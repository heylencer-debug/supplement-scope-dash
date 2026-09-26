/**
 * ReviewEvidence — the P3b "how much did we actually read, and how many
 * reviews back each claim" view. Used twice:
 *   - category scope (Market tab): ledger + per-domain breakdown + theme table
 *     with review / product counts, conflict counter and scope;
 *   - product scope (Product modal → Reviews): the same, restricted to one
 *     ASIN, with a column saying whether the theme also shows up elsewhere.
 * Pure presentation: data comes from useReviewSynthesis (category) or
 * products.review_analysis.review_evidence (product).
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  DomainBreakdownRow,
  IssueDomain,
  ReviewLedger,
  ReviewTheme,
  ThemeScope,
} from "@/hooks/useReviewSynthesis";

const DOMAIN_LABEL: Record<IssueDomain, string> = {
  product_efficacy: "Efficacy",
  taste_texture: "Taste & texture",
  packaging: "Packaging & label",
  shipping_condition: "Arrival condition",
  seller_service: "Seller & service",
  price_value: "Price & value",
  other: "Other",
};

const SCOPE_LABEL: Record<ThemeScope, string> = {
  single_product: "1 product only",
  multi_product: "Several products",
  category_wide: "Category-wide",
};

const nf = new Intl.NumberFormat("en-US");
const n = (v: number | null | undefined) => (v == null ? "–" : nf.format(v));
const pct = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v * 100)}%`);

function month(d: string | null | undefined) {
  if (!d) return "?";
  const [y, m] = d.split("-");
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1] ?? "?"} ${y}`;
}

function Chip({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-3.5 py-2 rounded-lg bg-muted/50 min-w-[110px]">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground tabular-nums">{sub}</span>}
    </div>
  );
}

export function ReviewLedgerChips({ ledger, scope }: { ledger: ReviewLedger; scope: "category" | "product" }) {
  const dr = ledger.date_range;
  const capped = !!ledger.cap_applied;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Chip
          label="Collected"
          value={n(ledger.reviews_collected)}
          sub={ledger.duplicate_rows_removed ? `${n(ledger.rows_collected)} rows, ${n(ledger.duplicate_rows_removed)} duplicates` : "unique reviews"}
        />
        <Chip
          label="Analyzed"
          value={n(ledger.reviews_analyzed)}
          sub={capped ? `capped at ${n(ledger.cap_applied?.max)}` : ledger.reviews_analyzed === ledger.reviews_collected ? "all of them" : undefined}
        />
        {scope === "category" && (
          <Chip
            label="Products"
            value={n(ledger.products_with_reviews)}
            sub={ledger.product_families != null && ledger.product_families !== ledger.products_with_reviews ? `${n(ledger.product_families)} product families` : "ASINs with reviews"}
          />
        )}
        <Chip
          label="Period"
          value={dr?.min ? `${month(dr.min)} – ${month(dr.max)}` : "–"}
          sub={dr?.undated ? `${n(dr.undated)} undated` : undefined}
        />
        <Chip label="Verified" value={pct(ledger.verified_share)} sub={ledger.vine_share ? `${pct(ledger.vine_share)} Vine` : undefined} />
      </div>
      {capped && (
        <p className="text-xs text-chart-2">
          {n(ledger.cap_applied?.reviews_dropped)} of {n(ledger.reviews_collected)} reviews were not analyzed — {ledger.cap_applied?.rule}.
        </p>
      )}
      {!!ledger.theme_pass?.batches_failed && (
        <p className="text-xs text-chart-2">
          Theme extraction is partial: {n(ledger.theme_pass.reviews_in_failed_batches)} reviews were in batches that failed, so theme counts may be low.
        </p>
      )}
    </div>
  );
}

function DomainBreakdown({ rows }: { rows: DomainBreakdownRow[] }) {
  const visible = rows.filter((r) => r.reviews_mentioning > 0);
  if (!visible.length) return null;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Mentions by issue type (keyword pass over every review)</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Issue type</TableHead>
            <TableHead className="text-right">Negative reviews</TableHead>
            <TableHead className="text-right">Positive reviews</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((r) => (
            <TableRow key={r.domain}>
              <TableCell className="text-sm">{DOMAIN_LABEL[r.domain] ?? r.domain}</TableCell>
              <TableCell className="text-right tabular-nums text-sm">
                {n(r.negative.count)} <span className="text-muted-foreground text-xs">· {n(r.negative.products)} products</span>
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm">
                {n(r.positive.count)} <span className="text-muted-foreground text-xs">· {n(r.positive.products)} products</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type Side = "negative" | "praise";

export function ReviewThemeTable({ themes, scope, limit = 25 }: { themes: ReviewTheme[]; scope: "category" | "product"; limit?: number }) {
  const [side, setSide] = useState<Side>("negative");
  const [domain, setDomain] = useState<IssueDomain | "all">("all");
  const [showAll, setShowAll] = useState(false);

  const sideThemes = useMemo(
    () => themes.filter((t) => (side === "praise" ? t.polarity === "praise" : t.polarity !== "praise")),
    [themes, side],
  );
  const domainCounts = useMemo(() => {
    const m = new Map<IssueDomain, number>();
    for (const t of sideThemes) m.set(t.domain, (m.get(t.domain) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [sideThemes]);
  const filtered = domain === "all" ? sideThemes : sideThemes.filter((t) => t.domain === domain);
  const rows = showAll ? filtered : filtered.slice(0, limit);
  const negCount = themes.filter((t) => t.polarity !== "praise").length;
  const posCount = themes.length - negCount;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {([["negative", `Complaints & unmet needs (${negCount})`], ["praise", `Praise (${posCount})`]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => { setSide(k); setDomain("all"); }}
            className={cn("px-2.5 py-1 rounded-md text-xs border", side === k ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground")}
          >
            {label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          onClick={() => setDomain("all")}
          className={cn("px-2 py-0.5 rounded-full text-[11px] border", domain === "all" ? "border-foreground text-foreground" : "border-border text-muted-foreground")}
        >
          All
        </button>
        {domainCounts.map(([d, c]) => (
          <button
            key={d}
            type="button"
            onClick={() => setDomain(d)}
            className={cn("px-2 py-0.5 rounded-full text-[11px] border", domain === d ? "border-foreground text-foreground" : "border-border text-muted-foreground")}
          >
            {DOMAIN_LABEL[d] ?? d} · {c}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground/80 py-1">No themes in this view.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[44%]">Theme</TableHead>
              <TableHead>Issue type</TableHead>
              <TableHead className="text-right">Reviews</TableHead>
              {scope === "category" ? <TableHead className="text-right">Products</TableHead> : <TableHead className="text-right">Elsewhere</TableHead>}
              <TableHead className="text-right">Verified</TableHead>
              <TableHead className="text-right" title="Reviews reporting the opposite experience on the same topic">Conflicting</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t, i) => {
              const ex = t.excerpts?.[0];
              const conflict = t.counter_evidence?.count ?? 0;
              return (
                <TableRow key={`${t.label}-${i}`}>
                  <TableCell className="align-top">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{t.label}</span>
                      {t.polarity === "unmet_need" && <Badge variant="outline" className="text-[10px]">unmet need</Badge>}
                      {scope === "category" && t.scope && (
                        <Badge variant={t.scope === "single_product" ? "secondary" : "outline"} className="text-[10px]">{SCOPE_LABEL[t.scope]}</Badge>
                      )}
                    </div>
                    {ex && <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-2">"{ex.text}" <span className="not-italic">({ex.asin})</span></p>}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant="outline" className="text-[10px] whitespace-nowrap">{DOMAIN_LABEL[t.domain] ?? t.domain}</Badge>
                  </TableCell>
                  <TableCell className="align-top text-right tabular-nums text-sm">{n(t.review_count)}</TableCell>
                  {scope === "category" ? (
                    <TableCell className="align-top text-right tabular-nums text-sm">{n(t.distinct_products?.count)}</TableCell>
                  ) : (
                    <TableCell className="align-top text-right tabular-nums text-sm" title="Other products where the same theme was found">
                      {t.category_context ? (t.category_context.other_products ? `${n(t.category_context.other_products)} products` : "only here") : "–"}
                    </TableCell>
                  )}
                  <TableCell className="align-top text-right tabular-nums text-sm">{n(t.verified_count)}</TableCell>
                  <TableCell
                    className={cn("align-top text-right tabular-nums text-sm", conflict > 0 && "text-chart-2")}
                    title={t.counter_evidence?.paired_theme_labels?.length ? `Opposite: ${t.counter_evidence.paired_theme_labels.join(", ")}` : undefined}
                  >
                    {conflict > 0 ? n(conflict) : "–"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {filtered.length > limit && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
          {showAll ? "Show fewer" : `Show all ${filtered.length} themes`}
        </button>
      )}
    </div>
  );
}

export function ReviewEvidence({
  ledger,
  themes,
  domainBreakdown,
  scope,
  status,
}: {
  ledger: ReviewLedger;
  themes: ReviewTheme[];
  domainBreakdown?: DomainBreakdownRow[];
  scope: "category" | "product";
  status?: "complete" | "partial" | "deterministic_only";
}) {
  return (
    <div className="space-y-4">
      <ReviewLedgerChips ledger={ledger} scope={scope} />
      {themes.length > 0 ? (
        <ReviewThemeTable themes={themes} scope={scope} />
      ) : (
        <p className="text-sm text-muted-foreground/80">
          {status === "deterministic_only"
            ? "Themes were not generated for this run (keyword pass only) — see the issue-type counts."
            : "No recurring themes were found in these reviews."}
        </p>
      )}
      {scope === "category" && domainBreakdown && <DomainBreakdown rows={domainBreakdown} />}
      <p className="text-[11px] text-muted-foreground">
        Counts are unique reviews. Products count variants that share one review pool once. "Conflicting" counts reviews that report the opposite
        experience — a theme with many is a split experience, not a verdict. A theme marked "1 product only" is not a category conclusion.
      </p>
    </div>
  );
}
