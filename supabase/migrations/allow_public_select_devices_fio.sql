-- Allow anonymous SELECT for devices and fixed_inventory_options
-- This complements previous write policies to ensure reads work under RLS

-- Devices table
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_anon_select_devices ON public.devices;
CREATE POLICY allow_anon_select_devices ON public.devices FOR SELECT TO anon USING (true);

-- Fixed inventory options table
ALTER TABLE public.fixed_inventory_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_anon_select_fio ON public.fixed_inventory_options;
CREATE POLICY allow_anon_select_fio ON public.fixed_inventory_options FOR SELECT TO anon USING (true);

