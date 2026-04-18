import { z } from "zod";

export const FEEDBACK_MODE_OPTIONS = ["synchronous", "post-jury"] as const;
export const feedbackModeSchema = z.enum(FEEDBACK_MODE_OPTIONS);
export type FeedbackMode = z.infer<typeof feedbackModeSchema>;

export const feedbackSchema = z.object({
  final: z.string().default(""),
  perSubject: z.record(z.string(), z.string()).default({}),
});
export type Feedback = z.infer<typeof feedbackSchema>;

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
  status: z.enum(["active", "completed"]),
  created_at: z.string(),
  completed_at: z.string().nullable(),
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
};
