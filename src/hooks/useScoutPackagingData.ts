/**
 * useScoutPackagingData
 * Reads P7 packaging_intelligence from products.marketing_analysis
 * and aggregates category-level insights client-side.
 * No AI API or edge functions needed — all from Scout P7 run.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProductPackagingData {
  asin: string;
  brand: string | null;
  title: string | null;
  bsr_current: number | null;
  price: number | null;
  main_image_url: string | null;
  packaging: {
    primary_benefit_claim: string | null;
    benefit_claims: string[];
    badge_claims: string[];
    inferred_color_palette: string[];
    claim_density: string;
    messaging_score: number;
    headline_hook: string;
    analyzed_at: string;
  };
}

export interface PackagingCategorySummary {
  products_analyzed: number;
  benefit_frequency: Array<{ label: string; count: number; pct: number }>;
  badge_frequency: Array<{ label: string; count: number; pct: number }>;
  color_frequency: Array<{ label: string; count: number; pct: number }>;
  saturated_claims: Array<{ label: string; pct: number }>;
  opportunity_gaps: Array<{ label: string; type: "benefit" | "badge"; pct: number }>;
  top_packagers: ProductPackagingData[];
  dovive_strategy: {
    primary_claim: string;
    claims_to_avoid: string[];
    claims_to_own: string[];
    badges_to_feature: string[];
    color_direction: string;
    color_rationale: string;
    key_insight: string;
  };
}

async function fetchPackagingData(categoryId: string): Promise<{
  products: ProductPackagingData[];
  summary: PackagingCategorySummary;
}> {
  const { data, error } = await supabase
    .from("products")
    .select("asin, brand, title, bsr_current, price, main_image_url, marketing_analysis")
    .eq("category_id", categoryId)
    .not("marketing_analysis", "is", null)
    .order("bsr_current", { ascending: true });

  if (error) throw error;

  // Extract only products that have packaging_intelligence
  const products: ProductPackagingData[] = (data || [])
    .filter((p) => p.marketing_analysis && (p.marketing_analysis as any).packaging_intelligence)
    .map((p) => ({
      asin: p.asin,
      brand: p.brand,
      title: p.title,
      bsr_current: p.bsr_current,
      price: p.price,
      main_image_url: p.main_image_url,
      packaging: (p.marketing_analysis as any).packaging_intelligence,
    }));

  // Aggregate
  const total = products.length;
  if (total === 0) {
    return {
      products: [],
      summary: {
        products_analyzed: 0,
        benefit_frequency: [],
        badge_frequency: [],
        color_frequency: [],
        saturated_claims: [],
        opportunity_gaps: [],
        top_packagers: [],
        dovive_strategy: {
          primary_claim: "",
          claims_to_avoid: [],
          claims_to_own: [],
          badges_to_feature: [],
          color_direction: "",
          color_rationale: "",
          key_insight: "",
        },
      },
    };
  }

  const benefitFreq: Record<string, number> = {};
  const badgeFreq: Record<string, number> = {};
  const colorFreq: Record<string, number> = {};

  for (const p of products) {
    for (const c of p.packaging.benefit_claims || []) benefitFreq[c] = (benefitFreq[c] || 0) + 1;
    for (const b of p.packaging.badge_claims || []) badgeFreq[b] = (badgeFreq[b] || 0) + 1;
    for (const col of p.packaging.inferred_color_palette || []) colorFreq[col] = (colorFreq[col] || 0) + 1;
  }

  const toFreqArray = (freq: Record<string, number>) =>
    Object.entries(freq)
      .map(([label, count]) => ({ label, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);

  const benefitArr = toFreqArray(benefitFreq);
  const badgeArr = toFreqArray(badgeFreq);
  const colorArr = toFreqArray(colorFreq);

  const saturated = benefitArr.filter((b) => b.pct >= 50);
  const saturatedLabels = new Set(saturated.map((s) => s.label));

  // Gaps: benefits used by < 15% that are real opportunities
  const opportunityBenefits = benefitArr
    .filter((b) => b.pct < 15 && !["Libido / Testosterone", "Thyroid Support"].includes(b.label))
    .slice(0, 5)
    .map((b) => ({ ...b, type: "benefit" as const }));

  const opportunityBadges = badgeArr
    .filter((b) => b.pct < 10 && ["Third-Party Tested", "Doctor Formulated", "Made in USA", "Clinically Studied", "Satisfaction Guarantee"].includes(b.label))
    .slice(0, 4)
    .map((b) => ({ ...b, type: "badge" as const }));

  const top5 = [...products].sort((a, b) => (b.packaging.messaging_score || 0) - (a.packaging.messaging_score || 0)).slice(0, 5);

  // Dovive strategy derivation
  const colorDominant = colorArr[0]?.label || "Green / Natural";
  const colorAlternative = colorArr[1]?.label || "Purple / Violet";
  const unusedBenefits = opportunityBenefits.map((b) => b.label);
  const primaryClaim = unusedBenefits.find((c) => !saturatedLabels.has(c)) || benefitArr[1]?.label || "Calm / Relaxation";
  const clinicalPct = badgeFreq["Clinically Studied"] ? Math.round((badgeFreq["Clinically Studied"] / total) * 100) : 0;
  const badgesToFeature = ["Third-Party Tested", "Clinically Studied", "Doctor Formulated", "Made in USA"]
    .filter((b) => (badgeFreq[b] || 0) / total < 0.25)
    .slice(0, 3);

  const summary: PackagingCategorySummary = {
    products_analyzed: total,
    benefit_frequency: benefitArr,
    badge_frequency: badgeArr,
    color_frequency: colorArr,
    saturated_claims: saturated,
    opportunity_gaps: [...opportunityBenefits, ...opportunityBadges],
    top_packagers: top5,
    dovive_strategy: {
      primary_claim: primaryClaim,
      claims_to_avoid: saturated.slice(0, 3).map((s) => `${s.label} (${s.pct}% of competitors)`),
      claims_to_own: unusedBenefits.slice(0, 3),
      badges_to_feature: badgesToFeature,
      color_direction: colorAlternative,
      color_rationale: `${colorDominant} dominates (${colorArr[0]?.pct || 0}% of products). ${colorAlternative} lets Dovive stand out while staying credible.`,
      key_insight: clinicalPct < 20
        ? `Only ${clinicalPct}% of competitors mention clinical studies — leading with "Clinically Studied" is a high-trust differentiation opportunity.`
        : `"${saturated[0]?.label || "Stress Relief"}" is used by ${saturated[0]?.pct || 0}% of competitors. Own a more specific claim to cut through the noise.`,
    },
  };

  return { products, summary };
}

export function useScoutPackagingData(categoryId?: string) {
  return useQuery({
    queryKey: ["scout_packaging", categoryId],
    queryFn: () => fetchPackagingData(categoryId!),
    enabled: !!categoryId,
    staleTime: 5 * 60_000,
  });
}
