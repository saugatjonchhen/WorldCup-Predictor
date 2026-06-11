-- ============================================================
-- 003_predictions.sql
-- User predictions for each match.
-- RLS ensures users can only write their own predictions
-- and only before kickoff.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.predictions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id          uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  home_score_pred   int NOT NULL CHECK (home_score_pred >= 0),
  away_score_pred   int NOT NULL CHECK (away_score_pred >= 0),
  advancing_team    text,                  -- Knockout only: predicted team to advance
  -- Scoring
  points_earned     int DEFAULT 0,         -- Official points (set after match completes)
  live_points       int DEFAULT 0,         -- Provisional points (recalculated during live match)
  -- Breakdown
  correct_result    bool DEFAULT false,
  correct_goal_diff bool DEFAULT false,
  exact_score       bool DEFAULT false,
  correct_advancing bool DEFAULT false,
  -- Timestamps
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, match_id)
);

CREATE INDEX IF NOT EXISTS predictions_user_idx ON public.predictions (user_id);
CREATE INDEX IF NOT EXISTS predictions_match_idx ON public.predictions (match_id);

CREATE TRIGGER predictions_updated_at
  BEFORE UPDATE ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
