/**
 * useReviewSynthesis — reads the category-scope row of the P3b review
 * synthesis (scout/migrations/012_review_synthesis.sql,
 * `dovive_review_synthesis`): coverage ledger, per-domain breakdown and the
 * evidence-counted themes. Product-scope evidence rides on
 * products.review_analysis.review_evidence instead (no extra query).
 *
 * Tolerates the migration not being applied yet — returns null, and the
 * Review evidence card renders its "not generated yet" line.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const synthesisTable = () => (supabase.from as unknown as (table: string) => any)("dovive_review_synthesis");

export type IssueDomain =
  | "product_efficacy"
  | "taste_texture"
  | "packaging"
  | "shipping_condition"
  | "seller_service"
  | "price_value"
  | "other";

export type ThemePolarity = "complaint" | "unmet_need" | "praise";
export type ThemeScope = "single_product" | "multi_product" | "category_wide";

export interface DateRange { min: string | null; max: string | null; undated?: number }

export interface ReviewLedger {
  rows_collected?: number;
  duplicate_rows_removed?: number;
  reviews_collected: number;
  reviews_analyzed: number;
  reviews_with_text?: number;
  rating_only_reviews?: number;
  cap_applied?: { max: number; reviews_collected: number; reviews_dropped: number; rule: string } | null;
  products_with_reviews: number;
  distinct_asins?: string[];
  product_families?: number;
  date_range?: DateRange;
  reviews_by_year?: Record<string, number>;
  verified_share?: number | null;
  vine_share?: number | null;
  star_distribution?: Record<string, number>;
  average_rating?: number | null;
  theme_pass?: {
    model: string | null;
    batches: number;
    batches_ok: number;
    batches_failed: number;
    reviews_sent: number;
    reviews_in_failed_batches: number;
    cost_usd?: number;
  };
}

export interface ThemeExcerpt { review_id: number; asin: string; rating?: number | null; verified?: boolean; date?: string | null; text: string }

export interface ReviewTheme {
  label: string;
  domain: IssueDomain;
  polarity: ThemePolarity;
  review_count: number;
  review_ids?: number[];
  /** category scope */
  distinct_products?: { count: number; asin_count?: number; asins?: string[] };
  scope?: ThemeScope;
  verified_count?: number;
  verified_share?: number | null;
  date_range?: DateRange;
  excerpts?: ThemeExcerpt[];
  counter_evidence?: { count: number; products?: number; paired_theme_labels?: string[]; excerpt?: ThemeExcerpt | null };
  /** product scope */
  category_context?: { review_count: number; distinct_products: number; scope: ThemeScope; other_products: number };
}

export interface DomainBreakdownRow {
  domain: IssueDomain;
  reviews_mentioning: number;
  negative: { count: number; products: number };
  positive: { count: number; products: number };
  unclear?: number;
}

export interface ReviewSynthesisRow {
  keyword: string;
  category_id: string | null;
  ledger: ReviewLedger;
  themes: ReviewTheme[];
  domain_breakdown: DomainBreakdownRow[];
  status: "complete" | "partial" | "deterministic_only";
  model: string | null;
  generated_at: string;
}

/** products.review_analysis.review_evidence (written by P3b / migrate-reviews-to-dash.js). */
export interface ProductReviewEvidence {
  ledger: ReviewLedger;
  themes: ReviewTheme[];
  theme_count?: number;
  generated_at?: string | null;
  model?: string | null;
}

const COLUMNS = "keyword, category_id, ledger, themes, domain_breakdown, status, model, generated_at";

export function useReviewSynthesis(categoryId: string | null | undefined, keyword?: string | null) {
  return useQuery({
    queryKey: ["review_synthesis", categoryId, keyword],
    enabled: !!(categoryId || keyword),
    queryFn: async (): Promise<ReviewSynthesisRow | null> => {
      try {
        if (categoryId) {
          const { data, error } = await synthesisTable()
            .select(COLUMNS)
            .eq("category_id", categoryId)
            .eq("scope", "category")
            .order("generated_at", { ascending: false })
            .limit(1);
          if (!error && data?.length) return data[0] as ReviewSynthesisRow;
        }
        if (keyword) {
          const { data, error } = await synthesisTable()
            .select(COLUMNS)
            .eq("keyword", keyword)
            .eq("scope", "category")
            .order("generated_at", { ascending: false })
            .limit(1);
          if (!error && data?.length) return data[0] as ReviewSynthesisRow;
        }
        return null;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });
}
