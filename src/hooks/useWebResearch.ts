/**
 * useWebResearch — reads the P5b category web research row
 * (scout/migrations/014_web_research.sql, `dovive_web_research`): coverage
 * ledger, every source with its page type / ownership / duplicate verdict, and
 * the roll-up of claims counted by independent vs brand-owned sources.
 *
 * Tolerates the migration not being applied yet — returns null, and the Web
 * evidence card renders its "not generated yet" line.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const webTable = () => (supabase.from as unknown as (table: string) => any)("dovive_web_research");

export type PageType =
  | "review_article"
  | "comparison"
  | "category_guide"
  | "specialist_blog"
  | "brand_page"
  | "retailer"
  | "forum"
  | "news"
  | "other";

export type Ownership = "brand_owned" | "sponsored" | "affiliate" | "independent" | "unknown";

export type WebResearchStatus = "complete" | "partial" | "no_model";

export interface WebLedger {
  queries_planned?: number;
  queries_run?: number;
  queries_failed?: number;
  sources_found?: number;
  sources_skipped?: Record<string, number>;
  fetched?: number;
  fetch_failed?: number;
  robots_disallowed?: number;
  blocked?: number;
  browser_fetches?: number;
  extraction_deferred?: number;
  searches_deferred?: number;
  partial_reasons?: string[];
  classified?: number;
  extracted?: number;
  extraction_failed?: number;
  extraction_not_attempted?: number;
  items_dropped_unquoted?: Record<string, number>;
  duplicates_removed?: number;
  copied_marketing_quotes?: number;
  by_page_type?: Record<string, number>;
  by_ownership?: Partial<Record<Ownership, number>>;
  cost_usd?: { search?: number; extraction?: number; total?: number };
  model?: string | null;
  competitor_source?: string;
  stopped?: string;
}

export interface OwnershipMarker { kind: Ownership; marker: string; snippet?: string }

export interface WebSource {
  url: string;
  domain: string;
  title?: string | null;
  snippet?: string | null;
  intent?: string;
  found_by?: string[];
  fetch_status?: "fetched" | "failed" | "blocked" | "robots_disallowed" | "skipped" | "not_fetched" | "pending";
  skip_reason?: string;
  fetch_error?: string;
  page_type?: PageType;
  page_type_evidence?: string;
  ownership?: Ownership;
  ownership_markers?: OwnershipMarker[];
  brand?: string;
  duplicate_of?: string | null;
  duplicate_kind?: "syndicated_page" | "amazon_listing_copy" | "canonical_link";
  duplicate_similarity?: number | null;
  extraction_status?: string;
}

export interface WebQuote { url: string; domain: string; ownership: Ownership; quote: string; excluded?: "duplicate" | "copied_marketing" }

export interface RollupRow {
  label: string;
  ingredient?: string | null;
  product?: string | null;
  independent_sources: number;
  brand_owned_sources: number;
  affiliate_sources: number;
  sponsored_sources: number;
  unknown_sources: number;
  total_sources: number;
  duplicate_sources_excluded: number;
  copied_marketing_excluded: number;
  products?: string[];
  quotes?: WebQuote[];
}

export interface WebRollup {
  ingredient_claims?: RollupRow[];
  comparison_criteria?: RollupRow[];
  strengths?: RollupRow[];
  weaknesses?: RollupRow[];
  pricing?: { product: string | null; observations: { price_text: string; url: string; domain: string; ownership: Ownership; quote: string }[] }[];
  products_discussed?: { brand: string | null; product: string | null; asin: string | null; asin_source?: "page" | "brand_match" | null; independent_sources: number; brand_owned_sources: number; affiliate_sources: number; total_sources: number }[];
}

export interface VerificationTarget {
  kind: "registry" | "literature";
  claim: string;
  registry?: string | null;
  brand?: string | null;
  ingredient?: string | null;
  status: "supported" | "not_found" | "not_checked" | "registry_unavailable";
  evidence_url?: string | null;
  note?: string;
  lookups?: { registry: string; url: string; checkable: boolean }[];
  pubmed?: { human_url: string } | null;
}

export interface WebResearchRow {
  keyword: string;
  category_id: string | null;
  status: WebResearchStatus;
  model: string | null;
  ledger: WebLedger;
  sources: WebSource[];
  rollup: WebRollup;
  verification: VerificationTarget[];
  cost_usd: number | null;
  generated_at: string;
}

const COLUMNS = "keyword, category_id, status, model, ledger, sources, rollup, verification, cost_usd, generated_at";

export function useWebResearch(categoryId: string | null | undefined, keyword?: string | null) {
  return useQuery({
    queryKey: ["web_research", categoryId, keyword],
    enabled: !!(categoryId || keyword),
    queryFn: async (): Promise<WebResearchRow | null> => {
      try {
        for (const [col, val] of [["category_id", categoryId], ["keyword", keyword]] as const) {
          if (!val) continue;
          const { data, error } = await webTable()
            .select(COLUMNS)
            .eq(col, val)
            .order("generated_at", { ascending: false })
            .limit(1);
          if (!error && data?.length) return data[0] as WebResearchRow;
        }
        return null;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });
}
