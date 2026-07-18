-- 2026-07-18: Workspace-created community cohorts.
--
-- community_groups.owner_client_id was NOT NULL, from the original design where
-- a cohort ("group") was always created and owned by a CLIENT. Cohorts are now
-- also created by the workspace/nutritionist to group clients for a focused
-- challenge, and such a cohort has no client owner. Make the column nullable;
-- the FK to clients stays (NULL passes through it). Existing client-owned
-- groups are untouched.
ALTER TABLE public.community_groups ALTER COLUMN owner_client_id DROP NOT NULL;
