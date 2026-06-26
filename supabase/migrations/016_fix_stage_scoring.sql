-- ============================================================
-- 016_fix_stage_scoring.sql
-- Fix calculate_stage_prediction_points to award points only
-- when the team's PRECEDING stage match is 'completed' AND they WON it.
--
-- Preceding rounds:
--             Ro16  → team WON a completed round_of_32 match
--             QF    → team WON a completed round_of_16 match
--             SF    → team WON a completed qf match
--             Final → team WON a completed sf match
--             Winner → checks completed final match for winner
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_stage_prediction_points(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points       integer := 0;
  v_r16_count    integer;
  v_qf_count     integer;
  v_sf_count     integer;
  v_final_count  integer;
  v_winner_count integer;
BEGIN
  -- 1. Round of 16 (2 pts each): team reached Ro16 when they WON their Ro32 match
  SELECT COUNT(*)
  INTO v_r16_count
  FROM public.stage_predictions sp
  WHERE sp.user_id = p_user_id
    AND sp.stage = 'round_of_16'
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.stage = 'round_of_32'
        AND m.status = 'completed'
        AND (
          (m.home_team_ext_id = sp.team_id AND (
            (m.penalty_winner IS NOT NULL AND m.penalty_winner = m.home_team) OR
            (m.penalty_winner IS NULL AND (COALESCE(m.home_score, 0) + COALESCE(m.home_score_et, 0) > COALESCE(m.away_score, 0) + COALESCE(m.away_score_et, 0)))
          )) OR
          (m.away_team_ext_id = sp.team_id AND (
            (m.penalty_winner IS NOT NULL AND m.penalty_winner = m.away_team) OR
            (m.penalty_winner IS NULL AND (COALESCE(m.away_score, 0) + COALESCE(m.away_score_et, 0) > COALESCE(m.home_score, 0) + COALESCE(m.home_score_et, 0)))
          ))
        )
    );

  -- 2. Quarterfinals (2 pts each): team reached QF when they WON their Ro16 match
  SELECT COUNT(*)
  INTO v_qf_count
  FROM public.stage_predictions sp
  WHERE sp.user_id = p_user_id
    AND sp.stage = 'qf'
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.stage = 'round_of_16'
        AND m.status = 'completed'
        AND (
          (m.home_team_ext_id = sp.team_id AND (
            (m.penalty_winner IS NOT NULL AND m.penalty_winner = m.home_team) OR
            (m.penalty_winner IS NULL AND (COALESCE(m.home_score, 0) + COALESCE(m.home_score_et, 0) > COALESCE(m.away_score, 0) + COALESCE(m.away_score_et, 0)))
          )) OR
          (m.away_team_ext_id = sp.team_id AND (
            (m.penalty_winner IS NOT NULL AND m.penalty_winner = m.away_team) OR
            (m.penalty_winner IS NULL AND (COALESCE(m.away_score, 0) + COALESCE(m.away_score_et, 0) > COALESCE(m.home_score, 0) + COALESCE(m.home_score_et, 0)))
          ))
        )
    );

  -- 3. Semifinals (2 pts each): team reached SF when they WON their QF match
  SELECT COUNT(*)
  INTO v_sf_count
  FROM public.stage_predictions sp
  WHERE sp.user_id = p_user_id
    AND sp.stage = 'sf'
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.stage = 'qf'
        AND m.status = 'completed'
        AND (
          (m.home_team_ext_id = sp.team_id AND (
            (m.penalty_winner IS NOT NULL AND m.penalty_winner = m.home_team) OR
            (m.penalty_winner IS NULL AND (COALESCE(m.home_score, 0) + COALESCE(m.home_score_et, 0) > COALESCE(m.away_score, 0) + COALESCE(m.away_score_et, 0)))
          )) OR
          (m.away_team_ext_id = sp.team_id AND (
            (m.penalty_winner IS NOT NULL AND m.penalty_winner = m.away_team) OR
            (m.penalty_winner IS NULL AND (COALESCE(m.away_score, 0) + COALESCE(m.away_score_et, 0) > COALESCE(m.home_score, 0) + COALESCE(m.home_score_et, 0)))
          ))
        )
    );

  -- 4. Final (2 pts each): team reached Final when they WON their SF match
  SELECT COUNT(*)
  INTO v_final_count
  FROM public.stage_predictions sp
  WHERE sp.user_id = p_user_id
    AND sp.stage = 'final'
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.stage = 'sf'
        AND m.status = 'completed'
        AND (
          (m.home_team_ext_id = sp.team_id AND (
            (m.penalty_winner IS NOT NULL AND m.penalty_winner = m.home_team) OR
            (m.penalty_winner IS NULL AND (COALESCE(m.home_score, 0) + COALESCE(m.home_score_et, 0) > COALESCE(m.away_score, 0) + COALESCE(m.away_score_et, 0)))
          )) OR
          (m.away_team_ext_id = sp.team_id AND (
            (m.penalty_winner IS NOT NULL AND m.penalty_winner = m.away_team) OR
            (m.penalty_winner IS NULL AND (COALESCE(m.away_score, 0) + COALESCE(m.away_score_et, 0) > COALESCE(m.home_score, 0) + COALESCE(m.home_score_et, 0)))
          ))
        )
    );

  -- 5. Winner (20 pts): checks the completed final match for winner
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

  v_points := COALESCE(v_r16_count,   0) * 2  +
              COALESCE(v_qf_count,    0) * 2  +
              COALESCE(v_sf_count,    0) * 2  +
              COALESCE(v_final_count, 0) * 2  +
              COALESCE(v_winner_count,0) * 20;

  RETURN v_points;
END;
$$;


-- ============================================================
-- Recreate Materialized Views to include stage_points
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS public.leaderboard_pool CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.leaderboard_global CASCADE;

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
  public.calculate_stage_prediction_points(pr.id) AS stage_points,
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
  public.calculate_stage_prediction_points(pr.id) AS stage_points,
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
