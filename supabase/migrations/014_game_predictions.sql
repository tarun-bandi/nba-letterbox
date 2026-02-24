CREATE TABLE public.game_predictions (
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id                  uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  predicted_winner_team_id uuid NOT NULL REFERENCES public.teams(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id)
);

CREATE INDEX game_predictions_game_id_idx ON public.game_predictions(game_id);

-- RLS
ALTER TABLE public.game_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read all predictions" ON public.game_predictions FOR SELECT USING (true);
CREATE POLICY "Users can insert own predictions" ON public.game_predictions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own predictions" ON public.game_predictions FOR DELETE USING (auth.uid() = user_id);
