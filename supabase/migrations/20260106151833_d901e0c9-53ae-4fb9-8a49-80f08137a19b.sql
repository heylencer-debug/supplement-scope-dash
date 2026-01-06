-- Fix search_path for the auto-reanalyze trigger function
CREATE OR REPLACE FUNCTION public.trigger_auto_reanalyze_supplement_facts()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  edge_function_url TEXT := 'https://jwkitkfufigldpldqtbq.supabase.co/functions/v1/auto-reanalyze-supplement-facts';
BEGIN
  -- Only trigger for low confidence products that have images
  IF NEW.ocr_confidence = 'low' AND NEW.main_image_url IS NOT NULL THEN
    -- Call edge function asynchronously via pg_net
    PERFORM extensions.http_post(
      url := edge_function_url,
      body := jsonb_build_object('productId', NEW.id::text),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3a2l0a2Z1ZmlnbGRwbGRxdGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEwNDU2NDUsImV4cCI6MjA3NjYyMTY0NX0.VziSAuTdqcteRERIPCdrMy4vqQuHjeC3tvazE0E8nMM'
      )
    );
    
    RAISE LOG 'Auto-reanalyze triggered for product % with low OCR confidence', NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;