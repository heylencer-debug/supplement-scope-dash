import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { ScoutJobStatus } from "@/types/scoutJobs";

export type CategoryAnalysis = Tables<"category_analyses">;
export type Category = Tables<"categories">;

export interface CategoryWithImages extends Category {
  product_images?: string[];
  /** Latest scout_jobs status for this category's keyword, if a job row exists. */
  job_status?: ScoutJobStatus | null;
  /** Normalized 0-10 opportunity score from the most recent category_analyses row, if any. */
  opportunity_score?: number | null;
}

/** Strip spreadsheet-import junk (leading "=", quotes, etc.) — display + name-matching. */
function stripLabel(name: string | null | undefined): string {
  return (name || "").replace(/^[=+\-'"\s]+/, "").trim();
}

function normalizeKey(name: string | null | undefined): string {
  return stripLabel(name).toLowerCase();
}

// scout_jobs isn't in the generated Supabase types yet (see src/types/scoutJobs.ts
// for why — same pattern used by src/hooks/useScoutJobs.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const scoutJobsTable = () => (supabase.from as unknown as (table: string) => any)("scout_jobs");

interface JobSignal {
  status: ScoutJobStatus;
  /** finished_at if the job completed, else updated_at (still honest for in-flight runs). */
  recency: string | null;
}

/** Fetch the latest scout_jobs row per normalized keyword. Tolerates the table not existing yet. */
async function fetchLatestJobByKeyword(): Promise<Map<string, JobSignal>> {
  const map = new Map<string, JobSignal>();
  try {
    const { data, error } = await scoutJobsTable()
      .select("keyword, status, finished_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (error) {
      if (error.code === "42P01" || /relation .* does not exist/i.test(error.message ?? "")) return map;
      console.warn("useRecentCategories: scout_jobs lookup failed", error);
      return map;
    }

    for (const j of data || []) {
      const key = normalizeKey(j.keyword);
      if (!key || map.has(key)) continue; // rows already sorted desc — first hit is most recent
      map.set(key, { status: j.status, recency: j.finished_at || j.updated_at || null });
    }
  } catch (e) {
    console.warn("useRecentCategories: scout_jobs lookup failed", e);
  }
  return map;
}

/**
 * Live COUNT + MAX(updated_at) of `products` per category, batched in
 * paginated (1000-row) scans instead of one query per category — a wide
 * category pool can easily hold more `products` rows than PostgREST's
 * default single-request row cap.
 */
async function fetchProductStats(categoryIds: string[]) {
  const countMap = new Map<string, number>();
  const recencyMap = new Map<string, string | null>();
  if (!categoryIds.length) return { countMap, recencyMap };

  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("products")
      .select("category_id, updated_at")
      .in("category_id", categoryIds)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;

    for (const row of data || []) {
      if (!row.category_id) continue;
      countMap.set(row.category_id, (countMap.get(row.category_id) || 0) + 1);
      const prev = recencyMap.get(row.category_id) ?? null;
      if (row.updated_at && (!prev || row.updated_at > prev)) {
        recencyMap.set(row.category_id, row.updated_at);
      }
    }

    if (!data || data.length < PAGE) break;
    from += PAGE;
  }

  return { countMap, recencyMap };
}

/**
 * Latest opportunity score (normalized to a 0-10 scale, matching
 * CockpitHero's own normalization) per category_id, batched in ONE query
 * scoped to just the finalist ids actually rendered.
 */
async function fetchLatestScores(categoryIds: string[]) {
  const map = new Map<string, number | null>();
  if (!categoryIds.length) return map;

  const { data, error } = await supabase
    .from("category_analyses")
    .select("category_id, opportunity_index, created_at")
    .in("category_id", categoryIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("useRecentCategories: category_analyses score lookup failed", error);
    return map;
  }

  for (const row of data || []) {
    if (!row.category_id || map.has(row.category_id)) continue; // rows sorted desc — first hit is latest
    const raw = row.opportunity_index;
    map.set(row.category_id, raw != null ? (raw > 10 ? raw / 10 : raw) : null);
  }
  return map;
}

/**
 * Fetch recently analyzed categories for the "Recently Analyzed Categories"
 * grid — honest version (2026-08-29 fix; was previously reading raw
 * `categories` rows directly: stale `total_products`, stale timestamps, and
 * junk-prefixed duplicate rows like "=Hydration Powder" shadowing the real
 * run of the same keyword).
 *
 * - Dedupes case-insensitively by junk-stripped name, keeping the PRIMARY
 *   sibling — most REAL products (live COUNT from `products`), tie-broken
 *   by most recent activity. Same tie-break signal as the backend's
 *   `utils/category-resolver.js#resolveCategory()`.
 * - `total_products` is always a live COUNT of `products` rows, never the
 *   write-once `categories.total_products` column.
 * - `updated_at` is overwritten with REAL recency: latest `scout_jobs`
 *   finished_at/updated_at for the category's keyword, falling back to
 *   max(`products.updated_at`), falling back to the category row's own
 *   timestamps only when neither exists (legacy/empty category).
 * - `job_status` carries the latest `scout_jobs` status for the keyword so
 *   the UI can render a real complete/error/running badge instead of a
 *   hardcoded "Complete".
 */
export function useRecentCategories(limit: number = 20) {
  return useQuery({
    queryKey: ["recent_categories", limit],
    queryFn: async () => {
      // Pool wider than `limit` so dedup + real-recency sorting has enough
      // candidates to survive junk duplicates before slicing to `limit`.
      const POOL_SIZE = Math.max(limit * 6, 120);

      const [{ data: categories, error: catErr }, jobByKeyword] = await Promise.all([
        supabase
          .from("categories")
          .select(
            "id, name, search_term, total_products, created_at, updated_at, last_scanned, analysis_type, product_forms"
          )
          .order("updated_at", { ascending: false })
          .limit(POOL_SIZE),
        fetchLatestJobByKeyword(),
      ]);

      if (catErr) throw catErr;
      if (!categories?.length) return [];

      const { countMap, recencyMap } = await fetchProductStats(categories.map((c) => c.id));

      const enriched = categories.map((cat) => {
        const job =
          jobByKeyword.get(normalizeKey(cat.search_term)) ?? jobByKeyword.get(normalizeKey(cat.name));

        const recency =
          job?.recency ?? recencyMap.get(cat.id) ?? cat.updated_at ?? cat.created_at ?? null;

        return {
          ...cat,
          total_products: countMap.get(cat.id) || 0,
          job_status: job?.status ?? null,
          _recency: recency,
        };
      });

      // Dedupe case-insensitively by junk-stripped name: keep the PRIMARY
      // sibling (most real products, tie-broken by most recent activity) —
      // never a junk-prefixed stray when a richer sibling exists.
      const groups = new Map<string, typeof enriched>();
      for (const cat of enriched) {
        const key = normalizeKey(cat.name) || cat.id;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(cat);
      }

      const deduped = Array.from(groups.values()).map((group) =>
        [...group].sort((a, b) => {
          if (b.total_products !== a.total_products) return b.total_products - a.total_products;
          return new Date(b._recency || 0).getTime() - new Date(a._recency || 0).getTime();
        })[0]
      );

      // Sort by real recency, newest first — today's runs surface ahead of
      // months-old ones regardless of raw `categories` insertion order.
      deduped.sort((a, b) => new Date(b._recency || 0).getTime() - new Date(a._recency || 0).getTime());

      const finalists = deduped.slice(0, limit);

      // Score lookup batched once for just the finalists actually rendered.
      const scoreMap = await fetchLatestScores(finalists.map((c) => c.id));

      // Product images only for the finalists actually rendered (cheap —
      // avoids an image query per category in the wider dedup pool).
      const withImages = await Promise.all(
        finalists.map(async (cat) => {
          const { data: products } = await supabase
            .from("products")
            .select("main_image_url")
            .eq("category_id", cat.id)
            .not("main_image_url", "is", null)
            .limit(4);

          const { _recency, ...rest } = cat;
          return {
            ...rest,
            name: stripLabel(cat.name),
            updated_at: _recency, // honest last-activity timestamp, not the raw DB column
            product_images: products?.map((p) => p.main_image_url).filter(Boolean) || [],
            opportunity_score: scoreMap.get(cat.id) ?? null,
          } as CategoryWithImages;
        })
      );

      return withImages;
    },
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

/**
 * Which categories have a real P13 chief-formulator sign-off — one query for
 * ALL categories (not N per-category queries), used to render the "Signed
 * off ✓" maturity chip in the Launchpad library grid. A row counts as signed
 * off when `ingredients.final_signoff.verdict` is non-null, mirroring
 * `getCanonicalFormula`'s own "signoff" tier without re-fetching the full
 * (often huge) `ingredients` document per category.
 */
export function useCategorySignoffs() {
  return useQuery({
    queryKey: ["category_signoffs"],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("formula_briefs")
        // JSON-path select: formula_briefs.ingredients->final_signoff->>verdict,
        // aliased to `verdict`. Not represented in the generated Supabase
        // types (computed column), hence the `as any` on the select string.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("category_id, verdict:ingredients->final_signoff->>verdict" as any);

      if (error) {
        console.warn("useCategorySignoffs: formula_briefs lookup failed", error);
        return new Set();
      }

      const signedOff = new Set<string>();
      for (const row of (data ?? []) as unknown as { category_id: string | null; verdict: string | null }[]) {
        if (row.category_id && row.verdict) signedOff.add(row.category_id);
      }
      return signedOff;
    },
    staleTime: 30_000,
  });
}

// Keep for backwards compatibility - fetches analysis data
export function useCategoryAnalyses(limit: number = 20) {
  return useQuery({
    queryKey: ["category_analyses", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_analyses")
        .select("id, category_id, category_name, overall_score, opportunity_index, recommendation, products_analyzed, reviews_analyzed, executive_summary, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as CategoryAnalysis[];
    },
    refetchInterval: 10000,
    staleTime: 5000,
  });
}

export function useCategoryAnalysis(categoryId?: string) {
  return useQuery({
    queryKey: ["category_analysis", categoryId],
    queryFn: async () => {
      if (!categoryId) return null;

      const { data, error } = await supabase
        .from("category_analyses")
        .select("*")
        .eq("category_id", categoryId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      return data as CategoryAnalysis | null;
    },
    enabled: !!categoryId,
  });
}
