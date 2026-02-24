-- Migration 020: Change playoff_round from enum to text
-- NBA values: first_round, conf_semis, conf_finals, finals
-- NFL values: wild_card, divisional, conf_championship, super_bowl

-- Change column type from enum to text
ALTER TABLE games ALTER COLUMN playoff_round TYPE text USING playoff_round::text;

-- Drop the old enum type if it exists
DROP TYPE IF EXISTS playoff_round;
