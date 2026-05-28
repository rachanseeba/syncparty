-- SyncParty — Supabase schema (rooms + devices)
--
-- This is the canonical backend schema for SyncParty. The app talks to
-- Supabase directly from the browser with the public anon key (see
-- js/supabase.js), so the anon role is granted read/write via permissive
-- RLS policies. Realtime sync (patterns/flash/spotlight) uses Supabase
-- Realtime *broadcast* channels (room:CODE) and needs no table changes.
--
-- To (re)build the backend: Supabase Dashboard -> SQL Editor -> New query ->
-- paste this file -> Run. It is idempotent (safe to re-run).

-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists rooms (
  id              uuid default gen_random_uuid() primary key,
  code            varchar(4) unique not null,
  host_device_id  varchar(20) not null,
  settings        jsonb default '{"pattern":"solid","theme":"neon","bpm":128}'::jsonb,
  is_active       boolean default true,
  created_at      timestamptz default now(),
  expires_at      timestamptz default (now() + interval '24 hours')
);

create table if not exists devices (
  id             uuid default gen_random_uuid() primary key,
  room_id        uuid references rooms(id) on delete cascade,
  device_id      varchar(20) not null,
  device_number  integer not null,
  display_name   varchar(50),
  position_x     float,
  position_y     float,
  orientation    varchar(10),
  group_id       varchar(20),
  is_connected   boolean default true,
  joined_at      timestamptz default now(),
  last_seen      timestamptz default now(),
  unique (room_id, device_id)
);

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table rooms   enable row level security;
alter table devices enable row level security;

drop policy if exists "rooms_public_read"   on rooms;
drop policy if exists "rooms_public_insert" on rooms;
drop policy if exists "rooms_public_update" on rooms;
create policy "rooms_public_read"   on rooms for select using (true);
create policy "rooms_public_insert" on rooms for insert with check (true);
create policy "rooms_public_update" on rooms for update using (true);

drop policy if exists "devices_public_read"   on devices;
drop policy if exists "devices_public_insert" on devices;
drop policy if exists "devices_public_update" on devices;
drop policy if exists "devices_public_delete" on devices;
create policy "devices_public_read"   on devices for select using (true);
create policy "devices_public_insert" on devices for insert with check (true);
create policy "devices_public_update" on devices for update using (true);
create policy "devices_public_delete" on devices for delete using (true);

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists idx_rooms_code   on rooms(code)     where is_active = true;
create index if not exists idx_devices_room on devices(room_id) where is_connected = true;
