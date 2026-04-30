import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/deviceId";
import type { Feedback } from "@/types/session";

/** Server-side live timer state stored on jury_sessions. */
export type ServerTimerState = {
  current_phase: "idle" | "setup" | "presenting" | "paused" | "finished";
  current_student_order: number | null;
  current_student_name: string | null;
  phase_setup_started_at: string | null;
  phase_presentation_started_at: string | null;
  phase_paused_at: string | null;
  phase_total_paused_ms: number;
  phase_elapsed_at_finish: number | null;
  phase_setup_elapsed_at_transition: number | null;
  current_feedback_draft: Feedback | null;
  active_device_id: string | null;
  device_heartbeat_at: string | null;
};

/** Snapshot of timer state computed from server timestamps. */
export type TimerSnapshot = {
  phase: "idle" | "setup" | "presenting" | "paused" | "finished";
  setupSeconds: number;
  elapsed: number;
  studentOrder: number | null;
  studentName: string;
  feedbackDraft: Feedback | null;
  /** Server timestamp used as reference for clock offset calculation. */
  serverNow: Date;
};

/**
 * Compute a timer snapshot from server state + server clock.
 * All elapsed values derived from server timestamps to avoid clock skew.
 */
export function computeSnapshot(
  state: ServerTimerState,
  serverNow: Date,
): TimerSnapshot {
  const phase = state.current_phase;
  let setupSeconds = 0;
  let elapsed = 0;

  // Setup seconds
  if (phase === "setup" && state.phase_setup_started_at) {
    setupSeconds = Math.floor(
      (serverNow.getTime() - new Date(state.phase_setup_started_at).getTime()) / 1000,
    );
  } else if (state.phase_setup_elapsed_at_transition != null) {
    setupSeconds = state.phase_setup_elapsed_at_transition;
  }

  // Presentation elapsed
  if (phase === "presenting" && state.phase_presentation_started_at) {
    const totalMs =
      serverNow.getTime() - new Date(state.phase_presentation_started_at).getTime();
    elapsed = Math.floor(totalMs / 1000) - Math.floor((state.phase_total_paused_ms ?? 0) / 1000);
  } else if (
    phase === "paused" &&
    state.phase_presentation_started_at &&
    state.phase_paused_at
  ) {
    const totalMs =
      new Date(state.phase_paused_at).getTime() -
      new Date(state.phase_presentation_started_at).getTime();
    elapsed = Math.floor(totalMs / 1000) - Math.floor((state.phase_total_paused_ms ?? 0) / 1000);
  } else if (phase === "finished" && state.phase_elapsed_at_finish != null) {
    elapsed = state.phase_elapsed_at_finish;
  }

  return {
    phase,
    setupSeconds: Math.max(0, setupSeconds),
    elapsed: Math.max(0, elapsed),
    studentOrder: state.current_student_order,
    studentName: state.current_student_name ?? "",
    feedbackDraft: state.current_feedback_draft,
    serverNow,
  };
}

type PhaseTransitionResult = {
  serverNow: Date;
  phase_setup_started_at: string | null;
  phase_presentation_started_at: string | null;
  phase_paused_at: string | null;
  phase_total_paused_ms: number;
  phase_elapsed_at_finish: number | null;
  phase_setup_elapsed_at_transition: number | null;
};

/**
 * Transition the timer phase via server RPC.
 * All timestamps are set server-side to avoid clock skew.
 */
export async function transitionPhase(
  sessionId: string,
  phase: string,
  opts?: {
    studentOrder?: number;
    studentName?: string;
    addPausedMs?: number;
  },
): Promise<PhaseTransitionResult> {
  const { data, error } = await supabase.rpc("update_timer_phase", {
    p_session_id: sessionId,
    p_phase: phase,
    p_student_order: opts?.studentOrder ?? null,
    p_student_name: opts?.studentName ?? null,
    p_add_paused_ms: opts?.addPausedMs ?? 0,
    p_device_id: getDeviceId(),
  });
  if (error) throw new Error(error.message);
  const row = data[0];
  return {
    serverNow: new Date(row.server_now),
    phase_setup_started_at: row.phase_setup_started_at,
    phase_presentation_started_at: row.phase_presentation_started_at,
    phase_paused_at: row.phase_paused_at,
    phase_total_paused_ms: row.phase_total_paused_ms ?? 0,
    phase_elapsed_at_finish: row.phase_elapsed_at_finish,
    phase_setup_elapsed_at_transition: row.phase_setup_elapsed_at_transition,
  };
}

/** Send heartbeat to maintain device lock. */
export async function sendHeartbeat(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("jury_sessions")
    .update({
      device_heartbeat_at: new Date().toISOString(),
      active_device_id: getDeviceId(),
    })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

/** Save feedback draft to server (debounced by caller). */
export async function saveFeedbackDraft(
  sessionId: string,
  draft: Feedback,
): Promise<void> {
  const { error } = await supabase
    .from("jury_sessions")
    .update({ current_feedback_draft: draft })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

/** Device lock status. */
export type DeviceLockStatus =
  | { locked: false }
  | { locked: true; stale: boolean; deviceId: string; lastHeartbeat: Date };

/** Check whether another device holds the timer lock. */
export function checkDeviceLock(state: ServerTimerState): DeviceLockStatus {
  const myDeviceId = getDeviceId();
  if (!state.active_device_id || state.active_device_id === myDeviceId) {
    return { locked: false };
  }
  const lastHeartbeat = state.device_heartbeat_at
    ? new Date(state.device_heartbeat_at)
    : new Date(0);
  const stale = Date.now() - lastHeartbeat.getTime() > 60_000;
  return { locked: true, stale, deviceId: state.active_device_id, lastHeartbeat };
}
