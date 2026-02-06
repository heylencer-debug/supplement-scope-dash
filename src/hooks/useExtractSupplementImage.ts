import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface ExtractedIngredient {
  name: string;
  amount: string;
  unit: string;
  daily_value: string | null;
}

export interface ExtractionData {
  serving_size: string | null;
  servings_per_container: number | null;
  ingredients: ExtractedIngredient[];
  other_ingredients: string | null;
  directions: string | null;
  warnings: string | null;
  claims_on_label: string[];
}

export interface ExtractionResponse {
  success: boolean;
  confidence: "high" | "medium" | "low";
  data: ExtractionData;
  extraction_notes: string;
  error?: string;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix to get just the base64 content
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function useExtractSupplementImage() {
  return useMutation({
    mutationFn: async (file: File): Promise<ExtractionResponse> => {
      // Validate file type
      const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
      if (!validTypes.includes(file.type)) {
        throw new Error("Please upload a JPEG, PNG, or WebP image");
      }

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error("Image must be less than 10MB");
      }

      // Convert to base64
      const imageBase64 = await fileToBase64(file);

      // Call edge function
      const { data, error } = await supabase.functions.invoke("extract-supplement-image", {
        body: {
          imageBase64,
          mimeType: file.type,
        },
      });

      if (error) {
        throw new Error(error.message || "Failed to analyze image");
      }

      if (!data.success) {
        throw new Error(data.error || "Extraction failed");
      }

      return data as ExtractionResponse;
    },
    onError: (error: Error) => {
      toast({
        title: "Extraction Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
