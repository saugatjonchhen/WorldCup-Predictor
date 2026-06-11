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
