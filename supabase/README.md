# Supabase setup

## 1. Environment variables

Copy `.env.example` at the repo root to `.env.local` and fill in:

- `VITE_SUPABASE_URL` — from Supabase dashboard → Project Settings → API
- `VITE_SUPABASE_ANON_KEY` — same page

## 2. Run migrations

Open each migration file in `supabase/migrations/` in order and run it in the Supabase SQL editor (Dashboard → SQL Editor → New query).

**Phase 1 migrations:**

- `0001_init.sql` — initial schema. No rollback (first migration).

Future migrations will include forward and rollback pairs.

## 3. Enable Google OAuth

1. In the Supabase dashboard: Authentication → Providers → Google → enable.
2. Create OAuth credentials in Google Cloud Console:
   - Authorized JavaScript origin: `http://localhost:5173` (dev) and the production URL.
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`.
3. Paste Client ID and Client Secret into Supabase.
4. Under Authentication → URL Configuration: add `http://localhost:5173` to Site URL and Redirect URLs.

## 4. Row-level security

Both tables use RLS. Every row is scoped to `faculty_id = auth.uid()` — a signed-in user can only read and write their own rows.
