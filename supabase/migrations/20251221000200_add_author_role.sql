-- Add author_role to community_posts and community_comments
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS author_role public.app_role;
ALTER TABLE public.community_comments ADD COLUMN IF NOT EXISTS author_role public.app_role;

-- Backfill author_role for posts
UPDATE public.community_posts cp
SET author_role = ur.role
FROM public.clients c
JOIN public.user_roles ur ON ur.user_id = c.user_id
WHERE cp.author_client_id = c.id
AND cp.author_role IS NULL;

-- Backfill author_role for comments
UPDATE public.community_comments cc
SET author_role = ur.role
FROM public.clients c
JOIN public.user_roles ur ON ur.user_id = c.user_id
WHERE cc.author_client_id = c.id
AND cc.author_role IS NULL;

-- Ensure author_role is set for new posts via trigger or handle in application logic
-- We'll handle it in application logic first as per plan, but a default or check is good
ALTER TABLE public.community_posts ALTER COLUMN author_role SET DEFAULT 'client'::public.app_role;
ALTER TABLE public.community_comments ALTER COLUMN author_role SET DEFAULT 'client'::public.app_role;
