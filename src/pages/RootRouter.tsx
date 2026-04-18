import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { SessionProvider, useSession } from "@/context/SessionContext";
import LoginGate from "@/components/LoginGate";
import TopNav from "@/components/TopNav";
import DaySetupForm from "@/components/DaySetupForm";
import ReportHistoryView from "@/components/ReportHistoryView";
import CompletedSessionDetailView from "@/components/CompletedSessionDetailView";
import DocsView from "@/components/DocsView";
import AdminView from "@/components/AdminView";
import JuryTimerApp from "@/JuryTimerApp";
import { isSuperAdminEnabled } from "@/lib/appSettings";

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <TopNav />
      {children}
    </div>
  );
}

function RootRedirect() {
  const { activeSession, loading } = useSession();
  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }
  return <Navigate to={activeSession ? "/jury" : "/day/new"} replace />;
}

function JuryGuard() {
  const { activeSession, loading } = useSession();
  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }
  if (!activeSession) return <Navigate to="/day/new" replace />;
  return <JuryTimerApp />;
}

function AdminGuard() {
  if (!isSuperAdminEnabled) return <Navigate to="/" replace />;
  return <AdminView />;
}

function SignedInRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route
          path="/jury"
          element={
            <AppShell>
              <JuryGuard />
            </AppShell>
          }
        />
        <Route
          path="/day/new"
          element={
            <AppShell>
              <DaySetupForm />
            </AppShell>
          }
        />
        <Route
          path="/history"
          element={
            <AppShell>
              <ReportHistoryView />
            </AppShell>
          }
        />
        <Route
          path="/history/:sessionId"
          element={
            <AppShell>
              <CompletedSessionDetailView />
            </AppShell>
          }
        />
        <Route
          path="/docs"
          element={
            <AppShell>
              <DocsView />
            </AppShell>
          }
        />
        <Route
          path="/admin"
          element={
            <AppShell>
              <AdminGuard />
            </AppShell>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function RootRouter() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  if (!session) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<LoginGate />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <SessionProvider>
      <SignedInRoutes />
    </SessionProvider>
  );
}
