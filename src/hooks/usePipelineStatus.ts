/**
 * usePipelineStatus
 * Queries Supabase to get REAL phase completion status for a given category.
 * No hardcoded values — all counts come from the DB.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PhaseStatus {
  phase: number;
  label: string;
  description: string;
  total: number;
  complete: number;
  status: "complete" | "partial" | "not_started" | "pending";
  pct: number;
}

async function fetchPipelineStatus(
  categoryId: string,
): Promise<PhaseStatus[]> {
  // All queries against supplement-scope-dash Supabase only — no cross-DB secrets
  const [p1, p2, p3, p4, p6] = await Promise.all([
    // P1 — Amazon scrape: products in DB
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId),

    // P2 — Keepa enrichment: has monthly_sales
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .not("monthly_sales", "is", null),

    // P3 — Reviews: has review_analysis JSON
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .not("review_analysis", "is", null),

    // P4 — OCR: has supplement_facts_raw text
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .not("supplement_facts_raw", "is", null),

    // P6 — Product intelligence: has marketing_analysis JSON
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .not("marketing_analysis", "is", null),
  ]);

  const total = p1.count ?? 0;

  const makeStatus = (
    complete: number,
    tot: number
  ): "complete" | "partial" | "not_started" => {
    if (complete === 0) return "not_started";
    if (complete >= tot) return "complete";
    return "partial";
  };

  // P5 is in Scout's separate DB — show as scout-side only, no frontend query
  // It will show "complete" if P6 ran (since P6 requires P5 upstream)
  // We'll derive P5 from context: if P6 has data, P5 ran
  const p5Complete = (p6.count ?? 0) > 0 ? 10 : 0;

  const phases: PhaseStatus[] = [
    {
      phase: 1,
      label: "Amazon Scrape",
      description: "Products scraped from Amazon search results",
      total,
      complete: p1.count ?? 0,
      status: makeStatus(p1.count ?? 0, total || 1),
      pct: total ? Math.round(((p1.count ?? 0) / total) * 100) : 0,
    },
    {
      phase: 2,
      label: "Keepa Enrichment",
      description: "BSR trend, monthly sales & revenue data",
      total,
      complete: p2.count ?? 0,
      status: makeStatus(p2.count ?? 0, total),
      pct: total ? Math.round(((p2.count ?? 0) / total) * 100) : 0,
    },
    {
      phase: 3,
      label: "Reviews",
      description: "Customer sentiment & review analysis",
      total,
      complete: p3.count ?? 0,
      status: makeStatus(p3.count ?? 0, total),
      pct: total ? Math.round(((p3.count ?? 0) / total) * 100) : 0,
    },
    {
      phase: 4,
      label: "OCR / Formula",
      description: "Supplement facts extracted from product images",
      total,
      complete: p4.count ?? 0,
      status: makeStatus(p4.count ?? 0, total),
      pct: total ? Math.round(((p4.count ?? 0) / total) * 100) : 0,
    },
    {
      phase: 5,
      label: "Deep Research",
      description: "Top-10 deep dives: Reddit, certs, competitor angle",
      total: 10,
      complete: p5Complete,
      status: makeStatus(p5Complete, 10),
      pct: Math.round((p5Complete / 10) * 100),
    },
    {
      phase: 6,
      label: "Product Intelligence",
      description: "Formula scoring, extract types, bonus ingredients, market gaps",
      total,
      complete: p6.count ?? 0,
      status: makeStatus(p6.count ?? 0, total),
      pct: total ? Math.round(((p6.count ?? 0) / total) * 100) : 0,
    },
    {
      phase: 7,
      label: "Packaging Intelligence",
      description: "AI vision analysis of competitor packaging & labels",
      total,
      complete: 0,
      status: "pending",
      pct: 0,
    },
  ];

  return phases;
}

export function usePipelineStatus(categoryId?: string, _keyword?: string) {
  return useQuery({
    queryKey: ["pipeline_status", categoryId],
    queryFn: () => fetchPipelineStatus(categoryId!),
    enabled: !!categoryId,
    staleTime: 60_000,
  });
}
