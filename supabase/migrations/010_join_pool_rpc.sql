-- ============================================================
-- 010_join_pool_rpc.sql
-- Adds a security definer function to join a pool using an invite code.
-- This bypasses SELECT RLS on the pools table for non-members.
-- ============================================================

CREATE OR REPLACE FUNCTION public.join_pool_with_invite_code(p_invite_code text)
RETURNS uuid
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_pool_id uuid;
  v_user_id uuid;
  v_existing_id uuid;
BEGIN
  -- Get the current authenticated user's ID
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find the pool matching the invite code (case-insensitive)
  SELECT id INTO v_pool_id
  FROM public.pools
  WHERE UPPER(invite_code) = UPPER(TRIM(p_invite_code));

  IF v_pool_id IS NULL THEN
    RAISE EXCEPTION 'Pool not found. Please verify the invite code.';
  END IF;

  -- Check if already a member
  SELECT id INTO v_existing_id
  FROM public.pool_members
  WHERE pool_id = v_pool_id AND user_id = v_user_id;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'You are already a member of this pool.';
  END IF;

  -- Insert user into pool_members
  INSERT INTO public.pool_members (pool_id, user_id, role)
  VALUES (v_pool_id, v_user_id, 'member');

  RETURN v_pool_id;
END;
$$;
