-- Allow anonymous SELECT/INSERT/UPDATE/DELETE on child_items for GH Pages client fallback

ALTER TABLE public.child_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_anon_select_child_items ON public.child_items;
DROP POLICY IF EXISTS allow_anon_insert_child_items ON public.child_items;
DROP POLICY IF EXISTS allow_anon_update_child_items ON public.child_items;
DROP POLICY IF EXISTS allow_anon_delete_child_items ON public.child_items;

CREATE POLICY allow_anon_select_child_items ON public.child_items FOR SELECT TO anon USING (true);
CREATE POLICY allow_anon_insert_child_items ON public.child_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY allow_anon_update_child_items ON public.child_items FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_delete_child_items ON public.child_items FOR DELETE TO anon USING (true);

