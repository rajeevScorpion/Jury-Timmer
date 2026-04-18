# Supabase setup

## 1. Environment variables

Copy `.env.example` at the repo root to `.env.local` and fill in:

- `App_Name` - visible application name/brand label (defaults to `Evalve`)
- `VITE_SUPABASE_URL` - from Supabase dashboard -> Project Settings -> API
- `VITE_SUPABASE_ANON_KEY` - same page
- `VITE_IS_SUPER_ADMIN=true` only for the environment that should expose the Admin page

Important: `VITE_IS_SUPER_ADMIN` is a frontend convenience switch for Phase 2. It is not a secure backend role system.

## 2. Run migrations

Open each migration file in `supabase/migrations/` in order and run it in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).

### Phase 1

- `0001_init.sql` - initial schema. No rollback (first migration).

### Phase 2

- `0002_feedback_modes.sql` - adds session feedback mode plus the `app_settings` table.
- `0002_feedback_modes.rollback.sql` - rolls back the Phase 2 schema changes.

### Phase 3

- `0003_jury_type.sql` - adds a jury type field to each jury session.
- `0003_jury_type.rollback.sql` - rolls back the Phase 3 schema changes.

Future migrations should continue to ship as forward + rollback pairs.

## 3. Enable Google OAuth

1. In the Supabase dashboard: Authentication -> Providers -> Google -> enable.
2. Create OAuth credentials in Google Cloud Console:
   - Authorized JavaScript origin: `http://localhost:5173` (dev) and the production URL.
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`.
3. Paste Client ID and Client Secret into Supabase.
4. Under Authentication -> URL Configuration: add `http://localhost:5173` to Site URL and Redirect URLs.

## 4. Row-level security

- `jury_sessions` and `student_records` are scoped to `faculty_id = auth.uid()`.
- `app_settings` is readable and writable by authenticated users.

Phase 2 note: because super admin access is currently controlled only by `VITE_IS_SUPER_ADMIN` in the frontend, `app_settings` is not protected by a true backend role yet. Document this clearly until a real role system is added.

## 5. SPA routing on Vercel

- The app uses `BrowserRouter`, so deep links such as `/history/SESSION_ID` need a rewrite back to `index.html`.
- Keep `vercel.json` in the repo when deploying to Vercel. It preserves real files first, then falls back all client routes to the SPA entrypoint.
- Without that fallback, refreshing nested routes will return a Vercel `404: NOT_FOUND`.
