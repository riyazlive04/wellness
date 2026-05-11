-- Drop the trigger that runs on new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop the function called by the trigger
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Ensure profiles table has correct RLS for service role (should be fine as service role bypasses RLS, but good to check)
-- No changes needed for RLS if we use Service Role in Edge Function.
