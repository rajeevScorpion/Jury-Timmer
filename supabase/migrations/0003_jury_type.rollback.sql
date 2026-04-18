-- 0003_jury_type.rollback.sql
-- Roll back Phase 3 jury type changes.

begin;

alter table jury_sessions
  drop column if exists jury_type;

commit;
