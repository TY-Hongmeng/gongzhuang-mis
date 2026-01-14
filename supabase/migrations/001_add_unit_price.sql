-- Add unit_price to materials as a single current price
ALTER TABLE public.materials
ADD COLUMN IF NOT EXISTS unit_price numeric;

