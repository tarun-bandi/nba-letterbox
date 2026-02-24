-- Unify game_rankings into game_logs: add position, sentiment, fan_of columns

-- Add columns to game_logs
ALTER TABLE public.game_logs ADD COLUMN IF NOT EXISTS position integer;
ALTER TABLE public.game_logs ADD COLUMN IF NOT EXISTS sentiment text CHECK (sentiment IN ('loved','good','okay','bad'));
ALTER TABLE public.game_logs ADD COLUMN IF NOT EXISTS fan_of text CHECK (fan_of IN ('home','away','both','neutral'));

-- Migrate existing ranking data (skip if table already dropped)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'game_rankings') THEN
    UPDATE public.game_logs gl
    SET position = gr.position
    FROM public.game_rankings gr
    WHERE gl.user_id = gr.user_id AND gl.game_id = gr.game_id;
  END IF;
END $$;

-- Index for ranked list queries
CREATE INDEX IF NOT EXISTS game_logs_user_position_idx ON public.game_logs (user_id, position)
WHERE position IS NOT NULL;

-- Rewrite insert RPC to target game_logs
CREATE OR REPLACE FUNCTION public.insert_game_ranking(
  p_user_id uuid, p_game_id uuid, p_position integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.game_logs
    SET position = position + 1, updated_at = now()
    WHERE user_id = p_user_id AND position IS NOT NULL AND position >= p_position;
  UPDATE public.game_logs
    SET position = p_position, updated_at = now()
    WHERE user_id = p_user_id AND game_id = p_game_id;
END;
$$;

-- Rewrite remove RPC to target game_logs
CREATE OR REPLACE FUNCTION public.remove_game_ranking(
  p_user_id uuid, p_game_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_position integer;
BEGIN
  SELECT position INTO v_position FROM public.game_logs
    WHERE user_id = p_user_id AND game_id = p_game_id;
  IF v_position IS NULL THEN RETURN; END IF;
  UPDATE public.game_logs SET position = NULL, updated_at = now()
    WHERE user_id = p_user_id AND game_id = p_game_id;
  UPDATE public.game_logs
    SET position = position - 1, updated_at = now()
    WHERE user_id = p_user_id AND position > v_position;
END;
$$;

-- Drop old table
DROP TABLE IF EXISTS public.game_rankings CASCADE;
