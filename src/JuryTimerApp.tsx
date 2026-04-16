import { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";

/* ── constants ─────────────────────────────────────────── */
const SUBJECT_SECONDS = 3 * 60;
const FINAL_FEEDBACK_SECONDS = 2 * 60;
const TOTAL_SECONDS = 4 * SUBJECT_SECONDS + FINAL_FEEDBACK_SECONDS;

const segmentLabels = [
  "Subject 1",
  "Subject 2",
  "Subject 3",
  "Subject 4",
  "Feedback",
];

type Phase = "idle" | "setup" | "presenting" | "paused" | "finished";

/* ── helpers ───────────────────────────────────────────── */
function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/* ── component ─────────────────────────────────────────── */
export default function JuryTimerApp() {
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

  const tick = useRef<number | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const lastCue = useRef(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* ── derived ──────────────────────── */
  const isOvertime = elapsed > TOTAL_SECONDS;
  const overtime = Math.max(elapsed - TOTAL_SECONDS, 0);
  const remaining = Math.max(TOTAL_SECONDS - elapsed, 0);
  const totalPct = Math.min((elapsed / TOTAL_SECONDS) * 100, 100);

  const stageIdx = useMemo(() => {
    if (elapsed >= TOTAL_SECONDS) return 4;
    if (elapsed < SUBJECT_SECONDS) return 0;
    if (elapsed < SUBJECT_SECONDS * 2) return 1;
    if (elapsed < SUBJECT_SECONDS * 3) return 2;
    if (elapsed < SUBJECT_SECONDS * 4) return 3;
    return 4;
  }, [elapsed]);

  const stageStart = stageIdx < 4 ? stageIdx * SUBJECT_SECONDS : 4 * SUBJECT_SECONDS;
  const stageDur = stageIdx < 4 ? SUBJECT_SECONDS : FINAL_FEEDBACK_SECONDS;
  const stageElapsed = Math.min(Math.max(elapsed - stageStart, 0), stageDur);
  const stageRem = Math.max(stageDur - stageElapsed, 0);
  const stagePct = Math.min((stageElapsed / stageDur) * 100, 100);

  const checkpoints = useMemo(
    () => [SUBJECT_SECONDS, SUBJECT_SECONDS * 2, SUBJECT_SECONDS * 3, SUBJECT_SECONDS * 4, TOTAL_SECONDS],
    [],
  );

  /* ── audio ────────────────────────── */
  const ensureAudio = async () => {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx.current) audioCtx.current = new Ctx();
    if (audioCtx.current.state === "suspended") await audioCtx.current.resume();
  };

  const beep = (freq = 880, dur = 250, repeat = 1) => {
    if (!soundEnabled || !audioCtx.current) return;
    const ctx = audioCtx.current;
    if (ctx.state === "suspended") ctx.resume();
    for (let i = 0; i < repeat; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.35;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur / 1000);
      osc.start(t);
      osc.stop(t + dur / 1000 + 0.03);
    }
  };

  /* ── real-time clock ───────────────── */
  useEffect(() => {
    const id = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fmtClock = (d: Date | null) => {
    if (!d) return "--:--";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  /* ── tick effects ─────────────────── */
  useEffect(() => {
    if (phase === "setup") {
      tick.current = window.setInterval(() => setSetupSeconds((p) => p + 1), 1000);
    } else if (phase === "presenting") {
      tick.current = window.setInterval(() => setElapsed((p) => p + 1), 1000);
    }
    return () => {
      if (tick.current) { clearInterval(tick.current); tick.current = null; }
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "presenting") return;
    const idx = checkpoints.findIndex((pt) => elapsed === pt);
    if (idx !== -1 && lastCue.current !== idx) {
      lastCue.current = idx;
      if (idx < 4) beep(880, 220, 1);
      else beep(1100, 260, 3);
    }
  }, [elapsed, phase, checkpoints]);

  /* ── actions ──────────────────────── */
  const openModal = () => {
    setNameInput("");
    setShowModal(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const submitName = async () => {
    if (!nameInput.trim()) return;
    setStudentName(nameInput.trim());
    setShowModal(false);
    await ensureAudio();
    setSetupStartTime(new Date());
    setPhase("setup");
  };

  const startPresentation = () => {
    beep(660, 200, 2);
    setPresentationStartTime(new Date());
    setPhase("presenting");
  };

  const pause = () => setPhase("paused");
  const resume = () => setPhase("presenting");

  const finish = () => {
    setEndTime(new Date());
    beep(1100, 260, 2);
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

  const isActive = phase === "presenting" || phase === "paused" || phase === "finished";

  /* ── render ───────────────────────── */
  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 lg:p-10">
      <div className="mx-auto max-w-6xl space-y-5">

        {/* ── HEADER CARD ──────────────── */}
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-slate-500">
                <Clock3 className="h-3.5 w-3.5" />
                <span className="text-xs font-medium uppercase tracking-wide">Internal Mid-Term Jury</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-4xl">Jury Timer</h1>
              <p className="mt-1 text-sm text-slate-500">
                Communication Design &bull; Semester 06 &bull; 14 min per student
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {studentName && (
                <div className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-1.5 text-white">
                  <User className="h-3.5 w-3.5" />
                  <span className="text-sm font-semibold">{studentName}</span>
                </div>
              )}
              {phase !== "idle" && setupSeconds > 0 && (
                <div className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-amber-800">
                  <Settings className="h-3.5 w-3.5" />
                  <span className="text-xs font-semibold">Setup {fmt(setupSeconds)}</span>
                </div>
              )}
              <div className="tabular-nums text-sm font-medium text-slate-400">
                {fmtClock(currentTime)}
              </div>
              <button
                onClick={() => setSoundEnabled((v) => !v)}
                className={`rounded-full p-2 transition ${soundEnabled ? "text-slate-500 hover:bg-slate-100" : "bg-slate-200 text-slate-400"}`}
              >
                <Volume2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── IDLE STATE ───────────────── */}
        {phase === "idle" && (
          <Card className="rounded-3xl border-0 shadow-sm">
            <CardContent className="flex flex-col items-center gap-6 py-16 text-center">
              <div className="rounded-3xl bg-slate-900 px-12 py-10 text-white shadow-inner md:px-20 md:py-14">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Ready</div>
                <div className="mt-2 text-6xl font-bold tabular-nums md:text-8xl">{fmt(TOTAL_SECONDS)}</div>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Badge className="rounded-full px-4 py-1 text-sm">4 Subjects &times; 3 min</Badge>
                <Badge variant="secondary" className="rounded-full px-4 py-1 text-sm">Final Feedback 2 min</Badge>
              </div>
              <Button size="lg" className="rounded-2xl px-10 text-base" onClick={openModal}>
                <Play className="mr-2 h-5 w-5" />
                Next Student
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── SETUP STATE ──────────────── */}
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
              <Button size="lg" className="rounded-2xl bg-emerald-600 px-10 text-base hover:bg-emerald-700" onClick={startPresentation}>
                <ChevronRight className="mr-2 h-5 w-5" />
                Start Presentation
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── PRESENTING / PAUSED / FINISHED ── */}
        {isActive && (
          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            {/* ── LEFT: Live Timer ────── */}
            <Card className="rounded-3xl border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg md:text-xl">Live Timer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* big clock */}
                <div className={`rounded-3xl px-6 py-7 text-center text-white shadow-inner md:py-10 ${
                  phase === "finished"
                    ? "bg-emerald-700"
                    : isOvertime
                      ? "bg-red-700"
                      : "bg-slate-900"
                }`}>
                  {phase === "finished" ? (
                    <>
                      <div className="text-xs uppercase tracking-[0.2em] text-emerald-200">Finished</div>
                      <div className="mt-2 text-5xl font-bold tabular-nums md:text-7xl">{fmt(elapsed)}</div>
                      {remaining > 0 && (
                        <div className="mt-1 text-sm text-emerald-200">{fmt(remaining)} remaining &mdash; finished early</div>
                      )}
                    </>
                  ) : isOvertime ? (
                    <>
                      <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-[0.2em] text-red-200">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Overtime</span>
                      </div>
                      <div className="mt-2 text-5xl font-bold tabular-nums md:text-7xl">+{fmt(overtime)}</div>
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

                {/* progress */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Total Progress</span>
                    <span>{Math.round(totalPct)}%</span>
                  </div>
                  <Progress value={totalPct} className="h-2.5" />
                </div>

                {/* current segment */}
                {!isOvertime && phase !== "finished" && (
                  <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-400">Current Segment</div>
                        <div className="mt-1 text-xl font-semibold text-slate-900">{segmentLabels[stageIdx]}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Remaining</div>
                        <div className="text-2xl font-bold tabular-nums text-slate-900">{fmt(stageRem)}</div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Segment Progress</span>
                        <span>{Math.round(stagePct)}%</span>
                      </div>
                      <Progress value={stagePct} className="h-1.5" />
                    </div>
                  </div>
                )}

                {isOvertime && phase !== "finished" && (
                  <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 font-semibold text-red-700">
                        <AlertTriangle className="h-4 w-4" />
                        Time&rsquo;s Up
                      </div>
                      <div className="text-2xl font-bold tabular-nums text-red-700">+{fmt(overtime)}</div>
                    </div>
                  </div>
                )}

                {/* controls */}
                <div className="flex flex-wrap gap-3 pt-1">
                  {phase === "finished" ? (
                    <Button size="lg" className="rounded-2xl px-8" onClick={reset}>
                      <RotateCcw className="mr-2 h-4 w-4" /> Next Student
                    </Button>
                  ) : (
                    <>
                      {phase === "presenting" ? (
                        <Button size="lg" variant="secondary" className="rounded-2xl px-6" onClick={pause}>
                          <Pause className="mr-2 h-4 w-4" /> Pause
                        </Button>
                      ) : (
                        <Button size="lg" className="rounded-2xl px-6" onClick={resume}>
                          <Play className="mr-2 h-4 w-4" /> Resume
                        </Button>
                      )}
                      <Button
                        size="lg"
                        variant="outline"
                        className="rounded-2xl border-red-200 px-6 text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={finish}
                      >
                        <Square className="mr-2 h-4 w-4" /> Finish
                      </Button>
                      <Button size="lg" variant="outline" className="rounded-2xl px-6" onClick={reset}>
                        <RotateCcw className="mr-2 h-4 w-4" /> Reset
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── RIGHT: Segments + Report ── */}
            <div className="space-y-5">
              <Card className="rounded-3xl border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg md:text-xl">Segment Plan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {/* setup row */}
                  <div className="flex items-center justify-between rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
                    <div className="flex items-center gap-2">
                      <Settings className="h-3.5 w-3.5 text-amber-600" />
                      <span className="text-sm font-medium text-amber-800">Setup</span>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-amber-700">{fmt(setupSeconds)}</span>
                  </div>

                  {segmentLabels.map((label, i) => {
                    const isFinal = i === 4;
                    const start = isFinal ? 4 * SUBJECT_SECONDS : i * SUBJECT_SECONDS;
                    const end = isFinal ? TOTAL_SECONDS : start + SUBJECT_SECONDS;
                    const done = elapsed >= end;
                    const active = elapsed >= start && elapsed < end && phase !== "finished";
                    return (
                      <div
                        key={label}
                        className={`flex items-center justify-between rounded-2xl px-4 py-3 ring-1 transition-all ${
                          active
                            ? "bg-slate-900 text-white ring-slate-900"
                            : done
                              ? "bg-slate-100 text-slate-400 ring-slate-200"
                              : "bg-white text-slate-700 ring-slate-200"
                        }`}
                      >
                        <div>
                          <div className="text-sm font-semibold">{label}</div>
                          <div className={`text-xs ${active ? "text-slate-300" : "text-slate-400"}`}>
                            {isFinal ? "2 minutes" : "3 minutes"}
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
                    <div className="flex items-center justify-between rounded-2xl bg-red-700 px-4 py-3 text-white ring-1 ring-red-700">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span className="text-sm font-semibold">Overtime</span>
                      </div>
                      <span className="text-sm font-bold tabular-nums">+{fmt(overtime)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── Time Report ────────── */}
              <Card className="rounded-3xl border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg md:text-xl">Time Report</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Entered</span>
                      <span className="tabular-nums font-medium text-slate-700">{fmtClock(setupStartTime)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Presented</span>
                      <span className="tabular-nums font-medium text-slate-700">{fmtClock(presentationStartTime)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{endTime ? "Ended" : "Now"}</span>
                      <span className="tabular-nums font-medium text-slate-700">{fmtClock(endTime || currentTime)}</span>
                    </div>

                    <div className="border-t border-slate-200" />

                    <div className="flex justify-between">
                      <span className="text-slate-500">Setup Time</span>
                      <span className="font-semibold tabular-nums text-amber-700">{fmt(setupSeconds)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Presentation</span>
                      <span className="font-semibold tabular-nums text-slate-700">{fmt(Math.min(elapsed, TOTAL_SECONDS))}</span>
                    </div>
                    {isOvertime && (
                      <div className="flex justify-between text-red-600">
                        <span>Overtime</span>
                        <span className="font-semibold tabular-nums">+{fmt(overtime)}</span>
                      </div>
                    )}
                    {phase === "finished" && remaining > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>Time Saved</span>
                        <span className="font-semibold tabular-nums">{fmt(remaining)}</span>
                      </div>
                    )}

                    <div className="border-t border-slate-200" />

                    <div className="flex justify-between text-base font-bold">
                      <span className="text-slate-800">Total Time</span>
                      <span className="tabular-nums text-slate-900">{fmt(setupSeconds + elapsed)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* ── NAME MODAL ─────────────────── */}
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
                <Button type="button" size="lg" variant="outline" className="rounded-2xl" onClick={() => setShowModal(false)}>
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
