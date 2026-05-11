-- Fix for recipe_ingredients schema
-- Run this in Supabase SQL Editor

-- 1. Check if we need to rename the column from food_item_id to ingredient_id
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recipe_ingredients' AND column_name = 'food_item_id') THEN
        ALTER TABLE public.recipe_ingredients RENAME COLUMN food_item_id TO ingredient_id;
    END IF;
END $$;

-- 2. Ensure the foreign key exists with the specific name required by the code
DO $$
BEGIN
    -- Drop old constraint if it exists with the wrong name or logic
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'recipe_ingredients_food_item_id_fkey') THEN
        ALTER TABLE public.recipe_ingredients DROP CONSTRAINT recipe_ingredients_food_item_id_fkey;
    END IF;

    -- Add the correct constraint if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'recipe_ingredients_ingredient_id_fkey') THEN
        ALTER TABLE public.recipe_ingredients 
          ADD CONSTRAINT recipe_ingredients_ingredient_id_fkey 
          FOREIGN KEY (ingredient_id) 
          REFERENCES public.ingredients(id) 
          ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Verify access policies again (just to be safe)
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
