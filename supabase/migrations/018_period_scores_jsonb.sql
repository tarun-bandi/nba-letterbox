-- Migration 018: Add period_scores JSONB column to games
-- Format: { home: [28, 31, 25, 22], away: [30, 22, 28, 19], ot: [{ home: 8, away: 6 }] }
-- Backfills from existing home_q1..home_ot / away_q1..away_ot columns.

ALTER TABLE games ADD COLUMN IF NOT EXISTS period_scores jsonb;

-- Backfill from existing quarter columns
UPDATE games
SET period_scores = jsonb_build_object(
  'home', jsonb_build_array(
    COALESCE(home_q1, 0), COALESCE(home_q2, 0),
    COALESCE(home_q3, 0), COALESCE(home_q4, 0)
  ),
  'away', jsonb_build_array(
    COALESCE(away_q1, 0), COALESCE(away_q2, 0),
    COALESCE(away_q3, 0), COALESCE(away_q4, 0)
  ),
  'ot', CASE
    WHEN home_ot IS NOT NULL OR away_ot IS NOT NULL
    THEN jsonb_build_array(jsonb_build_object(
      'home', COALESCE(home_ot, 0),
      'away', COALESCE(away_ot, 0)
    ))
    ELSE '[]'::jsonb
  END
)
WHERE home_q1 IS NOT NULL;
