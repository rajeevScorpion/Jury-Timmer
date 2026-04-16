import { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";

/* ── constants ─────────────────────────────────────────── */
const SUBJECT_SECONDS = 3 * 60;
const FINAL_FEEDBACK_SECONDS = 2 * 60;
const TOTAL_SECONDS = 4 * SUBJECT_SECONDS + FINAL_FEEDBACK_SECONDS; // 14 min

const segmentLabels = [
  "Subject 1",
  "Subject 2",
  "Subject 3",
  "Subject 4",
  "Feedback",
];

type Phase = "idle" | "setup" | "presenting" | "paused";

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
  const [elapsed, setElapsed] = useState(0); // presentation elapsed
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [setupStartTime, setSetupStartTime] = useState<Date | null>(null);
  const [presentationStartTime, setPresentationStartTime] = useState<Date | null>(null);
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

  // presentation checkpoint beeps
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

  const reset = () => {
    setPhase("idle");
    setStudentName("");
    setSetupSeconds(0);
    setElapsed(0);
    setSetupStartTime(null);
    setPresentationStartTime(null);
    lastCue.current = -1;
  };

  /* ── render ───────────────────────── */
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-100">
      {/* ── HEADER ─────────────────────── */}
      <header className="flex shrink-0 items-center justify-between gap-4 bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200 md:px-8 md:py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Clock3 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate text-xs font-medium uppercase tracking-wide">Internal Mid-Term Jury</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-3xl">Jury Timer</h1>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {studentName && (
            <div className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-1.5 text-white">
              <User className="h-3.5 w-3.5" />
              <span className="max-w-[140px] truncate text-sm font-semibold md:max-w-none">{studentName}</span>
            </div>
          )}
          {phase !== "idle" && setupSeconds > 0 && (
            <div className="hidden items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-amber-800 md:flex">
              <Settings className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold">Setup {fmt(setupSeconds)}</span>
            </div>
          )}
          <div className="hidden tabular-nums text-sm font-medium text-slate-500 md:block">
            {fmtClock(currentTime)}
          </div>
          <button
            onClick={() => setSoundEnabled((v) => !v)}
            className={`rounded-full p-2 transition ${soundEnabled ? "text-slate-500 hover:bg-slate-100" : "bg-slate-200 text-slate-400"}`}
          >
            <Volume2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ── BODY ───────────────────────── */}
      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ── LEFT: timer ────────────── */}
        <section className="flex flex-1 flex-col items-center justify-center gap-4 p-4 md:gap-6 md:p-8">

          {/* IDLE */}
          {phase === "idle" && (
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="rounded-3xl bg-slate-900 px-10 py-8 text-white shadow-inner md:px-16 md:py-12">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Ready</div>
                <div className="mt-2 text-5xl font-bold tabular-nums md:text-8xl">{fmt(TOTAL_SECONDS)}</div>
              </div>
              <p className="max-w-sm text-sm text-slate-500">
                Communication Design &bull; Semester 06 &bull; 14 minutes per student
              </p>
              <Button size="lg" className="rounded-2xl px-8 text-base" onClick={openModal}>
                <Play className="mr-2 h-5 w-5" />
                Next Student
              </Button>
            </div>
          )}

          {/* SETUP */}
          {phase === "setup" && (
            <div className="flex flex-col items-center gap-5 text-center">
              <div className="rounded-3xl bg-amber-500 px-10 py-8 text-white shadow-inner md:px-16 md:py-12">
                <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-[0.2em] text-amber-100">
                  <Settings className="h-4 w-4 animate-spin" style={{ animationDuration: "3s" }} />
                  <span>Setting Up</span>
                </div>
                <div className="mt-2 text-5xl font-bold tabular-nums md:text-8xl">{fmt(setupSeconds)}</div>
              </div>
              <p className="text-sm text-slate-500">Student is setting up. Click below when ready to present.</p>
              <Button size="lg" className="rounded-2xl bg-emerald-600 px-8 text-base hover:bg-emerald-700" onClick={startPresentation}>
                <ChevronRight className="mr-2 h-5 w-5" />
                Start Presentation
              </Button>
            </div>
          )}

          {/* PRESENTING / PAUSED */}
          {(phase === "presenting" || phase === "paused") && (
            <div className="flex w-full max-w-2xl flex-col items-center gap-4">
              {/* big clock */}
              <div className={`w-full rounded-3xl px-6 py-6 text-center text-white shadow-inner md:py-10 ${isOvertime ? "bg-red-700" : "bg-slate-900"}`}>
                {isOvertime ? (
                  <>
                    <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-[0.2em] text-red-200">
                      <AlertTriangle className="h-4 w-4" />
                      <span>Overtime</span>
                    </div>
                    <div className="mt-2 text-5xl font-bold tabular-nums md:text-8xl">+{fmt(overtime)}</div>
                  </>
                ) : (
                  <>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      {phase === "paused" ? "Paused" : "Remaining"}
                    </div>
                    <div className="mt-2 text-5xl font-bold tabular-nums md:text-8xl">{fmt(remaining)}</div>
                  </>
                )}
              </div>

              {/* progress */}
              <div className="w-full space-y-1">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Total</span>
                  <span>{Math.round(totalPct)}%</span>
                </div>
                <Progress value={totalPct} className="h-2" />
              </div>

              {/* current segment info */}
              {!isOvertime && (
                <div className="flex w-full items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <div>
                    <div className="text-xs uppercase text-slate-400">Segment</div>
                    <div className="text-lg font-semibold text-slate-900">{segmentLabels[stageIdx]}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold tabular-nums text-slate-900">{fmt(stageRem)}</div>
                    <Progress value={stagePct} className="mt-1 h-1.5 w-24" />
                  </div>
                </div>
              )}

              {isOvertime && (
                <div className="flex w-full items-center justify-between rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
                  <div className="flex items-center gap-2 font-semibold text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    Time&rsquo;s Up
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-red-700">+{fmt(overtime)}</div>
                </div>
              )}

              {/* controls */}
              <div className="flex flex-wrap gap-3">
                {phase === "presenting" ? (
                  <Button size="lg" variant="secondary" className="rounded-2xl px-6" onClick={pause}>
                    <Pause className="mr-2 h-4 w-4" /> Pause
                  </Button>
                ) : (
                  <Button size="lg" className="rounded-2xl px-6" onClick={resume}>
                    <Play className="mr-2 h-4 w-4" /> Resume
                  </Button>
                )}
                <Button size="lg" variant="outline" className="rounded-2xl px-6" onClick={reset}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Reset
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* ── RIGHT: segments ────────── */}
        {(phase === "presenting" || phase === "paused") && (
          <aside className="flex shrink-0 flex-col gap-2 border-t bg-white p-4 lg:w-72 lg:border-l lg:border-t-0 lg:p-5 xl:w-80">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Segments</div>

            {/* setup row */}
            <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
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
              const active = elapsed >= start && elapsed < end;
              return (
                <div
                  key={label}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 ring-1 transition-all ${
                    active
                      ? "bg-slate-900 text-white ring-slate-900"
                      : done
                        ? "bg-slate-50 text-slate-400 ring-slate-200"
                        : "bg-white text-slate-700 ring-slate-200"
                  }`}
                >
                  <span className="text-sm font-medium">{label}</span>
                  <Badge
                    variant={active ? "secondary" : "outline"}
                    className={`rounded-full text-xs ${done && !active ? "border-slate-200 text-slate-400" : ""}`}
                  >
                    {done ? "Done" : active ? "Live" : isFinal ? "2 min" : "3 min"}
                  </Badge>
                </div>
              );
            })}

            {isOvertime && (
              <div className="flex items-center justify-between rounded-xl bg-red-700 px-3 py-2 text-white ring-1 ring-red-700">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="text-sm font-medium">Overtime</span>
                </div>
                <span className="text-sm font-bold tabular-nums">+{fmt(overtime)}</span>
              </div>
            )}

            {/* report summary */}
            <div className="mt-auto rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Time Report</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Entered</span>
                  <span className="tabular-nums text-slate-600">{fmtClock(setupStartTime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Started</span>
                  <span className="tabular-nums text-slate-600">{fmtClock(presentationStartTime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Now</span>
                  <span className="tabular-nums text-slate-600">{fmtClock(currentTime)}</span>
                </div>
                <div className="border-t border-slate-200 pt-1" />
                <div className="flex justify-between">
                  <span className="text-slate-500">Setup</span>
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
                <div className="border-t border-slate-200 pt-1">
                  <div className="flex justify-between font-semibold">
                    <span className="text-slate-700">Total Time</span>
                    <span className="tabular-nums text-slate-900">{fmt(setupSeconds + elapsed)}</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}
      </main>

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
