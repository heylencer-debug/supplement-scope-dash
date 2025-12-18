-- Create formula_conversations table
CREATE TABLE public.formula_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create formula_brief_versions table
CREATE TABLE public.formula_brief_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  formula_brief_content text NOT NULL,
  parent_version_id uuid REFERENCES public.formula_brief_versions(id) ON DELETE SET NULL,
  created_from_message_id text,
  change_summary text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create unique constraint for active version per category
CREATE UNIQUE INDEX formula_brief_versions_active_idx 
ON public.formula_brief_versions (category_id) 
WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.formula_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formula_brief_versions ENABLE ROW LEVEL SECURITY;

-- RLS policies for formula_conversations
CREATE POLICY "Public Read Formula Conversations" 
ON public.formula_conversations 
FOR SELECT 
USING (true);

CREATE POLICY "Service Role Full Access Formula Conversations" 
ON public.formula_conversations 
FOR ALL 
USING (true)
WITH CHECK (true);

-- RLS policies for formula_brief_versions
CREATE POLICY "Public Read Formula Brief Versions" 
ON public.formula_brief_versions 
FOR SELECT 
USING (true);

CREATE POLICY "Service Role Full Access Formula Brief Versions" 
ON public.formula_brief_versions 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Trigger to update updated_at on formula_conversations
CREATE TRIGGER update_formula_conversations_updated_at
BEFORE UPDATE ON public.formula_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();