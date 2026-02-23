alter table public.games
  add column playoff_round text
  constraint games_playoff_round_check
  check (playoff_round in ('first_round', 'conf_semis', 'conf_finals', 'finals'));
