-- 0001_init.sql
-- First migration for Jury Timer Phase 1: configured, persistent jury-day runner.
-- Run in the Supabase SQL editor. No rollback required (first migration).

create extension if not exists "pgcrypto";

create table jury_sessions (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references auth.users(id) on delete cascade,
  department text not null,
  section text not null,
  semester text not null,
  academic_year text not null,
  total_time_seconds int not null,
  number_of_students int not null,
  buffer_seconds int not null default 0,
  subjects text[] not null,
  feedback_seconds int not null,
  per_subject_seconds int not null,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table student_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references jury_sessions(id) on delete cascade,
  faculty_id uuid not null references auth.users(id) on delete cascade,
  student_name text not null,
  student_order int not null,
  setup_seconds int not null default 0,
  presentation_seconds int not null default 0,
  overtime_seconds int not null default 0,
  time_saved_seconds int not null default 0,
  total_time_used_seconds int not null default 0,
  setup_started_at timestamptz,
  presentation_started_at timestamptz,
  ended_at timestamptz,
  feedback jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index student_records_session_order_idx on student_records (session_id, student_order);
create index jury_sessions_faculty_created_idx on jury_sessions (faculty_id, created_at desc);

alter table jury_sessions enable row level security;
alter table student_records enable row level security;

create policy "faculty_owns_sessions"
  on jury_sessions for all
  using (faculty_id = auth.uid())
  with check (faculty_id = auth.uid());

create policy "faculty_owns_records"
  on student_records for all
  using (faculty_id = auth.uid())
  with check (faculty_id = auth.uid());
