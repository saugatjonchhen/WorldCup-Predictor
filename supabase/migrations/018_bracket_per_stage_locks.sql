-- ============================================================
-- 018_bracket_per_stage_locks.sql
--
-- Introduces per-stage, rolling lock deadlines for bracket
-- (stage) predictions, keyed to the next upcoming Ro32 match.
--
-- Deadline formula:
--   round_of_16 → next_upcoming_ro32_kickoff − 1 hour
--   qf/sf/final/winner → next_upcoming_ro32_kickoff − 1 hour + 1 day
--
-- As each Ro32 match completes, the reference automatically
-- advances to the next upcoming Ro32 game.
-- When all Ro32 matches are done, falls back to MAX(ro32 kickoff)
-- so all stages become fully locked.
--
-- Also adds per-slot Ro16 DB protection: a completed Ro32 match's
-- winning team cannot be deleted from stage_predictions (Ro16).
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Helper: get_stage_lock_deadline(p_stage)
--    Returns the lock timestamp for a given stage.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_stage_lock_deadline(p_stage text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_ro32 timestamptz;
BEGIN
  -- Find the next upcoming (not completed) Ro32 match kickoff.
  -- If all Ro32 matches are done, use the MAX kickoff as reference
  -- so that the deadline is in the past → fully locked.
  SELECT COALESCE(
    MIN(kickoff_time) FILTER (WHERE status != 'completed'),
    MAX(kickoff_time)
  )
  INTO v_next_ro32
  FROM public.matches
  WHERE stage = 'round_of_32';

  -- If no Ro32 matches exist at all, return epoch (always locked)
  IF v_next_ro32 IS NULL THEN
    RETURN '-infinity'::timestamptz;
  END IF;

  RETURN CASE p_stage
    WHEN 'round_of_16' THEN v_next_ro32 - interval '1 hour'
    ELSE                     v_next_ro32 - interval '1 hour' + interval '1 day'
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stage_lock_deadline(text) TO authenticated;


-- ----------------------------------------------------------------
-- 2. RPC: get_bracket_lock_status()
--    Called by the frontend to get all stage deadlines and
--    information about completed Ro32 matches (for Ro16 slot locking).
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_bracket_lock_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_ro32        timestamptz;
  v_ro16_deadline    timestamptz;
  v_others_deadline  timestamptz;
  v_locked_matches   jsonb;
  v_result           jsonb;
BEGIN
  -- Compute the rolling reference
  SELECT COALESCE(
    MIN(kickoff_time) FILTER (WHERE status != 'completed'),
    MAX(kickoff_time)
  )
  INTO v_next_ro32
  FROM public.matches
  WHERE stage = 'round_of_32';

  IF v_next_ro32 IS NULL THEN
    v_ro16_deadline   := '-infinity'::timestamptz;
    v_others_deadline := '-infinity'::timestamptz;
  ELSE
    v_ro16_deadline   := v_next_ro32 - interval '1 hour';
    v_others_deadline := v_next_ro32 - interval '1 hour' + interval '1 day';
  END IF;

  -- Gather all completed Ro32 matches with winner info
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
      'round_of_16', v_ro16_deadline,
      'qf',          v_others_deadline,
      'sf',          v_others_deadline,
      'final',       v_others_deadline,
      'winner',      v_others_deadline
    ),
    'locked_ro32_matches', v_locked_matches
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bracket_lock_status() TO authenticated;


-- ----------------------------------------------------------------
-- 3. Drop old blanket RLS policies and replace with stage-aware ones
-- ----------------------------------------------------------------

-- Remove old policies (created in 007_stage_predictions.sql)
DROP POLICY IF EXISTS "stage_predictions_insert_own" ON public.stage_predictions;
DROP POLICY IF EXISTS "stage_predictions_delete_own" ON public.stage_predictions;


-- New stage-aware INSERT policy:
-- Allow insert when the current time is before this stage's lock deadline.
CREATE POLICY "stage_predictions_insert_own" ON public.stage_predictions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.get_stage_lock_deadline(stage) > now()
  );


-- New stage-aware DELETE policy:
-- Allow delete when:
--   1. The stage is not yet locked, AND
--   2. For round_of_16: the team is NOT the winner of a completed Ro32 match
--      (prevents removing a slot that is already determined).
CREATE POLICY "stage_predictions_delete_own" ON public.stage_predictions
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND public.get_stage_lock_deadline(stage) > now()
    -- Protect locked Ro16 winner slots at DB level
    AND NOT (
      stage = 'round_of_16'
      AND EXISTS (
        SELECT 1
        FROM public.matches m
        WHERE m.stage = 'round_of_32'
          AND m.status = 'completed'
          AND (
            -- Team is home winner
            (m.home_team_ext_id = team_id AND (
              (m.penalty_winner IS NOT NULL AND m.penalty_winner = m.home_team) OR
              (m.penalty_winner IS NULL AND
                (COALESCE(m.home_score, 0) + COALESCE(m.home_score_et, 0)) >
                (COALESCE(m.away_score, 0) + COALESCE(m.away_score_et, 0))
              )
            )) OR
            -- Team is away winner
            (m.away_team_ext_id = team_id AND (
              (m.penalty_winner IS NOT NULL AND m.penalty_winner = m.away_team) OR
              (m.penalty_winner IS NULL AND
                (COALESCE(m.away_score, 0) + COALESCE(m.away_score_et, 0)) >
                (COALESCE(m.home_score, 0) + COALESCE(m.home_score_et, 0))
              )
            ))
          )
      )
    )
  );
