-- Enable anonymous writes for GH Pages until Edge Function is deployed
-- WARNING: This temporarily opens insert/update/delete to anon; revert when server is ready

-- Devices table
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_anon_insert_devices ON public.devices;
DROP POLICY IF EXISTS allow_anon_update_devices ON public.devices;
DROP POLICY IF EXISTS allow_anon_delete_devices ON public.devices;
CREATE POLICY allow_anon_insert_devices ON public.devices FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY allow_anon_update_devices ON public.devices FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_delete_devices ON public.devices FOR DELETE TO anon USING (true);

-- Fixed inventory options table
ALTER TABLE public.fixed_inventory_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_anon_insert_fio ON public.fixed_inventory_options;
DROP POLICY IF EXISTS allow_anon_update_fio ON public.fixed_inventory_options;
DROP POLICY IF EXISTS allow_anon_delete_fio ON public.fixed_inventory_options;
CREATE POLICY allow_anon_insert_fio ON public.fixed_inventory_options FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY allow_anon_update_fio ON public.fixed_inventory_options FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_delete_fio ON public.fixed_inventory_options FOR DELETE TO anon USING (true);
