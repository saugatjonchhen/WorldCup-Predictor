-- ============================================================
-- 017_draw_advancing_bonus.sql
-- Restrict the knockout advancing bonus to predictions that
-- called a 90-minute draw, then picked the team that advanced.
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_prediction_points(
  p_match_status text,
  p_stage text,
  p_home_team text,
  p_away_team text,
  p_actual_home int,
  p_actual_away int,
  p_actual_home_et int,
  p_actual_away_et int,
  p_penalty_winner text,
  p_pred_home int,
  p_pred_away int,
  p_pred_advancing text
)
RETURNS TABLE (
  points_earned int,
  correct_result bool,
  correct_goal_diff bool,
  exact_score bool,
  correct_advancing bool
)
LANGUAGE plpgsql AS $$
DECLARE
  v_points int := 0;
  v_actual_res text;
  v_pred_res text;
  v_correct_res bool := false;
  v_correct_gd bool := false;
  v_exact bool := false;
  v_correct_adv bool := false;
  v_actual_advancing text := null;
  v_actual_home_total int;
  v_actual_away_total int;
BEGIN
  -- If actual scores are null, return zero points
  IF p_actual_home IS NULL OR p_actual_away IS NULL THEN
    RETURN QUERY SELECT 0, false, false, false, false;
    RETURN;
  END IF;

  -- 1. Correct Result (3 points) based on the 90-minute score
  IF p_actual_home > p_actual_away THEN
    v_actual_res := 'home';
  ELSIF p_actual_home < p_actual_away THEN
    v_actual_res := 'away';
  ELSE
    v_actual_res := 'draw';
  END IF;

  IF p_pred_home > p_pred_away THEN
    v_pred_res := 'home';
  ELSIF p_pred_home < p_pred_away THEN
    v_pred_res := 'away';
  ELSE
    v_pred_res := 'draw';
  END IF;

  IF v_actual_res = v_pred_res THEN
    v_correct_res := true;
    v_points := v_points + 3;
  END IF;

  -- 2. Correct Goal Difference (2 points)
  -- Awarded if goal differences match AND it's not a draw (or if it's an exact match)
  IF (p_actual_home - p_actual_away) = (p_pred_home - p_pred_away) AND 
     (v_actual_res <> 'draw' OR (p_actual_home = p_pred_home AND p_actual_away = p_pred_away)) THEN
    v_correct_gd := true;
    v_points := v_points + 2;
  END IF;

  -- 3. Exact Score (5 points)
  IF p_actual_home = p_pred_home AND p_actual_away = p_pred_away THEN
    v_exact := true;
    v_points := v_points + 5;
  END IF;

  -- 4. Correct Advancing (2 points)
  -- Round-of-32 and later only, and only when both the prediction and 90-minute result are draws.
  IF p_stage <> 'group' AND v_pred_res = 'draw' AND v_actual_res = 'draw' THEN
    v_actual_home_total := p_actual_home + COALESCE(p_actual_home_et, 0);
    v_actual_away_total := p_actual_away + COALESCE(p_actual_away_et, 0);

    IF v_actual_home_total > v_actual_away_total THEN
      v_actual_advancing := p_home_team;
    ELSIF v_actual_home_total < v_actual_away_total THEN
      v_actual_advancing := p_away_team;
    ELSIF p_penalty_winner IS NOT NULL AND p_penalty_winner <> '' THEN
      v_actual_advancing := p_penalty_winner;
    END IF;

    IF v_actual_advancing IS NOT NULL AND p_pred_advancing IS NOT NULL AND v_actual_advancing = p_pred_advancing THEN
      v_correct_adv := true;
      v_points := v_points + 2;
    END IF;
  END IF;

  RETURN QUERY SELECT v_points, v_correct_res, v_correct_gd, v_exact, v_correct_adv;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_match_update_recalculate_predictions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  calc RECORD;
BEGIN
  -- Perform calculation for all predictions of this match
  FOR r IN 
    SELECT id, home_score_pred, away_score_pred, advancing_team 
    FROM public.predictions 
    WHERE match_id = NEW.id
  LOOP
    -- Calculate based on whether the match is Live or Completed
    IF NEW.status = 'live' THEN
      SELECT * INTO calc FROM public.calculate_prediction_points(
        NEW.status, NEW.stage, NEW.home_team, NEW.away_team,
        NEW.live_home_score, NEW.live_away_score, null, null, NEW.penalty_winner,
        r.home_score_pred, r.away_score_pred, r.advancing_team
      );
      
      -- Update live_points (provisional)
      UPDATE public.predictions
      SET live_points = calc.points_earned,
          correct_result = calc.correct_result,
          correct_goal_diff = calc.correct_goal_diff,
          exact_score = calc.exact_score,
          correct_advancing = calc.correct_advancing
      WHERE id = r.id;

    ELSIF NEW.status = 'completed' THEN
      SELECT * INTO calc FROM public.calculate_prediction_points(
        NEW.status, NEW.stage, NEW.home_team, NEW.away_team,
        NEW.home_score, NEW.away_score, NEW.home_score_et, NEW.away_score_et, NEW.penalty_winner,
        r.home_score_pred, r.away_score_pred, r.advancing_team
      );

      -- Update final points_earned and breakdown
      UPDATE public.predictions
      SET points_earned = calc.points_earned,
          live_points = calc.points_earned,
          correct_result = calc.correct_result,
          correct_goal_diff = calc.correct_goal_diff,
          exact_score = calc.exact_score,
          correct_advancing = calc.correct_advancing
      WHERE id = r.id;
    
    ELSE
      -- Scheduled or reset back
      UPDATE public.predictions
      SET points_earned = 0,
          live_points = 0,
          correct_result = false,
          correct_goal_diff = false,
          exact_score = false,
          correct_advancing = false
      WHERE id = r.id;
    END IF;
  END LOOP;

  -- If status transitioned to completed, refresh the materialized views
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
    PERFORM public.refresh_leaderboards();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_on_match_update_recalculate ON public.matches;
CREATE TRIGGER trigger_on_match_update_recalculate
  AFTER UPDATE OF status, live_home_score, live_away_score, home_score, away_score, home_score_et, away_score_et, penalty_winner, live_minute ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.on_match_update_recalculate_predictions();

UPDATE public.matches
SET status = status
WHERE status IN ('live', 'completed');

SELECT public.refresh_leaderboards();
