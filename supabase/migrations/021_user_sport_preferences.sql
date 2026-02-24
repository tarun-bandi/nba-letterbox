-- Migration 021: Add enabled_sports to user_profiles
-- Default to ['nba'] so existing users see NBA only.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS enabled_sports text[] NOT NULL DEFAULT ARRAY['nba'];
