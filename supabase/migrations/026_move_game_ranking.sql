CREATE OR REPLACE FUNCTION public.move_game_ranking(
  p_user_id uuid, p_game_id uuid, p_new_position integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_old integer;
BEGIN
  SELECT position INTO v_old FROM public.game_logs
    WHERE user_id = p_user_id AND game_id = p_game_id;
  IF v_old IS NULL OR v_old = p_new_position THEN RETURN; END IF;
  IF p_new_position < v_old THEN
    UPDATE public.game_logs SET position = position + 1, updated_at = now()
      WHERE user_id = p_user_id AND position >= p_new_position AND position < v_old;
  ELSE
    UPDATE public.game_logs SET position = position - 1, updated_at = now()
      WHERE user_id = p_user_id AND position > v_old AND position <= p_new_position;
  END IF;
  UPDATE public.game_logs SET position = p_new_position, updated_at = now()
    WHERE user_id = p_user_id AND game_id = p_game_id;
END;
$$;
