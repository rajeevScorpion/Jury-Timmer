import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, GitBranch, History, Map, Shield, Database } from "lucide-react";

export default function DocsView() {
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8 md:px-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Documentation</h1>
        <p className="mt-1 text-sm text-slate-500">
          How Jury Timer is evolving, how it is put together, and what is coming next.
        </p>
      </header>

      <Section icon={<History className="h-4 w-4" />} title="Changelog">
        <Version label="Phase 1" badge="current">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Google sign-in via Supabase; every row scoped to the signed-in faculty.</li>
            <li>Day setup: department, section, semester, academic year, dynamic subjects, buffer and feedback durations.</li>
            <li>Per-student timing is computed from day config — no more hardcoded 4×3min + 2min.</li>
            <li>Student records persist to Supabase with structured feedback (final + per-subject JSON).</li>
            <li>History page with per-session expansion, day-level CSV export, and per-student PDF export.</li>
            <li>Screenshot export preserved as a quick capture on the live view.</li>
          </ul>
        </Version>

        <Version label="Phase 0">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Single hardcoded timer: 4 subjects × 3min + 2min feedback.</li>
            <li>Setup, presentation, pause/resume, finish, reset, overtime, audio cues.</li>
            <li>Screenshot export of the full page.</li>
          </ul>
        </Version>
      </Section>

      <Section icon={<GitBranch className="h-4 w-4" />} title="Architecture">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>
            React + TypeScript + Vite. Tailwind + shadcn-style primitives in{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">src/components/ui</code>.
          </li>
          <li>
            Routing via <code className="rounded bg-slate-100 px-1.5 py-0.5">react-router-dom</code>: login gate
            wraps everything, then Live / New Day / History / Docs.
          </li>
          <li>
            Two contexts: <code className="rounded bg-slate-100 px-1.5 py-0.5">AuthContext</code> (Supabase session)
            and <code className="rounded bg-slate-100 px-1.5 py-0.5">SessionContext</code> (active jury day + student
            counter, mirrored to localStorage).
          </li>
          <li>
            Timer math is a pure function in{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">src/lib/timing.ts</code>. Audio, time formatting, and
            CSV/PDF export live next to it in <code className="rounded bg-slate-100 px-1.5 py-0.5">src/lib</code>.
          </li>
          <li>
            Live timing state stays in the React component tree. Writes to Supabase happen once per student, at the
            end, so a flaky network never disrupts a live presentation.
          </li>
        </ul>
      </Section>

      <Section icon={<Database className="h-4 w-4" />} title="Data model">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>
            <code className="rounded bg-slate-100 px-1.5 py-0.5">jury_sessions</code> — one row per jury day with the
            full configuration (department, subjects, timings, status).
          </li>
          <li>
            <code className="rounded bg-slate-100 px-1.5 py-0.5">student_records</code> — one row per student with
            timing, overtime, and a JSON feedback column.
          </li>
          <li>
            Every row carries <code className="rounded bg-slate-100 px-1.5 py-0.5">faculty_id</code>. Row-level
            security restricts access to the owning faculty only.
          </li>
          <li>
            Migrations are plain SQL under{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">supabase/migrations</code> and are run manually in the
            Supabase SQL editor.
          </li>
        </ul>
      </Section>

      <Section icon={<Shield className="h-4 w-4" />} title="Security notes">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Client uses the Supabase anon key plus a signed-in session — all access goes through RLS.</li>
          <li>Google OAuth is configured in the Supabase dashboard; the app never sees the Google secret.</li>
          <li>Local storage holds only the active session id — never tokens, never raw records.</li>
        </ul>
      </Section>

      <Section icon={<Map className="h-4 w-4" />} title="Roadmap">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Voice capture with live transcription during feedback entry.</li>
          <li>AI-assisted summarisation of per-subject notes into the final feedback.</li>
          <li>XLSX day export with formatting and conditional colours.</li>
          <li>Editing past sessions and records.</li>
          <li>Department-wide analytics dashboards for jury day outcomes.</li>
        </ul>
      </Section>

      <Section icon={<BookOpen className="h-4 w-4" />} title="Developer notes">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>
            Copy <code className="rounded bg-slate-100 px-1.5 py-0.5">.env.example</code> to{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">.env.local</code> and fill in Supabase values before
            running <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run dev</code>.
          </li>
          <li>
            Migrations live in <code className="rounded bg-slate-100 px-1.5 py-0.5">supabase/migrations</code>. See
            <code className="rounded bg-slate-100 px-1.5 py-0.5"> supabase/README.md</code> for setup steps and Google
            OAuth configuration.
          </li>
          <li>
            Timer behavior is driven end-to-end by{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">computePerStudentPlan</code> — changing the time
            model is a one-file change.
          </li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-3xl border-0 shadow-sm">
      <CardContent className="p-6">
        <div className="mb-3 flex items-center gap-2 text-slate-500">
          {icon}
          <span className="text-xs font-semibold uppercase tracking-widest">{title}</span>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Version({ label, badge, children }: { label: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-900">{label}</span>
        {badge && <Badge className="rounded-full text-xs">{badge}</Badge>}
      </div>
      {children}
    </div>
  );
}
