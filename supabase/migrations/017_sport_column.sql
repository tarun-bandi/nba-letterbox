-- Migration 017: Add sport column to core tables
-- Adds a sport text column (default 'nba') to teams, players, seasons, games, box_scores.
-- Replaces seasons(year) unique constraint with (sport, year).
-- Adds indexes for sport-based queries.

-- Add sport column to core tables
ALTER TABLE teams ADD COLUMN IF NOT EXISTS sport text NOT NULL DEFAULT 'nba';
ALTER TABLE players ADD COLUMN IF NOT EXISTS sport text NOT NULL DEFAULT 'nba';
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS sport text NOT NULL DEFAULT 'nba';
ALTER TABLE games ADD COLUMN IF NOT EXISTS sport text NOT NULL DEFAULT 'nba';
ALTER TABLE box_scores ADD COLUMN IF NOT EXISTS sport text NOT NULL DEFAULT 'nba';

-- Replace seasons unique constraint: (year) -> (sport, year)
ALTER TABLE seasons DROP CONSTRAINT IF EXISTS seasons_year_key;
ALTER TABLE seasons ADD CONSTRAINT seasons_sport_year_key UNIQUE (sport, year);

-- Indexes for sport-based filtering
CREATE INDEX IF NOT EXISTS idx_games_sport ON games (sport);
CREATE INDEX IF NOT EXISTS idx_teams_sport ON teams (sport);
CREATE INDEX IF NOT EXISTS idx_players_sport ON players (sport);
