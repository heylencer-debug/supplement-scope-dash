/**
 * usePipelineStatus
 * Live phase completion status for P1–P10.
 * Auto-refreshes every 30s so running scripts show real-time progress.
 * P1–P8 query real Supabase data. P9–P10 are placeholders (not built yet).
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

async function fetchPipelineStatus(categoryId: string): Promise<PhaseStatus[]> {
  const [p1, p2, p3, p4, p6_pi, p7_market, p6_pkg, p8, p9raw] = await Promise.all([
    // P1 — Amazon scrape
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId),

    // P2 — Keepa: has monthly_sales
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .not("monthly_sales", "is", null),

    // P3 — Reviews: has review_analysis
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .not("review_analysis", "is", null),

    // P4 — OCR: has supplement_facts_raw
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .not("supplement_facts_raw", "is", null),

    // P6 — Product Intelligence: marketing_analysis has product_intelligence key
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .filter("marketing_analysis->product_intelligence", "not.is", null),

    // P7 — Market Intelligence: formula_briefs.ingredients.market_intelligence.ai_market_analysis
    supabase
      .from("formula_briefs")
      .select("ingredients")
      .eq("category_id", categoryId)
      .not("ingredients", "is", null)
      .limit(1)
      .maybeSingle(),

    // P8 — Packaging Intelligence: marketing_analysis has packaging_intelligence key
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .filter("marketing_analysis->packaging_intelligence", "not.is", null),

    // P8 — Formula Brief: formula_briefs table
    supabase
      .from("formula_briefs")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId),

    // P9 — Formula QA: formula_briefs.ingredients has qa_report key
    supabase
      .from("formula_briefs")
      .select("ingredients")
      .eq("category_id", categoryId)
      .not("ingredients", "is", null)
      .limit(1)
      .single(),
  ]);

  const total = p1.count ?? 0;

  const makeStatus = (
    complete: number,
    tot: number
  ): "complete" | "partial" | "not_started" | "pending" => {
    if (tot === 0) return "not_started";
    if (complete === 0) return "not_started";
    if (complete >= tot) return "complete";
    return "partial";
  };

  // P5 lives in dovive Supabase — infer from whether P6 has data
  const p5Complete = (p6_pi.count ?? 0) > 0 ? 10 : 0;

  // P7: Market Intelligence — check for ai_market_analysis in formula_briefs.ingredients
  const p7HasMarket = !!(p7_market as any)?.data?.ingredients?.market_intelligence?.ai_market_analysis;
  const p7Complete = p7HasMarket ? 1 : 0;

  // P9: Formula Brief (was P8)
  const p8Complete = p8.count ?? 0;
  const p8fb = (p8 as any);
  const p9HasBrief = p8Complete > 0;

  // P10: QA — complete if formula_briefs.ingredients has qa_report
  const p10HasQA = !!(p9raw as any)?.data?.ingredients?.qa_report;
  const p10Complete = p10HasQA ? 1 : 0;

  return [
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
      description: "BSR trends, monthly sales & revenue data",
      total,
      complete: p2.count ?? 0,
      status: makeStatus(p2.count ?? 0, total),
      pct: total ? Math.round(((p2.count ?? 0) / total) * 100) : 0,
    },
    {
      phase: 3,
      label: "Review Analysis",
      description: "Customer sentiment, pain points & review mining",
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
      description: "Per-product AI scoring — Formula Landscape, Extract Types, Dosage, Certs, Threat Levels, Top 10",
      total,
      complete: p6_pi.count ?? 0,
      status: makeStatus(p6_pi.count ?? 0, total),
      pct: total ? Math.round(((p6_pi.count ?? 0) / total) * 100) : 0,
    },
    {
      phase: 7,
      label: "Market Intel",
      description: "Category-level Grok market report — powers Market tab analysis",
      total: 1,
      complete: p7Complete,
      status: p7Complete > 0 ? "complete" : (p6_pi.count ?? 0) > 0 ? "not_started" : "pending",
      pct: p7Complete * 100,
    },
    {
      phase: 8,
      label: "Packaging Intel",
      description: "Competitor packaging, label design & trust signals",
      total,
      complete: p6_pkg.count ?? 0,
      status: makeStatus(p6_pkg.count ?? 0, total),
      pct: total ? Math.round(((p6_pkg.count ?? 0) / total) * 100) : 0,
    },
    {
      phase: 9,
      label: "Formula Brief",
      description: "AI-generated CMO formula spec for contract manufacturer",
      total: 1,
      complete: p8Complete > 0 ? 1 : 0,
      status: p8Complete > 0 ? "complete" : "not_started",
      pct: p8Complete > 0 ? 100 : 0,
    },
    {
      phase: 10,
      label: "Formula QA",
      description: "QA specialist: dose validation, competitor head-to-head, formula adjustments",
      total: 1,
      complete: p10Complete,
      status: p10Complete > 0 ? "complete" : p8Complete > 0 ? "not_started" : "pending",
      pct: p10Complete * 100,
    },
    {
      phase: 11,
      label: "Launch Brief",
      description: "Final CMO launch package: specs, pricing, go-to-market",
      total: 0,
      complete: 0,
      status: "pending",
      pct: 0,
    },
  ];
}

export function usePipelineStatus(categoryId?: string, _keyword?: string) {
  return useQuery({
    queryKey: ["pipeline_status", categoryId],
    queryFn: () => fetchPipelineStatus(categoryId!),
    enabled: !!categoryId,
    staleTime: 15_000,          // data is stale after 15s
    refetchInterval: 30_000,    // auto-refresh every 30s while component is mounted
    refetchIntervalInBackground: false, // only refresh when tab is active
  });
}
