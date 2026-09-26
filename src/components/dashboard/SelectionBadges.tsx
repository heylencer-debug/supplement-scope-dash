import type { SyntheticEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Competitor-selection badges for a product row (scout migration 011,
 * select-competitors.js). "Top 40 · #n" opens a "Why selected" popover
 * built from `products.selection_reason`; "Promo?" and "Shared reviews" are
 * the two checks the owner asked for — whether a listing's apparent success
 * rides on a temporary promotion or on reviews pooled across variations.
 *
 * Reads the columns defensively: before the migration is applied (or before
 * a category has been through selection) they are absent / null and this
 * renders nothing.
 */

type SelectionReason = {
  summary?: string;
  rank?: number | null;
  of?: number;
  pool_rank?: number | null;
  excluded?: string | null;
  score?: number | null;
  components?: { sales?: number; reviews?: number; rating?: number; promo_discount?: number } | null;
  inputs?: {
    family_monthly_sales?: number | null;
    reviews_displayed?: number | null;
    reviews_own?: number | null;
    reviews_scored?: number | null;
    review_basis?: string | null;
    rating?: number | null;
  };
  cohort?: { cohort?: string | null; age_months?: number | null } | null;
  flags?: {
    promo?: { flag?: boolean; why?: string[] };
    shared_reviews?: { with?: string[]; likely_family_pooled?: boolean };
    market_leader?: boolean;
  };
  family?: { variants?: string[]; representative?: string };
  search?: { queries?: string[] };
};

type SelectionFields = {
  selected: boolean | null;
  rank: number | null;
  reason: SelectionReason | null;
  promo: boolean;
  sharedWith: string[];
};

const EXCLUDED_LABEL: Record<string, string> = {
  below_cut: "Outside the top 40",
  variation_of: "Variation of another listing",
  sponsored_only: "Sponsored only",
  below_review_floor: "Too few reviews",
  low_rating: "Low rating",
  brand_cap: "Brand already has 3",
};

function readSelection(product: object): SelectionFields {
  const p = product as Record<string, unknown>;
  const reason = p.selection_reason && typeof p.selection_reason === "object" ? (p.selection_reason as SelectionReason) : null;
  return {
    selected: typeof p.selected === "boolean" ? p.selected : null,
    rank: typeof p.selection_rank === "number" ? p.selection_rank : null,
    reason,
    promo: p.promo_flag === true,
    sharedWith: Array.isArray(p.shared_reviews_with) ? (p.shared_reviews_with as string[]) : [],
  };
}

const pct = (v?: number) => (typeof v === "number" ? `${Math.round(v * 100)}%` : "–");
const n = (v?: number | null) => (typeof v === "number" ? v.toLocaleString() : "–");

function WhySelected({ reason, rank }: { reason: SelectionReason; rank: number | null }) {
  const i = reason.inputs ?? {};
  const c = reason.components;
  const promoWhy = reason.flags?.promo?.why ?? [];
  const shared = reason.flags?.shared_reviews;
  const variants = reason.family?.variants ?? [];
  const queries = reason.search?.queries ?? [];
  return (
    <div className="space-y-2 text-xs">
      <p className="text-sm font-semibold text-foreground">
        {rank != null ? `Why selected — #${rank}${reason.of ? ` of ${reason.of}` : ""}` : `Not selected — ${EXCLUDED_LABEL[reason.excluded ?? ""] ?? "excluded"}`}
      </p>
      {reason.summary && <p className="text-muted-foreground">{reason.summary}</p>}
      {c && (
        <p>
          <span className="font-medium">Score {reason.score ?? "–"}</span>
          <span className="text-muted-foreground"> · sales {pct(c.sales)} · reviews {pct(c.reviews)} · rating {pct(c.rating)}</span>
        </p>
      )}
      <p className="text-muted-foreground">
        {n(i.family_monthly_sales)} sales/mo · {n(i.reviews_scored)} reviews
        {i.review_basis === "own_asin" ? " (its own, not the pooled page count)" : ""} · {i.rating ?? "–"}★
      </p>
      {reason.cohort?.cohort && reason.cohort.cohort !== "context" && (
        <p className="text-muted-foreground">
          Cohort: {reason.cohort.cohort}
          {typeof reason.cohort.age_months === "number" ? ` · ${(reason.cohort.age_months / 12).toFixed(1)} yrs on market` : ""}
        </p>
      )}
      {variants.length > 0 && <p className="text-muted-foreground">{variants.length} flavor/size variation(s) counted once under this listing.</p>}
      {reason.excluded === "variation_of" && reason.family?.representative && (
        <p className="text-muted-foreground">Counted under {reason.family.representative}.</p>
      )}
      {promoWhy.length > 0 && <p className="text-amber-700">Promotion check: {promoWhy.join("; ")}. Sales weighted down.</p>}
      {(shared?.with?.length ?? 0) > 0 && (
        <p className="text-amber-700">Reviews shared with {shared?.with?.join(", ")} (same count and rating across variations).</p>
      )}
      {shared?.likely_family_pooled && !(shared?.with?.length) && (
        <p className="text-amber-700">
          Page shows {n(i.reviews_displayed)} reviews pooled across variations; scored on its own {n(i.reviews_own)}.
        </p>
      )}
      {queries.length > 0 && <p className="text-muted-foreground">Found by: {queries.map((q) => `“${q}”`).join(", ")}</p>}
    </div>
  );
}

export function SelectionBadges({ product }: { product: object }) {
  const s = readSelection(product);
  if (s.selected == null || !s.reason) return null;
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1" onClick={stop}>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="focus:outline-none" aria-label={s.selected ? "Why selected" : "Why not selected"}>
            {s.selected ? (
              <Badge variant="success" className="px-2 py-0.5 text-[10px]">Top 40 · #{s.rank}</Badge>
            ) : (
              <Badge variant="outline" className="px-2 py-0.5 text-[10px] text-muted-foreground">
                {EXCLUDED_LABEL[s.reason.excluded ?? ""] ?? "Not selected"}
              </Badge>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start" onClick={stop}>
          <WhySelected reason={s.reason} rank={s.rank} />
        </PopoverContent>
      </Popover>
      {s.promo && (
        <Badge variant="warning" className="px-2 py-0.5 text-[10px]" title="Current rank or price looks promotion-driven">
          Promo?
        </Badge>
      )}
      {s.sharedWith.length > 0 && (
        <Badge variant="warning" className="px-2 py-0.5 text-[10px]" title={`Reviews shared with ${s.sharedWith.join(", ")}`}>
          Shared reviews
        </Badge>
      )}
    </span>
  );
}
