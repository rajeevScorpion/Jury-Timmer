import { supabase } from "@/lib/supabase";
import type { JurySession, StudentRecord } from "@/types/session";

export async function fetchHistorySessions(): Promise<JurySession[]> {
  const { data, error } = await supabase
    .from("jury_sessions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message || "Failed to load history.");
  return (data as JurySession[]) ?? [];
}

export async function fetchJurySession(sessionId: string): Promise<JurySession | null> {
  const { data, error } = await supabase
    .from("jury_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw new Error(error.message || "Failed to load session.");
  return (data as JurySession | null) ?? null;
}

export async function fetchSessionRecords(sessionId: string): Promise<StudentRecord[]> {
  const { data, error } = await supabase
    .from("student_records")
    .select("*")
    .eq("session_id", sessionId)
    .order("student_order", { ascending: true });

  if (error) throw new Error(error.message || "Failed to load student records.");
  return (data as StudentRecord[]) ?? [];
}

export async function markSessionCompleted(sessionId: string): Promise<string> {
  const completedAt = new Date().toISOString();
  const { error } = await supabase
    .from("jury_sessions")
    .update({ status: "completed", completed_at: completedAt })
    .eq("id", sessionId);

  if (error) throw new Error(error.message || "Failed to complete jury day.");
  return completedAt;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { error: recErr } = await supabase
    .from("student_records")
    .delete()
    .eq("session_id", sessionId);
  if (recErr) throw new Error(recErr.message || "Failed to delete student records.");

  const { error: sessErr } = await supabase
    .from("jury_sessions")
    .delete()
    .eq("id", sessionId);
  if (sessErr) throw new Error(sessErr.message || "Failed to delete session.");
}

export function sessionStatusLabel(status: JurySession["status"]): string {
  return status === "active" ? "In Progress" : "Completed";
}

export function historyTimestampLabel(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString();
}
