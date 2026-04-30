import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  AlertTriangle,
  Settings,
  ChevronRight,
  Square,
  BookOpen,
  Save,
  Info,
  Plus,
  Minus,
  Users,
  Trash2,
  ArrowUp,
  ArrowDown,
  Monitor,
  WifiOff,
} from "lucide-react";
import { fmt, fmtClock, fmtHM } from "@/lib/timeFormat";
import { beep, ensureAudio } from "@/lib/audio";
import type { Feedback, JurySession, RosterEntry } from "@/types/session";
import { computeSnapshot, checkDeviceLock, sendHeartbeat, type DeviceLockStatus } from "@/lib/timerSync";
import {
  checkpointsFor,
  segmentIndexAt,
  segmentStart,
  validateStudentCountChange,
  type PerStudentPlan,
  type Segment,
} from "@/lib/timing";
import { useSession } from "@/context/SessionContext";
import FeedbackDialog from "@/components/FeedbackDialog";
import FeedbackEditor from "@/components/FeedbackEditor";
import {
  feedbackModeDescription,
  feedbackModeLabel,
  LEGACY_FEEDBACK_MODE,
  normalizeFeedbackMode,
} from "@/lib/appSettings";
import { appName } from "@/lib/brand";
import {
  cleanFeedback,
  createEmptyFeedback,
  hasFinalFeedback,
  parseFeedbackDraft,
} from "@/lib/feedback";

type Phase = "idle" | "setup" | "presenting" | "paused" | "finished";

const FEEDBACK_DRAFT_KEY = "juryTimer.feedbackDraft";
const TIMER_HELP_COPY =
  "One tap starts the full cycle. The app beeps once after each subject segment and gives a triple beep when time is up. Overtime keeps counting so students can see exactly how much extra time was used.";

function feedbackDraftStorageKey(sessionId: string, studentOrder: number): string {
  return `${FEEDBACK_DRAFT_KEY}:${sessionId}:${studentOrder}`;
}

