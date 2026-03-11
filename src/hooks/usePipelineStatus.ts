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

    // P9 — Formula Brief: check ingredients has actual AI content (grok or primary brief)
    supabase
      .from("formula_briefs")
      .select("ingredients")
      .eq("category_id", categoryId)
      .not("ingredients", "is", null)
      .limit(1)
      .maybeSingle(),

    // P10 — Formula QA: formula_briefs.ingredients has qa_report key
    supabase
      .from("formula_briefs")
      .select("ingredients")
      .eq("category_id", categoryId)
      .not("ingredients", "is", null)
      .limit(1)
      .maybeSingle(),
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

  // P5 — Deep Research: check products.marketing_analysis.p5_research (saved by phase5-deep-research.js)
  // Each researched product has p5_research key in marketing_analysis
  // We target 20 total (10 BSR + 10 new brands). Use p6_pi as a proxy for total products.
  const p5CountRaw = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("category_id", categoryId)
    .filter("marketing_analysis->p5_research", "not.is", null);
  const p5Count = p5CountRaw.count ?? 0;
  const P5_TARGET = 20;

  // P7: Market Intelligence — check for ai_market_analysis in formula_briefs.ingredients
  const p7HasMarket = !!(p7_market as any)?.data?.ingredients?.market_intelligence?.ai_market_analysis;
  const p7Complete = p7HasMarket ? 1 : 0;

  // P9: Formula Brief — check actual AI content exists (grok brief OR primary brief), not just record
  const p9Ingredients = (p8 as any)?.data?.ingredients as Record<string, unknown> | null;
  const p9HasBrief = !!(
    (p9Ingredients?.ai_generated_brief_grok as string)?.length > 100 ||
    (p9Ingredients?.ai_generated_brief as string)?.length > 100
  );
  const p9HasClaude = !!(p9Ingredients?.ai_generated_brief_claude as string)?.length;
  const p9BriefComplete = p9HasBrief ? 1 : 0;

  // P10: QA — complete if formula_briefs.ingredients has qa_report with content
  const p10Ingredients = (p9raw as any)?.data?.ingredients as Record<string, unknown> | null;
  const p10HasQA = !!(p10Ingredients?.qa_report as string)?.length;
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
      // P3 is CAPTCHA-limited — partial is expected. Complete = 80%+ coverage.
      status: (p3.count ?? 0) >= total * 0.8 ? "complete" : (p3.count ?? 0) > 0 ? "partial" : "not_started",
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
      description: "Top 10 BSR + Top 10 New Brands — Grok 4.1 fast competitive intelligence",
      total: P5_TARGET,
      complete: p5Count,
      status: p5Count >= P5_TARGET ? "complete" : p5Count >= 10 ? "partial" : p5Count > 0 ? "partial" : "not_started",
      pct: Math.round((p5Count / P5_TARGET) * 100),
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
      description: `AI formula spec — Grok 4.2 deep reasoning + Claude Opus 4.6${p9HasClaude ? " ✓ dual" : p9HasBrief ? " ✓ single" : ""}`,
      total: 1,
      complete: p9BriefComplete,
      status: p9BriefComplete > 0 ? "complete" : "not_started",
      pct: p9BriefComplete * 100,
    },
    {
      phase: 10,
      label: "Formula QA",
      description: "QA: dose validation, dual-formula comparison, final adjudicated formula",
      total: 1,
      complete: p10Complete,
      status: p10Complete > 0 ? "complete" : p9BriefComplete > 0 ? "not_started" : "pending",
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
