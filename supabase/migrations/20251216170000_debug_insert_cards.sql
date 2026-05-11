-- 2026-05-11: original migration inserted debug test cards and referenced
-- a non-existent column (profiles.role). Roles live in public.user_roles,
-- not public.profiles. Neutralized to a no-op for clean dev rebuild.

SELECT 1 WHERE false;
