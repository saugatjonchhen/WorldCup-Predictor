-- ============================================================
-- 002_teams.sql
-- 48 FIFA World Cup 2026 teams with flags and metadata.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.teams (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_team_id text UNIQUE NOT NULL,  -- worldcup26.ir team id
  name             text NOT NULL,
  name_fa          text,
  flag_url         text,
  fifa_code        text,
  iso2             text,
  group_name       text,                   -- "A"-"L" for group stage
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teams_external_id_idx ON public.teams (external_team_id);
CREATE INDEX IF NOT EXISTS teams_group_idx ON public.teams (group_name);

-- Enable RLS (read-only for all)
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 003_matches.sql
-- All 104 FIFA World Cup 2026 fixtures.
-- Live scores are written by the sync-live-scores Edge Function.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.matches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_match_id   text UNIQUE NOT NULL,   -- worldcup26.ir game id (used for polling)
  home_team           text,                    -- team name or label e.g. "Winner Group A"
  away_team           text,
  home_team_ext_id    text REFERENCES public.teams(external_team_id),
  away_team_ext_id    text REFERENCES public.teams(external_team_id),
  kickoff_time        timestamptz NOT NULL,    -- UTC
  stage               text NOT NULL,           -- group/round_of_32/round_of_16/qf/sf/third_place/final
  group_name          text,                    -- Null for knockout stages
  matchday            int,
  -- Live score (updated every 60s during match)
  live_home_score     int,
  live_away_score     int,
  live_minute         text,                    -- "notstarted" | "45" | "90" | "FT" etc.
  -- Final score (locked at full time)
  home_score          int,
  away_score          int,
  home_score_et       int,                     -- Extra time
  away_score_et       int,
  penalty_winner      text,                    -- Team name of penalty shootout winner (set manually)
  -- Status
  status              text NOT NULL DEFAULT 'scheduled',  -- scheduled/live/completed
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT matches_status_check CHECK (status IN ('scheduled', 'live', 'completed')),
  CONSTRAINT matches_stage_check CHECK (
    stage IN ('group', 'round_of_32', 'round_of_16', 'qf', 'sf', 'third_place', 'final')
  )
);

CREATE INDEX IF NOT EXISTS matches_status_idx ON public.matches (status);
CREATE INDEX IF NOT EXISTS matches_kickoff_idx ON public.matches (kickoff_time);
CREATE INDEX IF NOT EXISTS matches_stage_idx ON public.matches (stage);
CREATE INDEX IF NOT EXISTS matches_external_id_idx ON public.matches (external_match_id);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER matches_updated_at
  BEFORE UPDATE ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
