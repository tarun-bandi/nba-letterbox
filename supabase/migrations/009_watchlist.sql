CREATE TABLE public.watchlist (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id    uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id)
);

CREATE INDEX watchlist_user_id_idx ON public.watchlist(user_id);
