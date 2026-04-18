export type DayConfig = {
  totalSeconds: number;
  students: number;
  bufferSeconds: number;
  subjects: string[];
  feedbackSeconds: number;
};

export type Segment = {
  name: string;
  seconds: number;
  kind: "subject" | "feedback";
};

export type PerStudentPlan = {
  perSubjectSeconds: number;
  feedbackSeconds: number;
  segments: Segment[];
  totalSeconds: number;
};

export class TimingConfigError extends Error {}

const MIN_SEGMENT_SECONDS = 30;

export function computePerStudentPlan(cfg: DayConfig): PerStudentPlan {
  if (cfg.students < 1) throw new TimingConfigError("At least one student is required.");
  if (cfg.subjects.length < 1) throw new TimingConfigError("At least one subject is required.");
  if (cfg.totalSeconds <= 0) throw new TimingConfigError("Total time must be positive.");
  if (cfg.feedbackSeconds < 0) throw new TimingConfigError("Feedback time cannot be negative.");
  if (cfg.bufferSeconds < 0) throw new TimingConfigError("Buffer cannot be negative.");

  const totalBuffer = cfg.bufferSeconds * Math.max(cfg.students - 1, 0);
  const perStudent = Math.floor((cfg.totalSeconds - totalBuffer) / cfg.students);
  if (perStudent <= cfg.feedbackSeconds) {
    throw new TimingConfigError(
      "Not enough time per student after buffer and feedback. Increase total time or reduce students/buffer/feedback.",
    );
  }

  const perSubject = Math.floor((perStudent - cfg.feedbackSeconds) / cfg.subjects.length);
  if (perSubject < MIN_SEGMENT_SECONDS) {
    throw new TimingConfigError(
      `Each subject would get less than ${MIN_SEGMENT_SECONDS}s. Reduce subjects or increase total time.`,
    );
  }

  const segments: Segment[] = [
    ...cfg.subjects.map((name) => ({ name, seconds: perSubject, kind: "subject" as const })),
    { name: "Final Feedback", seconds: cfg.feedbackSeconds, kind: "feedback" as const },
  ];
  const totalSeconds = segments.reduce((sum, s) => sum + s.seconds, 0);

  return {
    perSubjectSeconds: perSubject,
    feedbackSeconds: cfg.feedbackSeconds,
    segments,
    totalSeconds,
  };
}

export function segmentIndexAt(elapsed: number, segments: Segment[]): number {
  let acc = 0;
  for (let i = 0; i < segments.length; i++) {
    acc += segments[i].seconds;
    if (elapsed < acc) return i;
  }
  return segments.length - 1;
}

export function segmentStart(i: number, segments: Segment[]): number {
  let acc = 0;
  for (let j = 0; j < i; j++) acc += segments[j].seconds;
  return acc;
}

export function checkpointsFor(segments: Segment[]): number[] {
  const cps: number[] = [];
  let acc = 0;
  for (const s of segments) {
    acc += s.seconds;
    cps.push(acc);
  }
  return cps;
}
