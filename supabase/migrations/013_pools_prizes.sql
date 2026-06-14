-- ============================================================
-- 013_pools_prizes.sql
-- Add prizes column to pools table.
-- ============================================================

ALTER TABLE public.pools
ADD COLUMN IF NOT EXISTS prizes jsonb DEFAULT NULL;
