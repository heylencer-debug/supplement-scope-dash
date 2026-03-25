/**
 * useOcrCoverage
 * Formula / OCR data coverage for a category.
 * A product HAS formula data if: nutrients_count > 0 OR supplement_facts_raw IS NOT NULL.
 * Returns overall + top-50-BSR coverage, and the full list of products missing OCR sorted by BSR.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OcrMissingProduct {
  asin: string;
  brand: string | null;
  title: string | null;
  bsr_current: number | null;
  bsrRank: number;
}

export interface OcrCoverageData {
  total: number;
  withOcr: number;
  missingOcr: number;
  pct: number;
  top50Total: number;
  top50WithOcr: number;
  top50Pct: number;
  top10Missing: OcrMissingProduct[];
  missingProducts: OcrMissingProduct[];
}

function hasOcr(p: { nutrients_count: number | null; supplement_facts_raw: string | null }) {
  return (p.nutrients_count != null && p.nutrients_count > 0) ||
    (p.supplement_facts_raw != null && p.supplement_facts_raw.length > 0);
}

async function fetchOcrCoverage(categoryId: string): Promise<OcrCoverageData> {
  const { data, error } = await supabase
    .from("products")
    .select("asin, brand, title, bsr_current, nutrients_count, supplement_facts_raw")
    .eq("category_id", categoryId)
    .order("bsr_current", { ascending: true });

  if (error) throw error;

  const all = data ?? [];
  const total = all.length;

  const missingProducts: OcrMissingProduct[] = [];
  const top10Missing: OcrMissingProduct[] = [];
  let withOcr = 0;

  all.forEach((p, idx) => {
    const bsrRank = idx + 1;
    if (hasOcr(p)) {
      withOcr++;
    } else {
      const entry: OcrMissingProduct = {
        asin: p.asin,
        brand: p.brand,
        title: p.title,
        bsr_current: p.bsr_current,
        bsrRank,
      };
      missingProducts.push(entry);
      if (bsrRank <= 10) top10Missing.push(entry);
    }
  });

  const top50 = all.slice(0, Math.min(50, total));
  const top50WithOcr = top50.filter(hasOcr).length;
  const top50Total = top50.length;

  return {
    total,
    withOcr,
    missingOcr: total - withOcr,
    pct: total ? Math.round((withOcr / total) * 100) : 0,
    top50Total,
    top50WithOcr,
    top50Pct: top50Total ? Math.round((top50WithOcr / top50Total) * 100) : 0,
    top10Missing,
    missingProducts,
  };
}

export function useOcrCoverage(categoryId?: string) {
  return useQuery({
    queryKey: ["ocr_coverage", categoryId],
    queryFn: () => fetchOcrCoverage(categoryId!),
    enabled: !!categoryId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
