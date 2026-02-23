-- Add onboarding_completed to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false;
