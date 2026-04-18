import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import type { DaySetupInput, Feedback, JurySession, StudentRecord } from "@/types/session";
import { computePerStudentPlan } from "@/lib/timing";

const LS_KEY = "juryTimer.activeSessionId";

export type StudentRecordInput = {
  student_name: string;
  setup_seconds: number;
  presentation_seconds: number;
  overtime_seconds: number;
  time_saved_seconds: number;
  total_time_used_seconds: number;
  setup_started_at: string | null;
  presentation_started_at: string | null;
  ended_at: string | null;
  feedback: Feedback;
};

type SessionValue = {
  activeSession: JurySession | null;
  studentsCompleted: number;
  nextStudentOrder: number;
  isDayComplete: boolean;
  loading: boolean;
  createSession: (input: DaySetupInput) => Promise<JurySession>;
  clearActive: () => void;
  completeSession: () => Promise<void>;
  saveStudentRecord: (input: StudentRecordInput) => Promise<StudentRecord>;
  reload: () => Promise<void>;
};

const SessionCtx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activeSession, setActiveSession] = useState<JurySession | null>(null);
  const [studentsCompleted, setStudentsCompleted] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadById = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("jury_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    return data as JurySession;
  }, []);

  const loadStudentCount = useCallback(async (sessionId: string) => {
    const { count } = await supabase
      .from("student_records")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId);
    return count ?? 0;
  }, []);

  const reload = useCallback(async () => {
    if (!user) {
      setActiveSession(null);
      setStudentsCompleted(0);
      setLoading(false);
      return;
    }
    const id = localStorage.getItem(LS_KEY);
    if (!id) {
      setActiveSession(null);
      setStudentsCompleted(0);
      setLoading(false);
      return;
    }
    const s = await loadById(id);
    if (!s || s.status !== "active") {
      setActiveSession(null);
      setStudentsCompleted(0);
      localStorage.removeItem(LS_KEY);
    } else {
      setActiveSession(s);
      setStudentsCompleted(await loadStudentCount(s.id));
    }
    setLoading(false);
  }, [user, loadById, loadStudentCount]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createSession = useCallback(
    async (input: DaySetupInput): Promise<JurySession> => {
      if (!user) throw new Error("Not signed in");
      const plan = computePerStudentPlan({
        totalSeconds: input.total_time_seconds,
        students: input.number_of_students,
        bufferSeconds: input.buffer_seconds,
        subjects: input.subjects,
        feedbackSeconds: input.feedback_seconds,
      });
      const row = {
        faculty_id: user.id,
        department: input.department,
        section: input.section,
        semester: input.semester,
        academic_year: input.academic_year,
        total_time_seconds: input.total_time_seconds,
        number_of_students: input.number_of_students,
        buffer_seconds: input.buffer_seconds,
        subjects: input.subjects,
        feedback_seconds: input.feedback_seconds,
        per_subject_seconds: plan.perSubjectSeconds,
        status: "active",
      };
      const { data, error } = await supabase
        .from("jury_sessions")
        .insert(row)
        .select("*")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Failed to create session");
      const session = data as JurySession;
      localStorage.setItem(LS_KEY, session.id);
      setActiveSession(session);
      setStudentsCompleted(0);
      return session;
    },
    [user],
  );

  const clearActive = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    setActiveSession(null);
    setStudentsCompleted(0);
  }, []);

  const completeSession = useCallback(async () => {
    if (!activeSession) return;
    await supabase
      .from("jury_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", activeSession.id);
    clearActive();
  }, [activeSession, clearActive]);

  const saveStudentRecord = useCallback(
    async (input: StudentRecordInput): Promise<StudentRecord> => {
      if (!user) throw new Error("Not signed in");
      if (!activeSession) throw new Error("No active session");
      const order = studentsCompleted + 1;
      const { data, error } = await supabase
        .from("student_records")
        .insert({
          session_id: activeSession.id,
          faculty_id: user.id,
          student_name: input.student_name,
          student_order: order,
          setup_seconds: input.setup_seconds,
          presentation_seconds: input.presentation_seconds,
          overtime_seconds: input.overtime_seconds,
          time_saved_seconds: input.time_saved_seconds,
          total_time_used_seconds: input.total_time_used_seconds,
          setup_started_at: input.setup_started_at,
          presentation_started_at: input.presentation_started_at,
          ended_at: input.ended_at,
          feedback: input.feedback,
        })
        .select("*")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Failed to save record");
      setStudentsCompleted(order);
      return data as StudentRecord;
    },
    [user, activeSession, studentsCompleted],
  );

  const nextStudentOrder = studentsCompleted + 1;
  const isDayComplete = activeSession
    ? studentsCompleted >= activeSession.number_of_students
    : false;

  return (
    <SessionCtx.Provider
      value={{
        activeSession,
        studentsCompleted,
        nextStudentOrder,
        isDayComplete,
        loading,
        createSession,
        clearActive,
        completeSession,
        saveStudentRecord,
        reload,
      }}
    >
      {children}
    </SessionCtx.Provider>
  );
}

export function useSession(): SessionValue {
  const v = useContext(SessionCtx);
  if (!v) throw new Error("useSession must be used inside <SessionProvider>");
  return v;
}
