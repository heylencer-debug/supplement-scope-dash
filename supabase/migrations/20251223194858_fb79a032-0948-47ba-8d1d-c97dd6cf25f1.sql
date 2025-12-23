-- Allow anonymous users to delete formula brief versions
CREATE POLICY "Allow anon delete formula brief versions"
ON public.formula_brief_versions
FOR DELETE
USING (true);