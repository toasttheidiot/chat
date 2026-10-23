-- Run this whole file in Supabase: SQL Editor > New query > Run
-- It first removes any earlier copies of these tables, so it is safe to re-run.
-- WARNING: this deletes data in tables named profiles, dms, dm_messages, rooms, room_members, channels, room_messages.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user() cascade;
drop function if exists start_dm(text) cascade;
drop function if exists create_room(text) cascade;
drop function if exists join_room(text) cascade;
drop function if exists create_channel(text,text) cascade;
drop table if exists moderators, room_messages, channels, room_members, rooms, dm_messages, dms, profiles cascade;
drop function if exists in_room(text) cascade;
drop function if exists in_dm(uuid) cascade;

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null,
  description text default '',
  avatar_url text
);

create table dms (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references profiles on delete cascade,
  user_b uuid not null references profiles on delete cascade,
  unique (user_a, user_b)
);
create table dm_messages (
  id bigint generated always as identity primary key,
  dm_id uuid not null references dms on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  content text not null check (char_length(content) <= 2000),
  created_at timestamptz default now()
);

create table rooms (
  id text primary key default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  name text not null,
  owner_id uuid not null references profiles
);
create table room_members (
  room_id text references rooms on delete cascade,
  user_id uuid references profiles on delete cascade,
  primary key (room_id, user_id)
);
create table channels (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms on delete cascade,
  name text not null,
  created_at timestamptz default now()
);
create table room_messages (
  id bigint generated always as identity primary key,
  channel_id uuid not null references channels on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  content text not null check (char_length(content) <= 2000),
  created_at timestamptz default now()
);

-- Helpers (security definer avoids RLS recursion)
create function in_room(rid text) returns boolean language sql security definer stable set search_path = public
  as $$ select exists (select 1 from room_members where room_id = rid and user_id = auth.uid()) $$;
create function in_dm(did uuid) returns boolean language sql security definer stable set search_path = public
  as $$ select exists (select 1 from dms where id = did and auth.uid() in (user_a, user_b)) $$;

-- Create a profile automatically on signup (username comes from the signup form)
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Actions the pages call
create function start_dm(uname text) returns uuid language plpgsql security definer set search_path = public as $$
declare other uuid; d uuid;
begin
  select id into other from profiles where username = uname;
  if other is null then raise exception 'No user named %', uname; end if;
  if other = auth.uid() then raise exception 'You cannot DM yourself'; end if;
  select id into d from dms where (user_a = auth.uid() and user_b = other) or (user_a = other and user_b = auth.uid());
  if d is null then insert into dms (user_a, user_b) values (auth.uid(), other) returning id into d; end if;
  return d;
end $$;

create function create_room(rname text) returns text language plpgsql security definer set search_path = public as $$
declare rid text;
begin
  insert into rooms (name, owner_id) values (rname, auth.uid()) returning id into rid;
  insert into room_members values (rid, auth.uid());
  insert into channels (room_id, name) values (rid, 'general');
  return rid;
end $$;

create function join_room(rid text) returns text language plpgsql security definer set search_path = public as $$
declare rname text;
begin
  select name into rname from rooms where id = rid;
  if rname is null then raise exception 'No room with that ID'; end if;
  insert into room_members values (rid, auth.uid()) on conflict do nothing;
  return rname;
end $$;

-- Row Level Security
alter table profiles enable row level security;
alter table dms enable row level security;
alter table dm_messages enable row level security;
alter table rooms enable row level security;
alter table room_members enable row level security;
alter table channels enable row level security;
alter table room_messages enable row level security;

create policy "read profiles" on profiles for select to authenticated using (true);
create policy "edit own profile" on profiles for update to authenticated using (id = auth.uid());
create policy "read own dms" on dms for select to authenticated using (auth.uid() in (user_a, user_b));
create policy "read dm messages" on dm_messages for select to authenticated using (in_dm(dm_id));
create policy "send dm messages" on dm_messages for insert to authenticated with check (user_id = auth.uid() and in_dm(dm_id));
create policy "read my rooms" on rooms for select to authenticated using (in_room(id));
create policy "read members" on room_members for select to authenticated using (in_room(room_id));
create policy "read channels" on channels for select to authenticated using (in_room(room_id));
create policy "read room messages" on room_messages for select to authenticated
  using (in_room((select room_id from channels where id = channel_id)));
create policy "send room messages" on room_messages for insert to authenticated
  with check (user_id = auth.uid() and in_room((select room_id from channels where id = channel_id)));

-- Realtime
alter publication supabase_realtime add table dm_messages, room_messages;

-- Create profiles for any accounts that were made before this ran
insert into profiles (id, username)
select id, coalesce(nullif(raw_user_meta_data->>'username', ''), split_part(email, '@', 1))
from auth.users on conflict do nothing;

alter table dm_messages add column if not exists edited_at timestamptz;
alter table room_messages add column if not exists edited_at timestamptz;

drop policy if exists "edit own dm messages" on dm_messages;
drop policy if exists "delete own dm messages" on dm_messages;
drop policy if exists "edit own room messages" on room_messages;
drop policy if exists "delete own room messages" on room_messages;

create policy "edit own dm messages" on dm_messages for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and in_dm(dm_id));
create policy "delete own dm messages" on dm_messages for delete to authenticated
  using (user_id = auth.uid());
create policy "edit own room messages" on room_messages for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and in_room((select room_id from channels where id = channel_id)));
create policy "delete own room messages" on room_messages for delete to authenticated
  using (user_id = auth.uid());

create or replace function create_channel(rid text, cname text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; n text := left(regexp_replace(lower(trim(cname)), '\s+', '-', 'g'), 30);
begin
  if not in_room(rid) then raise exception 'You are not in that room'; end if;
  if n = '' then raise exception 'Channel name required'; end if;
  insert into channels (room_id, name) values (rid, n) returning id into cid;
  return cid;
end $$;

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
