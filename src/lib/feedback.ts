import { feedbackSchema, type Feedback } from "@/types/session";

export function createEmptyFeedback(): Feedback {
  return feedbackSchema.parse({});
}

export function parseFeedbackDraft(value: unknown): Feedback {
  const parsed = feedbackSchema.safeParse(value);
  return parsed.success ? parsed.data : createEmptyFeedback();
}

export function cleanFeedback(feedback: Feedback): Feedback {
  const parsed = feedbackSchema.parse(feedback);
  return {
    final: parsed.final.trim(),
    perSubject: Object.fromEntries(
      Object.entries(parsed.perSubject)
        .map(([subject, note]) => [subject, note.trim()])
        .filter(([, note]) => note.length > 0),
    ),
  };
}

export function hasFinalFeedback(feedback: Feedback): boolean {
  return cleanFeedback(feedback).final.length > 0;
}
