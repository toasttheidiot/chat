-- Update #3: settings, avatars, moderators, bans, account deletion.
-- Safe to run on top of your existing setup. Does NOT delete any data.

alter table profiles add column if not exists banned boolean not null default false;

-- Users may only change these profile columns (so nobody can unban themselves)
revoke update on profiles from authenticated, anon;
grant update (username, description, avatar_url) on profiles to authenticated;

-- Deleting an account must not be blocked by rooms the user created
alter table rooms alter column owner_id drop not null;
alter table rooms drop constraint if exists rooms_owner_id_fkey;
alter table rooms add constraint rooms_owner_id_fkey foreign key (owner_id) references profiles on delete set null;

-- Moderators (clients cannot read or change this table; use the SQL Editor)
create table if not exists moderators (user_id uuid primary key references profiles on delete cascade);
alter table moderators enable row level security;

create or replace function is_mod() returns boolean language sql security definer stable set search_path = public
  as $$ select exists (select 1 from moderators where user_id = auth.uid()) $$;
create or replace function is_banned() returns boolean language sql security definer stable set search_path = public
  as $$ select coalesce((select banned from profiles where id = auth.uid()), false) $$;

-- Banned users lose access to every room and DM (also blocks sending)
create or replace function in_room(rid text) returns boolean language sql security definer stable set search_path = public
  as $$ select exists (select 1 from room_members where room_id = rid and user_id = auth.uid()) and not is_banned() $$;
create or replace function in_dm(did uuid) returns boolean language sql security definer stable set search_path = public
  as $$ select exists (select 1 from dms where id = did and auth.uid() in (user_a, user_b)) and not is_banned() $$;

-- Moderators can edit and delete any message they can see
drop policy if exists "edit own dm messages" on dm_messages;
drop policy if exists "delete own dm messages" on dm_messages;
drop policy if exists "edit own room messages" on room_messages;
drop policy if exists "delete own room messages" on room_messages;
drop policy if exists "edit dm messages" on dm_messages;
drop policy if exists "delete dm messages" on dm_messages;
drop policy if exists "edit room messages" on room_messages;
drop policy if exists "delete room messages" on room_messages;

create policy "edit dm messages" on dm_messages for update to authenticated
  using (user_id = auth.uid() or is_mod())
  with check (in_dm(dm_id) and (user_id = auth.uid() or is_mod()));
create policy "delete dm messages" on dm_messages for delete to authenticated
  using (user_id = auth.uid() or is_mod());
create policy "edit room messages" on room_messages for update to authenticated
  using (user_id = auth.uid() or is_mod())
  with check (in_room((select room_id from channels where id = channel_id)) and (user_id = auth.uid() or is_mod()));
create policy "delete room messages" on room_messages for delete to authenticated
  using (user_id = auth.uid() or is_mod());

-- Actions
create or replace function ban_user(uid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_mod() then raise exception 'Moderators only'; end if;
  if exists (select 1 from moderators where user_id = uid) then raise exception 'You cannot ban a moderator'; end if;
  update profiles set banned = true where id = uid;
end $$;
create or replace function unban_user(uid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_mod() then raise exception 'Moderators only'; end if;
  update profiles set banned = false where id = uid;
end $$;
create or replace function mod_delete_account(uid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_mod() then raise exception 'Moderators only'; end if;
  if exists (select 1 from moderators where user_id = uid) then raise exception 'You cannot delete a moderator'; end if;
  delete from auth.users where id = uid;
end $$;
create or replace function delete_my_account() returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- Profile pictures (public bucket; each user can only write inside their own folder)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/gif','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars read" on storage.objects;
drop policy if exists "avatars insert own" on storage.objects;
drop policy if exists "avatars update own" on storage.objects;
drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- TO MAKE SOMEONE A MODERATOR, run this with their username:
-- insert into moderators (user_id) select id from profiles where username = 'their-username';
-- TO REMOVE ONE:
-- delete from moderators where user_id = (select id from profiles where username = 'their-username');
