import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
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
  Camera,
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

type Phase = "idle" | "setup" | "presenting" | "paused" | "finished";

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

  const [phase, setPhase] = useState<Phase>("idle");
  const [studentName, setStudentName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [showModal, setShowModal] = useState(false);

  const [setupSeconds, setSetupSeconds] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [setupStartTime, setSetupStartTime] = useState<Date | null>(null);
  const [presentationStartTime, setPresentationStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showFeedback, setShowFeedback] = useState(false);

  const tick = useRef<number | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const lastCue = useRef(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);

  const isOvertime = elapsed > TOTAL;
  const overtime = Math.max(elapsed - TOTAL, 0);
  const remaining = Math.max(TOTAL - elapsed, 0);
  const totalPct = Math.min((elapsed / TOTAL) * 100, 100);

  const stageIdx = useMemo(() => segmentIndexAt(Math.min(elapsed, TOTAL - 1), segments), [elapsed, segments, TOTAL]);
  const stageStart = segmentStart(stageIdx, segments);
  const stageDur = segments[stageIdx].seconds;
  const stageElapsed = Math.min(Math.max(elapsed - stageStart, 0), stageDur);
  const stageRem = Math.max(stageDur - stageElapsed, 0);
  const stagePct = Math.min((stageElapsed / stageDur) * 100, 100);

  useEffect(() => {
    const id = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (phase === "setup") {
      tick.current = window.setInterval(() => setSetupSeconds((p) => p + 1), 1000);
    } else if (phase === "presenting") {
      tick.current = window.setInterval(() => setElapsed((p) => p + 1), 1000);
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
    const idx = checkpoints.findIndex((pt) => elapsed === pt);
    if (idx !== -1 && lastCue.current !== idx) {
      lastCue.current = idx;
      const isFinalCheckpoint = idx === checkpoints.length - 1;
      if (isFinalCheckpoint) beep(audioCtx, soundEnabled, 1100, 260, 3);
      else beep(audioCtx, soundEnabled, 880, 220, 1);
    }
  }, [elapsed, phase, checkpoints, soundEnabled]);

  const openModal = () => {
    setNameInput("");
    setShowModal(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const submitName = async () => {
    if (!nameInput.trim()) return;
    setStudentName(nameInput.trim());
    setShowModal(false);
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

  const reset = () => {
    setPhase("idle");
    setStudentName("");
    setSetupSeconds(0);
    setElapsed(0);
    setSetupStartTime(null);
    setPresentationStartTime(null);
    setEndTime(null);
    lastCue.current = -1;
  };

  const handleFeedbackSubmit = async (feedback: Feedback) => {
    const presentationCapped = Math.min(elapsed, TOTAL);
    await saveStudentRecord({
      student_name: studentName,
      setup_seconds: setupSeconds,
      presentation_seconds: presentationCapped,
      overtime_seconds: overtime,
      time_saved_seconds: phase === "finished" ? Math.max(TOTAL - elapsed, 0) : 0,
      total_time_used_seconds: setupSeconds + elapsed,
      setup_started_at: setupStartTime ? setupStartTime.toISOString() : null,
      presentation_started_at: presentationStartTime ? presentationStartTime.toISOString() : null,
      ended_at: (endTime ?? new Date()).toISOString(),
      feedback,
    });
    const completedNow = studentsCompleted + 1;
    if (completedNow >= activeSession.number_of_students) {
      await completeSession();
      navigate("/history");
      return;
    }
    reset();
  };

  const isActive = phase === "presenting" || phase === "paused" || phase === "finished";

  const takeScreenshot = async () => {
    if (!pageRef.current) return;
    const canvas = await html2canvas(pageRef.current, {
      backgroundColor: "#f1f5f9",
      scale: 2,
      useCORS: true,
    });
    const link = document.createElement("a");
    link.download = `jury-timer${studentName ? "-" + studentName.replace(/\s+/g, "-") : ""}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const contextLine = `${activeSession.department} \u2022 ${activeSession.section} \u2022 Sem ${activeSession.semester} \u2022 ${activeSession.academic_year}`;
  const perStudentLabel = `${fmt(TOTAL)} per student`;

  return (
    <div ref={pageRef} className="p-4 md:p-8 lg:p-10">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 md:px-8 md:py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-slate-500">
                <Clock3 className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-widest">Jury Day</span>
              </div>
              <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900 md:text-4xl">Jury Timer</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                {contextLine} &bull; {perStudentLabel}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-slate-700">
                <span className="text-xs font-semibold uppercase tracking-widest">
                  Student {nextStudentOrder} of {activeSession.number_of_students}
                </span>
              </div>
              {studentName && (
                <div className="flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-white">
                  <User className="h-4 w-4" />
                  <span className="text-sm font-semibold">{studentName}</span>
                </div>
              )}
              {phase !== "idle" && setupSeconds > 0 && (
                <div className="flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-amber-800">
                  <Settings className="h-4 w-4" />
                  <span className="text-xs font-semibold">Setup {fmt(setupSeconds)}</span>
                </div>
              )}
              <div className="tabular-nums text-sm font-medium text-slate-400">
                {fmtClock(currentTime)}
              </div>
              <button
                onClick={takeScreenshot}
                className="rounded-full p-2.5 text-slate-500 transition hover:bg-slate-100"
                title="Save screenshot"
              >
                <Camera className="h-4 w-4" />
              </button>
              <button
                onClick={() => setSoundEnabled((v) => !v)}
                className={`rounded-full p-2.5 transition ${soundEnabled ? "text-slate-500 hover:bg-slate-100" : "bg-slate-200 text-slate-400"}`}
              >
                <Volume2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {phase === "idle" && (
          <Card className="rounded-3xl border-0 shadow-sm">
            <CardContent className="flex flex-col items-center gap-6 py-16 text-center">
              <div className="rounded-3xl bg-slate-900 px-12 py-10 text-white shadow-inner md:px-20 md:py-14">
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
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 px-6">
                {activeSession.subjects.map((s, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                  >
                    <BookOpen className="h-3 w-3" /> {s}
                  </span>
                ))}
              </div>
              <Button size="lg" className="rounded-2xl px-10 py-6 text-lg" onClick={openModal}>
                <Play className="mr-2 h-6 w-6" />
                Start Prep Timer
              </Button>
            </CardContent>
          </Card>
        )}

        {phase === "setup" && (
          <Card className="rounded-3xl border-0 shadow-sm">
            <CardContent className="flex flex-col items-center gap-6 py-16 text-center">
              <div className="rounded-3xl bg-amber-500 px-12 py-10 text-white shadow-inner md:px-20 md:py-14">
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
                className="rounded-2xl bg-emerald-600 px-10 text-base hover:bg-emerald-700"
                onClick={startPresentation}
              >
                <ChevronRight className="mr-2 h-5 w-5" />
                Start Presentation
              </Button>
            </CardContent>
          </Card>
        )}

        {isActive && (
          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <Card className="rounded-3xl border-0 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg md:text-xl">Live Timer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div
                  className={`rounded-3xl px-8 py-8 text-center text-white shadow-inner md:py-12 ${
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
                          {fmt(remaining)} remaining &mdash; finished early
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
                    <div className="flex items-center justify-between gap-6">
                      <div>
                        <div className="text-xs uppercase tracking-widest text-slate-400">Current Segment</div>
                        <div className="mt-1.5 text-xl font-semibold leading-snug text-slate-900">
                          {segments[stageIdx].name}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Remaining</div>
                        <div className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{fmt(stageRem)}</div>
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
                    <div className="flex items-center justify-between gap-6">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-widest text-red-500">
                          Time&rsquo;s Up
                        </div>
                        <div className="mt-1.5 text-xl font-semibold leading-snug text-red-700">Overtime</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-red-500">Extra Time</div>
                        <div className="mt-0.5 text-3xl font-bold tabular-nums text-red-700">+{fmt(overtime)}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4 pt-3">
                  {phase === "finished" ? (
                    <>
                      <Button
                        size="lg"
                        className="rounded-2xl px-10 py-6 text-lg"
                        onClick={() => setShowFeedback(true)}
                      >
                        <Save className="mr-2 h-5 w-5" /> Save Feedback & Continue
                      </Button>
                      <div className="ml-auto">
                        <Button
                          size="lg"
                          variant="outline"
                          className="rounded-2xl px-8 py-6 text-lg"
                          onClick={reset}
                        >
                          <RotateCcw className="mr-2 h-5 w-5" /> Discard
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex gap-4">
                        {phase === "presenting" ? (
                          <Button size="lg" variant="secondary" className="rounded-2xl px-8 py-6 text-lg" onClick={pause}>
                            <Pause className="mr-2 h-5 w-5" /> Pause
                          </Button>
                        ) : (
                          <Button size="lg" className="rounded-2xl px-8 py-6 text-lg" onClick={resume}>
                            <Play className="mr-2 h-5 w-5" /> Resume
                          </Button>
                        )}
                        <Button
                          size="lg"
                          variant="outline"
                          className="rounded-2xl border-red-200 px-8 py-6 text-lg text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={finish}
                        >
                          <Square className="mr-2 h-5 w-5" /> Finish
                        </Button>
                      </div>
                      <div className="ml-auto">
                        <Button size="lg" variant="outline" className="rounded-2xl px-8 py-6 text-lg" onClick={reset}>
                          <RotateCcw className="mr-2 h-5 w-5" /> Reset
                        </Button>
                      </div>
                    </>
                  )}
                </div>

                <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm leading-relaxed text-slate-500">
                  One click starts the full {fmt(TOTAL)} cycle. The app beeps once after each subject segment and gives a
                  triple beep when time is up. The timer continues counting overtime so students can see how much extra
                  time was used.
                </div>
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card className="rounded-3xl border-0 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg md:text-xl">Time Report</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between leading-relaxed">
                      <span className="text-slate-500">Entered</span>
                      <span className="tabular-nums font-medium text-slate-700">{fmtClock(setupStartTime)}</span>
                    </div>
                    <div className="flex justify-between leading-relaxed">
                      <span className="text-slate-500">Presented</span>
                      <span className="tabular-nums font-medium text-slate-700">{fmtClock(presentationStartTime)}</span>
                    </div>
                    <div className="flex justify-between leading-relaxed">
                      <span className="text-slate-500">{endTime ? "Ended" : "Now"}</span>
                      <span className="tabular-nums font-medium text-slate-700">
                        {fmtClock(endTime || currentTime)}
                      </span>
                    </div>

                    <div className="border-t border-slate-200 my-1" />

                    <div className="flex justify-between leading-relaxed">
                      <span className="text-slate-500">Setup Time</span>
                      <span className="font-semibold tabular-nums text-amber-700">{fmt(setupSeconds)}</span>
                    </div>
                    <div className="flex justify-between leading-relaxed">
                      <span className="text-slate-500">Presentation</span>
                      <span className="font-semibold tabular-nums text-slate-700">
                        {fmt(Math.min(elapsed, TOTAL))}
                      </span>
                    </div>
                    {isOvertime && (
                      <div className="flex justify-between leading-relaxed text-red-600">
                        <span>Overtime</span>
                        <span className="font-semibold tabular-nums">+{fmt(overtime)}</span>
                      </div>
                    )}
                    {phase === "finished" && remaining > 0 && (
                      <div className="flex justify-between leading-relaxed text-emerald-600">
                        <span>Time Saved</span>
                        <span className="font-semibold tabular-nums">{fmt(remaining)}</span>
                      </div>
                    )}

                    <div className="border-t border-slate-200 my-1" />

                    <div className="flex justify-between text-base font-bold leading-relaxed">
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

                  {segments.map((seg, i) => {
                    const start = segmentStart(i, segments);
                    const end = start + seg.seconds;
                    const done = elapsed >= end;
                    const active = elapsed >= start && elapsed < end && phase !== "finished";
                    return (
                      <div
                        key={seg.name + i}
                        className={`flex items-center justify-between rounded-2xl px-5 py-3.5 ring-1 transition-all ${
                          active
                            ? "bg-slate-900 text-white ring-slate-900"
                            : done
                            ? "bg-slate-100 text-slate-400 ring-slate-200"
                            : "bg-white text-slate-700 ring-slate-200"
                        }`}
                      >
                        <div>
                          <div className="text-sm font-semibold leading-snug">{seg.name}</div>
                          <div
                            className={`mt-0.5 text-xs leading-normal ${
                              active ? "text-slate-300" : "text-slate-400"
                            }`}
                          >
                            {fmt(seg.seconds)}
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
        open={showFeedback}
        onOpenChange={setShowFeedback}
        studentName={studentName}
        subjects={activeSession.subjects}
        onSubmit={handleFeedbackSubmit}
      />

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
            <h2 className="text-2xl font-bold text-slate-900">Student Name</h2>
            <p className="mt-1 text-sm text-slate-500">Enter the student&rsquo;s name to begin setup.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitName();
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
              <div className="mt-6 flex gap-3">
                <Button type="submit" size="lg" className="flex-1 rounded-2xl" disabled={!nameInput.trim()}>
                  <Settings className="mr-2 h-4 w-4" />
                  Start Setup
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => setShowModal(false)}
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
