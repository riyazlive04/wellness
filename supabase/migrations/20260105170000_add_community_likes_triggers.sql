-- Function to update likes count (Security Definier to bypass RLS)
CREATE OR REPLACE FUNCTION public.update_likes_count()
RETURNS TRIGGER AS $$
DECLARE
  target_table text;
  record_row record;
BEGIN
  -- Determine if we are handling an INSERT, UPDATE, or DELETE
  IF (TG_OP = 'DELETE') THEN
    record_row := OLD;
  ELSE
    record_row := NEW;
  END IF;

  -- Update community_posts if target_type is post
  IF record_row.target_type = 'post' THEN
    UPDATE public.community_posts
    SET likes_count = (
      SELECT count(*)
      FROM public.community_reactions
      WHERE target_type = 'post'
      AND target_id = record_row.target_id
      AND reaction = 'like'
    )
    WHERE id = record_row.target_id;
  
  -- Update community_comments if target_type is comment
  ELSIF record_row.target_type = 'comment' THEN
    UPDATE public.community_comments
    SET likes_count = (
      SELECT count(*)
      FROM public.community_reactions
      WHERE target_type = 'comment'
      AND target_id = record_row.target_id
      AND reaction = 'like'
    )
    WHERE id = record_row.target_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for INSERT
DROP TRIGGER IF EXISTS on_reaction_added ON public.community_reactions;
CREATE TRIGGER on_reaction_added
AFTER INSERT ON public.community_reactions
FOR EACH ROW
EXECUTE FUNCTION public.update_likes_count();

-- Trigger for UPDATE (e.g. changing reaction type if we supported more than likes)
DROP TRIGGER IF EXISTS on_reaction_updated ON public.community_reactions;
CREATE TRIGGER on_reaction_updated
AFTER UPDATE ON public.community_reactions
FOR EACH ROW
EXECUTE FUNCTION public.update_likes_count();

-- Trigger for DELETE
DROP TRIGGER IF EXISTS on_reaction_removed ON public.community_reactions;
CREATE TRIGGER on_reaction_removed
AFTER DELETE ON public.community_reactions
FOR EACH ROW
EXECUTE FUNCTION public.update_likes_count();
