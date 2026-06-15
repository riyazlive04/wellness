-- Barcode scanning for fast packaged-food logging.
--
-- A first scan resolves a barcode against Open Food Facts; the result is cached
-- here so repeat scans are instant AND we build our OWN curated, label-accurate
-- product DB over time (the "accurate, not just big" differentiator). A
-- nutritionist can verify/correct an entry (`verified`), and nutrition values
-- are per-100g so any serving size can be computed.

CREATE TABLE IF NOT EXISTS public.barcode_products (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode        text        NOT NULL UNIQUE,
  name           text,
  brand          text,
  serving_size   text,
  image_url      text,
  kcal_100g      numeric,
  protein_100g   numeric,
  carb_100g      numeric,
  fat_100g       numeric,
  fiber_100g     numeric,
  sodium_mg_100g numeric,
  source         text        NOT NULL DEFAULT 'openfoodfacts',
  verified       boolean     NOT NULL DEFAULT false,
  raw            jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
