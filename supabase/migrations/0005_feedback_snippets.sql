-- Feedback snippet library for reusable feedback text
create table feedback_snippets (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null,
  label text not null default '',
  scope text not null default 'general',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index feedback_snippets_faculty_scope_idx
  on feedback_snippets (faculty_id, scope);

alter table feedback_snippets enable row level security;

create policy "faculty_owns_snippets"
  on feedback_snippets for all
  using (faculty_id = auth.uid())
  with check (faculty_id = auth.uid());
