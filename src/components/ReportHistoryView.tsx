import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Download, FileDown, FileText, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import type { JurySession, StudentRecord } from "@/types/session";
import { fmt } from "@/lib/timeFormat";
import { buildDayCsv, csvFilenameFor, downloadCsv } from "@/lib/csv";
import { exportStudentPdf } from "@/lib/pdf";

export default function ReportHistoryView() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<JurySession[]>([]);
  const [recordsBySession, setRecordsBySession] = useState<Record<string, StudentRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("jury_sessions")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setSessions(data as JurySession[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (id: string) => {
    const now = !expanded[id];
    setExpanded((p) => ({ ...p, [id]: now }));
    if (now && !recordsBySession[id]) {
      const { data } = await supabase
        .from("student_records")
        .select("*")
        .eq("session_id", id)
        .order("student_order", { ascending: true });
      setRecordsBySession((p) => ({ ...p, [id]: (data as StudentRecord[]) ?? [] }));
    }
  };

  const downloadSessionCsv = async (session: JurySession) => {
    let records = recordsBySession[session.id];
    if (!records) {
      const { data } = await supabase
        .from("student_records")
        .select("*")
        .eq("session_id", session.id)
        .order("student_order", { ascending: true });
      records = (data as StudentRecord[]) ?? [];
      setRecordsBySession((p) => ({ ...p, [session.id]: records }));
    }
    downloadCsv(csvFilenameFor(session), buildDayCsv(session, records));
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 md:px-8">
        <div className="text-sm text-slate-500">Loading history…</div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 md:px-8">
        <div className="rounded-3xl bg-white p-10 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">No jury days yet</h1>
          <p className="mt-2 text-sm text-slate-500">
            Create a new jury day to start. Completed days will appear here with per-student details and CSV export.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 md:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">History</h1>
      <p className="text-sm text-slate-500">
        All jury days you have run. Expand to inspect individual students, export a day CSV, or download a student PDF.
      </p>

      <div className="space-y-3">
        {sessions.map((s) => {
          const isExpanded = !!expanded[s.id];
          const records = recordsBySession[s.id] ?? [];
          return (
            <Card key={s.id} className="rounded-3xl border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold text-slate-900">{s.department}</span>
                      <Badge variant="outline" className="rounded-full">
                        {s.section} · Sem {s.semester} · {s.academic_year}
                      </Badge>
                      <Badge variant={s.status === "completed" ? "secondary" : "default"} className="rounded-full">
                        {s.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>Created {new Date(s.created_at).toLocaleString()}</span>
                      <span>· {s.number_of_students} students</span>
                      <span>· {fmt(s.total_time_seconds)} total</span>
                      <span>· {s.subjects.length} subjects + feedback</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => downloadSessionCsv(s)}
                    >
                      <Download className="mr-1.5 h-4 w-4" />
                      CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => toggle(s.id)}
                    >
                      <Users className="mr-1.5 h-4 w-4" />
                      Students
                      {isExpanded ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 space-y-2">
                    {records.length === 0 ? (
                      <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500 ring-1 ring-slate-200">
                        No student records yet.
                      </div>
                    ) : (
                      records.map((r) => <StudentRow key={r.id} session={s} record={r} />)
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StudentRow({ session, record }: { session: JurySession; record: StudentRecord }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handlePdf = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setExporting(true);
      await exportStudentPdf(session, record);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 flex-wrap items-center gap-3 text-left"
        >
          <span className="w-8 text-xs font-medium text-slate-400">#{record.student_order}</span>
          <span className="font-semibold text-slate-900">{record.student_name}</span>
          <span className="text-xs tabular-nums text-slate-500">
            Total {fmt(record.total_time_used_seconds)} · Setup {fmt(record.setup_seconds)} · Pres{" "}
            {fmt(record.presentation_seconds)}
          </span>
          {record.overtime_seconds > 0 && (
            <Badge variant="outline" className="rounded-full border-red-200 text-red-700">
              +{fmt(record.overtime_seconds)} over
            </Badge>
          )}
          {record.time_saved_seconds > 0 && (
            <Badge variant="outline" className="rounded-full border-emerald-200 text-emerald-700">
              {fmt(record.time_saved_seconds)} saved
            </Badge>
          )}
        </button>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={handlePdf}
            disabled={exporting}
          >
            <FileDown className="mr-1.5 h-4 w-4" />
            {exporting ? "Generating…" : "PDF"}
          </Button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-4 text-sm">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-slate-500">
              <FileText className="h-3 w-3" /> Final feedback
            </div>
            <div className="whitespace-pre-wrap text-slate-700">
              {record.feedback?.final || <span className="text-slate-400">—</span>}
            </div>
          </div>
          {record.feedback?.perSubject && Object.keys(record.feedback.perSubject).length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-widest text-slate-500">
                Per-subject notes
              </div>
              <div className="space-y-1.5">
                {Object.entries(record.feedback.perSubject).map(([subject, note]) => (
                  <div key={subject} className="rounded-xl bg-slate-50 p-3">
                    <div className="text-xs font-semibold text-slate-600">{subject}</div>
                    <div className="mt-0.5 whitespace-pre-wrap text-slate-700">{note}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
            <span>Setup started {formatTs(record.setup_started_at)}</span>
            <span>Presented {formatTs(record.presentation_started_at)}</span>
            <span>Ended {formatTs(record.ended_at)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTs(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
