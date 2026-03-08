-- Supabase-Auth-first V1 schema
-- Primary identity = auth.users.id

create extension if not exists pgcrypto;

create table if not exists role_assignments (
  email text primary key,
  role text not null check (role in ('admin','pharma','non_pharma')),
  assigned_at timestamptz not null default now()
);

create table if not exists user_profile (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null check (role in ('admin','pharma','non_pharma')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists training_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profile(id) on delete cascade,
  training_id text not null,
  status text not null check (status in ('in_progress','completed')),
  started_at timestamptz,
  attempt_count int not null default 0 check (attempt_count >= 0),
  last_score int check (last_score between 0 and 100),
  last_attempt_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, training_id)
);

create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profile(id) on delete cascade,
  training_id text not null,
  attempt_number int not null check (attempt_number > 0),
  score int not null check (score between 0 and 100),
  submitted_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, training_id, attempt_number)
);

create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profile(id) on delete cascade,
  training_id text not null,
  certificate_code text not null unique,
  generated_at timestamptz not null,
  download_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, training_id)
);

alter table role_assignments enable row level security;
alter table user_profile enable row level security;
alter table training_progress enable row level security;
alter table quiz_attempts enable row level security;
alter table certificates enable row level security;

-- Baseline privileges: block direct anon access and keep authenticated least-privilege.
revoke all on table role_assignments, user_profile, training_progress, quiz_attempts, certificates from anon, authenticated;
grant usage on schema public to authenticated;

grant select, insert on table user_profile to authenticated;
grant update (email, updated_at) on table user_profile to authenticated;

grant select on table training_progress to authenticated;
grant select on table quiz_attempts to authenticated;
grant select on table certificates to authenticated;

-- Explicitly deny direct client writes for audit tables; writes happen via server-side service-role functions.
revoke insert, update, delete on table training_progress from authenticated;
revoke insert, update, delete on table quiz_attempts from authenticated;
revoke insert, update, delete on table certificates from authenticated;

-- role_assignments: no direct reads/writes for users; managed via service role/admin functions.
drop policy if exists role_assignments_no_direct_access on role_assignments;
create policy role_assignments_no_direct_access
  on role_assignments
  for all
  to authenticated
  using (false)
  with check (false);

-- user_profile: users can only view and create/update their own profile row.
drop policy if exists user_profile_select_own on user_profile;
create policy user_profile_select_own
  on user_profile
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists user_profile_insert_own on user_profile;
create policy user_profile_insert_own
  on user_profile
  for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists user_profile_update_own on user_profile;
create policy user_profile_update_own
  on user_profile
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- training_progress: own rows readable; write path restricted to trusted server-side functions.
drop policy if exists training_progress_select_own on training_progress;
create policy training_progress_select_own
  on training_progress
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists training_progress_insert_own on training_progress;
drop policy if exists training_progress_update_own on training_progress;

-- quiz_attempts: own rows readable; write path restricted to trusted server-side functions.
drop policy if exists quiz_attempts_select_own on quiz_attempts;
create policy quiz_attempts_select_own
  on quiz_attempts
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists quiz_attempts_insert_own on quiz_attempts;

-- certificates: only own rows readable; writes restricted to service role.
drop policy if exists certificates_select_own on certificates;
create policy certificates_select_own
  on certificates
  for select
  to authenticated
  using (user_id = auth.uid());
