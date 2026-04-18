import type { JurySession, StudentRecord } from "@/types/session";

const COLUMNS = [
  "student_name",
  "department",
  "section",
  "semester",
  "academic_year",
  "student_order",
  "setup_seconds",
  "presentation_seconds",
  "overtime_seconds",
  "time_saved_seconds",
  "total_time_used_seconds",
  "setup_started_at",
  "presentation_started_at",
  "ended_at",
  "feedback_final",
  "feedback_per_subject_json",
  "created_at",
] as const;

function escape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildDayCsv(session: JurySession, records: StudentRecord[]): string {
  const header = COLUMNS.join(",");
  const rows = records.map((r) => {
    const values: Record<(typeof COLUMNS)[number], unknown> = {
      student_name: r.student_name,
      department: session.department,
      section: session.section,
      semester: session.semester,
      academic_year: session.academic_year,
      student_order: r.student_order,
      setup_seconds: r.setup_seconds,
      presentation_seconds: r.presentation_seconds,
      overtime_seconds: r.overtime_seconds,
      time_saved_seconds: r.time_saved_seconds,
      total_time_used_seconds: r.total_time_used_seconds,
      setup_started_at: r.setup_started_at,
      presentation_started_at: r.presentation_started_at,
      ended_at: r.ended_at,
      feedback_final: r.feedback?.final ?? "",
      feedback_per_subject_json: JSON.stringify(r.feedback?.perSubject ?? {}),
      created_at: r.created_at,
    };
    return COLUMNS.map((c) => escape(values[c])).join(",");
  });
  return [header, ...rows].join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function csvFilenameFor(session: JurySession): string {
  const datePart = (session.completed_at ?? session.created_at).slice(0, 10);
  const slug = [session.department, session.section, session.semester, session.academic_year]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `jury-${slug}-${datePart}.csv`;
}
