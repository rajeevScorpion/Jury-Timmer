-- Add optional student roster (pre-loaded list of students) to jury sessions.
-- When NULL, students are entered manually one-at-a-time during the jury.
-- Format: [{enrollmentNo, studentName, order}, ...]
ALTER TABLE jury_sessions
  ADD COLUMN student_roster jsonb DEFAULT NULL;
