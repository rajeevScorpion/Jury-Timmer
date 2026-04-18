import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Clock3,
  AlertTriangle,
  User,
  Settings,
  ChevronRight,
  Square,
  BookOpen,
  Save,
} from "lucide-react";
import { fmt, fmtClock } from "@/lib/timeFormat";
import { beep, ensureAudio } from "@/lib/audio";
import type { Feedback, JurySession } from "@/types/session";
import {
  computePerStudentPlan,
  checkpointsFor,
  segmentIndexAt,
  segmentStart,
  type PerStudentPlan,
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
  const { saveStudentRecord, completeSession, studentsCompleted, nextStudentOrder } = useSession();
  const plan: PerStudentPlan = useMemo(
    () =>
      computePerStudentPlan({
        totalSeconds: activeSession.total_time_seconds,
        students: activeSession.number_of_students,
        bufferSeconds: activeSession.buffer_seconds,
        subjects: activeSession.subjects,
        feedbackSeconds: activeSession.feedback_seconds,
      }),
    [activeSession],
  );

  const TOTAL = plan.totalSeconds;
  const segments = plan.segments;
  const checkpoints = useMemo(() => checkpointsFor(segments), [segments]);
  const feedbackMode = normalizeFeedbackMode(activeSession.feedback_mode, LEGACY_FEEDBACK_MODE);
  const isSynchronousFeedback = feedbackMode === "synchronous";
  const draftStorageId = useMemo(
    () => feedbackDraftStorageKey(activeSession.id, nextStudentOrder),
    [activeSession.id, nextStudentOrder],
  );

  const [phase, setPhase] = useState<Phase>("idle");
  const [studentName, setStudentName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [showNameModal, setShowNameModal] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);

  const [setupSeconds, setSetupSeconds] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [feedbackDraft, setFeedbackDraft] = useState<Feedback>(() => createEmptyFeedback());
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSaving, setFeedbackSaving] = useState(false);

  const [setupStartTime, setSetupStartTime] = useState<Date | null>(null);
  const [presentationStartTime, setPresentationStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const tick = useRef<number | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const lastCue = useRef(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (phase === "setup") {
      tick.current = window.setInterval(() => setSetupSeconds((previous) => previous + 1), 1000);
    } else if (phase === "presenting") {
      tick.current = window.setInterval(() => setElapsed((previous) => previous + 1), 1000);
    }

    return () => {
      if (tick.current) {
        clearInterval(tick.current);
        tick.current = null;
      }
    };
  }, [phase]);

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
        return;
      }
      localStorage.setItem(draftStorageId, JSON.stringify(feedbackDraft));
    } catch {
      // Ignore local storage failures so the timer keeps running.
    }
  }, [draftStorageId, feedbackDraft]);

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

  const resetStudent = (storageKey: string = draftStorageId) => {
    setPhase("idle");
    setStudentName("");
    setNameInput("");
    setSetupSeconds(0);
    setElapsed(0);
    setSetupStartTime(null);
    setPresentationStartTime(null);
    setEndTime(null);
    setShowFeedbackDialog(false);
    lastCue.current = -1;
    clearFeedbackDraft(storageKey);
  };

  const openNameModal = () => {
    setNameInput("");
    setShowNameModal(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const submitName = async () => {
    if (!nameInput.trim()) return;
    setStudentName(nameInput.trim());
    setShowNameModal(false);
    await ensureAudio(audioCtx);
    setSetupStartTime(new Date());
    setPhase("setup");
  };

  const startPresentation = () => {
    beep(audioCtx, soundEnabled, 660, 200, 2);
    setPresentationStartTime(new Date());
    setPhase("presenting");
  };

  const pause = () => setPhase("paused");
  const resume = () => setPhase("presenting");

  const finish = () => {
    setEndTime(new Date());
    beep(audioCtx, soundEnabled, 1100, 260, 2);
    setPhase("finished");
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

  const isActive = phase === "presenting" || phase === "paused" || phase === "finished";

  const perStudentLabel = `${fmt(TOTAL)} per student`;

  return (
    <div ref={pageRef} className="p-3 sm:p-4 md:p-8 lg:p-10">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-6 md:px-8 md:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 max-w-3xl">
              <div className="mb-1 flex items-center gap-2 text-slate-500">
                <Clock3 className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-widest">Jury Day</span>
              </div>
              <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 md:text-4xl">
                {appName}
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

            <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
              <div className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-slate-700">
                <span className="text-xs font-semibold uppercase tracking-widest">
                  Student {nextStudentOrder} of {activeSession.number_of_students}
                </span>
              </div>
              {studentName && (
                <div className="flex min-w-0 items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-white">
                  <User className="h-4 w-4" />
                  <span className="truncate text-sm font-semibold">{studentName}</span>
                </div>
              )}
              {phase !== "idle" && setupSeconds > 0 && (
                <div className="flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-amber-800">
                  <Settings className="h-4 w-4" />
                  <span className="text-xs font-semibold">Setup {fmt(setupSeconds)}</span>
                </div>
              )}
              <div className="tabular-nums text-sm font-medium text-slate-400">{fmtClock(currentTime)}</div>
              <button
                onClick={() => setSoundEnabled((value) => !value)}
                className={`rounded-full p-2.5 transition ${
                  soundEnabled ? "text-slate-500 hover:bg-slate-100" : "bg-slate-200 text-slate-400"
                }`}
              >
                <Volume2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {phase === "idle" && (
          <Card className="rounded-3xl border-0 shadow-sm">
            <CardContent className="flex flex-col items-center gap-6 px-4 py-12 text-center sm:py-16">
              <div className="rounded-3xl bg-slate-900 px-8 py-8 text-white shadow-inner sm:px-12 sm:py-10 md:px-20 md:py-14">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Ready</div>
                <div className="mt-2 text-6xl font-bold tabular-nums md:text-8xl">{fmt(TOTAL)}</div>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Badge className="rounded-full px-4 py-1 text-sm">
                  {activeSession.subjects.length} Subjects &times; {fmt(plan.perSubjectSeconds)}
                </Badge>
                <Badge variant="secondary" className="rounded-full px-4 py-1 text-sm">
                  Final Feedback {fmt(plan.feedbackSeconds)}
                </Badge>
                <Badge variant="outline" className="rounded-full px-4 py-1 text-sm">
                  {feedbackModeLabel(feedbackMode)} mode
                </Badge>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 sm:px-6">
                {activeSession.subjects.map((subject, index) => (
                  <span
                    key={index}
                    className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                  >
                    <BookOpen className="h-3 w-3" /> {subject}
                  </span>
                ))}
              </div>
              <Button
                size="lg"
                className="w-full rounded-2xl px-6 py-4 text-lg sm:w-auto sm:px-10 sm:py-6"
                onClick={openNameModal}
              >
                <Play className="mr-2 h-6 w-6" />
                Start Prep Timer
              </Button>
            </CardContent>
          </Card>
        )}

        {phase === "setup" && (
          <Card className="rounded-3xl border-0 shadow-sm">
            <CardContent className="flex flex-col items-center gap-6 px-4 py-12 text-center sm:py-16">
              <div className="rounded-3xl bg-amber-500 px-8 py-8 text-white shadow-inner sm:px-12 sm:py-10 md:px-20 md:py-14">
                <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-[0.2em] text-amber-100">
                  <Settings className="h-4 w-4 animate-spin" style={{ animationDuration: "3s" }} />
                  <span>Setting Up</span>
                </div>
                <div className="mt-2 text-6xl font-bold tabular-nums md:text-8xl">{fmt(setupSeconds)}</div>
              </div>
              <p className="max-w-md text-slate-500">
                <strong>{studentName}</strong> is setting up. Click below when ready to present.
              </p>
              <Button
                size="lg"
                className="w-full rounded-2xl bg-emerald-600 px-6 py-4 text-base hover:bg-emerald-700 sm:w-auto sm:px-10"
                onClick={startPresentation}
              >
                <ChevronRight className="mr-2 h-5 w-5" />
                Start Presentation
              </Button>
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
                  className={`rounded-3xl px-5 py-6 text-center text-white shadow-inner sm:px-8 sm:py-8 md:py-12 ${
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

                <div className="grid gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-3">
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

                <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm leading-relaxed text-slate-500">
                  One click starts the full {fmt(TOTAL)} cycle. The app beeps once after each subject
                  segment and gives a triple beep when time is up. The timer continues counting overtime
                  so students can see how much extra time was used.
                </div>

                {isSynchronousFeedback && (
                  <div className="space-y-4 rounded-3xl bg-slate-50 p-6 ring-1 ring-slate-200">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">Feedback Draft</h3>
                    </div>

                    <div className="rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
                      {phase === "finished"
                        ? "Review the live notes, then save once for this student."
                        : "Write notes during the jury. They stay local on this device until you save or discard the student."}
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

                    <div className="text-xs leading-relaxed text-slate-400">
                      {feedbackModeDescription(feedbackMode)}
                    </div>
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
                        className={`flex flex-col gap-3 rounded-2xl px-5 py-3.5 ring-1 transition-all sm:flex-row sm:items-center sm:justify-between ${
                          active
                            ? "bg-slate-900 text-white ring-slate-900"
                            : done
                            ? "bg-slate-100 text-slate-400 ring-slate-200"
                            : "bg-white text-slate-700 ring-slate-200"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold leading-snug">{segment.name}</div>
                          <div
                            className={`mt-0.5 text-xs leading-normal ${
                              active ? "text-slate-300" : "text-slate-400"
                            }`}
                          >
                            {fmt(segment.seconds)}
                          </div>
                        </div>
                        <Badge
                          variant={active ? "secondary" : "outline"}
                          className={`rounded-full ${done && !active ? "border-slate-200 text-slate-400" : ""}`}
                        >
                          {done ? "Done" : active ? "Live" : "Pending"}
                        </Badge>
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

      {showNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl sm:p-8">
            <h2 className="text-2xl font-bold text-slate-900">Student Name</h2>
            <p className="mt-1 text-sm text-slate-500">Enter the student&apos;s name to begin setup.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitName();
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="e.g. Aavriti Sharma"
                className="mt-5 w-full rounded-2xl border border-slate-300 px-4 py-3 text-lg text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full rounded-2xl sm:flex-1"
                  disabled={!nameInput.trim()}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Start Setup
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="w-full rounded-2xl sm:w-auto"
                  onClick={() => setShowNameModal(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
