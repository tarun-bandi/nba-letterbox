-- Drop the old check constraint that only allowed NBA playoff round values
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_playoff_round_check;
