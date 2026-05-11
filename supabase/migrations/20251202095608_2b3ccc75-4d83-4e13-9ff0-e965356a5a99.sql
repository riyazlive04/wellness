-- Create ingredients table (separate from food_items)
CREATE TABLE IF NOT EXISTS public.ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  serving_size TEXT NOT NULL,
  serving_unit TEXT NOT NULL,
  kcal_per_serving INTEGER NOT NULL,
  protein NUMERIC,
  carbs NUMERIC,
  fats NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add trigger for updated_at
CREATE TRIGGER handle_ingredients_updated_at
  BEFORE UPDATE ON public.ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable RLS
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ingredients
CREATE POLICY "Admins can manage ingredients"
  ON public.ingredients
  FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view ingredients"
  ON public.ingredients
  FOR SELECT
  USING (true);

-- Update recipe_ingredients to reference ingredients instead of food_items
ALTER TABLE public.recipe_ingredients 
  DROP CONSTRAINT IF EXISTS recipe_ingredients_food_item_id_fkey;

ALTER TABLE public.recipe_ingredients 
  RENAME COLUMN food_item_id TO ingredient_id;

ALTER TABLE public.recipe_ingredients 
  ADD CONSTRAINT recipe_ingredients_ingredient_id_fkey 
  FOREIGN KEY (ingredient_id) 
  REFERENCES public.ingredients(id) 
  ON DELETE CASCADE;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_ingredients_category ON public.ingredients(category);
CREATE INDEX IF NOT EXISTS idx_ingredients_name ON public.ingredients(name);