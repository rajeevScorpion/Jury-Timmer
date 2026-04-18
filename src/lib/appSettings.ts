import { supabase } from "@/lib/supabase";
import { FEEDBACK_MODE_OPTIONS, type FeedbackMode } from "@/types/session";

export const DEFAULT_FEEDBACK_MODE: FeedbackMode = "synchronous";
export const LEGACY_FEEDBACK_MODE: FeedbackMode = "post-jury";
export const DEFAULT_FEEDBACK_MODE_KEY = "default_feedback_mode";
export const isSuperAdminEnabled = import.meta.env.VITE_IS_SUPER_ADMIN === "true";

export const feedbackModeOptions: ReadonlyArray<{
  value: FeedbackMode;
  label: string;
  description: string;
}> = [
  {
    value: "synchronous",
    label: "Synchronous",
    description: "Write per-subject and overall notes live during the jury, then save once at the end.",
  },
  {
    value: "post-jury",
    label: "Post-jury",
    description: "Keep feedback hidden during the timer and capture it only after the student finishes.",
  },
];

export function isFeedbackMode(value: unknown): value is FeedbackMode {
  return typeof value === "string" && FEEDBACK_MODE_OPTIONS.includes(value as FeedbackMode);
}

export function normalizeFeedbackMode(
  value: unknown,
  fallback: FeedbackMode = DEFAULT_FEEDBACK_MODE,
): FeedbackMode {
  return isFeedbackMode(value) ? value : fallback;
}

export function feedbackModeLabel(mode: FeedbackMode): string {
  return mode === "synchronous" ? "Synchronous" : "Post-jury";
}

export function feedbackModeDescription(mode: FeedbackMode): string {
  return (
    feedbackModeOptions.find((option) => option.value === mode)?.description ??
    feedbackModeOptions[0].description
  );
}

export async function fetchDefaultFeedbackMode(): Promise<FeedbackMode> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", DEFAULT_FEEDBACK_MODE_KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_FEEDBACK_MODE;
  return normalizeFeedbackMode(data.value, DEFAULT_FEEDBACK_MODE);
}

export async function saveDefaultFeedbackMode(mode: FeedbackMode): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: DEFAULT_FEEDBACK_MODE_KEY,
      value: mode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) throw new Error(error.message || "Failed to save default feedback mode.");
}
