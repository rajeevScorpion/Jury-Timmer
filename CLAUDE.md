# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `npm run dev` (Vite on port 5173)
- **Build:** `npm run build` (runs `tsc -b && vite build`)
- **Preview prod build:** `npm run preview`
- No test runner or linter is configured.

## Architecture

Jury Timer (branded "Evalve") is a React 18 SPA for managing timed jury presentations in educational settings. Faculty create a jury session, then run a per-student timer with audio cues and feedback capture.

**Stack:** React 18 + TypeScript + Vite + Tailwind CSS 3 + Supabase (Postgres, Auth, RLS)

### Key directories

- `src/components/` — page-level components and `ui/` shadcn-style primitives
- `src/context/` — React Context providers (AuthContext, SessionContext)
- `src/lib/` — pure utilities: timer math, time formatting, audio, CSV/PDF export, Supabase client
- `src/pages/RootRouter.tsx` — all routes and guards
- `src/types/session.ts` — Zod schemas and TypeScript types
- `supabase/migrations/` — numbered SQL migrations (run manually in Supabase SQL editor)

### Routing (React Router v7, BrowserRouter)

- `/` — redirects to `/jury` (active session) or `/day/new`
- `/jury` — live timer (requires active session)
- `/day/new` — create new jury session
- `/history` — session history list
- `/history/:sessionId` — completed session detail
- `/docs` — documentation
- `/admin` — settings (requires `VITE_IS_SUPER_ADMIN=true`)

All routes are auth-gated via `LoginGate` (Google OAuth through Supabase).

### State management

- **AuthContext** — Supabase auth session, user, signOut
- **SessionContext** — active jury session, student records, CRUD operations; persists active session ID in localStorage (`juryTimer.activeSessionId`)
- Feedback drafts stored per-student in localStorage (`juryTimer.feedbackDraft:{sessionId}:{studentOrder}`)

### Database (Supabase)

Two main tables with RLS scoped to `faculty_id = auth.uid()`:
- `jury_sessions` — session config (timing, subjects, feedback mode, jury type)
- `student_records` — per-student timing data + JSONB feedback

`app_settings` — key/value config (authenticated read/write, no admin role yet).

Migrations ship as forward + rollback pairs (`supabase/migrations/`).

### Path alias

`@/*` maps to `./src/*` (configured in tsconfig.json and vite.config.ts).

### Environment variables

Defined in `.env.local` (see `.env.example`):
- `App_Name` — brand label (default "Evalve"), exposed as `__APP_NAME__` global via Vite define
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Supabase connection
- `VITE_IS_SUPER_ADMIN` — frontend-only admin toggle (not backend-secured)

### Deployment

Vercel with `vercel.json` providing SPA fallback routing for BrowserRouter deep links.
