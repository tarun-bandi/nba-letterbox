-- ============================================================
-- Add quarter scores, arena, attendance to games
-- ============================================================
alter table public.games
  add column home_q1  smallint,
  add column home_q2  smallint,
  add column home_q3  smallint,
  add column home_q4  smallint,
  add column home_ot  smallint,
  add column away_q1  smallint,
  add column away_q2  smallint,
  add column away_q3  smallint,
  add column away_q4  smallint,
  add column away_ot  smallint,
  add column arena    text,
  add column attendance integer;

-- ============================================================
-- box_scores table
-- ============================================================
create table public.box_scores (
  id                 uuid primary key default gen_random_uuid(),
  game_id            uuid not null references public.games (id) on delete cascade,
  team_id            uuid not null references public.teams (id) on delete cascade,
  player_name        text not null,
  minutes            text,
  points             smallint,
  rebounds           smallint,
  offensive_rebounds smallint,
  defensive_rebounds smallint,
  assists            smallint,
  steals             smallint,
  blocks             smallint,
  turnovers          smallint,
  fgm                smallint,
  fga                smallint,
  fg_pct             real,
  tpm                smallint,
  tpa                smallint,
  tp_pct             real,
  ftm                smallint,
  fta                smallint,
  ft_pct             real,
  personal_fouls     smallint,
  plus_minus         smallint,
  -- advanced stats
  ts_pct             real,
  efg_pct            real,
  three_par          real,
  ft_rate            real,
  orb_pct            real,
  drb_pct            real,
  trb_pct            real,
  ast_pct            real,
  stl_pct            real,
  blk_pct            real,
  tov_pct            real,
  usg_pct            real,
  offensive_rating   smallint,
  defensive_rating   smallint,
  bpm                real,
  starter            boolean not null default false,
  created_at         timestamptz not null default now()
);

-- Prevent duplicate rows per game/team/player
create unique index box_scores_game_team_player_idx
  on public.box_scores (game_id, team_id, player_name);

-- ============================================================
-- RLS: read-only via client (ingestion uses service role)
-- ============================================================
alter table public.box_scores enable row level security;

create policy "Box scores are viewable by everyone"
  on public.box_scores for select using (true);
