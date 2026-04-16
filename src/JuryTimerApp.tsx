import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Play, Pause, RotateCcw, Volume2, Clock3 } from "lucide-react";

const SUBJECT_COUNT = 4;
const SUBJECT_SECONDS = 3 * 60; // 3 min each
const FINAL_FEEDBACK_SECONDS = 2 * 60; // 2 min
const TOTAL_SECONDS = SUBJECT_COUNT * SUBJECT_SECONDS + FINAL_FEEDBACK_SECONDS; // 14 min

const subjectLabels = [
  "Subject 1",
  "Subject 2",
  "Subject 3",
  "Subject 4",
  "Final Feedback",
];

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function JuryTimerApp() {
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const intervalRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastCueRef = useRef(-1);

  const checkpoints = useMemo(
    () => [
      SUBJECT_SECONDS,
      SUBJECT_SECONDS * 2,
      SUBJECT_SECONDS * 3,
      SUBJECT_SECONDS * 4,
      TOTAL_SECONDS,
    ],
    []
  );

  const currentStageIndex = useMemo(() => {
    if (elapsed >= TOTAL_SECONDS) return 4;
    if (elapsed < SUBJECT_SECONDS) return 0;
    if (elapsed < SUBJECT_SECONDS * 2) return 1;
    if (elapsed < SUBJECT_SECONDS * 3) return 2;
    if (elapsed < SUBJECT_SECONDS * 4) return 3;
    return 4;
  }, [elapsed]);

  const remainingTotal = Math.max(TOTAL_SECONDS - elapsed, 0);

  const stageStart = currentStageIndex < 4 ? currentStageIndex * SUBJECT_SECONDS : SUBJECT_SECONDS * 4;
  const stageDuration = currentStageIndex < 4 ? SUBJECT_SECONDS : FINAL_FEEDBACK_SECONDS;
  const stageElapsed = Math.min(Math.max(elapsed - stageStart, 0), stageDuration);
  const stageRemaining = Math.max(stageDuration - stageElapsed, 0);

  const totalProgress = (elapsed / TOTAL_SECONDS) * 100;
  const stageProgress = (stageElapsed / stageDuration) * 100;

  const beep = (frequency = 880, duration = 250, repeat = 1) => {
    if (!soundEnabled) return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioCtx();
    }

    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    for (let i = 0; i < repeat; i++) {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      const startAt = ctx.currentTime + i * 0.35;
      gainNode.gain.setValueAtTime(0.0001, startAt);
      gainNode.gain.exponentialRampToValueAtTime(0.2, startAt + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration / 1000);

      oscillator.start(startAt);
      oscillator.stop(startAt + duration / 1000 + 0.03);
    }
  };

  useEffect(() => {
    if (isRunning && elapsed < TOTAL_SECONDS) {
      intervalRef.current = window.setInterval(() => {
        setElapsed((prev) => {
          if (prev >= TOTAL_SECONDS) return TOTAL_SECONDS;
          return prev + 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning, elapsed]);

  useEffect(() => {
    const hitIndex = checkpoints.findIndex((point) => elapsed === point);
    if (hitIndex !== -1 && lastCueRef.current !== hitIndex) {
      lastCueRef.current = hitIndex;
      if (hitIndex < 4) {
        beep(880, 220, 1);
      } else {
        beep(1100, 260, 3);
        setIsRunning(false);
      }
    }
  }, [elapsed, checkpoints]);

  const startTimer = async () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx && !audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current?.state === "suspended") {
        await audioCtxRef.current.resume();
      }
      setIsRunning(true);
    } catch {
      setIsRunning(true);
    }
  };

  const pauseTimer = () => setIsRunning(false);

  const resetTimer = () => {
    setIsRunning(false);
    setElapsed(0);
    lastCueRef.current = -1;
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6 md:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-slate-600">
                <Clock3 className="h-4 w-4" />
                <span className="text-sm font-medium tracking-wide uppercase">Internal Mid-Term Jury</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">Jury Timer</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 md:text-base">
                Communication Design &bull; Semester 06 &bull; 14 minutes per student
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="rounded-full px-4 py-1 text-sm">4 Subjects &times; 3 min</Badge>
              <Badge variant="secondary" className="rounded-full px-4 py-1 text-sm">Final Feedback 2 min</Badge>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <Card className="rounded-3xl border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl md:text-2xl">Live Timer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-3xl bg-slate-900 px-6 py-8 text-center text-white shadow-inner">
                <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Total Remaining</div>
                <div className="mt-3 text-6xl font-bold tabular-nums md:text-8xl">{formatTime(remainingTotal)}</div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Total Progress</span>
                  <span>{Math.min(Math.round(totalProgress), 100)}%</span>
                </div>
                <Progress value={Math.min(totalProgress, 100)} className="h-3" />
              </div>

              <div className="rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm uppercase tracking-wide text-slate-500">Current Segment</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">{subjectLabels[currentStageIndex]}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-500">Segment Remaining</div>
                    <div className="text-3xl font-bold tabular-nums text-slate-900">{formatTime(stageRemaining)}</div>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <span>Segment Progress</span>
                    <span>{Math.min(Math.round(stageProgress), 100)}%</span>
                  </div>
                  <Progress value={Math.min(stageProgress, 100)} className="h-2" />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                {!isRunning ? (
                  <Button size="lg" className="rounded-2xl px-6" onClick={startTimer}>
                    <Play className="mr-2 h-4 w-4" />
                    {elapsed === 0 ? "Start" : "Resume"}
                  </Button>
                ) : (
                  <Button size="lg" variant="secondary" className="rounded-2xl px-6" onClick={pauseTimer}>
                    <Pause className="mr-2 h-4 w-4" />
                    Pause
                  </Button>
                )}
                <Button size="lg" variant="outline" className="rounded-2xl px-6" onClick={resetTimer}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset
                </Button>
                <Button
                  size="lg"
                  variant={soundEnabled ? "outline" : "secondary"}
                  className="rounded-2xl px-6"
                  onClick={() => setSoundEnabled((v) => !v)}
                >
                  <Volume2 className="mr-2 h-4 w-4" />
                  {soundEnabled ? "Sound On" : "Sound Off"}
                </Button>
              </div>

              <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                One click starts the full 14-minute cycle. The app beeps once after each 3-minute subject segment and gives a triple beep when the full timer ends.
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl md:text-2xl">Segment Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {subjectLabels.map((label, index) => {
                  const isFinal = index === 4;
                  const start = isFinal ? SUBJECT_SECONDS * 4 : index * SUBJECT_SECONDS;
                  const end = isFinal ? TOTAL_SECONDS : start + SUBJECT_SECONDS;
                  const isDone = elapsed >= end;
                  const isActive = elapsed >= start && elapsed < end;

                  return (
                    <div
                      key={label}
                      className={`rounded-2xl p-4 ring-1 transition-all ${
                        isActive
                          ? "bg-slate-900 text-white ring-slate-900"
                          : isDone
                          ? "bg-slate-100 text-slate-500 ring-slate-200"
                          : "bg-white text-slate-800 ring-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold">{label}</div>
                          <div className={`text-sm ${isActive ? "text-slate-300" : "text-slate-500"}`}>
                            {isFinal ? "2 minutes" : "3 minutes"}
                          </div>
                        </div>
                        <Badge variant={isActive ? "secondary" : "outline"} className="rounded-full">
                          {isDone ? "Done" : isActive ? "Live" : "Pending"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
                Suggested subject flow:<br />
                Problem 30 sec &bull; Solution 30 sec &bull; Outcomes 60 sec &bull; Q&amp;A 60 sec
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default JuryTimerApp;
