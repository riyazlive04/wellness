-- Photo support for the global Nutritionist Network. Images are stored inline
-- as downscaled data URLs (same approach as community_posts.media_urls); a
-- proper object-storage upload lands with the Storage module.

alter table public.network_posts
  add column if not exists image_url text;
