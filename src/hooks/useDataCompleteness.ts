/**
 * useDataCompleteness — per-phase (P1-P12) data completeness for a keyword.
 *
 * This intentionally does NOT trust scout_jobs.status or the legacy
 * usePipelineStatus.ts proxy columns (products.review_analysis etc, which
 * belong to an older schema). It queries the raw Scout pipeline tables
 * directly, the same way scout/phase-audit.mjs does (the proven-correct
 * completeness audit script), so a job can never show "complete" over
 * empty/thin data.
 *
 * Category resolution mirrors the pipeline's own resolveCategory() tie-break:
 * among duplicate `categories` rows matching the keyword, pick the one with
 * the MOST products — never just the first match.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  DoviveResearchRow,
  DovivePhase5ResearchRow,
  FormulaBriefIngredientsShape,
} from "@/types/dovivePipeline";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rawTable = (table: string) => (supabase.from as unknown as (t: string) => any)(table);

export type PhaseCompletenessStatus = "complete" | "incomplete";

export interface PhaseCompleteness {
  phase: number;
  label: string;
  status: PhaseCompletenessStatus;
  detail: string;
}

export interface DataCompletenessResult {
  keyword: string;
  categoryId: string | null;
  categoryName: string | null;
  phases: PhaseCompleteness[];
  overallComplete: boolean;
}

const hasContent = (v: unknown): boolean => {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 20;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return Boolean(v);
};

async function countRows(table: string, keyword: string): Promise<number> {
  const { count, error } = await rawTable(table)
    .select("*", { count: "exact", head: true })
    .eq("keyword", keyword);
  if (error) {
    // Table not present / not migrated yet -> treat as 0, not a hard failure.
    return 0;
  }
  return count ?? 0;
}

/** Resolves the SAME category the pipeline's runFinalVerifier/resolveCategory would pick:
 * among all categories whose name/search_term match the keyword, the one with the most
 * live `products` rows wins (deterministic tie-break for duplicate category rows). */
async function resolveCategory(keyword: string): Promise<{ id: string; name: string } | null> {
  const escaped = keyword.replace(/,/g, "\\,");
  const { data: candidates, error } = await supabase
    .from("categories")
    .select("id, name")
    .or(`name.ilike.%${escaped}%,search_term.ilike.%${escaped}%`);

  if (error || !candidates || candidates.length === 0) return null;

  let best: { id: string; name: string } | null = null;
  let bestCount = -1;
  for (const c of candidates) {
    const { count } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", c.id);
    const productCount = count ?? 0;
    if (productCount > bestCount) {
      bestCount = productCount;
      best = { id: c.id, name: c.name };
    }
  }
  return best;
}

