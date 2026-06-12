-- ============================================================
-- 012_secure_profile_role.sql
-- 1. Cleans up temporary testing admin and helper users.
-- 2. Secures the profiles.role column so non-admins cannot escalate their privileges.
-- ============================================================

-- Delete all temp admins created by tests
DELETE FROM auth.users
WHERE email LIKE 'temp_admin_%@example.com';

-- Delete helper auth users created during inspection/tests
DELETE FROM auth.users
WHERE email LIKE 'helper_auth_%@example.com';

-- Function to check role update permissions
CREATE OR REPLACE FUNCTION public.check_profile_role_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Only allow the role to be updated if the user performing the update is already an admin
    -- Since the profiles update RLS policy only allows a user to update their own profile,
    -- OLD.role corresponds to the role of the user performing the update.
    IF OLD.role != 'admin' THEN
      RAISE EXCEPTION 'You are not authorized to change your profile role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger to execute before update
DROP TRIGGER IF EXISTS check_profile_role_before_update ON public.profiles;
CREATE TRIGGER check_profile_role_before_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_profile_role_update();
