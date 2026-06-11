-- ============================================================
-- 005_leaderboard.sql
-- Global and per-pool leaderboard as a materialized view.
-- Refreshed by the update-leaderboard Edge Function after
-- each match completes.
-- ============================================================

-- Global leaderboard: sum of points_earned across all predictions
CREATE MATERIALIZED VIEW IF NOT EXISTS public.leaderboard_global AS
SELECT
  p.user_id,
  pr.username,
  pr.display_name,
  pr.avatar_url,
  pr.country,
  SUM(p.points_earned)                        AS total_points,
  COUNT(p.id)                                  AS predictions_count,
  COUNT(p.id) FILTER (WHERE p.exact_score)     AS exact_scores,
  COUNT(p.id) FILTER (WHERE p.correct_result)  AS correct_results,
  RANK() OVER (ORDER BY SUM(p.points_earned) DESC NULLS LAST) AS rank
FROM public.predictions p
JOIN public.profiles pr ON pr.id = p.user_id
GROUP BY p.user_id, pr.username, pr.display_name, pr.avatar_url, pr.country
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_global_user_idx
  ON public.leaderboard_global (user_id);

-- Pool leaderboard: per-pool ranking
CREATE MATERIALIZED VIEW IF NOT EXISTS public.leaderboard_pool AS
SELECT
  pm.pool_id,
  p.user_id,
  pr.username,
  pr.display_name,
  pr.avatar_url,
  SUM(p.points_earned)                        AS total_points,
  COUNT(p.id)                                  AS predictions_count,
  RANK() OVER (
    PARTITION BY pm.pool_id
    ORDER BY SUM(p.points_earned) DESC NULLS LAST
  ) AS pool_rank
FROM public.pool_members pm
JOIN public.predictions p ON p.user_id = pm.user_id
JOIN public.profiles pr ON pr.id = p.user_id
GROUP BY pm.pool_id, p.user_id, pr.username, pr.display_name, pr.avatar_url
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_pool_idx
  ON public.leaderboard_pool (pool_id, user_id);

-- Helper function: refresh both leaderboard views atomically
CREATE OR REPLACE FUNCTION public.refresh_leaderboards()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_global;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard_pool;
END;
$$;
