-- 0003_jury_type.sql
-- Phase 3: add jury type to each session.

begin;

alter table jury_sessions
  add column jury_type text not null default 'Mid Sem';

commit;
