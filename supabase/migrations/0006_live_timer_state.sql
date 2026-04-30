-- Persist live timer state to survive refresh and enable cross-device resume
-- All timestamps are set via server-side now() to avoid client clock skew

ALTER TABLE jury_sessions
  ADD COLUMN current_student_order int,
  ADD COLUMN current_student_name text,
  ADD COLUMN current_phase text DEFAULT 'idle'
    CHECK (current_phase IN ('idle', 'setup', 'presenting', 'paused', 'finished')),
  ADD COLUMN phase_setup_started_at timestamptz,
  ADD COLUMN phase_presentation_started_at timestamptz,
  ADD COLUMN phase_paused_at timestamptz,
  ADD COLUMN phase_total_paused_ms int DEFAULT 0,
  ADD COLUMN phase_elapsed_at_finish int,
  ADD COLUMN phase_setup_elapsed_at_transition int,
  ADD COLUMN current_feedback_draft jsonb,
  ADD COLUMN active_device_id text,
  ADD COLUMN device_heartbeat_at timestamptz;

-- RPC function for server-timestamped phase transitions
CREATE OR REPLACE FUNCTION update_timer_phase(
  p_session_id uuid,
  p_phase text,
  p_student_order int DEFAULT NULL,
  p_student_name text DEFAULT NULL,
  p_add_paused_ms int DEFAULT 0,
  p_device_id text DEFAULT NULL
)
RETURNS TABLE (
  server_now timestamptz,
  phase_setup_started_at timestamptz,
  phase_presentation_started_at timestamptz,
  phase_paused_at timestamptz,
  phase_total_paused_ms int,
  phase_elapsed_at_finish int,
  phase_setup_elapsed_at_transition int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session jury_sessions%ROWTYPE;
  v_now timestamptz := now();
  v_setup_elapsed int;
  v_presentation_elapsed int;
BEGIN
  -- Verify ownership
  SELECT * INTO v_session
    FROM jury_sessions
    WHERE id = p_session_id AND faculty_id = auth.uid()
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or access denied';
  END IF;

  CASE p_phase
    WHEN 'setup' THEN
      UPDATE jury_sessions SET
        current_phase = 'setup',
        current_student_order = p_student_order,
        current_student_name = p_student_name,
        phase_setup_started_at = v_now,
        phase_presentation_started_at = NULL,
        phase_paused_at = NULL,
        phase_total_paused_ms = 0,
        phase_elapsed_at_finish = NULL,
        phase_setup_elapsed_at_transition = NULL,
        current_feedback_draft = NULL,
        active_device_id = p_device_id,
        device_heartbeat_at = v_now
      WHERE id = p_session_id;

    WHEN 'presenting' THEN
      -- Calculate setup elapsed when transitioning from setup
      IF v_session.current_phase = 'setup' THEN
        v_setup_elapsed := EXTRACT(EPOCH FROM (v_now - v_session.phase_setup_started_at))::int;
      ELSE
        v_setup_elapsed := v_session.phase_setup_elapsed_at_transition;
      END IF;

      UPDATE jury_sessions SET
        current_phase = 'presenting',
        phase_presentation_started_at = COALESCE(v_session.phase_presentation_started_at, v_now),
        phase_paused_at = NULL,
        phase_total_paused_ms = COALESCE(v_session.phase_total_paused_ms, 0) + p_add_paused_ms,
        phase_setup_elapsed_at_transition = v_setup_elapsed,
        active_device_id = p_device_id,
        device_heartbeat_at = v_now
      WHERE id = p_session_id;

    WHEN 'paused' THEN
      UPDATE jury_sessions SET
        current_phase = 'paused',
        phase_paused_at = v_now,
        active_device_id = p_device_id,
        device_heartbeat_at = v_now
      WHERE id = p_session_id;

    WHEN 'finished' THEN
      -- Calculate final elapsed
      IF v_session.current_phase = 'paused' AND v_session.phase_paused_at IS NOT NULL THEN
        v_presentation_elapsed := EXTRACT(EPOCH FROM (v_session.phase_paused_at - v_session.phase_presentation_started_at))::int
          - COALESCE(v_session.phase_total_paused_ms, 0) / 1000;
      ELSE
        v_presentation_elapsed := EXTRACT(EPOCH FROM (v_now - v_session.phase_presentation_started_at))::int
          - COALESCE(v_session.phase_total_paused_ms, 0) / 1000;
      END IF;

      UPDATE jury_sessions SET
        current_phase = 'finished',
        phase_elapsed_at_finish = GREATEST(v_presentation_elapsed, 0),
        active_device_id = p_device_id,
        device_heartbeat_at = v_now
      WHERE id = p_session_id;

    WHEN 'idle' THEN
      UPDATE jury_sessions SET
        current_phase = 'idle',
        current_student_order = NULL,
        current_student_name = NULL,
        phase_setup_started_at = NULL,
        phase_presentation_started_at = NULL,
        phase_paused_at = NULL,
        phase_total_paused_ms = 0,
        phase_elapsed_at_finish = NULL,
        phase_setup_elapsed_at_transition = NULL,
        current_feedback_draft = NULL
      WHERE id = p_session_id;

  END CASE;

  -- Return the updated state plus server time
  RETURN QUERY
    SELECT v_now,
           js.phase_setup_started_at,
           js.phase_presentation_started_at,
           js.phase_paused_at,
           js.phase_total_paused_ms,
           js.phase_elapsed_at_finish,
           js.phase_setup_elapsed_at_transition
    FROM jury_sessions js
    WHERE js.id = p_session_id;
END;
$$;
