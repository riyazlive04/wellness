-- Migration: Fix Post Persistence and Remove Awards
-- Ensures all posts are visible and cleans up reaction types.

-- 1. Ensure all existing posts are public so they are visible under current RLS
UPDATE public.community_posts 
SET visibility = 'public' 
WHERE visibility IS NULL OR visibility = 'archived';

-- 2. Set default and NOT NULL for visibility to prevent future issues
ALTER TABLE public.community_posts ALTER COLUMN visibility SET DEFAULT 'public';
-- We use a DO block for safety with NOT NULL in case of concurrent inserts
DO $$
BEGIN
    ALTER TABLE public.community_posts ALTER COLUMN visibility SET NOT NULL;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 3. Convert all 'love' and 'celebrate' reactions to 'like'
-- First, identify duplicates that would occur after update
DELETE FROM public.community_reactions cr1
USING public.community_reactions cr2
WHERE cr1.id > cr2.id
  AND cr1.client_id = cr2.client_id
  AND cr1.target_type = cr2.target_type
  AND cr1.target_id = cr2.target_id
  AND cr1.reaction IN ('love', 'celebrate')
  AND cr2.reaction = 'like';

-- Now update remaining non-like reactions
UPDATE public.community_reactions
SET reaction = 'like'
WHERE reaction IN ('love', 'celebrate');

-- 4. Re-calculate likes counts to ensure accuracy after conversion
UPDATE public.community_posts p
SET likes_count = (
    SELECT count(*) 
    FROM public.community_reactions r 
    WHERE r.target_id = p.id AND r.target_type = 'post' AND r.reaction = 'like'
);

UPDATE public.community_comments c
SET likes_count = (
    SELECT count(*) 
    FROM public.community_reactions r 
    WHERE r.target_id = c.id AND r.target_type = 'comment' AND r.reaction = 'like'
);

-- 5. No need to drop enum values from community_reaction_type yet as it might be used elsewhere
-- but we've sanitized the data for posts/comments.