async function fetchDataCompleteness(keyword: string): Promise<DataCompletenessResult> {
  const kw = keyword.trim();

  // P1 — Amazon scrape: products with title+brand and images
  const { data: p1Rows } = await rawTable("dovive_research")
    .select("asin,title,brand,bsr,images")
    .eq("keyword", kw);
  const p1: DoviveResearchRow[] = p1Rows ?? [];
  const p1Total = p1.length;
  const p1Titled = p1.filter((r) => r.title && r.brand).length;
  const p1Imaged = p1.filter((r) => Array.isArray(r.images) && r.images.length > 0).length;
  const p1Complete = p1Total > 0 && p1Titled === p1Total;

  // P2 — Keepa enrichment
  const p2Count = await countRows("dovive_keepa", kw);
  const p2Complete = p1Total > 0 && p2Count >= p1Total * 0.8;

  // P3 — Reviews (count + distinct ASINs)
  const { data: p3Rows } = await rawTable("dovive_reviews").select("asin").eq("keyword", kw);
  const p3List: { asin: string }[] = p3Rows ?? [];
  const p3Asins = new Set(p3List.map((r) => r.asin)).size;
  const p3Complete = p3List.length >= 200;

  // P4 — OCR / formula extraction
  const p4Count = await countRows("dovive_ocr", kw);
  const p4Complete = p1Total > 0 && p4Count >= p1Total * 0.5;

  // P5 — Deep research: rows WITH non-null full_research and structured fields
  const { data: p5Rows } = await rawTable("dovive_phase5_research")
    .select("asin,full_research,key_strengths,benefits,competitor_angle,researched_by")
    .eq("keyword", kw);
  const p5: DovivePhase5ResearchRow[] = p5Rows ?? [];
  const p5Full = p5.filter((r) => r.full_research && r.full_research.length > 50).length;
  const p5Struct = p5.filter(
    (r) =>
      (r.key_strengths && r.key_strengths.length > 0) ||
      (Array.isArray(r.benefits) && r.benefits.length > 0) ||
      (r.competitor_angle && r.competitor_angle.length > 0)
  ).length;
  const p5Complete = p5.length > 0 && p5Full === p5.length;

  // P5 sources — off-Amazon brand pages (informational, never gates completeness)
  const p5SrcCount = await countRows("dovive_p5_sources", kw);

  // Category resolution (P6-P12 live on formula_briefs, keyed by category_id)
  const category = await resolveCategory(kw);

  let fb: {
    positioning: string | null;
    market_summary: string | null;
    key_differentiators: string[] | null;
    opportunity_insights: string | null;
    ingredients: FormulaBriefIngredientsShape | null;
  } | null = null;

  if (category) {
    const { data } = await supabase
      .from("formula_briefs")
      .select("positioning,market_summary,key_differentiators,opportunity_insights,ingredients")
      .eq("category_id", category.id)
      .limit(1)
      .maybeSingle();
    fb = (data as typeof fb) ?? null;
  }

  const ing = (fb?.ingredients ?? {}) as FormulaBriefIngredientsShape;

  // The audit script (source of truth) only distinguishes 4 signals across
  // P6-P12: a combined "brief/intel" signal (P6-P8), qa_report (P9),
  // competitive_benchmarking (P11), fda_compliance (P12) — it does not track
  // P7/P8/P10 independently. Rather than inventing unrelated proxies for
  // those phases, each shares its group's real signal so the checklist never
  // implies more granularity than the underlying data actually supports.
  const briefIntelComplete = hasContent(fb?.positioning) || hasContent(fb?.market_summary);
  const qaComplete = hasContent(ing.qa_report);
  const p11Complete = hasContent(ing.competitive_benchmarking);
  const p12Complete = hasContent(ing.fda_compliance);

  const phases: PhaseCompleteness[] = [
    {
      phase: 1,
      label: "Amazon Scrape",
      status: p1Complete ? "complete" : "incomplete",
      detail: `${p1Total} products | ${p1Titled} with title+brand | ${p1Imaged} with images`,
    },
    {
      phase: 2,
      label: "Keepa Enrichment",
      status: p2Complete ? "complete" : "incomplete",
      detail: `${p2Count} enriched (${p1Total ? Math.round((p2Count / p1Total) * 100) : 0}% of products)`,
    },
    {
      phase: 3,
      label: "Review Analysis",
      status: p3Complete ? "complete" : "incomplete",
      detail: `${p3List.length} reviews across ${p3Asins} products`,
    },
    {
      phase: 4,
      label: "OCR / Formula Extraction",
      status: p4Complete ? "complete" : "incomplete",
      detail: `${p4Count} extractions (${p1Total ? Math.round((p4Count / p1Total) * 100) : 0}% of products)`,
    },
    {
      phase: 5,
      label: "Deep Research",
      status: p5Complete ? "complete" : "incomplete",
      detail: `P5: ${p5Full}/${p5.length || 0} briefs with full_research | ${p5Struct} with structured fields${
        p5.length ? ` [model: ${p5[0]?.researched_by ?? "n/a"}]` : ""
      }`,
    },
    {
      phase: 6,
      label: "Product Intelligence",
      status: briefIntelComplete ? "complete" : "incomplete",
      detail: `positioning:${hasContent(fb?.positioning) ? "yes" : "no"} · market_summary:${
        hasContent(fb?.market_summary) ? "yes" : "no"
      } · differentiators:${hasContent(fb?.key_differentiators) ? "yes" : "no"}`,
    },
    {
      phase: 7,
      label: "Market Intelligence",
      status: briefIntelComplete ? "complete" : "incomplete",
      detail: hasContent(fb?.opportunity_insights)
        ? "brief present · opportunity_insights present"
        : "brief present, opportunity_insights not yet set — shares P6-P8 brief/intel signal",
    },
    {
      phase: 8,
      label: "Packaging Intelligence",
      status: briefIntelComplete ? "complete" : "incomplete",
      detail: `shares P6-P8 brief/intel signal · ${p5SrcCount} off-Amazon brand sources scraped (informational)`,
    },
    {
      phase: 9,
      label: "Formula Brief",
      status: qaComplete ? "complete" : "incomplete",
      detail: `qa_report:${hasContent(ing.qa_report) ? "yes" : "no"} · call2_raw:${
        hasContent(ing.call2_raw_output) ? "yes" : "no"
      } · flavor_qa:${hasContent(ing.flavor_qa) ? "yes" : "no"}`,
    },
    {
      phase: 10,
      label: "Formula QA",
      status: qaComplete ? "complete" : "incomplete",
      detail: hasContent(ing.competitor_notes_json)
        ? "qa_report present · competitor_notes present"
        : "shares P9/P10 qa_report signal · competitor_notes missing",
    },
    {
      phase: 11,
      label: "Competitive Benchmarking",
      status: p11Complete ? "complete" : "incomplete",
      detail: p11Complete ? "competitive_benchmarking present" : "competitive_benchmarking missing",
    },
    {
      phase: 12,
      label: "FDA Compliance",
      status: p12Complete ? "complete" : "incomplete",
      detail: p12Complete ? "fda_compliance present" : "fda_compliance missing",
    },
  ];

  const overallComplete = phases.every((p) => p.status === "complete");

  return {
    keyword: kw,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    phases,
    overallComplete,
  };
}

export function useDataCompleteness(keyword?: string) {
  return useQuery({
    queryKey: ["data_completeness", keyword],
    queryFn: () => fetchDataCompleteness(keyword!),
    enabled: !!keyword,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}
