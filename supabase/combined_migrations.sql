-- ============================================================
-- 001_profiles.sql
-- Extends auth.users with a public profiles table.
-- A DB trigger auto-creates a profile row on signup.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      text UNIQUE,
  display_name  text,
  avatar_url    text,
  country       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for username lookups
CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles (username);

-- ----------------------------------------------------------------
-- Trigger: auto-create a profile row when a new auth.users row is inserted
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'username',
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
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
-- ============================================================
-- 004_pools.sql
-- Pools (leagues) and pool membership.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pools (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  is_private  bool NOT NULL DEFAULT true,
  invite_code text UNIQUE NOT NULL,
  created_by  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pools_invite_code_idx ON public.pools (invite_code);
CREATE INDEX IF NOT EXISTS pools_created_by_idx ON public.pools (created_by);

CREATE TRIGGER pools_updated_at
  BEFORE UPDATE ON public.pools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pools ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pool_members (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id   uuid NOT NULL REFERENCES public.pools(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member',   -- admin | member
  joined_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (pool_id, user_id),
  CONSTRAINT pool_members_role_check CHECK (role IN ('admin', 'member'))
);

CREATE INDEX IF NOT EXISTS pool_members_pool_idx ON public.pool_members (pool_id);
CREATE INDEX IF NOT EXISTS pool_members_user_idx ON public.pool_members (user_id);

ALTER TABLE public.pool_members ENABLE ROW LEVEL SECURITY;
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
-- ============================================================
-- 006_rls.sql
-- Row Level Security policies for all tables.
-- ============================================================

-- ----------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------
-- Anyone authenticated can read all profiles
CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can only update their own profile
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can insert/upsert their own profile
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ----------------------------------------------------------------
-- teams
-- ----------------------------------------------------------------
-- Public read (even anon can see teams)
CREATE POLICY "teams_select_all"
  ON public.teams FOR SELECT
  TO anon, authenticated
  USING (true);

-- ----------------------------------------------------------------
-- matches
-- ----------------------------------------------------------------
-- Public read
CREATE POLICY "matches_select_all"
  ON public.matches FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only service_role can write (Edge Functions use service_role key)
-- No INSERT/UPDATE/DELETE policy for authenticated users = blocked by default

-- ----------------------------------------------------------------
-- predictions
-- ----------------------------------------------------------------
-- Users can read their own predictions at any time
CREATE POLICY "predictions_select_own"
  ON public.predictions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can read other predictions only after the match kickoff has passed
CREATE POLICY "predictions_select_others_after_kickoff"
  ON public.predictions FOR SELECT
  TO authenticated
  USING (
    auth.uid() != user_id
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
      AND m.kickoff_time < now()
    )
  );

-- Users can insert their own prediction only before kickoff
CREATE POLICY "predictions_insert_own_before_kickoff"
  ON public.predictions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
      AND m.kickoff_time > now()
      AND m.status = 'scheduled'
    )
  );

-- Users can update their own prediction only before kickoff
CREATE POLICY "predictions_update_own_before_kickoff"
  ON public.predictions FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
      AND m.kickoff_time > now()
      AND m.status = 'scheduled'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
      AND m.kickoff_time > now()
      AND m.status = 'scheduled'
    )
  );

-- ----------------------------------------------------------------
-- security helper functions (SECURITY DEFINER to avoid recursion)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_pool_member(p_pool_id uuid, p_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.pool_members
    WHERE pool_id = p_pool_id
    AND user_id = p_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_pool_admin(p_pool_id uuid, p_user_id uuid)
RETURNS boolean
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.pool_members
    WHERE pool_id = p_pool_id
    AND user_id = p_user_id
    AND role = 'admin'
  );
END;
$$;

-- ----------------------------------------------------------------
-- pools
-- ----------------------------------------------------------------
-- Public pools are readable by everyone authenticated
CREATE POLICY "pools_select_public"
  ON public.pools FOR SELECT
  TO authenticated
  USING (is_private = false);

-- Private pools are readable only by members or the creator
CREATE POLICY "pools_select_private_members"
  ON public.pools FOR SELECT
  TO authenticated
  USING (
    (is_private = true AND public.is_pool_member(id, auth.uid()))
    OR created_by = auth.uid()
  );

-- Any authenticated user can create a pool
CREATE POLICY "pools_insert_authenticated"
  ON public.pools FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Only the pool creator (admin) can update pool details
CREATE POLICY "pools_update_admin"
  ON public.pools FOR UPDATE
  TO authenticated
  USING (
    public.is_pool_admin(id, auth.uid())
  );

-- ----------------------------------------------------------------
-- pool_members
-- ----------------------------------------------------------------
-- Members can see who else is in their pools
CREATE POLICY "pool_members_select_own_pools"
  ON public.pool_members FOR SELECT
  TO authenticated
  USING (
    public.is_pool_member(pool_id, auth.uid())
  );

-- Any authenticated user can join a pool (insert themselves)
CREATE POLICY "pool_members_insert_self"
  ON public.pool_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Admin can remove members
CREATE POLICY "pool_members_delete_admin"
  ON public.pool_members FOR DELETE
  TO authenticated
  USING (
    -- The person being deleted is removing themselves
    auth.uid() = user_id
    -- OR the deleter is the pool admin
    OR public.is_pool_admin(pool_id, auth.uid())
  );

-- ----------------------------------------------------------------
-- leaderboard views (read-only for all authenticated)
-- ----------------------------------------------------------------
-- Note: materialized views don't support RLS directly.
-- Access is controlled by granting SELECT on the views only.
GRANT SELECT ON public.leaderboard_global TO authenticated;
GRANT SELECT ON public.leaderboard_pool TO authenticated;
