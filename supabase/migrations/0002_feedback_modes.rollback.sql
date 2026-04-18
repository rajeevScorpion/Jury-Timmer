-- 0002_feedback_modes.rollback.sql
-- Roll back Phase 2 feedback-mode changes.

begin;

drop policy if exists "authenticated_users_can_update_app_settings" on app_settings;
drop policy if exists "authenticated_users_can_insert_app_settings" on app_settings;
drop policy if exists "authenticated_users_can_read_app_settings" on app_settings;

drop table if exists app_settings;

alter table jury_sessions
  drop constraint if exists jury_sessions_feedback_mode_check;

alter table jury_sessions
  drop column if exists feedback_mode;

commit;