function hasDraftContent(feedback: Feedback): boolean {
  return (
    feedback.final.trim().length > 0 ||
    Object.values(feedback.perSubject).some((note) => note.trim().length > 0)
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Failed to save feedback.";
}

export default function LiveJuryView({ activeSession }: { activeSession: JurySession }) {
  const navigate = useNavigate();
  const { saveStudentRecord, completeSession, studentsCompleted, nextStudentOrder, completedOrders, adjustStudentCount, getConsumedSeconds, updateRoster, persistPhaseTransition, saveFeedbackDraftToServer, clearLiveTimerState } = useSession();
  const plan: PerStudentPlan = useMemo(() => {
    const perSubject = activeSession.per_subject_seconds;
    const segments: Segment[] = [
      ...activeSession.subjects.map((name) => ({ name, seconds: perSubject, kind: "subject" as const })),
      { name: "Final Feedback", seconds: activeSession.feedback_seconds, kind: "feedback" as const },
    ];
    const totalSeconds = segments.reduce((sum, s) => sum + s.seconds, 0);
    return { perSubjectSeconds: perSubject, feedbackSeconds: activeSession.feedback_seconds, segments, totalSeconds };
  }, [activeSession]);

  const roster: RosterEntry[] = useMemo(
    () => (activeSession.student_roster as RosterEntry[]) ?? [],
    [activeSession.student_roster],
  );
  const hasRoster = roster.length > 0;

  const TOTAL = plan.totalSeconds;
  const segments = plan.segments;
  const checkpoints = useMemo(() => checkpointsFor(segments), [segments]);
  const feedbackMode = normalizeFeedbackMode(activeSession.feedback_mode, LEGACY_FEEDBACK_MODE);
  const isSynchronousFeedback = feedbackMode === "synchronous";
  const [currentStudentOrder, setCurrentStudentOrder] = useState<number | null>(null);

  const activeDraftOrder = currentStudentOrder ?? nextStudentOrder;
  const draftStorageId = useMemo(
    () => feedbackDraftStorageKey(activeSession.id, activeDraftOrder),
    [activeSession.id, activeDraftOrder],
  );

  const [phase, setPhase] = useState<Phase>("idle");
  const [studentName, setStudentName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [showNameModal, setShowNameModal] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [showTimerHelp, setShowTimerHelp] = useState(false);
  const [showFeedbackInfo, setShowFeedbackInfo] = useState(false);

  const [setupSeconds, setSetupSeconds] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [feedbackDraft, setFeedbackDraft] = useState<Feedback>(() => createEmptyFeedback());
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSaving, setFeedbackSaving] = useState(false);

  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [adjustedCount, setAdjustedCount] = useState(activeSession.number_of_students);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [consumedSeconds, setConsumedSeconds] = useState(0);

  const [showRosterManage, setShowRosterManage] = useState(false);
  const [editableRoster, setEditableRoster] = useState<RosterEntry[]>([]);
  const [rosterSaving, setRosterSaving] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [newStudentName, setNewStudentName] = useState("");
  const [newEnrollmentNo, setNewEnrollmentNo] = useState("");

  const [setupStartTime, setSetupStartTime] = useState<Date | null>(null);
  const [presentationStartTime, setPresentationStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Timestamp-based timer state (for server sync)
  const [clockOffset, setClockOffset] = useState(0); // ms: serverTime - clientTime
  const [setupStartedAtMs, setSetupStartedAtMs] = useState<number | null>(null);
  const [presentationStartedAtMs, setPresentationStartedAtMs] = useState<number | null>(null);
  const [totalPausedSeconds, setTotalPausedSeconds] = useState(0);
  const [pauseStartTime, setPauseStartTime] = useState<number | null>(null);

  // Device lock
  const [showDeviceLock, setShowDeviceLock] = useState(false);
  const [deviceLockInfo, setDeviceLockInfo] = useState<DeviceLockStatus | null>(null);
  const [takingOver, setTakingOver] = useState(false);

  // Sync status
  const [syncError, setSyncError] = useState<string | null>(null);
  const [restoringState, setRestoringState] = useState(false);

  const tick = useRef<number | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const lastCue = useRef(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const debouncedSaveDraft = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRestored = useRef(false);
  const isActive = phase === "presenting" || phase === "paused" || phase === "finished";

  const isOvertime = elapsed > TOTAL;
  const overtime = Math.max(elapsed - TOTAL, 0);
  const remaining = Math.max(TOTAL - elapsed, 0);
  const totalPct = Math.min((elapsed / TOTAL) * 100, 100);

  const stageIdx = useMemo(
    () => segmentIndexAt(Math.min(elapsed, TOTAL - 1), segments),
    [elapsed, segments, TOTAL],
  );
  const currentSegment = segments[stageIdx];
  const activeSubject = currentSegment?.kind === "subject" ? currentSegment.name : null;
  const stageStart = segmentStart(stageIdx, segments);
  const stageDur = currentSegment.seconds;
  const stageElapsed = Math.min(Math.max(elapsed - stageStart, 0), stageDur);
  const stageRem = Math.max(stageDur - stageElapsed, 0);
  const stagePct = Math.min((stageElapsed / stageDur) * 100, 100);

  useEffect(() => {
    const id = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // --- Restore state from server on mount ---
  useEffect(() => {
    if (hasRestored.current) return;
    const serverPhase = activeSession.current_phase;
    if (!serverPhase || serverPhase === "idle") return;
    hasRestored.current = true;

    const lockStatus = checkDeviceLock(activeSession);
    if (lockStatus.locked && !lockStatus.stale) {
      setDeviceLockInfo(lockStatus);
      setShowDeviceLock(true);
      return;
    }

    restoreFromServer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession.id]);

  const restoreFromServer = useCallback(() => {
    setRestoringState(true);
    try {
      // Use current time as approximate server_now (heartbeat will correct drift)
      const serverNow = new Date(Date.now() + clockOffset);
      const snapshot = computeSnapshot(activeSession, serverNow);

      setPhase(snapshot.phase);
      setStudentName(snapshot.studentName);
      setSetupSeconds(snapshot.setupSeconds);
      setElapsed(snapshot.elapsed);
      if (snapshot.studentOrder != null) {
        setCurrentStudentOrder(snapshot.studentOrder);
      }

      // Restore feedback draft: prefer server, fallback to localStorage
      if (snapshot.feedbackDraft && hasDraftContent(snapshot.feedbackDraft)) {
        setFeedbackDraft(snapshot.feedbackDraft);
      }

      // Restore timestamp references for tick interval
      if (activeSession.phase_setup_started_at) {
        const ms = new Date(activeSession.phase_setup_started_at).getTime();
        setSetupStartedAtMs(ms);
        setSetupStartTime(new Date(activeSession.phase_setup_started_at));
      }
      if (activeSession.phase_presentation_started_at) {
        const ms = new Date(activeSession.phase_presentation_started_at).getTime();
        setPresentationStartedAtMs(ms);
        setPresentationStartTime(new Date(activeSession.phase_presentation_started_at));
      }
      if (activeSession.phase_paused_at && snapshot.phase === "paused") {
        setPauseStartTime(new Date(activeSession.phase_paused_at).getTime());
      }
      setTotalPausedSeconds(Math.floor((activeSession.phase_total_paused_ms ?? 0) / 1000));

      // Claim device lock via heartbeat
      sendHeartbeat(activeSession.id).catch(() => {});
    } finally {
      setRestoringState(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession, clockOffset]);

  const handleTakeOver = useCallback(async () => {
    setTakingOver(true);
    try {
      await sendHeartbeat(activeSession.id);
      setShowDeviceLock(false);
      restoreFromServer();
    } catch {
      setSyncError("Failed to take over session. Please try again.");
    } finally {
      setTakingOver(false);
    }
  }, [activeSession.id, restoreFromServer]);

  // --- Tick interval (timestamp-derived) ---
  useEffect(() => {
    if (phase === "setup" && setupStartedAtMs) {
      tick.current = window.setInterval(() => {
        const adjustedNow = Date.now() + clockOffset;
        setSetupSeconds(Math.max(0, Math.floor((adjustedNow - setupStartedAtMs) / 1000)));
      }, 1000);
    } else if (phase === "setup" && !setupStartedAtMs) {
      // Fallback for before server response (local increment)
      tick.current = window.setInterval(() => setSetupSeconds((previous) => previous + 1), 1000);
    } else if (phase === "presenting" && presentationStartedAtMs) {
      tick.current = window.setInterval(() => {
        const adjustedNow = Date.now() + clockOffset;
        const totalMs = adjustedNow - presentationStartedAtMs;
        setElapsed(Math.max(0, Math.floor(totalMs / 1000) - totalPausedSeconds));
      }, 1000);
    } else if (phase === "presenting" && !presentationStartedAtMs) {
      // Fallback for before server response
      tick.current = window.setInterval(() => setElapsed((previous) => previous + 1), 1000);
    }

    return () => {
      if (tick.current) {
        clearInterval(tick.current);
        tick.current = null;
      }
    };
  }, [phase, setupStartedAtMs, presentationStartedAtMs, totalPausedSeconds, clockOffset]);

  useEffect(() => {
    if (phase !== "presenting") return;
    const checkpointIndex = checkpoints.findIndex((checkpoint) => elapsed === checkpoint);
    if (checkpointIndex !== -1 && lastCue.current !== checkpointIndex) {
      lastCue.current = checkpointIndex;
      const isFinalCheckpoint = checkpointIndex === checkpoints.length - 1;
      if (isFinalCheckpoint) beep(audioCtx, soundEnabled, 1100, 260, 3);
      else beep(audioCtx, soundEnabled, 880, 220, 1);
    }
  }, [elapsed, phase, checkpoints, soundEnabled]);

  useEffect(() => {
    try {
      const rawDraft = localStorage.getItem(draftStorageId);
      if (!rawDraft) {
        setFeedbackDraft(createEmptyFeedback());
        setFeedbackError(null);
        return;
      }
      setFeedbackDraft(parseFeedbackDraft(JSON.parse(rawDraft)));
      setFeedbackError(null);
    } catch {
      setFeedbackDraft(createEmptyFeedback());
      setFeedbackError(null);
    }
  }, [draftStorageId]);

  useEffect(() => {
    try {
      if (!hasDraftContent(feedbackDraft)) {
        localStorage.removeItem(draftStorageId);
      } else {
        localStorage.setItem(draftStorageId, JSON.stringify(feedbackDraft));
      }
    } catch {
      // Ignore local storage failures so the timer keeps running.
    }

    // Debounced server save (2 second delay)
    if (debouncedSaveDraft.current) clearTimeout(debouncedSaveDraft.current);
    if (hasDraftContent(feedbackDraft)) {
      debouncedSaveDraft.current = setTimeout(() => {
        saveFeedbackDraftToServer(feedbackDraft).catch(() => {});
      }, 2000);
    }

    return () => {
      if (debouncedSaveDraft.current) clearTimeout(debouncedSaveDraft.current);
    };
  }, [draftStorageId, feedbackDraft, saveFeedbackDraftToServer]);

  // Flush feedback draft on tab hide/close
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && hasDraftContent(feedbackDraft)) {
        saveFeedbackDraftToServer(feedbackDraft).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [feedbackDraft, saveFeedbackDraftToServer]);

  useEffect(() => {
    if (!isActive && showTimerHelp) {
      setShowTimerHelp(false);
    }
  }, [isActive, showTimerHelp]);

  useEffect(() => {
    if ((!isActive || !isSynchronousFeedback) && showFeedbackInfo) {
      setShowFeedbackInfo(false);
    }
  }, [isActive, isSynchronousFeedback, showFeedbackInfo]);

  const updateFeedbackDraft = (nextFeedback: Feedback) => {
    setFeedbackDraft(nextFeedback);
    if (feedbackError) setFeedbackError(null);
  };

  const clearFeedbackDraft = (storageKey: string) => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore local storage failures so the timer keeps running.
    }
    setFeedbackDraft(createEmptyFeedback());
    setFeedbackError(null);
  };

  const remainingStudents = adjustedCount - studentsCompleted;
  const adjustValidation = useMemo(() => {
    if (adjustedCount === activeSession.number_of_students) return null;
    if (remainingStudents < 1) return "At least one remaining student is required.";
    return validateStudentCountChange({
      totalSeconds: activeSession.total_time_seconds,
      consumedSeconds,
      remainingStudents,
      bufferSeconds: activeSession.buffer_seconds,
      subjects: activeSession.subjects,
      feedbackSeconds: activeSession.feedback_seconds,
    });
  }, [adjustedCount, activeSession, consumedSeconds, remainingStudents]);

  const adjustPreview = useMemo(() => {
    if (adjustValidation || adjustedCount === activeSession.number_of_students) return null;
    const remainingTime = activeSession.total_time_seconds - consumedSeconds;
    const futureBuffers = activeSession.buffer_seconds * Math.max(remainingStudents - 1, 0);
    const perStudent = Math.floor((remainingTime - futureBuffers) / remainingStudents);
    return perStudent;
  }, [adjustValidation, adjustedCount, activeSession, consumedSeconds, remainingStudents]);

  const openAdjustDialog = useCallback(async () => {
    setAdjustedCount(activeSession.number_of_students);
    setAdjustError(null);
    const consumed = await getConsumedSeconds();
    setConsumedSeconds(consumed);
    setShowAdjustDialog(true);
  }, [activeSession.number_of_students, getConsumedSeconds]);

  const handleAdjustCount = useCallback(async () => {
    if (adjustValidation || adjustedCount === activeSession.number_of_students) return;
    try {
      setAdjusting(true);
      setAdjustError(null);
      await adjustStudentCount(adjustedCount);
      setShowAdjustDialog(false);
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : "Failed to adjust student count");
    } finally {
      setAdjusting(false);
    }
  }, [adjustValidation, adjustedCount, activeSession.number_of_students, adjustStudentCount]);

  const resetStudent = (storageKey: string = draftStorageId) => {
    setPhase("idle");
    setStudentName("");
    setNameInput("");
    setShowFeedbackInfo(false);
    setShowTimerHelp(false);
    setSetupSeconds(0);
    setElapsed(0);
    setSetupStartTime(null);
    setPresentationStartTime(null);
    setEndTime(null);
    setShowFeedbackDialog(false);
    lastCue.current = -1;
    clearFeedbackDraft(storageKey);
    setCurrentStudentOrder(null);
    // Reset timestamp tracking
    setSetupStartedAtMs(null);
    setPresentationStartedAtMs(null);
    setTotalPausedSeconds(0);
    setPauseStartTime(null);
    setSyncError(null);
    // Clear server live state (fire-and-forget)
    clearLiveTimerState().catch(() => {});
  };

  const openNameModal = (prefillName?: string, order?: number) => {
    if (order !== undefined) {
      setCurrentStudentOrder(order);
      setNameInput(prefillName ?? "");
    } else if (hasRoster) {
      const nextEntry = roster.find((e) => !completedOrders.has(e.order));
      setCurrentStudentOrder(nextEntry?.order ?? null);
      setNameInput(nextEntry?.studentName ?? "");
    } else {
      setCurrentStudentOrder(null);
      setNameInput("");
    }
    setShowNameModal(true);
  };

  const submitName = async () => {
    if (!nameInput.trim()) return;
    const name = nameInput.trim();
    setShowNameModal(false);
    await ensureAudio(audioCtx);

    try {
      setSyncError(null);
      const order = currentStudentOrder ?? nextStudentOrder;
      const result = await persistPhaseTransition("setup", {
        studentOrder: order,
        studentName: name,
      });
      setStudentName(name);
      const serverNow = result.serverNow;
      setClockOffset(serverNow.getTime() - Date.now());
      setSetupStartTime(serverNow);
      setSetupStartedAtMs(serverNow.getTime());
      setPhase("setup");
    } catch (err) {
      // Fallback: start locally if server fails
      setSyncError("Could not sync with server. Timer running locally.");
      setStudentName(name);
      setSetupStartTime(new Date());
      setPhase("setup");
    }
  };

  const startPresentation = async () => {
    beep(audioCtx, soundEnabled, 660, 200, 2);

    try {
      setSyncError(null);
      const result = await persistPhaseTransition("presenting");
      const serverNow = result.serverNow;
      setClockOffset(serverNow.getTime() - Date.now());
      setPresentationStartTime(serverNow);
      setPresentationStartedAtMs(serverNow.getTime());
      setTotalPausedSeconds(0);
      if (result.phase_setup_elapsed_at_transition != null) {
        setSetupSeconds(result.phase_setup_elapsed_at_transition);
      }
      setPhase("presenting");
    } catch {
      setSyncError("Could not sync with server. Timer running locally.");
      setPresentationStartTime(new Date());
      setPhase("presenting");
    }
  };

  const pause = async () => {
    // Optimistic: update UI immediately
    setPhase("paused");
    setPauseStartTime(Date.now());
    try {
      setSyncError(null);
      await persistPhaseTransition("paused");
    } catch {
      setSyncError("Pause not synced to server.");
    }
  };

  const resume = async () => {
    // Calculate how long we were paused
    const pausedMs = pauseStartTime ? Date.now() - pauseStartTime : 0;
    // Optimistic: update UI immediately
    setPhase("presenting");
    setTotalPausedSeconds((prev) => prev + Math.floor(pausedMs / 1000));
    setPauseStartTime(null);
    try {
      setSyncError(null);
      const result = await persistPhaseTransition("presenting", { addPausedMs: pausedMs });
      // Update paused total from server (authoritative)
      setTotalPausedSeconds(Math.floor((result.phase_total_paused_ms ?? 0) / 1000));
    } catch {
      setSyncError("Resume not synced to server.");
    }
  };

  const finish = async () => {
    // Optimistic: update UI immediately
    setEndTime(new Date());
    beep(audioCtx, soundEnabled, 1100, 260, 2);
    setPhase("finished");
    try {
      setSyncError(null);
      const result = await persistPhaseTransition("finished");
      if (result.phase_elapsed_at_finish != null) {
        setElapsed(result.phase_elapsed_at_finish);
      }
    } catch {
      setSyncError("Finish not synced to server.");
    }
  };

  const persistStudentRecord = async (): Promise<boolean> => {
    const cleanedFeedback = cleanFeedback(feedbackDraft);
    if (!hasFinalFeedback(cleanedFeedback)) {
      setFeedbackError("Final feedback is required before saving.");
      return false;
    }

    const storageKeyAtSave = draftStorageId;

    try {
      setFeedbackSaving(true);
      setFeedbackError(null);

      await saveStudentRecord({
        student_order: currentStudentOrder ?? undefined,
        student_name: studentName,
        setup_seconds: setupSeconds,
        presentation_seconds: Math.min(elapsed, TOTAL),
        overtime_seconds: overtime,
        time_saved_seconds: phase === "finished" ? Math.max(TOTAL - elapsed, 0) : 0,
        total_time_used_seconds: setupSeconds + elapsed,
        setup_started_at: setupStartTime ? setupStartTime.toISOString() : null,
        presentation_started_at: presentationStartTime ? presentationStartTime.toISOString() : null,
        ended_at: (endTime ?? new Date()).toISOString(),
        feedback: cleanedFeedback,
      });

      // Clear server live timer state
      clearLiveTimerState().catch(() => {});
      clearFeedbackDraft(storageKeyAtSave);

      const completedNow = studentsCompleted + 1;
      if (completedNow >= activeSession.number_of_students) {
        await completeSession();
        navigate("/history");
        return true;
      }

      resetStudent(storageKeyAtSave);
      return true;
    } catch (err) {
      setFeedbackError(errorMessage(err));
      return false;
    } finally {
      setFeedbackSaving(false);
    }
  };

  const perStudentLabel = `${fmtHM(TOTAL)} per student`;

  return (
    <div ref={pageRef} className="p-3 sm:p-4 md:p-8 lg:p-10">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6 md:px-8 md:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 max-w-3xl">
              <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 md:text-4xl">
                {studentName || appName}
              </h1>
              <p className="mt-2 text-base font-semibold text-slate-800">{activeSession.department}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-medium">
                  {activeSession.jury_type}
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-medium">
                  {activeSession.section} / Sem {activeSession.semester}
                </Badge>
                <Badge variant="outline" className="rounded-full px-3 py-1 text-xs font-medium">
                  {activeSession.academic_year}
                </Badge>
                <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-medium">
                  {perStudentLabel}
                </Badge>
              </div>
            </div>

            <div className="flex flex-col items-start gap-2.5 sm:items-end lg:justify-end">
              <div className="flex flex-wrap items-center gap-2.5 sm:justify-end">
              <div className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-slate-700">
                <span className="text-xs font-semibold uppercase tracking-widest">
                  Student {currentStudentOrder ?? nextStudentOrder} of {activeSession.number_of_students}
                </span>
              </div>
              <div className="flex items-center rounded-full bg-slate-50 px-4 py-2 ring-1 ring-slate-200">
                <div className="tabular-nums text-sm font-medium text-slate-500">{fmtClock(currentTime)}</div>
              </div>
              <button
                onClick={() => setSoundEnabled((value) => !value)}
                className={`flex items-center justify-center rounded-full p-2.5 ring-1 transition ${
                  soundEnabled
                    ? "bg-slate-50 text-slate-500 ring-slate-200 hover:bg-slate-100"
                    : "bg-slate-200 text-slate-400 ring-slate-300"
                }`}
              >
                <Volume2 className="h-4 w-4" />
              </button>
              </div>
            </div>
          </div>
        </div>

        {syncError && (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>{syncError}</span>
            <button
              type="button"
              className="ml-auto text-xs font-medium text-amber-600 hover:text-amber-800"
              onClick={() => setSyncError(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {restoringState && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            Restoring timer state from server...
          </div>
        )}

        {phase === "idle" && (
          <Card className="rounded-3xl border-0 shadow-sm">
            <CardContent className="px-4 py-12 sm:py-16">
              <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 text-center">
                <div className="w-full rounded-[2rem] bg-slate-900 px-6 py-8 text-white shadow-inner sm:px-8 sm:py-10">
                  <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Ready</div>
                  <div className="mt-2 text-6xl font-bold tabular-nums sm:text-7xl">{fmt(TOTAL)}</div>
                </div>

                <div className="flex w-full flex-wrap justify-center gap-2">
                  <Badge className="rounded-full px-4 py-1.5 text-sm">
                    {activeSession.subjects.length} Subjects &times; {fmt(plan.perSubjectSeconds)}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full px-4 py-1.5 text-sm">
                    Final Feedback {fmt(plan.feedbackSeconds)}
                  </Badge>
                  <Badge variant="outline" className="rounded-full px-4 py-1.5 text-sm">
                    {feedbackModeLabel(feedbackMode)} mode
                  </Badge>
                </div>

                <div className="flex w-full flex-wrap justify-center gap-2">
                  {activeSession.subjects.map((subject, index) => (
                    <span
                      key={index}
                      className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600"
                    >
                      <BookOpen className="h-3 w-3" /> {subject}
                    </span>
                  ))}
                </div>

                <Button
                  size="lg"
                  className="w-full rounded-2xl px-6 py-4 text-lg sm:py-5"
                  onClick={() => openNameModal()}
                >
                  <Play className="mr-2 h-6 w-6" />
                  Start Prep Timer
                </Button>

                <Button
                  variant="outline"
                  className="rounded-2xl px-5 py-3 text-sm"
                  onClick={() => void openAdjustDialog()}
                >
                  <Users className="mr-2 h-4 w-4" />
                  Adjust Student Count
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === "idle" && hasRoster && (
          <Card className="rounded-3xl border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="text-lg">Student Roster</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => {
                  setEditableRoster([...roster]);
                  setRosterError(null);
                  setNewStudentName("");
                  setNewEnrollmentNo("");
                  setShowRosterManage(true);
                }}
              >
                <Settings className="mr-1 h-3.5 w-3.5" /> Manage
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {roster.map((entry) => {
                  const isCompleted = completedOrders.has(entry.order);
                  return (
                    <div
                      key={entry.order}
                      className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 ring-1 ${
                        isCompleted
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : "bg-white text-slate-600 ring-slate-200"
                      }`}
                    >
                      <span className="w-6 text-center text-xs font-medium text-slate-400">{entry.order}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{entry.studentName}</div>
                        {entry.enrollmentNo && (
                          <div className="truncate text-xs opacity-60">{entry.enrollmentNo}</div>
                        )}
                      </div>
                      {isCompleted ? (
                        <Badge
                          variant="default"
                          className="shrink-0 rounded-full bg-emerald-600 text-xs"
                        >
                          Done
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="shrink-0 rounded-full px-3 py-1 text-xs"
                          onClick={() => openNameModal(entry.studentName, entry.order)}
                        >
                          <Play className="mr-1 h-3 w-3" /> Start
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {phase === "setup" && (
          <Card className="rounded-3xl border-0 shadow-sm">
            <CardContent className="px-4 py-12 sm:py-16">
              <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 text-center">
                <div className="w-full rounded-[2rem] bg-slate-900 px-6 py-14 text-white shadow-inner ring-1 ring-amber-200/30 sm:px-8 sm:py-16">
                  <div className="text-6xl font-bold tabular-nums sm:text-7xl">{fmt(setupSeconds)}</div>
                </div>

                <p className="max-w-sm text-slate-600">
                  <strong>{studentName}</strong> is setting up. Start the presentation when everything is ready.
                </p>

                <Button size="lg" className="w-full rounded-2xl px-6 py-4 text-base sm:py-5" onClick={startPresentation}>
                  <ChevronRight className="mr-2 h-5 w-5" />
                  Start Presentation
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isActive && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Card className="rounded-3xl border-0 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg md:text-xl">Live Timer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 sm:space-y-6">
                <div
                  className={`rounded-3xl px-5 py-14 text-center text-white shadow-inner sm:px-8 sm:py-16 ${
                    phase === "finished"
                      ? "bg-emerald-700"
                      : isOvertime
                      ? "bg-red-700"
                      : "bg-slate-900"
                  }`}
                >
                  {phase === "finished" ? (
                    <>
                      <div className="text-xs uppercase tracking-[0.2em] text-emerald-200">Finished</div>
                      <div className="mt-2 text-5xl font-bold tabular-nums md:text-7xl">{fmt(elapsed)}</div>
                      {remaining > 0 && (
                        <div className="mt-1 text-sm text-emerald-200">
                          {fmt(remaining)} remaining - finished early
                        </div>
                      )}
                    </>
                  ) : isOvertime ? (
                    <>
                      <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-[0.2em] text-red-200">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Total Time</span>
                      </div>
                      <div className="mt-2 text-5xl font-bold tabular-nums md:text-7xl">{fmt(elapsed)}</div>
                      <div className="mt-1 text-sm text-red-200">+{fmt(overtime)} overtime</div>
                    </>
                  ) : (
                    <>
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        {phase === "paused" ? "Paused" : "Total Remaining"}
                      </div>
                      <div className="mt-2 text-5xl font-bold tabular-nums md:text-7xl">{fmt(remaining)}</div>
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Total Progress</span>
                    <span>{Math.round(totalPct)}%</span>
                  </div>
                  <Progress value={totalPct} className="h-3" />
                </div>

                {!isOvertime && phase !== "finished" && (
                  <div className="rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-widest text-slate-400">Current Segment</div>
                        <div className="mt-1.5 text-xl font-semibold leading-snug text-slate-900">
                          {currentSegment.name}
                        </div>
                      </div>
                      <div className="sm:text-right">
                        <div className="text-xs text-slate-400">Remaining</div>
                        <div className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">
                          {fmt(stageRem)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-1.5">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Segment Progress</span>
                        <span>{Math.round(stagePct)}%</span>
                      </div>
                      <Progress value={stagePct} className="h-2" />
                    </div>
                  </div>
                )}

                {isOvertime && phase !== "finished" && (
                  <div className="rounded-2xl bg-red-50 p-5 ring-1 ring-red-200">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-xs font-medium uppercase tracking-widest text-red-500">
                          Time&apos;s Up
                        </div>
                        <div className="mt-1.5 text-xl font-semibold leading-snug text-red-700">Overtime</div>
                      </div>
                      <div className="sm:text-right">
                        <div className="text-xs text-red-500">Extra Time</div>
                        <div className="mt-0.5 text-3xl font-bold tabular-nums text-red-700">
                          +{fmt(overtime)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3 pt-3">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowTimerHelp((value) => !value)}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
                      aria-expanded={showTimerHelp}
                      aria-controls="timer-help-panel"
                    >
                      <Info className="h-4 w-4" />
                      {showTimerHelp ? "Hide info" : "Info"}
                    </button>
                  </div>

                  {showTimerHelp && (
                    <div
                      id="timer-help-panel"
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-relaxed text-slate-600"
                    >
                      {TIMER_HELP_COPY}
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {phase === "finished" ? (
                      <>
                        {isSynchronousFeedback ? (
                          <Button
                            size="lg"
                            className="w-full rounded-2xl px-6 py-4 text-lg sm:col-span-2 xl:col-span-1"
                            onClick={() => void persistStudentRecord()}
                            disabled={feedbackSaving}
                          >
                            <Save className="mr-2 h-5 w-5" />
                            {feedbackSaving ? "Saving..." : "Save Feedback & Continue"}
                          </Button>
                        ) : (
                          <Button
                            size="lg"
                            className="w-full rounded-2xl px-6 py-4 text-lg sm:col-span-2 xl:col-span-1"
                            onClick={() => setShowFeedbackDialog(true)}
                          >
                            <Save className="mr-2 h-5 w-5" /> Add Feedback & Continue
                          </Button>
                        )}
                        <Button
                          size="lg"
                          variant="outline"
                          className="w-full rounded-2xl px-6 py-4 text-lg"
                          onClick={() => resetStudent()}
                          disabled={feedbackSaving}
                        >
                          <RotateCcw className="mr-2 h-5 w-5" /> Discard
                        </Button>
                      </>
                    ) : (
                      <>
                        {phase === "presenting" ? (
                          <Button
                            size="lg"
                            variant="secondary"
                            className="w-full rounded-2xl px-6 py-4 text-lg"
                            onClick={pause}
                          >
                            <Pause className="mr-2 h-5 w-5" /> Pause
                          </Button>
                        ) : (
                          <Button size="lg" className="w-full rounded-2xl px-6 py-4 text-lg" onClick={resume}>
                            <Play className="mr-2 h-5 w-5" /> Resume
                          </Button>
                        )}
                        <Button
                          size="lg"
                          variant="outline"
                          className="w-full rounded-2xl border-red-200 px-6 py-4 text-lg text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={finish}
                        >
                          <Square className="mr-2 h-5 w-5" /> Finish
                        </Button>
                        <Button
                          size="lg"
                          variant="outline"
                          className="w-full rounded-2xl px-6 py-4 text-lg"
                          onClick={() => resetStudent()}
                        >
                          <RotateCcw className="mr-2 h-5 w-5" /> Reset
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {isSynchronousFeedback && (
                  <div className="space-y-4 rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 sm:p-6">
                    <div className="relative flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-slate-900">Feedback Draft</h3>
                        {activeSubject && phase !== "finished" && (
                          <div className="mt-2">
                            <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-medium">
                              Live subject: {activeSubject}
                            </Badge>
                          </div>
                        )}
                      </div>

                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() => setShowFeedbackInfo((value) => !value)}
                          className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
                          aria-expanded={showFeedbackInfo}
                          aria-label="Show feedback help"
                        >
                          <Info className="h-4 w-4" />
                        </button>

                        {showFeedbackInfo && (
                          <div className="absolute right-0 top-full z-10 mt-2 w-[min(18rem,calc(100vw-4rem))] rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600 shadow-lg">
                            <p>Drafts stay on this device until you save or discard the student.</p>
                            <p className="mt-2">{feedbackModeDescription(feedbackMode)}</p>
                            {phase === "finished" && (
                              <p className="mt-2">Review the notes, then save once for this student.</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <FeedbackEditor
                      feedback={feedbackDraft}
                      onChange={updateFeedbackDraft}
                      subjects={activeSession.subjects}
                      activeSubject={activeSubject}
                      finalRequired
                      compact
                    />

                    {feedbackError && (
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {feedbackError}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card className="rounded-3xl border-0 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg md:text-xl">Time Report</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2 leading-relaxed">
                      <span className="text-slate-500">Entered</span>
                      <span className="tabular-nums font-medium text-slate-700">{fmtClock(setupStartTime)}</span>
                    </div>
                    <div className="flex flex-wrap items-start justify-between gap-2 leading-relaxed">
                      <span className="text-slate-500">Presented</span>
                      <span className="tabular-nums font-medium text-slate-700">
                        {fmtClock(presentationStartTime)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-start justify-between gap-2 leading-relaxed">
                      <span className="text-slate-500">{endTime ? "Ended" : "Now"}</span>
                      <span className="tabular-nums font-medium text-slate-700">
                        {fmtClock(endTime || currentTime)}
                      </span>
                    </div>

                    <div className="my-1 border-t border-slate-200" />

                    <div className="flex flex-wrap items-start justify-between gap-2 leading-relaxed">
                      <span className="text-slate-500">Setup Time</span>
                      <span className="font-semibold tabular-nums text-amber-700">{fmt(setupSeconds)}</span>
                    </div>
                    <div className="flex flex-wrap items-start justify-between gap-2 leading-relaxed">
                      <span className="text-slate-500">Presentation</span>
                      <span className="font-semibold tabular-nums text-slate-700">
                        {fmt(Math.min(elapsed, TOTAL))}
                      </span>
                    </div>
                    {isOvertime && (
                      <div className="flex flex-wrap items-start justify-between gap-2 leading-relaxed text-red-600">
                        <span>Overtime</span>
                        <span className="font-semibold tabular-nums">+{fmt(overtime)}</span>
                      </div>
                    )}
                    {phase === "finished" && remaining > 0 && (
                      <div className="flex flex-wrap items-start justify-between gap-2 leading-relaxed text-emerald-600">
                        <span>Time Saved</span>
                        <span className="font-semibold tabular-nums">{fmt(remaining)}</span>
                      </div>
                    )}

                    <div className="my-1 border-t border-slate-200" />

                    <div className="flex flex-wrap items-start justify-between gap-2 text-base font-bold leading-relaxed">
                      <span className="text-slate-800">Total Time</span>
                      <span className="tabular-nums text-slate-900">{fmt(setupSeconds + elapsed)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-0 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg md:text-xl">Segment Plan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-2xl bg-amber-50 px-5 py-3.5 ring-1 ring-amber-200">
                    <div className="flex items-center gap-2.5">
                      <Settings className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-medium text-amber-800">Setup</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-amber-700">{fmt(setupSeconds)}</span>
                  </div>

                  {segments.map((segment, index) => {
                    const start = segmentStart(index, segments);
                    const end = start + segment.seconds;
                    const done = elapsed >= end;
                    const active = elapsed >= start && elapsed < end && phase !== "finished";

                    return (
                      <div
                        key={`${segment.name}-${index}`}
                        className={`rounded-2xl px-5 py-3.5 ring-1 transition-all ${
                          active
                            ? "bg-slate-900 text-white ring-slate-900"
                            : done
                            ? "bg-slate-100 text-slate-400 ring-slate-200"
                            : "bg-white text-slate-700 ring-slate-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold leading-snug">{segment.name}</div>
                          </div>
                          <Badge
                            variant={active ? "secondary" : "outline"}
                            className={`shrink-0 rounded-full ${
                              done && !active ? "border-slate-200 text-slate-400" : ""
                            }`}
                          >
                            {done ? "Done" : active ? "Live" : "Pending"}
                          </Badge>
                        </div>
                        <div
                          className={`mt-1.5 text-xs leading-normal ${
                            active ? "text-slate-300" : "text-slate-400"
                          }`}
                        >
                          {fmt(segment.seconds)}
                        </div>
                      </div>
                    );
                  })}

                  {isOvertime && (
                    <div className="flex items-center justify-between rounded-2xl bg-red-700 px-5 py-3.5 text-white ring-1 ring-red-700">
                      <div className="flex items-center gap-2.5">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm font-semibold">Overtime</span>
                      </div>
                      <span className="text-sm font-bold tabular-nums">+{fmt(overtime)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {hasRoster && (
                <Card className="rounded-3xl border-0 shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between pb-4">
                    <CardTitle className="text-lg md:text-xl">Student Roster</CardTitle>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => {
                        setEditableRoster([...roster]);
                        setRosterError(null);
                        setNewStudentName("");
                        setNewEnrollmentNo("");
                        setShowRosterManage(true);
                      }}
                    >
                      <Settings className="mr-1 h-3.5 w-3.5" /> Manage
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {roster.map((entry) => {
                      const isCompleted = completedOrders.has(entry.order);
                      const isCurrent = entry.order === currentStudentOrder;
                      return (
                        <div
                          key={entry.order}
                          className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 ring-1 transition-all ${
                            isCompleted
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : isCurrent
                              ? "bg-blue-100 text-blue-800 ring-2 ring-blue-400 shadow-md"
                              : "bg-white text-slate-600 ring-slate-200"
                          }`}
                        >
                          <span className="w-6 text-center text-xs font-medium">{entry.order}</span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{entry.studentName}</div>
                            {entry.enrollmentNo && (
                              <div className="truncate text-xs opacity-60">{entry.enrollmentNo}</div>
                            )}
                          </div>
                          <Badge
                            variant={isCompleted ? "default" : isCurrent ? "default" : "outline"}
                            className={`shrink-0 rounded-full text-xs ${
                              isCompleted ? "bg-emerald-600" : isCurrent ? "bg-blue-600 text-white" : ""
                            }`}
                          >
                            {isCompleted ? "Done" : isCurrent ? "Current" : "Pending"}
                          </Badge>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>

      <FeedbackDialog
        open={showFeedbackDialog}
        onOpenChange={(open) => {
          if (!open) setFeedbackError(null);
          setShowFeedbackDialog(open);
        }}
        studentName={studentName}
        subjects={activeSession.subjects}
        feedback={feedbackDraft}
        onChange={updateFeedbackDraft}
        saving={feedbackSaving}
        error={feedbackError}
        onSubmit={async () => {
          const saved = await persistStudentRecord();
          if (saved) setShowFeedbackDialog(false);
        }}
      />

      <Dialog open={showNameModal} onOpenChange={setShowNameModal}>
        <DialogContent
          className="max-w-md"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Student Name</DialogTitle>
            <DialogDescription>
              {hasRoster
                ? `Student ${currentStudentOrder ?? nextStudentOrder} of ${activeSession.number_of_students}. Confirm or edit the name.`
                : "Enter the student\u2019s name to begin setup."}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitName();
            }}
            className="space-y-5"
          >
            {(() => {
              const rosterEntry = hasRoster ? roster.find((e) => e.order === (currentStudentOrder ?? nextStudentOrder)) : null;
              return rosterEntry?.enrollmentNo ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Enrollment</span>
                  <div className="mt-0.5 font-mono">{rosterEntry.enrollmentNo}</div>
                </div>
              ) : null;
            })()}
            <Input
              ref={inputRef}
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="e.g. Aavriti Sharma"
              className="h-14 rounded-2xl px-4 text-lg"
            />

            <Button type="submit" size="lg" className="w-full rounded-2xl" disabled={!nameInput.trim()}>
              <Settings className="mr-2 h-4 w-4" />
              Start Setup
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Student Count</DialogTitle>
            <DialogDescription>
              Add or remove students. Remaining time will be redistributed equally.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Completed</span>
                <span className="font-semibold text-slate-900">{studentsCompleted} students</span>
              </div>
              <div className="mt-2 flex justify-between">
                <span className="text-slate-600">Remaining</span>
                <span className="font-semibold text-slate-900">
                  {activeSession.number_of_students - studentsCompleted} students
                </span>
              </div>
              <div className="mt-3 border-t border-slate-200 pt-3">
                <div className="flex justify-between">
                  <span className="text-slate-600">Time remaining</span>
                  <span className="font-semibold text-emerald-700">
                    {fmtHM(Math.max(activeSession.total_time_seconds - consumedSeconds, 0))}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">New Total Student Count</label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-12 w-12 shrink-0 rounded-2xl p-0"
                  onClick={() => setAdjustedCount((c) => Math.max(studentsCompleted + 1, c - 1))}
                  disabled={adjustedCount <= studentsCompleted + 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>

                <Input
                  type="number"
                  min={studentsCompleted + 1}
                  max={99}
                  value={adjustedCount}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v)) setAdjustedCount(Math.max(studentsCompleted + 1, Math.min(99, v)));
                  }}
                  className="h-12 rounded-2xl text-center text-lg font-semibold"
                />

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-12 w-12 shrink-0 rounded-2xl p-0"
                  onClick={() => setAdjustedCount((c) => Math.min(99, c + 1))}
                  disabled={adjustedCount >= 99}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {adjustedCount !== activeSession.number_of_students && !adjustValidation && adjustPreview !== null && (
                <p className="text-sm text-slate-600">
                  {adjustedCount > activeSession.number_of_students
                    ? `Adding ${adjustedCount - activeSession.number_of_students}`
                    : `Removing ${activeSession.number_of_students - adjustedCount}`}{" "}
                  student{Math.abs(adjustedCount - activeSession.number_of_students) !== 1 ? "s" : ""} &middot; New
                  time per student: {fmtHM(adjustPreview)}
                </p>
              )}
            </div>

            {adjustValidation && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {adjustValidation}
              </div>
            )}

            {adjustError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {adjustError}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-2xl"
                onClick={() => setShowAdjustDialog(false)}
                disabled={adjusting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1 rounded-2xl"
                onClick={() => void handleAdjustCount()}
                disabled={adjusting || !!adjustValidation || adjustedCount === activeSession.number_of_students}
              >
                {adjusting ? "Updating..." : "Update Count"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeviceLock} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Session Active Elsewhere
            </DialogTitle>
            <DialogDescription>
              Another device is currently controlling this jury session.
              {deviceLockInfo && deviceLockInfo.locked && (
                <span className="mt-1 block text-xs text-slate-400">
                  Last active: {Math.round((Date.now() - deviceLockInfo.lastHeartbeat.getTime()) / 1000)}s ago
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Button
              className="w-full rounded-2xl"
              onClick={() => void handleTakeOver()}
              disabled={takingOver}
            >
              {takingOver ? "Taking over..." : "Take Over Control"}
            </Button>
            <Button
              variant="outline"
              className="w-full rounded-2xl"
              onClick={() => setShowDeviceLock(false)}
            >
              View Only
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRosterManage} onOpenChange={setShowRosterManage}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Student Roster</DialogTitle>
            <DialogDescription>
              Add, remove, or reorder pending students. Completed students cannot be changed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {editableRoster.map((entry, i) => {
                const isCompleted = completedOrders.has(entry.order);
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 ring-1 ${
                      isCompleted
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-white text-slate-700 ring-slate-200"
                    }`}
                  >
                    <span className="w-6 text-center text-xs font-medium text-slate-400">{entry.order}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{entry.studentName}</div>
                      {entry.enrollmentNo && (
                        <div className="truncate text-xs text-slate-400">{entry.enrollmentNo}</div>
                      )}
                    </div>
                    {isCompleted ? (
                      <Badge variant="default" className="shrink-0 rounded-full bg-emerald-600 text-xs">Done</Badge>
                    ) : (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                          disabled={i === 0 || completedOrders.has(editableRoster[i - 1]?.order)}
                          onClick={() => {
                            setEditableRoster((prev) => {
                              const copy = [...prev];
                              [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
                              return copy.map((e, idx) => ({ ...e, order: idx + 1 }));
                            });
                          }}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                          disabled={i >= editableRoster.length - 1}
                          onClick={() => {
                            setEditableRoster((prev) => {
                              const copy = [...prev];
                              [copy[i], copy[i + 1]] = [copy[i + 1], copy[i]];
                              return copy.map((e, idx) => ({ ...e, order: idx + 1 }));
                            });
                          }}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                          onClick={() => {
                            setEditableRoster((prev) =>
                              prev.filter((_, idx) => idx !== i).map((e, idx) => ({ ...e, order: idx + 1 })),
                            );
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-2">Add Student</div>
              <div className="flex gap-2">
                <Input
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="Student name"
                  className="flex-1 rounded-xl text-sm"
                />
                <Input
                  value={newEnrollmentNo}
                  onChange={(e) => setNewEnrollmentNo(e.target.value)}
                  placeholder="Enrollment (optional)"
                  className="w-36 rounded-xl text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={!newStudentName.trim()}
                  onClick={() => {
                    setEditableRoster((prev) => [
                      ...prev,
                      {
                        studentName: newStudentName.trim(),
                        enrollmentNo: newEnrollmentNo.trim(),
                        order: prev.length + 1,
                      },
                    ]);
                    setNewStudentName("");
                    setNewEnrollmentNo("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {rosterError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {rosterError}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-2xl"
                onClick={() => setShowRosterManage(false)}
                disabled={rosterSaving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1 rounded-2xl"
                disabled={rosterSaving || editableRoster.length < studentsCompleted + 1}
                onClick={async () => {
                  setRosterError(null);
                  setRosterSaving(true);
                  try {
                    await updateRoster(editableRoster);
                    setShowRosterManage(false);
                  } catch (err) {
                    setRosterError(err instanceof Error ? err.message : "Failed to update roster");
                  } finally {
                    setRosterSaving(false);
                  }
                }}
              >
                {rosterSaving ? "Saving..." : "Save Roster"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
