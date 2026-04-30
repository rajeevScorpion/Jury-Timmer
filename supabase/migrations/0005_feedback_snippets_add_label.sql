-- Add missing 'label' column to feedback_snippets
ALTER TABLE feedback_snippets
ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT '';
