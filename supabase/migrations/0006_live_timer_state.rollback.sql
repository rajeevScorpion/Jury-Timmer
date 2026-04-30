-- Rollback: remove live timer state columns and RPC function

DROP FUNCTION IF EXISTS update_timer_phase(uuid, text, int, text, int, text);

ALTER TABLE jury_sessions
  DROP COLUMN IF EXISTS current_student_order,
  DROP COLUMN IF EXISTS current_student_name,
  DROP COLUMN IF EXISTS current_phase,
  DROP COLUMN IF EXISTS phase_setup_started_at,
  DROP COLUMN IF EXISTS phase_presentation_started_at,
  DROP COLUMN IF EXISTS phase_paused_at,
  DROP COLUMN IF EXISTS phase_total_paused_ms,
  DROP COLUMN IF EXISTS phase_elapsed_at_finish,
  DROP COLUMN IF EXISTS phase_setup_elapsed_at_transition,
  DROP COLUMN IF EXISTS current_feedback_draft,
  DROP COLUMN IF EXISTS active_device_id,
  DROP COLUMN IF EXISTS device_heartbeat_at;
