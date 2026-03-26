-- Create storage bucket for manufacturer feedback images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'formula-assets',
  'formula-assets',
  true,
  10485760, -- 10MB limit per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public read formula-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'formula-assets');

-- Allow authenticated uploads
CREATE POLICY "Authenticated upload formula-assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'formula-assets');

-- Allow authenticated deletes
CREATE POLICY "Authenticated delete formula-assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'formula-assets');
