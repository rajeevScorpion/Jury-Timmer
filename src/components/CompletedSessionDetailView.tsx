import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileText, Users } from "lucide-react";
import SessionStudentRow from "@/components/SessionStudentRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildDayCsv, csvFilenameFor, downloadCsv } from "@/lib/csv";
import { fmt, fmtHM } from "@/lib/timeFormat";
import {
  fetchJurySession,
  fetchSessionRecords,
  historyTimestampLabel,
  sessionStatusLabel,
} from "@/lib/sessionHistory";
import type { JurySession, StudentRecord } from "@/types/session";

export default function CompletedSessionDetailView() {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const [session, setSession] = useState<JurySession | null>(null);
  const [records, setRecords] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalidSession, setInvalidSession] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) {
      setInvalidSession(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const loadedSession = await fetchJurySession(sessionId);
      if (!loadedSession || loadedSession.status !== "completed") {
        setInvalidSession(true);
        setSession(null);
        setRecords([]);
        return;
      }

      const loadedRecords = await fetchSessionRecords(sessionId);
      setSession(loadedSession);
      setRecords(loadedRecords);
      setInvalidSession(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load completed jury day.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-8">
        <div className="text-sm text-slate-500">Loading completed jury day...</div>
      </div>
    );
  }

  if (invalidSession) {
    return <Navigate to="/history" replace />;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 md:px-8">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-xl font-semibold text-slate-900">Could not load this jury day</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="w-full rounded-full sm:w-auto"
              onClick={() => navigate("/history")}
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to History
            </Button>
            <Button className="w-full rounded-full sm:w-auto" onClick={() => void load()}>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/history" replace />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          className="w-full rounded-full sm:w-auto"
          onClick={() => navigate("/history")}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to History
        </Button>
        <Button
          variant="outline"
          className="w-full rounded-full sm:w-auto"
          onClick={() => downloadCsv(csvFilenameFor(session), buildDayCsv(session, records))}
        >
          <Download className="mr-1.5 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <Card className="rounded-3xl border-0 shadow-sm">
        <CardContent className="space-y-6 p-5 sm:p-6 md:p-8">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{session.department}</h1>
              <Badge variant="outline" className="rounded-full">
                {session.jury_type}
              </Badge>
              <Badge variant="outline" className="rounded-full">
                {session.section} / Sem {session.semester} / {session.academic_year}
              </Badge>
              <Badge variant="secondary" className="rounded-full">
                {sessionStatusLabel(session.status)}
              </Badge>
            </div>
            <p className="text-sm text-slate-500">
              Review the saved student feedback for this completed jury day.
            </p>
            <div className="flex flex-wrap gap-3 text-sm text-slate-500">
              <span>Created {historyTimestampLabel(session.created_at)}</span>
              <span>Completed {historyTimestampLabel(session.completed_at)}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <DetailStat label="Students planned" value={String(session.number_of_students)} />
            <DetailStat label="Reports saved" value={String(records.length)} />
            <DetailStat label="Per student" value={fmtHM(session.per_subject_seconds * session.subjects.length + session.feedback_seconds)} />
            <DetailStat label="Per subject" value={fmtHM(session.per_subject_seconds)} />
            <DetailStat label="Final feedback" value={fmtHM(session.feedback_seconds)} />
          </div>

          {records.length < session.number_of_students && (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
              This jury day was closed with {records.length} saved student reports out of {session.number_of_students} planned.
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-widest text-slate-500">Subjects</div>
            <div className="flex flex-wrap gap-2">
              {session.subjects.map((subject) => (
                <Badge key={subject} variant="outline" className="rounded-full px-3 py-1">
                  {subject}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Students</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Expand a student to read final feedback and per-subject notes.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full">
                <Users className="mr-1.5 h-3.5 w-3.5" />
                {records.length} saved
              </Badge>
              <Badge variant="outline" className="rounded-full">
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Read only
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {records.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500 ring-1 ring-slate-200">
              No student reports were saved for this jury day.
            </div>
          ) : (
            records.map((record) => <SessionStudentRow key={record.id} session={session} record={record} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-200">
      <div className="text-xs font-medium uppercase tracking-widest text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}
