-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function to auto-trigger reanalysis for low confidence products
CREATE OR REPLACE FUNCTION public.trigger_auto_reanalyze_supplement_facts()
RETURNS TRIGGER AS $$
DECLARE
  edge_function_url TEXT := 'https://jwkitkfufigldpldqtbq.supabase.co/functions/v1/auto-reanalyze-supplement-facts';
  service_role_key TEXT := current_setting('app.settings.service_role_key', true);
BEGIN
  -- Only trigger for low confidence products that have images
  IF NEW.ocr_confidence = 'low' AND NEW.main_image_url IS NOT NULL THEN
    -- Call edge function asynchronously via pg_net
    PERFORM net.http_post(
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on products table for automatic reanalysis
DROP TRIGGER IF EXISTS auto_reanalyze_low_confidence ON public.products;

CREATE TRIGGER auto_reanalyze_low_confidence
  AFTER INSERT OR UPDATE OF ocr_confidence
  ON public.products
  FOR EACH ROW
  WHEN (NEW.ocr_confidence = 'low' AND NEW.main_image_url IS NOT NULL)
  EXECUTE FUNCTION public.trigger_auto_reanalyze_supplement_facts();