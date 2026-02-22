-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Enums
create type season_type as enum ('regular', 'playoffs');
create type game_status as enum ('scheduled', 'live', 'final');
create type watch_mode as enum ('live', 'replay', 'condensed', 'highlights');

-- ============================================================
-- user_profiles
-- ============================================================
create table public.user_profiles (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  display_name text       not null,
  handle      text        not null unique,
  bio         text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index user_profiles_handle_idx on public.user_profiles (lower(handle));

-- Trigger: auto-create profile on auth.users insert
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_profiles (user_id, display_name, handle)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(
      new.raw_user_meta_data->>'handle',
      lower(split_part(new.email, '@', 1)) || '_' || substr(gen_random_uuid()::text, 1, 6)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- follows
-- ============================================================
create table public.follows (
  follower_id uuid        not null references public.user_profiles(user_id) on delete cascade,
  following_id uuid       not null references public.user_profiles(user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index follows_following_id_idx on public.follows (following_id);

-- ============================================================
-- teams
-- ============================================================
create table public.teams (
  id                uuid        primary key default gen_random_uuid(),
  provider          text        not null default 'balldontlie',
  provider_team_id  integer     not null,
  abbreviation      text        not null,
  city              text        not null,
  conference        text,
  division          text,
  full_name         text        not null,
  name              text        not null,
  created_at        timestamptz not null default now(),
  unique (provider, provider_team_id)
);

create index teams_abbreviation_idx on public.teams (abbreviation);

-- ============================================================
-- players
-- ============================================================
create table public.players (
  id                uuid        primary key default gen_random_uuid(),
  provider          text        not null default 'balldontlie',
  provider_player_id integer    not null,
  first_name        text        not null,
  last_name         text        not null,
  position          text,
  jersey_number     text,
  team_id           uuid        references public.teams(id) on delete set null,
  height            text,
  weight            text,
  college           text,
  country           text,
  draft_year        integer,
  draft_round       integer,
  draft_number      integer,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (provider, provider_player_id)
);

create index players_team_id_idx on public.players (team_id);
create index players_last_name_idx on public.players (last_name);

-- ============================================================
-- seasons
-- ============================================================
create table public.seasons (
  id          uuid        primary key default gen_random_uuid(),
  year        integer     not null unique,
  type        season_type not null default 'regular',
  created_at  timestamptz not null default now()
);

-- ============================================================
-- games
-- ============================================================
create table public.games (
  id                uuid        primary key default gen_random_uuid(),
  provider          text        not null default 'balldontlie',
  provider_game_id  integer     not null,
  season_id         uuid        not null references public.seasons(id),
  home_team_id      uuid        not null references public.teams(id),
  away_team_id      uuid        not null references public.teams(id),
  home_team_score   integer,
  away_team_score   integer,
  game_date_utc     timestamptz not null,
  status            game_status not null default 'scheduled',
  period            integer,
  time              text,
  postseason        boolean     not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (provider, provider_game_id)
);

create index games_game_date_utc_idx on public.games (game_date_utc desc);
create index games_home_team_id_idx  on public.games (home_team_id);
create index games_away_team_id_idx  on public.games (away_team_id);
create index games_season_id_idx     on public.games (season_id);

-- ============================================================
-- game_logs
-- ============================================================
create table public.game_logs (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  game_id       uuid        not null references public.games(id) on delete cascade,
  rating        smallint    check (rating >= 0 and rating <= 50),
  watch_mode    watch_mode,
  review        text,
  has_spoilers  boolean     not null default false,
  logged_at     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, game_id)
);

create index game_logs_user_id_idx  on public.game_logs (user_id);
create index game_logs_game_id_idx  on public.game_logs (game_id);
create index game_logs_logged_at_idx on public.game_logs (logged_at desc);

-- ============================================================
-- log_tags
-- ============================================================
create table public.log_tags (
  id    uuid primary key default gen_random_uuid(),
  name  text not null unique,
  slug  text not null unique
);

create table public.game_log_tag_map (
  log_id  uuid not null references public.game_logs(id) on delete cascade,
  tag_id  uuid not null references public.log_tags(id) on delete cascade,
  primary key (log_id, tag_id)
);

-- ============================================================
-- likes
-- ============================================================
create table public.likes (
  user_id uuid        not null references auth.users(id) on delete cascade,
  log_id  uuid        not null references public.game_logs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, log_id)
);

create index likes_log_id_idx on public.likes (log_id);

-- ============================================================
-- lists
-- ============================================================
create table public.lists (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  title       text        not null,
  description text,
  is_private  boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index lists_user_id_idx on public.lists (user_id);

create table public.list_items (
  id          uuid    primary key default gen_random_uuid(),
  list_id     uuid    not null references public.lists(id) on delete cascade,
  game_id     uuid    not null references public.games(id) on delete cascade,
  position    integer not null default 0,
  note        text,
  added_at    timestamptz not null default now(),
  unique (list_id, game_id)
);

create index list_items_list_id_idx on public.list_items (list_id);

-- ============================================================
-- user_favorite_teams
-- ============================================================
create table public.user_favorite_teams (
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

-- ============================================================
-- user_favorite_players
-- ============================================================
create table public.user_favorite_players (
  user_id   uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, player_id)
);
