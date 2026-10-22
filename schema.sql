-- Run this whole file in Supabase: SQL Editor > New query > Run

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
