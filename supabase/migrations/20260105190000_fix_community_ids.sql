-- Fix missing default ID generation for community tables
-- This resolves the "null value in column id violates not-null constraint" error (23502)

-- Enable pgcrypto if not already enabled (usually enabled by default in Supabase, but good practice)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Alter community_comments to auto-generate IDs
ALTER TABLE community_comments 
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Alter community_posts to auto-generate IDs (preventative)
ALTER TABLE community_posts 
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Alter community_reactions to auto-generate IDs (preventative)
ALTER TABLE community_reactions 
ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Alter community_notifications to auto-generate IDs (preventative)
ALTER TABLE community_notifications 
ALTER COLUMN id SET DEFAULT gen_random_uuid();
