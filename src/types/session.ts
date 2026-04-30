import { z } from "zod";

export const FEEDBACK_MODE_OPTIONS = ["synchronous", "post-jury"] as const;
export const feedbackModeSchema = z.enum(FEEDBACK_MODE_OPTIONS);
export type FeedbackMode = z.infer<typeof feedbackModeSchema>;

export const feedbackSchema = z.object({
  final: z.string().default(""),
  perSubject: z.record(z.string(), z.string()).default({}),
});
export type Feedback = z.infer<typeof feedbackSchema>;

export const rosterEntrySchema = z.object({
  enrollmentNo: z.string(),
  studentName: z.string().min(1),
  order: z.number().int().positive(),
});
export type RosterEntry = z.infer<typeof rosterEntrySchema>;

export const jurySessionSchema = z.object({
  id: z.string().uuid(),
  faculty_id: z.string().uuid(),
  jury_type: z.string().min(1),
  department: z.string().min(1),
  section: z.string().min(1),
  semester: z.string().min(1),
  academic_year: z.string().min(1),
  total_time_seconds: z.number().int().positive(),
  number_of_students: z.number().int().positive(),
  buffer_seconds: z.number().int().nonnegative(),
  subjects: z.array(z.string().min(1)).min(1),
  feedback_seconds: z.number().int().nonnegative(),
  feedback_mode: feedbackModeSchema,
  per_subject_seconds: z.number().int().positive(),
  student_roster: z.array(rosterEntrySchema).nullable().default(null),
  status: z.enum(["active", "completed"]),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  // Live timer state (persisted for refresh/cross-device resume)
  current_student_order: z.number().int().nullable().default(null),
  current_student_name: z.string().nullable().default(null),
  current_phase: z.enum(["idle", "setup", "presenting", "paused", "finished"]).default("idle"),
  phase_setup_started_at: z.string().nullable().default(null),
  phase_presentation_started_at: z.string().nullable().default(null),
  phase_paused_at: z.string().nullable().default(null),
  phase_total_paused_ms: z.number().int().default(0),
  phase_elapsed_at_finish: z.number().int().nullable().default(null),
  phase_setup_elapsed_at_transition: z.number().int().nullable().default(null),
  current_feedback_draft: feedbackSchema.nullable().default(null),
  active_device_id: z.string().nullable().default(null),
  device_heartbeat_at: z.string().nullable().default(null),
});
export type JurySession = z.infer<typeof jurySessionSchema>;

export const studentRecordSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  faculty_id: z.string().uuid(),
  student_name: z.string().min(1),
  student_order: z.number().int().positive(),
  setup_seconds: z.number().int().nonnegative(),
  presentation_seconds: z.number().int().nonnegative(),
  overtime_seconds: z.number().int().nonnegative(),
  time_saved_seconds: z.number().int().nonnegative(),
  total_time_used_seconds: z.number().int().nonnegative(),
  setup_started_at: z.string().nullable(),
  presentation_started_at: z.string().nullable(),
  ended_at: z.string().nullable(),
  feedback: feedbackSchema,
  created_at: z.string(),
});
export type StudentRecord = z.infer<typeof studentRecordSchema>;

export type DaySetupInput = {
  jury_type: string;
  department: string;
  section: string;
  semester: string;
  academic_year: string;
  total_time_seconds: number;
  number_of_students: number;
  buffer_seconds: number;
  subjects: string[];
  feedback_seconds: number;
  feedback_mode: FeedbackMode;
  student_roster?: RosterEntry[] | null;
};
