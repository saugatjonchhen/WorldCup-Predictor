-- ============================================================
-- 019_lock_bracket_predictions.sql
--
-- Locks all bracket predictions (Round of 16, QF, SF, Final, Winner)
-- by setting their lock deadlines to a timestamp in the past.
-- ============================================================

-- 1. Helper: get_stage_lock_deadline(p_stage)
--    Returns the lock timestamp for a given stage (hardcoded to past).
CREATE OR REPLACE FUNCTION public.get_stage_lock_deadline(p_stage text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Set all deadlines to June 25, 2026 (before the tournament bracket started)
  RETURN '2026-06-25T00:00:00+00:00'::timestamptz;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stage_lock_deadline(text) TO authenticated;


-- 2. RPC: get_bracket_lock_status()
--    Called by the frontend to get all stage deadlines (now all in the past).
CREATE OR REPLACE FUNCTION public.get_bracket_lock_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked_matches   jsonb;
  v_result           jsonb;
  v_lock_time        timestamptz := '2026-06-25T00:00:00+00:00'::timestamptz;
BEGIN
  -- Gather all completed Ro32 matches with winner info (still needed for UI display/verification)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'external_match_id',  m.external_match_id,
      'home_team_ext_id',   m.home_team_ext_id,
      'away_team_ext_id',   m.away_team_ext_id,
      'home_team',          m.home_team,
      'away_team',          m.away_team,
      -- Determine winner team external_team_id
      'winner_team_ext_id', CASE
        WHEN m.penalty_winner IS NOT NULL THEN
          CASE
            WHEN m.penalty_winner = m.home_team THEN m.home_team_ext_id
            ELSE m.away_team_ext_id
          END
        WHEN (COALESCE(m.home_score, 0) + COALESCE(m.home_score_et, 0)) >
             (COALESCE(m.away_score, 0) + COALESCE(m.away_score_et, 0))
          THEN m.home_team_ext_id
        WHEN (COALESCE(m.away_score, 0) + COALESCE(m.away_score_et, 0)) >
             (COALESCE(m.home_score, 0) + COALESCE(m.home_score_et, 0))
          THEN m.away_team_ext_id
        ELSE NULL  -- draw / not yet determined
      END
    )
  ), '[]'::jsonb)
  INTO v_locked_matches
  FROM public.matches m
  WHERE m.stage = 'round_of_32'
    AND m.status = 'completed';

  v_result := jsonb_build_object(
    'stage_deadlines', jsonb_build_object(
      'round_of_16', v_lock_time,
      'qf',          v_lock_time,
      'sf',          v_lock_time,
      'final',       v_lock_time,
      'winner',      v_lock_time
    ),
    'locked_ro32_matches', v_locked_matches
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bracket_lock_status() TO authenticated;
