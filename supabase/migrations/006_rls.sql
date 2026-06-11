-- ============================================================
-- 006_rls.sql
-- Row Level Security policies for all tables.
-- ============================================================

-- ----------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------
-- Anyone authenticated can read all profiles
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_all"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can only update their own profile
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can insert/upsert their own profile
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ----------------------------------------------------------------
-- teams
-- ----------------------------------------------------------------
-- Public read (even anon can see teams)
DROP POLICY IF EXISTS "teams_select_all" ON public.teams;
CREATE POLICY "teams_select_all"
  ON public.teams FOR SELECT
  TO anon, authenticated
  USING (true);

-- ----------------------------------------------------------------
-- matches
-- ----------------------------------------------------------------
-- Public read
DROP POLICY IF EXISTS "matches_select_all" ON public.matches;
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
DROP POLICY IF EXISTS "predictions_select_own" ON public.predictions;
CREATE POLICY "predictions_select_own"
  ON public.predictions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can read other predictions only after the match predictions are locked (2 hours before kickoff)
DROP POLICY IF EXISTS "predictions_select_others_after_kickoff" ON public.predictions;
CREATE POLICY "predictions_select_others_after_kickoff"
  ON public.predictions FOR SELECT
  TO authenticated
  USING (
    auth.uid() != user_id
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
      AND m.kickoff_time - interval '2 hours' < now()
    )
  );

-- Users can insert their own prediction only before the 2-hour pre-game lock deadline
DROP POLICY IF EXISTS "predictions_insert_own_before_kickoff" ON public.predictions;
CREATE POLICY "predictions_insert_own_before_kickoff"
  ON public.predictions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
      AND m.kickoff_time - interval '2 hours' > now()
      AND m.status = 'scheduled'
    )
  );

-- Users can update their own prediction only before the 2-hour pre-game lock deadline
DROP POLICY IF EXISTS "predictions_update_own_before_kickoff" ON public.predictions;
CREATE POLICY "predictions_update_own_before_kickoff"
  ON public.predictions FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
      AND m.kickoff_time - interval '2 hours' > now()
      AND m.status = 'scheduled'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_id
      AND m.kickoff_time - interval '2 hours' > now()
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
DROP POLICY IF EXISTS "pools_select_public" ON public.pools;
CREATE POLICY "pools_select_public"
  ON public.pools FOR SELECT
  TO authenticated
  USING (is_private = false);

-- Private pools are readable only by members or the creator
DROP POLICY IF EXISTS "pools_select_private_members" ON public.pools;
CREATE POLICY "pools_select_private_members"
  ON public.pools FOR SELECT
  TO authenticated
  USING (
    (is_private = true AND public.is_pool_member(id, auth.uid()))
    OR created_by = auth.uid()
  );

-- Any authenticated user can create a pool
DROP POLICY IF EXISTS "pools_insert_authenticated" ON public.pools;
CREATE POLICY "pools_insert_authenticated"
  ON public.pools FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Only the pool creator (admin) can update pool details
DROP POLICY IF EXISTS "pools_update_admin" ON public.pools;
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
DROP POLICY IF EXISTS "pool_members_select_own_pools" ON public.pool_members;
CREATE POLICY "pool_members_select_own_pools"
  ON public.pool_members FOR SELECT
  TO authenticated
  USING (
    public.is_pool_member(pool_id, auth.uid())
  );

-- Any authenticated user can join a pool (insert themselves)
DROP POLICY IF EXISTS "pool_members_insert_self" ON public.pool_members;
CREATE POLICY "pool_members_insert_self"
  ON public.pool_members FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Admin can remove members
DROP POLICY IF EXISTS "pool_members_delete_admin" ON public.pool_members;
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
