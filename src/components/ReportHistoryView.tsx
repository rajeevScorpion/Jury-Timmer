import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  Download,
  Minus,
  Play,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import SessionStudentRow from "@/components/SessionStudentRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useSession } from "@/context/SessionContext";
import { buildDayCsv, csvFilenameFor, downloadCsv } from "@/lib/csv";
import { supabase } from "@/lib/supabase";
import { fmtHM } from "@/lib/timeFormat";
import { computeRemainingPlan, validateStudentCountChange } from "@/lib/timing";
import {
  deleteSession,
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
  const { activeSession, reload, resumeSession } = useSession();
  const [sessions, setSessions] = useState<JurySession[]>([]);
  const [recordsBySession, setRecordsBySession] = useState<Record<string, StudentRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<JurySession | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [adjustSession, setAdjustSession] = useState<JurySession | null>(null);
  const [adjustedCount, setAdjustedCount] = useState(0);
  const [adjustCompletedCount, setAdjustCompletedCount] = useState(0);
  const [adjustConsumed, setAdjustConsumed] = useState(0);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const adjustRemaining = adjustedCount - adjustCompletedCount;
  const adjustValidation = useMemo(() => {
    if (!adjustSession || adjustedCount === adjustSession.number_of_students) return null;
    if (adjustRemaining < 1) return "At least one remaining student is required.";
    return validateStudentCountChange({
      totalSeconds: adjustSession.total_time_seconds,
      consumedSeconds: adjustConsumed,
      remainingStudents: adjustRemaining,
      bufferSeconds: adjustSession.buffer_seconds,
      subjects: adjustSession.subjects,
      feedbackSeconds: adjustSession.feedback_seconds,
    });
  }, [adjustSession, adjustedCount, adjustConsumed, adjustRemaining]);

  const adjustPreview = useMemo(() => {
    if (!adjustSession || adjustValidation || adjustedCount === adjustSession.number_of_students) return null;
    const remainingTime = adjustSession.total_time_seconds - adjustConsumed;
    const futureBuffers = adjustSession.buffer_seconds * Math.max(adjustRemaining - 1, 0);
    return Math.floor((remainingTime - futureBuffers) / adjustRemaining);
  }, [adjustSession, adjustValidation, adjustedCount, adjustConsumed, adjustRemaining]);

  const openAdjustDialog = useCallback(async (session: JurySession) => {
    const { data, error } = await supabase
      .from("student_records")
      .select("presentation_seconds, overtime_seconds")
      .eq("session_id", session.id);
    const records = (!error && data) ? data : [];
    const completedCount = records.length;
    const presentationTime = records.reduce(
      (sum, r) => sum + ((r.presentation_seconds ?? 0) + (r.overtime_seconds ?? 0)),
      0,
    );
    const consumed = presentationTime + completedCount * session.buffer_seconds;

    setAdjustSession(session);
    setAdjustedCount(session.number_of_students);
    setAdjustCompletedCount(completedCount);
    setAdjustConsumed(consumed);
    setAdjustError(null);
  }, []);

  const handleAdjustCount = useCallback(async () => {
    if (!adjustSession || adjustValidation || adjustedCount === adjustSession.number_of_students) return;
    try {
      setAdjusting(true);
      setAdjustError(null);
      const newPlan = computeRemainingPlan({
        totalSeconds: adjustSession.total_time_seconds,
        consumedSeconds: adjustConsumed,
        remainingStudents: adjustRemaining,
        bufferSeconds: adjustSession.buffer_seconds,
        subjects: adjustSession.subjects,
        feedbackSeconds: adjustSession.feedback_seconds,
      });
      const { error } = await supabase
        .from("jury_sessions")
        .update({ number_of_students: adjustedCount, per_subject_seconds: newPlan.perSubjectSeconds })
        .eq("id", adjustSession.id);
      if (error) throw new Error(error.message ?? "Failed to update student count");

      setSessions((prev) =>
        prev.map((s) =>
          s.id === adjustSession.id
            ? { ...s, number_of_students: adjustedCount, per_subject_seconds: newPlan.perSubjectSeconds }
            : s,
        ),
      );
      if (activeSession?.id === adjustSession.id) await reload();
      setAdjustSession(null);
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : "Failed to adjust student count");
    } finally {
      setAdjusting(false);
    }
  }, [adjustSession, adjustValidation, adjustedCount, adjustConsumed, adjustRemaining, activeSession, reload]);

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

  const handleDeleteSession = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      setActionError(null);
      await deleteSession(deleteTarget.id);
      setSessions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setRecordsBySession((prev) => {
        const next = { ...prev };
        delete next[deleteTarget.id];
        return next;
      });
      if (activeSession?.id === deleteTarget.id) {
        await reload();
      }
      setDeleteTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete session.");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, activeSession, reload]);

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
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 sm:p-10">
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
              <CardContent className="p-4 sm:p-5">
                <SessionSummary session={session} />

                <div className="mt-4 border-t border-slate-200 pt-4">
                  <div className="grid gap-2 sm:flex sm:flex-wrap">
                    <Button
                      size="sm"
                      className="w-full justify-center rounded-full sm:w-auto"
                      onClick={() => {
                        void resumeSession(session.id).then(() => navigate("/jury"));
                      }}
                    >
                      <Play className="h-4 w-4" />
                      Resume Jury
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full justify-center rounded-full sm:w-auto"
                      onClick={() => void completeHistorySession(session)}
                      disabled={isClosing}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {isClosing ? "Completing..." : "Complete Jury"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-center rounded-full sm:w-auto"
                      onClick={() => void downloadSessionCsvFor(session)}
                    >
                      <Download className="h-4 w-4" />
                      CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-center rounded-full sm:w-auto"
                      onClick={() => void openAdjustDialog(session)}
                    >
                      <Users className="h-4 w-4" />
                      Adjust Students
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-center rounded-full sm:w-auto"
                      onClick={() => void toggle(session.id)}
                    >
                      <Users className="h-4 w-4" />
                      Students
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-center rounded-full text-red-600 hover:bg-red-50 hover:text-red-700 sm:w-auto"
                      onClick={() => setDeleteTarget(session)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
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
            <CardContent className="p-4 sm:p-5">
              <SessionSummary session={session} />

              <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-center rounded-full sm:w-auto"
                    onClick={(event) => {
                      event.stopPropagation();
                      void downloadSessionCsvFor(session);
                    }}
                  >
                    <Download className="h-4 w-4" />
                    CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-center rounded-full text-red-600 hover:bg-red-50 hover:text-red-700 sm:w-auto"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleteTarget(session);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>

                <div className="inline-flex items-center justify-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white sm:self-auto">
                  Open
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </HistorySection>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Session</DialogTitle>
            <DialogDescription>
              This will permanently delete this jury session and all its student records. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteTarget && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-red-50 p-4 text-sm ring-1 ring-red-200">
                <p className="font-semibold text-red-800">{deleteTarget.department}</p>
                <p className="mt-1 text-red-700">
                  {deleteTarget.jury_type} &middot; {deleteTarget.section} / Sem {deleteTarget.semester} / {deleteTarget.academic_year}
                </p>
                <p className="mt-1 text-red-700">
                  {deleteTarget.number_of_students} student{deleteTarget.number_of_students !== 1 ? "s" : ""} planned
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-2xl"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="flex-1 rounded-2xl bg-red-600 text-white hover:bg-red-700"
                  onClick={() => void handleDeleteSession()}
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!adjustSession} onOpenChange={(open) => { if (!open) setAdjustSession(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Student Count</DialogTitle>
            <DialogDescription>
              Add or remove students. Remaining time will be redistributed equally.
            </DialogDescription>
          </DialogHeader>

          {adjustSession && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-50 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Completed</span>
                  <span className="font-semibold text-slate-900">{adjustCompletedCount} students</span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-slate-600">Remaining</span>
                  <span className="font-semibold text-slate-900">
                    {adjustSession.number_of_students - adjustCompletedCount} students
                  </span>
                </div>
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Time remaining</span>
                    <span className="font-semibold text-emerald-700">
                      {fmtHM(Math.max(adjustSession.total_time_seconds - adjustConsumed, 0))}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">New Total Student Count</label>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-12 w-12 shrink-0 rounded-2xl p-0"
                    onClick={() => setAdjustedCount((c) => Math.max(adjustCompletedCount + 1, c - 1))}
                    disabled={adjustedCount <= adjustCompletedCount + 1}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>

                  <Input
                    type="number"
                    min={adjustCompletedCount + 1}
                    max={99}
                    value={adjustedCount}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) setAdjustedCount(Math.max(adjustCompletedCount + 1, Math.min(99, v)));
                    }}
                    className="h-12 rounded-2xl text-center text-lg font-semibold"
                  />

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-12 w-12 shrink-0 rounded-2xl p-0"
                    onClick={() => setAdjustedCount((c) => Math.min(99, c + 1))}
                    disabled={adjustedCount >= 99}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {adjustedCount !== adjustSession.number_of_students && !adjustValidation && adjustPreview !== null && (
                  <p className="text-sm text-slate-600">
                    {adjustedCount > adjustSession.number_of_students
                      ? `Adding ${adjustedCount - adjustSession.number_of_students}`
                      : `Removing ${adjustSession.number_of_students - adjustedCount}`}{" "}
                    student{Math.abs(adjustedCount - adjustSession.number_of_students) !== 1 ? "s" : ""} &middot; New
                    time per student: {fmtHM(adjustPreview)}
                  </p>
                )}
              </div>

              {adjustValidation && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {adjustValidation}
                </div>
              )}

              {adjustError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {adjustError}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-2xl"
                  onClick={() => setAdjustSession(null)}
                  disabled={adjusting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="flex-1 rounded-2xl"
                  onClick={() => void handleAdjustCount()}
                  disabled={adjusting || !!adjustValidation || adjustedCount === adjustSession.number_of_students}
                >
                  {adjusting ? "Updating..." : "Update Count"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-xl font-semibold tracking-tight text-slate-900">{session.department}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-full">
              {session.jury_type}
            </Badge>
            <Badge variant="outline" className="rounded-full">
              {session.section} / Sem {session.semester} / {session.academic_year}
            </Badge>
          </div>
        </div>

        <Badge variant={statusVariant} className="self-start rounded-full px-3 py-1">
          {sessionStatusLabel(session.status)}
        </Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SessionFact icon={<Calendar className="h-4 w-4" />} label="Created" value={historyTimestampLabel(session.created_at)} />
        {session.completed_at && (
          <SessionFact
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Completed"
            value={historyTimestampLabel(session.completed_at)}
          />
        )}
        <SessionFact
          icon={<Users className="h-4 w-4" />}
          label="Students"
          value={`${session.number_of_students} planned`}
        />
        <SessionFact icon={<Clock3 className="h-4 w-4" />} label="Per student" value={fmtHM(session.per_subject_seconds * session.subjects.length + session.feedback_seconds)} />
        <SessionFact
          icon={<BookOpen className="h-4 w-4" />}
          label="Subjects"
          value={`${session.subjects.length} + feedback`}
        />
      </div>
    </div>
  );
}

function SessionFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3.5 py-3 ring-1 ring-slate-200">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-sm font-semibold leading-relaxed text-slate-900">{value}</div>
    </div>
  );
}
