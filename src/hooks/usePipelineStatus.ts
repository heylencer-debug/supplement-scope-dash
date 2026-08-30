/**
 * usePipelineStatus
 * Live phase completion status for P1-P12.
 * Auto-refreshes every 30s so running scripts show real-time progress.
 * P1-P10 query real Supabase data. P11-P12 check formula_briefs.ingredients.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseBenchmarkAndCompliance } from "@/lib/formulaScores";

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
    // P1 - Amazon scrape
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId),

    // P2 - Keepa: has monthly_sales
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .not("monthly_sales", "is", null),

    // P3 - Reviews: has review_analysis
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .not("review_analysis", "is", null),

    // P4 - OCR: has supplement_facts_raw
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .not("supplement_facts_raw", "is", null),

    // P6 - Product Intelligence: marketing_analysis has product_intelligence key
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .filter("marketing_analysis->product_intelligence", "not.is", null),

    // P7 - Market Intelligence: formula_briefs.ingredients.market_intelligence.ai_market_analysis
    supabase
      .from("formula_briefs")
      .select("ingredients")
      .eq("category_id", categoryId)
      .not("ingredients", "is", null)
      .limit(1)
      .maybeSingle(),

    // P8 - Packaging Intelligence: marketing_analysis has packaging_intelligence key
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId)
      .filter("marketing_analysis->packaging_intelligence", "not.is", null),

    // P9 - Formula Brief: check ingredients has actual AI content (grok or primary brief)
    supabase
      .from("formula_briefs")
      .select("ingredients")
      .eq("category_id", categoryId)
      .not("ingredients", "is", null)
      .limit(1)
      .maybeSingle(),

    // P10 - Formula QA: formula_briefs.ingredients has qa_report key
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

  // P5 - Deep Research: check products.marketing_analysis.p5_research (saved by phase5-deep-research.js)
  // Each researched product has p5_research key in marketing_analysis
  // We target 20 total (10 BSR + 10 new brands). Use p6_pi as a proxy for total products.
  const p5CountRaw = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("category_id", categoryId)
    .filter("marketing_analysis->p5_research", "not.is", null);
  let p5Count = p5CountRaw.count ?? 0;
  // Pipeline runs 5 top-BSR + 3 new-brand briefs (P5_TOP_COUNT/P5_NEW_COUNT);
  // the verifier passes at >= 6 with content. The old 20 here made every
  // verifier-green run display as "10/20 PARTIAL" forever.
  const P5_TARGET = 8;

  // Top-20-by-BSR coverage — the SAME criterion the pipeline's P3/P4 gates
  // use (reviews and OCR are deliberately capped to the top sellers; blanket
  // percentages of a 160-product category are not the goal and made
  // verifier-passed runs show PARTIAL).
  const { data: top20Rows } = await supabase
    .from("products")
    .select("review_analysis, nutrients_count")
    .eq("category_id", categoryId)
    .not("bsr_current", "is", null)
    .order("bsr_current", { ascending: true })
    .limit(20);
  const top20P3 = (top20Rows ?? []).filter((r) => r.review_analysis != null).length;
  const top20P4 = (top20Rows ?? []).filter((r) => (r.nutrients_count ?? 0) > 0).length;

  // Fallback: if product-level p5_research is empty, infer P5 complete when formula brief has deep-research data sources.
  // This avoids false 0/20 when P5 wrote to source table but product mirror lagged/missed.
  if (p5Count === 0) {
    const p5Fallback = ((p8 as any)?.data?.ingredients?.data_sources?.p5_deep_research ||
      (p8 as any)?.data?.ingredients?.data_sources?.deep_research ||
      []) as unknown[];
    if (Array.isArray(p5Fallback) && p5Fallback.length > 0) {
      p5Count = Math.min(P5_TARGET, p5Fallback.length);
    }
  }
  // Cap the DISPLAYED count/pct at the target — P5 runs 5 top-BSR + 3
  // new-brand briefs against an 8-target, but the raw product-level count
  // can legitimately exceed 8 (e.g. re-runs, extra brand coverage), which
  // rendered as "19/8 (238%)" instead of a capped, honest "8/8 (100%)".
  p5Count = Math.min(p5Count, P5_TARGET);

  // P7: Market Intelligence - check for ai_market_analysis in formula_briefs.ingredients
  const p7HasMarket = !!(p7_market as any)?.data?.ingredients?.market_intelligence?.ai_market_analysis;
  const p7Complete = p7HasMarket ? 1 : 0;

  // P9: Formula Brief - check actual AI content exists (grok brief OR primary brief), not just record
  const p9Ingredients = (p8 as any)?.data?.ingredients as Record<string, unknown> | null;
  const p9HasBrief = !!(
    (p9Ingredients?.ai_generated_brief_grok as string)?.length > 100 ||
    (p9Ingredients?.ai_generated_brief as string)?.length > 100
  );
  const p9HasClaude = !!(p9Ingredients?.ai_generated_brief_claude as string)?.length;
  const p9BriefComplete = p9HasBrief ? 1 : 0;

  // P10: QA - complete if formula_briefs.ingredients has qa_report with content
  const p10Ingredients = (p9raw as any)?.data?.ingredients as Record<string, unknown> | null;
  const p10HasQA = !!(p10Ingredients?.qa_report as string)?.length;
  const p10Complete = p10HasQA ? 1 : 0;

  // P11/P12: Competitive Benchmarking + FDA Compliance — shared parser, see
  // src/lib/formulaScores.ts (identical logic to what previously lived here).
  const {
    p11Score,
    p11Complete: p11HasBenchmarking,
    p12Score,
    p12Complete: p12HasCompliance,
  } = parseBenchmarkAndCompliance(p10Ingredients);
  const p11Complete = p11HasBenchmarking ? 1 : 0;
  const p12Complete = p12HasCompliance ? 1 : 0;

  // P13: Final Sign-off — Opus 5 chief-formulator pass after compliance.
  const p13Signoff = p10Ingredients?.final_signoff as { opus_review?: string; verdict?: string } | null | undefined;
  const p13Complete = (p13Signoff?.opus_review?.length ?? 0) > 500 ? 1 : 0;
  const p13Verdict = p13Complete ? p13Signoff?.verdict || null : null;

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
      // Mirrors the pipeline's REAL P2 gate: >=90% complete (not 100%) —
      // a handful of ASINs can legitimately fail Keepa lookup (delisted,
      // no history) forever, so verifier-passed runs sitting at 99% used
      // to show "PARTIAL" indefinitely on an otherwise-done phase.
      status: total === 0 ? "not_started" : (p2.count ?? 0) >= total * 0.9 ? "complete" : (p2.count ?? 0) > 0 ? "partial" : "not_started",
      pct: total ? Math.round(((p2.count ?? 0) / total) * 100) : 0,
    },
    {
      phase: 3,
      label: "Review Analysis",
      description: "Customer sentiment, pain points & review mining",
      total,
      complete: p3.count ?? 0,
      // Mirrors the pipeline's REAL P3 gate: >=50% blanket coverage OR
      // top-20-BSR coverage >= 15 (review scraping is deliberately capped
      // to the top sellers; blanket % of a 160-product category is not the
      // goal, and the old 80% bar showed verifier-passed runs as PARTIAL).
      status: ((p3.count ?? 0) >= total * 0.5 || top20P3 >= 15) ? "complete" : (p3.count ?? 0) > 0 ? "partial" : "not_started",
      pct: total ? Math.round(((p3.count ?? 0) / total) * 100) : 0,
    },
    {
      phase: 4,
      label: "OCR / Formula",
      description: "Supplement facts extracted from product images",
      total,
      complete: p4.count ?? 0,
      // Mirrors the pipeline's P4 gate: >=80% blanket OR top-20 >= 15
      // (stick-pack brands publish no facts imagery — a real ceiling).
      status: ((p4.count ?? 0) >= total * 0.8 || top20P4 >= 15) ? "complete" : (p4.count ?? 0) > 0 ? "partial" : "not_started",
      pct: total ? Math.round(((p4.count ?? 0) / total) * 100) : 0,
    },
    {
      phase: 5,
      label: "Deep Research",
      description: "Top 10 BSR + Top 10 New Brands - Claude Sonnet 5 competitive intelligence",
      total: P5_TARGET,
      complete: p5Count,
      // Verifier passes P5 at >= 6 briefs with content (75% of the 8-target).
      status: p5Count >= 6 ? "complete" : p5Count > 0 ? "partial" : "not_started",
      pct: Math.round((p5Count / P5_TARGET) * 100),
    },
    {
      phase: 6,
      label: "Product Intelligence",
      description: "Per-product AI scoring - Formula Landscape, Primary Active Forms, Dosage, Certs, Threat Levels, Top 10",
      total,
      complete: p6_pi.count ?? 0,
      status: makeStatus(p6_pi.count ?? 0, total),
      pct: total ? Math.round(((p6_pi.count ?? 0) / total) * 100) : 0,
    },
    {
      phase: 7,
      label: "Market Intel",
      description: "Category-level Sonnet 5 market report - powers Market tab analysis",
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
      description: `AI formula spec - Opus 5 + Sonnet 5 dual drafts${p9HasClaude ? " ✓ dual" : p9HasBrief ? " ✓ single" : ""}`,
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
      label: "Competitive Benchmark",
      description: `Ingredient-by-ingredient vs competitors — Sonnet 5 draft + Opus 5 validation${p11Score !== null ? ` · Score: ${p11Score}/10` : ""}`,
      total: 1,
      complete: p11Complete,
      status: p11Complete > 0 ? "complete" : p10Complete > 0 ? "not_started" : "pending",
      pct: p11Complete * 100,
    },
    {
      phase: 12,
      label: "FDA Compliance",
      description: `NIH ODS live data · DSHEA claim validation · Claude Opus 5${p12Score !== null ? ` · Score: ${p12Score}/100` : ""}`,
      total: 1,
      complete: p12Complete,
      status: p12Complete > 0 ? "complete" : p11Complete > 0 ? "not_started" : "pending",
      pct: p12Complete * 100,
    },
    {
      phase: 13,
      label: "Final Sign-off",
      description: `Chief-formulator sign-off — Opus 5 applies compliance corrections, issues the final verdict${p13Verdict ? ` · ${p13Verdict}` : ""}`,
      total: 1,
      complete: p13Complete,
      status: p13Complete > 0 ? "complete" : p12Complete > 0 ? "not_started" : "pending",
      pct: p13Complete * 100,
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
