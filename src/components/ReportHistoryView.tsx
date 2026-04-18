import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Download, Users } from "lucide-react";
import SessionStudentRow from "@/components/SessionStudentRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { useSession } from "@/context/SessionContext";
import { buildDayCsv, csvFilenameFor, downloadCsv } from "@/lib/csv";
import { fmt } from "@/lib/timeFormat";
import {
  fetchHistorySessions,
  fetchSessionRecords,
  historyTimestampLabel,
  markSessionCompleted,
  sessionStatusLabel,
} from "@/lib/sessionHistory";
import type { JurySession, StudentRecord } from "@/types/session";

export default function ReportHistoryView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeSession, reload } = useSession();
  const [sessions, setSessions] = useState<JurySession[]>([]);
  const [recordsBySession, setRecordsBySession] = useState<Record<string, StudentRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      setActionError(null);
      setSessions(await fetchHistorySessions());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to load history.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const getSessionRecords = useCallback(
    async (sessionId: string) => {
      const cached = recordsBySession[sessionId];
      if (cached) return cached;

      const records = await fetchSessionRecords(sessionId);
      setRecordsBySession((prev) => (prev[sessionId] ? prev : { ...prev, [sessionId]: records }));
      return records;
    },
    [recordsBySession],
  );

  const toggle = async (sessionId: string) => {
    const nextOpen = !expanded[sessionId];
    setExpanded((prev) => ({ ...prev, [sessionId]: nextOpen }));
    if (!nextOpen) return;

    try {
      setActionError(null);
      await getSessionRecords(sessionId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to load student records.");
    }
  };

  const downloadSessionCsvFor = async (session: JurySession) => {
    const records = await getSessionRecords(session.id);
    downloadCsv(csvFilenameFor(session), buildDayCsv(session, records));
  };

  const completeHistorySession = async (session: JurySession) => {
    if (session.status !== "active" || closingSessionId) return;

    const confirmed = window.confirm(
      "Complete this jury day now? It will close the live session and keep the saved records in History.",
    );
    if (!confirmed) return;

    try {
      setClosingSessionId(session.id);
      setActionError(null);

      const completedAt = await markSessionCompleted(session.id);
      setSessions((prev) =>
        prev.map((entry) =>
          entry.id === session.id ? { ...entry, status: "completed", completed_at: completedAt } : entry,
        ),
      );

      if (activeSession?.id === session.id) {
        await reload();
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to complete jury day.");
    } finally {
      setClosingSessionId(null);
    }
  };

  const inProgressSessions = sessions.filter((session) => session.status === "active");
  const completedSessions = sessions.filter((session) => session.status === "completed");

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 md:px-8">
        <div className="text-sm text-slate-500">Loading history...</div>
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
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 md:px-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">History</h1>
        <p className="mt-1 text-sm text-slate-500">
          Open jury days stay manageable inline. Completed days open in a dedicated review page for full feedback.
        </p>
      </div>

      {actionError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <HistorySection
        title="In Progress"
        description="Open jury days that can still be reviewed, exported, or formally completed."
        count={inProgressSessions.length}
        emptyMessage="No jury days are currently in progress."
      >
        {inProgressSessions.map((session) => {
          const isExpanded = !!expanded[session.id];
          const records = recordsBySession[session.id] ?? [];
          const isClosing = closingSessionId === session.id;

          return (
            <Card key={session.id} className="rounded-3xl border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <SessionSummary session={session} />

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="rounded-full"
                      onClick={() => void completeHistorySession(session)}
                      disabled={isClosing}
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      {isClosing ? "Completing..." : "Complete Jury"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => void downloadSessionCsvFor(session)}
                    >
                      <Download className="mr-1.5 h-4 w-4" />
                      CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => void toggle(session.id)}
                    >
                      <Users className="mr-1.5 h-4 w-4" />
                      Students
                      {isExpanded ? (
                        <ChevronUp className="ml-1 h-4 w-4" />
                      ) : (
                        <ChevronDown className="ml-1 h-4 w-4" />
                      )}
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
                      records.map((record) => (
                        <SessionStudentRow key={record.id} session={session} record={record} />
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </HistorySection>

      <HistorySection
        title="Completed"
        description="Closed jury days. Open a session to review all saved student feedback on its own page."
        count={completedSessions.length}
        emptyMessage="No completed jury days yet."
      >
        {completedSessions.map((session) => (
          <Card
            key={session.id}
            role="button"
            tabIndex={0}
            className="rounded-3xl border-0 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-300"
            onClick={() => navigate(`/history/${session.id}`)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                navigate(`/history/${session.id}`);
              }
            }}
          >
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <SessionSummary session={session} />
                  <div className="mt-3 text-sm text-slate-500">
                    Open this completed jury day to review all student feedback in one place.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={(event) => {
                      event.stopPropagation();
                      void downloadSessionCsvFor(session);
                    }}
                  >
                    <Download className="mr-1.5 h-4 w-4" />
                    CSV
                  </Button>
                  <div className="flex items-center gap-1 text-sm font-medium text-slate-500">
                    Open
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </HistorySection>
    </div>
  );
}

function HistorySection({
  title,
  description,
  count,
  emptyMessage,
  children,
}: {
  title: string;
  description: string;
  count: number;
  emptyMessage: string;
  children: ReactNode;
}) {
  const hasItems = count > 0;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <Badge variant="secondary" className="rounded-full">
              {count}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
      </div>

      {hasItems ? (
        <div className="space-y-3">{children}</div>
      ) : (
        <div className="rounded-3xl bg-white p-6 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
          {emptyMessage}
        </div>
      )}
    </section>
  );
}

function SessionSummary({ session }: { session: JurySession }) {
  const statusVariant = session.status === "completed" ? "secondary" : "default";

  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold text-slate-900">{session.department}</span>
        <Badge variant="outline" className="rounded-full">
          {session.jury_type}
        </Badge>
        <Badge variant="outline" className="rounded-full">
          {session.section} / Sem {session.semester} / {session.academic_year}
        </Badge>
        <Badge variant={statusVariant} className="rounded-full">
          {sessionStatusLabel(session.status)}
        </Badge>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>Created {historyTimestampLabel(session.created_at)}</span>
        {session.completed_at && <span>Completed {historyTimestampLabel(session.completed_at)}</span>}
        <span>{session.number_of_students} students planned</span>
        <span>{fmt(session.total_time_seconds)} per student</span>
        <span>{session.subjects.length} subjects + feedback</span>
      </div>
    </div>
  );
}
