-- Migration 019: Add stats JSONB column to box_scores
-- NBA: { points: 30, rebounds: 10, assists: 5, ... }
-- NFL: { passing_yards: 312, passing_tds: 3, ... }
-- Backfills from existing typed columns for NBA.

ALTER TABLE box_scores ADD COLUMN IF NOT EXISTS stats jsonb;

-- Backfill existing NBA box score data into stats JSONB
UPDATE box_scores
SET stats = jsonb_strip_nulls(jsonb_build_object(
  'minutes', minutes,
  'points', points,
  'rebounds', rebounds,
  'offensive_rebounds', offensive_rebounds,
  'defensive_rebounds', defensive_rebounds,
  'assists', assists,
  'steals', steals,
  'blocks', blocks,
  'turnovers', turnovers,
  'fgm', fgm,
  'fga', fga,
  'fg_pct', fg_pct,
  'tpm', tpm,
  'tpa', tpa,
  'tp_pct', tp_pct,
  'ftm', ftm,
  'fta', fta,
  'ft_pct', ft_pct,
  'personal_fouls', personal_fouls,
  'plus_minus', plus_minus,
  'ts_pct', ts_pct,
  'efg_pct', efg_pct,
  'three_par', three_par,
  'ft_rate', ft_rate,
  'orb_pct', orb_pct,
  'drb_pct', drb_pct,
  'trb_pct', trb_pct,
  'ast_pct', ast_pct,
  'stl_pct', stl_pct,
  'blk_pct', blk_pct,
  'tov_pct', tov_pct,
  'usg_pct', usg_pct,
  'offensive_rating', offensive_rating,
  'defensive_rating', defensive_rating,
  'bpm', bpm
))
WHERE stats IS NULL;
