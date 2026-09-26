/**
 * useMarketingAssets — reads P7b marketing assets
 * (scout/migrations/015_marketing_assets.sql, `dovive_marketing_assets`):
 * what the competitors' gallery / A+ images actually say (vision read,
 * counted), and the experienced-vs-claimed join with the P3b review themes.
 *
 * Tolerates the migration not being applied yet — returns null, and the
 * card / modal section render their "not generated yet" line.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const assetsTable = () => (supabase.from as unknown as (table: string) => any)("dovive_marketing_assets");

export type SeenBucket = "main" | "gallery" | "a+" | "brand";
export type SeenOn = Partial<Record<SeenBucket, number>>;

export type AssetStatus = "complete" | "partial" | "inventory_only" | "failed" | "not_attempted" | "no_images";
export type Verdict = "experienced" | "claimed_only" | "contradicted" | "no_review_signal";

export interface AssetLedger {
  products: number;
  products_with_images?: number;
  products_analyzed: number;
  products_cached?: number;
  products_failed?: number;
  products_not_attempted?: number;
  images_available: number;
  gallery_images_available?: number;
  images_selected?: number;
  images_analyzed: number;
  images_sent_this_run?: number;
  images_unreadable?: number;
  a_plus_available?: number;
  a_plus_unknown?: number;
  a_plus_analyzed?: number;
  a_plus_images_available?: number;
  a_plus_images_analyzed?: number;
  brand_story_images_available?: number;
  brand_story_images_analyzed?: number;
  videos_available?: number;
  products_with_videos?: number;
  videos_analyzed?: number;
  videos_note?: string;
  claims_dropped_unevidenced?: number;
  scope?: { mode: "selection" | "top_bsr"; why?: string; products_in_category?: number; products_in_scope?: number } | null;
  model?: string | null;
  cost_usd_this_run?: number;
}

export interface MessageCluster {
  key: string | null;
  label: string;
  variants?: string[];
  products: number;
  asins?: string[];
  seen_on?: SeenOn;
  kinds?: Record<string, number>;
  evidence?: string[];
  vs_who?: string[];
}

export interface AudienceSegment { segment: string; products: number; asins?: string[]; example_cues?: string[]; unmatched?: boolean }

export interface MarketingRollup {
  products_analyzed: number;
  recurring_messages: MessageCluster[];
  main_promises: MessageCluster[];
  audience_segments: AudienceSegment[];
  use_cases: MessageCluster[];
  comparison_table_claims: MessageCluster[];
  packaging?: {
    formats?: { value: string; products: number }[];
    colours?: { value: string; products: number }[];
    certifications_shown?: { value: string; products: number }[];
  };
}

export interface ReviewSupport {
  theme_label: string;
  review_count: number;
  distinct_products: number;
  on_claiming_products?: number;
  polarity: "complaint" | "unmet_need" | "praise";
  rule: string;
}

export interface ExperiencedVsClaimedItem {
  claim: string;
  benefit_group: string | null;
  variants?: string[];
  products_claiming: number;
  asins?: string[];
  claimed_via?: Record<string, number>;
  claim_surface: "shown_in_images" | "comparison_table_only" | "comparison_table_and_bullets_only" | "bullets_only";
  seen_on?: SeenOn;
  claiming_products_with_reviews?: number;
  review_support: ReviewSupport | null;
  praise_reviews: number;
  complaint_reviews: number;
  verdict: Verdict;
}

export interface ExperiencedVsClaimed {
  available: boolean;
  items: ExperiencedVsClaimedItem[];
  counts: Record<Verdict, number>;
  excluded_attribute_claims?: number;
  synthesis?: { keyword: string | null; generated_at: string | null; status: string | null; themes: number; products_with_reviews: number } | null;
}

export interface MarketingAssetsCategoryRow {
  keyword: string;
  category_id: string | null;
  ledger: AssetLedger;
  rollup: MarketingRollup | null;
  experienced_vs_claimed: ExperiencedVsClaimed | null;
  status: AssetStatus;
  model: string | null;
  generated_at: string;
}

export interface PerImage {
  label: string;
  url: string;
  kind: "gallery" | "a+" | "brand";
  text_seen: string[];
  messages: string[];
  comparison_claims: string[];
  unreadable?: boolean;
}

export interface ProductAnalysis {
  target_audience: { who: string; cues: string[] } | null;
  main_promise: { text: string; where_seen: string } | null;
  recurring_messages: { message: string; seen_on: string[]; verbatim?: string }[];
  demonstrated_use_cases: { use_case: string; evidence: string; seen_on: string[] }[];
  packaging: {
    format: string | null;
    colours: string[];
    claims_on_pack: { claim: string; seen_on: string[] }[];
    certifications_shown: { name: string; seen_on: string[] }[];
  };
  comparison_table_claims: { claim: string; vs_who: string | null; seen_on: string[] }[];
  text_seen: { label: string | null; text: string }[];
  images_unreadable: string[];
  validation?: { dropped_total: number };
}

export interface MarketingAssetsProductRow {
  keyword: string;
  asin: string;
  ledger: AssetLedger;
  assets: {
    gallery?: { label: string; url: string }[];
    a_plus?: { available: boolean | null; images: { label: string; url: string }[]; videos: string[] };
    brand_story?: { label: string; url: string }[];
    videos?: { listing_count: number; a_plus_streams: number; note?: string };
    per_image?: PerImage[];
  };
  analysis: ProductAnalysis | null;
  status: AssetStatus;
  model: string | null;
  generated_at: string;
}

const CATEGORY_COLUMNS = "keyword, category_id, ledger, rollup, experienced_vs_claimed, status, model, generated_at";
const PRODUCT_COLUMNS = "keyword, asin, ledger, assets, analysis, status, model, generated_at";

export function useMarketingAssets(categoryId: string | null | undefined, keyword?: string | null) {
  return useQuery({
    queryKey: ["marketing_assets", categoryId, keyword],
    enabled: !!(categoryId || keyword),
    queryFn: async (): Promise<MarketingAssetsCategoryRow | null> => {
      try {
        for (const [col, val] of [["category_id", categoryId], ["keyword", keyword]] as const) {
          if (!val) continue;
          const { data, error } = await assetsTable()
            .select(CATEGORY_COLUMNS)
            .eq(col, val)
            .eq("scope", "category")
            .order("generated_at", { ascending: false })
            .limit(1);
          if (!error && data?.length) return data[0] as MarketingAssetsCategoryRow;
        }
        return null;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });
}

export function useProductMarketingAssets(asin: string | null | undefined, categoryId?: string | null) {
  return useQuery({
    queryKey: ["marketing_assets_product", asin, categoryId],
    enabled: !!asin,
    queryFn: async (): Promise<MarketingAssetsProductRow | null> => {
      try {
        let q = assetsTable().select(PRODUCT_COLUMNS).eq("scope", "product").eq("asin", asin);
        if (categoryId) q = q.eq("category_id", categoryId);
        const { data, error } = await q.order("generated_at", { ascending: false }).limit(1);
        if (!error && data?.length) return data[0] as MarketingAssetsProductRow;
        return null;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });
}
