ALTER TABLE public.games
  ADD COLUMN week smallint,
  ADD COLUMN broadcast text,
  ADD COLUMN home_team_record text,
  ADD COLUMN away_team_record text;
