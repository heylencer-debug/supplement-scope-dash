/**
 * useP5Sources — surfaces the off-Amazon intelligence Scout's P5 phase
 * collects into `dovive_p5_sources` (Perplexity findings, brand-page
 * excerpts, citation URLs). This table is otherwise only counted (never
 * rendered) per the 2026-08 UI wiring audit — these hooks are the fix.
 *
 * `dovive_p5_sources` is a raw Scout pipeline table (not in the generated
 * Supabase types), same pattern as useDataCompleteness.ts's rawTable().
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DoviveP5SourceRow } from "@/types/dovivePipeline";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rawTable = (table: string) => (supabase.from as unknown as (t: string) => any)(table);

/** Sources for a single product (ASIN + keyword) — used by ProductDetailModal. */
export function useP5SourcesForProduct(asin?: string, keyword?: string) {
  return useQuery({
    queryKey: ["p5_sources_product", asin, keyword],
    queryFn: async (): Promise<DoviveP5SourceRow[]> => {
      const { data, error } = await rawTable("dovive_p5_sources")
        .select("id, asin, keyword, source_url, source_type, raw_html_excerpt, extracted, scraped_at")
        .eq("asin", asin)
        // dovive_p5_sources.keyword is written lowercase by the Scout pipeline,
        // while categories.name (the value in CategoryContext) is Title Case —
        // normalize here so the exact-match .eq() actually finds rows.
        .eq("keyword", keyword?.toLowerCase())
        .order("scraped_at", { ascending: false });
      if (error) return [];
      return (data ?? []) as DoviveP5SourceRow[];
    },
    enabled: !!asin && !!keyword,
    staleTime: 5 * 60_000,
  });
}

/** Sources for a whole category/keyword, deduped by URL — used by the "Our Concept" side panel. */
export function useP5SourcesForKeyword(keyword?: string) {
  return useQuery({
    queryKey: ["p5_sources_keyword", keyword],
    queryFn: async (): Promise<DoviveP5SourceRow[]> => {
      const { data, error } = await rawTable("dovive_p5_sources")
        .select("id, asin, keyword, source_url, source_type, raw_html_excerpt, extracted, scraped_at")
        .eq("keyword", keyword?.toLowerCase())
        .order("scraped_at", { ascending: false })
        .limit(200);
      if (error) return [];
      const rows = (data ?? []) as DoviveP5SourceRow[];
      const seen = new Set<string>();
      const deduped: DoviveP5SourceRow[] = [];
      for (const row of rows) {
        const key = row.source_url || `${row.asin}-${row.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(row);
      }
      return deduped;
    },
    enabled: !!keyword,
    staleTime: 5 * 60_000,
  });
}
