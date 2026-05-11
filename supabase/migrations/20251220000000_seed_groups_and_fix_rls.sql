-- Migration: Fix Community Groups RLS and Seed Default Groups (v6)
-- Final fix for all constraint, type mismatch, and syntax issues.

-- 1. Repair Table Structures
DO $$
BEGIN
  -- Fix community_groups
  ALTER TABLE public.community_groups ALTER COLUMN id SET DEFAULT gen_random_uuid();
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_groups_slug_key') THEN
    ALTER TABLE public.community_groups ADD CONSTRAINT community_groups_slug_key UNIQUE (slug);
  END IF;

  -- Fix community_group_members
  ALTER TABLE public.community_group_members ALTER COLUMN id SET DEFAULT gen_random_uuid();
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_group_members_group_id_client_id_key') THEN
    -- Check if ANY unique constraint exists on those two columns before adding
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i 
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'public.community_group_members'::regclass 
      AND i.indisunique 
      GROUP BY i.indexrelid 
      HAVING COUNT(*) = 2
    ) THEN
      ALTER TABLE public.community_group_members ADD CONSTRAINT community_group_members_group_id_client_id_key UNIQUE (group_id, client_id);
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Clean and Setup RLS Policies (Groups)
DROP POLICY IF EXISTS "Enable select for all authenticated users" ON public.community_groups;
DROP POLICY IF EXISTS "Enable manage for admins" ON public.community_groups;
CREATE POLICY "Enable select for all authenticated users" ON public.community_groups FOR SELECT USING (true);
CREATE POLICY "Enable manage for admins" ON public.community_groups FOR ALL USING (public.is_admin());

-- 3. Clean and Setup RLS Policies (Members)
DROP POLICY IF EXISTS "Enable view for all memberships" ON public.community_group_members;
DROP POLICY IF EXISTS "Enable join for own record" ON public.community_group_members;
DROP POLICY IF EXISTS "Enable leave for own record" ON public.community_group_members;
DROP POLICY IF EXISTS "Enable manage for admins" ON public.community_group_members;

CREATE POLICY "Enable view for all memberships" ON public.community_group_members FOR SELECT USING (true);
CREATE POLICY "Enable join for own record" ON public.community_group_members FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.clients WHERE id::text = community_group_members.client_id::text AND user_id::text = auth.uid()::text));
CREATE POLICY "Enable leave for own record" ON public.community_group_members FOR DELETE USING (EXISTS (SELECT 1 FROM public.clients WHERE id::text = community_group_members.client_id::text AND user_id::text = auth.uid()::text));
CREATE POLICY "Enable manage for admins" ON public.community_group_members FOR ALL USING (public.is_admin());

-- 4. Seed Default Groups safely without ON CONFLICT dependencies
DO $$
DECLARE
  v_admin_client_id text;
  v_group_id uuid;
  r RECORD; -- Declared the missing loop variable
BEGIN
  -- Find Admin Client
  SELECT id::text INTO v_admin_client_id FROM public.clients WHERE user_id::text IN (SELECT user_id::text FROM public.user_roles WHERE role::text = 'admin') LIMIT 1;
  IF v_admin_client_id IS NULL THEN SELECT id::text INTO v_admin_client_id FROM public.clients LIMIT 1; END IF;

  IF v_admin_client_id IS NOT NULL THEN
    -- Seed Groups using manual existence checks
    FOR r IN (SELECT 'Weight Loss Journey' as n, 'weight-loss' as s, 'Support and tips for goals.' as d
              UNION ALL SELECT 'Recipe Exchange', 'recipes', 'Share your favorite healthy recipes.'
              UNION ALL SELECT 'General Wellness', 'wellness', 'General health discussions.'
              UNION ALL SELECT 'Motivation & Mindset', 'motivation', 'Keep each other inspired.')
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.community_groups WHERE slug::text = r.s::text) THEN
        INSERT INTO public.community_groups (name, slug, description, owner_client_id)
        VALUES (r.n, r.s, r.d, v_admin_client_id::uuid)
        RETURNING id INTO v_group_id;
      ELSE
        SELECT id INTO v_group_id FROM public.community_groups WHERE slug::text = r.s::text;
      END IF;

      -- Add Owner as Member (Explicitly casting both sides to text for comparison)
      IF NOT EXISTS (SELECT 1 FROM public.community_group_members WHERE group_id::text = v_group_id::text AND client_id::text = v_admin_client_id::text) THEN
        INSERT INTO public.community_group_members (group_id, client_id, role)
        VALUES (v_group_id, v_admin_client_id::uuid, 'owner');
      END IF;
    END LOOP;
  END IF;
END $$;

-- 5. Re-grant permissions
GRANT ALL ON public.community_groups TO authenticated;
GRANT ALL ON public.community_group_members TO authenticated;
GRANT ALL ON public.community_groups TO service_role;
GRANT ALL ON public.community_group_members TO service_role;
