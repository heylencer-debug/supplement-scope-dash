-- Enable realtime for categories table
ALTER TABLE public.categories REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;

-- Enable realtime for category_analyses table  
ALTER TABLE public.category_analyses REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.category_analyses;

-- Enable realtime for products table
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;