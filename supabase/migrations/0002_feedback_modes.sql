-- 0002_feedback_modes.sql
-- Phase 2: add session-level feedback modes and global app settings.

begin;

alter table jury_sessions
  add column feedback_mode text not null default 'post-jury';

alter table jury_sessions
  add constraint jury_sessions_feedback_mode_check
  check (feedback_mode in ('synchronous', 'post-jury'));

create table app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

create policy "authenticated_users_can_read_app_settings"
  on app_settings for select
  using (auth.role() = 'authenticated');

create policy "authenticated_users_can_insert_app_settings"
  on app_settings for insert
  with check (auth.role() = 'authenticated');

create policy "authenticated_users_can_update_app_settings"
  on app_settings for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

insert into app_settings (key, value)
values ('default_feedback_mode', 'synchronous')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

commit;
