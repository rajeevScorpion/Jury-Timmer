import { z } from "zod";

export const feedbackSnippetSchema = z.object({
  id: z.string().uuid(),
  faculty_id: z.string().uuid(),
  text: z.string().min(1),
  label: z.string().default(""),
  scope: z.string().default("general"),
  created_at: z.string(),
  updated_at: z.string(),
});

export type FeedbackSnippet = z.infer<typeof feedbackSnippetSchema>;

export type CreateSnippetInput = {
  text: string;
  label: string;
  scope: string;
};
