-- Allow anon role to insert formula brief versions
CREATE POLICY "Allow anon insert formula brief versions"
ON public.formula_brief_versions
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon role to update formula brief versions (for setting is_active)
CREATE POLICY "Allow anon update formula brief versions"
ON public.formula_brief_versions
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Fix existing version to be active
UPDATE public.formula_brief_versions 
SET is_active = true 
WHERE id = '44ccc11f-e802-40a0-b8eb-024b8aef77db';