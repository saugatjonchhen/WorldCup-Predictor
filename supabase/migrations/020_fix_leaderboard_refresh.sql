-- ============================================================
-- 020_fix_leaderboard_refresh.sql
-- 레드라인: Redefine trigger function to refresh leaderboards when completed matches are corrected/updated
-- ============================================================

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

  -- Refresh the materialized views if the status transitioned to/from completed, or if any score fields of a completed match changed
  IF (NEW.status = 'completed' AND (
        OLD.status IS NULL 
        OR OLD.status <> 'completed'
        OR OLD.home_score IS DISTINCT FROM NEW.home_score
        OR OLD.away_score IS DISTINCT FROM NEW.away_score
        OR OLD.home_score_et IS DISTINCT FROM NEW.home_score_et
        OR OLD.away_score_et IS DISTINCT FROM NEW.away_score_et
        OR OLD.penalty_winner IS DISTINCT FROM NEW.penalty_winner
     )) 
     OR (OLD.status = 'completed' AND NEW.status <> 'completed') THEN
    PERFORM public.refresh_leaderboards();
  END IF;

  RETURN NEW;
END;
$$;

-- Perform a one-time refresh to make sure views are currently synchronized
SELECT public.refresh_leaderboards();
