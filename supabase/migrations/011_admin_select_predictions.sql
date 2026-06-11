-- ============================================================
-- 011_admin_select_predictions.sql
-- Allow global admins (profiles.role = 'admin') to select
-- all predictions and stage predictions.
-- ============================================================

-- 1. predictions table select policy for admin
DROP POLICY IF EXISTS "predictions_select_admin" ON public.predictions;
CREATE POLICY "predictions_select_admin" ON public.predictions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- 2. stage_predictions table select policy for admin
DROP POLICY IF EXISTS "stage_predictions_select_admin" ON public.stage_predictions;
CREATE POLICY "stage_predictions_select_admin" ON public.stage_predictions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
