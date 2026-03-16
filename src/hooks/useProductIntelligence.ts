/**
 * useProductIntelligence
 * Aggregates P6 product_intelligence data from products.marketing_analysis
 * Provides formula landscape, dosage distribution, certifications, threats, etc.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProductIntelligenceItem {
  id: string;
  asin: string;
  brand: string | null;
  title: string | null;
  bsr_current: number | null;
  price: number | null;
  monthly_sales: number | null;
  monthly_revenue: number | null;
  main_image_url: string | null;
  rating_value: number | null;
  intel: {
    // Generic primary active fields (all categories)
    primary_active_ingredient: string | null;
    primary_active_amount_mg: number | null;
    primary_active_form: string | null;
    // Ashwagandha-specific (backward compat, null for non-ashwagandha)
    ashwagandha_amount_mg: number | null;
    ashwagandha_extract_type: string;
    withanolide_percentage: string | null;
    serving_size_gummies: number;
    servings_per_container: number | null;
    total_gummies: number | null;
    price_per_serving: number | null;
    price_per_mg_ashwagandha: number | null;
    is_sugar_free: boolean;
    is_vegan: boolean;
    is_gluten_free: boolean;
    is_non_gmo: boolean;
    is_cgmp: boolean;
    is_third_party_tested: boolean;
    certifications: string[];
    bonus_ingredients: string[];
    other_ingredients_quality: string;
    artificial_colors: boolean;
    flavors_available: string[];
    value_score: number;
    formula_quality_score: number;
    key_strengths: string[];
    key_weaknesses: string[];
    competitor_threat_level: string;
  };
}

export interface ProductIntelligenceSummary {
  total: number;
  // Extract type distribution
  extract_distribution: Array<{ label: string; count: number; pct: number }>;
  // Dosage distribution buckets
  dosage_buckets: Array<{ label: string; count: number; min: number; max: number }>;
  dosage_stats: { avg: number | null; min: number | null; max: number | null; median: number | null };
  // Certifications
  cert_frequency: Array<{ label: string; count: number; pct: number }>;
  // Bonus ingredients
  bonus_frequency: Array<{ label: string; count: number; pct: number }>;
  // Threat levels
  threat_distribution: Array<{ label: string; count: number; pct: number; color: string }>;
  // Formula quality
  quality_buckets: Array<{ label: string; count: number }>;
  avg_quality_score: number | null;
  // Price per serving
  price_stats: { avg: number | null; min: number | null; max: number | null; median: number | null };
  // Top 10 by formula score
  top_by_formula: ProductIntelligenceItem[];
  // Products with identified primary form/extract (generic for any category)
  primary_form_products: ProductIntelligenceItem[];
  // % booleans
  pct_sugar_free: number;
  pct_vegan: number;
  pct_non_gmo: number;
  pct_third_party: number;
  pct_cgmp: number;
  pct_no_artificial: number;
}

function buildSummary(products: ProductIntelligenceItem[]): ProductIntelligenceSummary {
  const total = products.length;
  if (total === 0) return emptyS();

  // Extract distribution
  const extractMap: Record<string, number> = {};
  const certMap: Record<string, number> = {};
  const bonusMap: Record<string, number> = {};
  const threatMap: Record<string, number> = { "Very High": 0, High: 0, Medium: 0, Low: 0 };

  const amounts: number[] = [];
  const prices: number[] = [];
  const scores: number[] = [];

  for (const p of products) {
    const i = p.intel;
    // Extract/form — use generic primary_active_form first, fallback to ashwagandha_extract_type
    const et = i.primary_active_form || i.ashwagandha_extract_type || "Unknown";
    extractMap[et] = (extractMap[et] || 0) + 1;
    // Certs
    for (const c of i.certifications || []) certMap[c] = (certMap[c] || 0) + 1;
    // Bonus
    for (const b of i.bonus_ingredients || []) bonusMap[b] = (bonusMap[b] || 0) + 1;
    // Threat
    const t = i.competitor_threat_level || "Low";
    threatMap[t] = (threatMap[t] || 0) + 1;
    // Dosage — use generic primary_active_amount_mg first, fallback to ashwagandha_amount_mg
    const activeAmt = i.primary_active_amount_mg || i.ashwagandha_amount_mg;
    if (activeAmt) amounts.push(activeAmt);
    // Price per serving
    if (i.price_per_serving) prices.push(i.price_per_serving);
    // Quality
    if (i.formula_quality_score) scores.push(i.formula_quality_score);
  }

  const sorted = (arr: number[]) => [...arr].sort((a, b) => a - b);
  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;
  const median = (arr: number[]) => {
    const s = sorted(arr);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  };

  const sortedAmounts = sorted(amounts);
  const sortedPrices = sorted(prices);

  // Dosage buckets
  const dosageBuckets = [
    { label: "< 200mg", min: 0, max: 199 },
    { label: "200–399mg", min: 200, max: 399 },
    { label: "400–599mg", min: 400, max: 599 },
    { label: "600–999mg", min: 600, max: 999 },
    { label: "1000–1999mg", min: 1000, max: 1999 },
    { label: "2000mg+", min: 2000, max: Infinity },
  ].map(b => ({
    ...b,
    count: amounts.filter(a => a >= b.min && a <= b.max).length,
  })).filter(b => b.count > 0);

  // Quality buckets
  const qualityBuckets = [
    { label: "1–3 (Poor)", range: [1, 3] },
    { label: "4–5 (Below Avg)", range: [4, 5] },
    { label: "6–7 (Average)", range: [6, 7] },
    { label: "8–9 (Good)", range: [8, 9] },
    { label: "10 (Excellent)", range: [10, 10] },
  ].map(b => ({
    label: b.label,
    count: scores.filter(s => s >= b.range[0] && s <= b.range[1]).length,
  })).filter(b => b.count > 0);

  const toArr = (map: Record<string, number>) =>
    Object.entries(map)
      .map(([label, count]) => ({ label, count, pct: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count);

  const threatColors: Record<string, string> = {
    "Very High": "#ef4444",
    High: "#f97316",
    Medium: "#eab308",
    Low: "#22c55e",
  };

  const topByFormula = [...products]
    .sort((a, b) => (b.intel.formula_quality_score || 0) - (a.intel.formula_quality_score || 0))
    .slice(0, 10);

  // Top products with identified extract/form (any category)
  const primaryFormProducts = products
    .filter(p => {
      const form = p.intel.primary_active_form || p.intel.ashwagandha_extract_type;
      return form && form !== "Unknown";
    })
    .sort((a, b) => (a.bsr_current || 99999) - (b.bsr_current || 99999))
    .slice(0, 10);

  const pct = (arr: ProductIntelligenceItem[], fn: (p: ProductIntelligenceItem) => boolean) =>
    total ? Math.round((arr.filter(fn).length / total) * 100) : 0;

  return {
    total,
    extract_distribution: toArr(extractMap),
    dosage_buckets: dosageBuckets,
    dosage_stats: {
      avg: avg(amounts),
      min: amounts.length ? Math.min(...amounts) : null,
      max: amounts.length ? Math.max(...amounts) : null,
      median: median(sortedAmounts),
    },
    cert_frequency: toArr(certMap),
    bonus_frequency: toArr(bonusMap),
    threat_distribution: Object.entries(threatMap)
      .filter(([, c]) => c > 0)
      .map(([label, count]) => ({
        label,
        count,
        pct: Math.round((count / total) * 100),
        color: threatColors[label] || "#94a3b8",
      }))
      .sort((a, b) => b.count - a.count),
    quality_buckets: qualityBuckets,
    avg_quality_score: avg(scores),
    price_stats: {
      avg: avg(sortedPrices),
      min: sortedPrices.length ? sortedPrices[0] : null,
      max: sortedPrices.length ? sortedPrices[sortedPrices.length - 1] : null,
      median: median(sortedPrices),
    },
    top_by_formula: topByFormula,
    primary_form_products: primaryFormProducts,
    pct_sugar_free: pct(products, p => p.intel.is_sugar_free),
    pct_vegan: pct(products, p => p.intel.is_vegan),
    pct_non_gmo: pct(products, p => p.intel.is_non_gmo),
    pct_third_party: pct(products, p => p.intel.is_third_party_tested),
    pct_cgmp: pct(products, p => p.intel.is_cgmp),
    pct_no_artificial: pct(products, p => !p.intel.artificial_colors),
  };
}

function emptyS(): ProductIntelligenceSummary {
  return {
    total: 0,
    extract_distribution: [],
    dosage_buckets: [],
    dosage_stats: { avg: null, min: null, max: null, median: null },
    cert_frequency: [],
    bonus_frequency: [],
    threat_distribution: [],
    quality_buckets: [],
    avg_quality_score: null,
    price_stats: { avg: null, min: null, max: null, median: null },
    top_by_formula: [],
    primary_form_products: [],
    pct_sugar_free: 0,
    pct_vegan: 0,
    pct_non_gmo: 0,
    pct_third_party: 0,
    pct_cgmp: 0,
    pct_no_artificial: 0,
  };
}

async function fetchProductIntelligence(categoryId: string): Promise<{
  products: ProductIntelligenceItem[];
  summary: ProductIntelligenceSummary;
}> {
  const { data, error } = await supabase
    .from("products")
    .select("id, asin, brand, title, bsr_current, price, monthly_sales, monthly_revenue, main_image_url, rating_value, marketing_analysis")
    .eq("category_id", categoryId)
    .not("marketing_analysis", "is", null)
    .order("bsr_current", { ascending: true });

  if (error) throw error;

  const products: ProductIntelligenceItem[] = (data || [])
    .filter(p => (p.marketing_analysis as any)?.product_intelligence)
    .map(p => ({
      id: p.id,
      asin: p.asin,
      brand: p.brand,
      title: p.title,
      bsr_current: p.bsr_current,
      price: p.price,
      monthly_sales: p.monthly_sales,
      monthly_revenue: p.monthly_revenue,
      main_image_url: p.main_image_url,
      rating_value: p.rating_value,
      intel: (p.marketing_analysis as any).product_intelligence,
    }));

  return { products, summary: buildSummary(products) };
}

export function useProductIntelligence(categoryId?: string) {
  return useQuery({
    queryKey: ["product_intelligence", categoryId],
    queryFn: () => fetchProductIntelligence(categoryId!),
    enabled: !!categoryId,
    staleTime: 5 * 60_000,
  });
}
