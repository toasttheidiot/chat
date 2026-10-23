-- Update #2: edit/delete own messages + channel creation.
-- Safe to run on top of your existing setup. Does NOT delete any data.

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
