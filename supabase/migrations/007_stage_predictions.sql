-- ============================================================
-- 007_stage_predictions.sql
-- User predictions for tournament stages (Ro16, QF, SF, Final, Winner).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stage_predictions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stage       text NOT NULL, -- 'round_of_16', 'qf', 'sf', 'final', 'winner'
  team_id     text NOT NULL REFERENCES public.teams(external_team_id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, stage, team_id),
  CONSTRAINT stage_predictions_stage_check CHECK (stage IN ('round_of_16', 'qf', 'sf', 'final', 'winner'))
);

CREATE INDEX IF NOT EXISTS stage_predictions_user_idx ON public.stage_predictions (user_id);
CREATE INDEX IF NOT EXISTS stage_predictions_stage_idx ON public.stage_predictions (stage);

-- Enable RLS
ALTER TABLE public.stage_predictions ENABLE ROW LEVEL SECURITY;

-- Select Policies:
-- Users can see their own stage predictions at any time.
CREATE POLICY "stage_predictions_select_own" ON public.stage_predictions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can see other users' stage predictions only after the first match's kickoff - 2 hours lock time.
CREATE POLICY "stage_predictions_select_others" ON public.stage_predictions
  FOR SELECT TO authenticated
  USING (
    auth.uid() != user_id
    AND (SELECT MIN(kickoff_time) - interval '2 hours' FROM public.matches WHERE stage = 'round_of_32') < now()
  );

-- Insert/Delete Policies:
-- Users can only insert/delete their own predictions before the lock time.
CREATE POLICY "stage_predictions_insert_own" ON public.stage_predictions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (SELECT MIN(kickoff_time) - interval '2 hours' FROM public.matches WHERE stage = 'round_of_32') > now()
  );

CREATE POLICY "stage_predictions_delete_own" ON public.stage_predictions
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND (SELECT MIN(kickoff_time) - interval '2 hours' FROM public.matches WHERE stage = 'round_of_32') > now()
  );

-- ----------------------------------------------------------------
-- Scoring & Point Calculation Function
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calculate_stage_prediction_points(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points integer := 0;
  v_r16_count integer;
  v_qf_count integer;
  v_sf_count integer;
  v_final_count integer;
  v_winner_count integer;
BEGIN
  -- 1. Round of 16: 2 points for each correct team
  SELECT COUNT(*)
  INTO v_r16_count
  FROM public.stage_predictions sp
  WHERE sp.user_id = p_user_id
    AND sp.stage = 'round_of_16'
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.stage = 'round_of_16'
        AND (m.home_team_ext_id = sp.team_id OR m.away_team_ext_id = sp.team_id)
    );

  -- 2. Quarterfinals: 2 points for each correct team
  SELECT COUNT(*)
  INTO v_qf_count
  FROM public.stage_predictions sp
  WHERE sp.user_id = p_user_id
    AND sp.stage = 'qf'
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.stage = 'qf'
        AND (m.home_team_ext_id = sp.team_id OR m.away_team_ext_id = sp.team_id)
    );

  -- 3. Semifinals: 2 points for each correct team
  SELECT COUNT(*)
  INTO v_sf_count
  FROM public.stage_predictions sp
  WHERE sp.user_id = p_user_id
    AND sp.stage = 'sf'
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.stage = 'sf'
        AND (m.home_team_ext_id = sp.team_id OR m.away_team_ext_id = sp.team_id)
    );

  -- 4. Final: 2 points for each correct team
  SELECT COUNT(*)
  INTO v_final_count
  FROM public.stage_predictions sp
  WHERE sp.user_id = p_user_id
    AND sp.stage = 'final'
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.stage = 'final'
        AND (m.home_team_ext_id = sp.team_id OR m.away_team_ext_id = sp.team_id)
    );

  -- 5. Winner: 20 points
  SELECT COUNT(*)
  INTO v_winner_count
  FROM public.stage_predictions sp
  WHERE sp.user_id = p_user_id
    AND sp.stage = 'winner'
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.stage = 'final'
        AND m.status = 'completed'
        AND (
          (m.penalty_winner IS NOT NULL AND (
            (m.penalty_winner = m.home_team AND m.home_team_ext_id = sp.team_id) OR
            (m.penalty_winner = m.away_team AND m.away_team_ext_id = sp.team_id)
          )) OR
          (m.penalty_winner IS NULL AND (
            (COALESCE(m.home_score, 0) + COALESCE(m.home_score_et, 0) > COALESCE(m.away_score, 0) + COALESCE(m.away_score_et, 0) AND m.home_team_ext_id = sp.team_id) OR
            (COALESCE(m.away_score, 0) + COALESCE(m.away_score_et, 0) > COALESCE(m.home_score, 0) + COALESCE(m.home_score_et, 0) AND m.away_team_ext_id = sp.team_id)
          ))
        )
    );

  v_points := COALESCE(v_r16_count, 0) * 2 +
              COALESCE(v_qf_count, 0) * 2 +
              COALESCE(v_sf_count, 0) * 2 +
              COALESCE(v_final_count, 0) * 2 +
              COALESCE(v_winner_count, 0) * 20;

  RETURN v_points;
END;
$$;

-- ----------------------------------------------------------------
-- Update Leaderboard Views to Include Stage Predictions
-- ----------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS public.leaderboard_pool;
DROP MATERIALIZED VIEW IF EXISTS public.leaderboard_global;

CREATE MATERIALIZED VIEW public.leaderboard_global AS
SELECT
  pr.id AS user_id,
  pr.username,
  pr.display_name,
  pr.avatar_url,
  pr.country,
  COALESCE(SUM(p.points_earned), 0) + public.calculate_stage_prediction_points(pr.id) AS total_points,
  COUNT(p.id)                                  AS predictions_count,
  COUNT(p.id) FILTER (WHERE p.exact_score)     AS exact_scores,
  COUNT(p.id) FILTER (WHERE p.correct_result)  AS correct_results,
  RANK() OVER (ORDER BY COALESCE(SUM(p.points_earned), 0) + public.calculate_stage_prediction_points(pr.id) DESC) AS rank
FROM public.profiles pr
LEFT JOIN public.predictions p ON p.user_id = pr.id
GROUP BY pr.id, pr.username, pr.display_name, pr.avatar_url, pr.country
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_global_user_idx ON public.leaderboard_global (user_id);

CREATE MATERIALIZED VIEW public.leaderboard_pool AS
SELECT
  pm.pool_id,
  pr.id AS user_id,
  pr.username,
  pr.display_name,
  pr.avatar_url,
  COALESCE(SUM(p.points_earned), 0) + public.calculate_stage_prediction_points(pr.id) AS total_points,
  COUNT(p.id)                                  AS predictions_count,
  RANK() OVER (
    PARTITION BY pm.pool_id
    ORDER BY COALESCE(SUM(p.points_earned), 0) + public.calculate_stage_prediction_points(pr.id) DESC
  ) AS pool_rank
FROM public.pool_members pm
JOIN public.profiles pr ON pr.id = pm.user_id
LEFT JOIN public.predictions p ON p.user_id = pr.id
GROUP BY pm.pool_id, pr.id, pr.username, pr.display_name, pr.avatar_url
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_pool_idx ON public.leaderboard_pool (pool_id, user_id);

-- Re-grant permissions
GRANT SELECT ON public.leaderboard_global TO authenticated;
GRANT SELECT ON public.leaderboard_pool TO authenticated;
