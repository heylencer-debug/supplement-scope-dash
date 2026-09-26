/**
 * MarketingAssets — the P7b view: what competitors' listing images actually
 * say (vision read of gallery + A+ images, counted per product) and which
 * claimed benefits customers experience vs which are only claimed.
 *   - MarketingAssetsCategory (Market tab card): ledger, recurring messages,
 *     promises, audience, use cases, comparison-table claims, packaging, and
 *     the experienced-vs-claimed table with verdict chips;
 *   - ProductMarketingAssets (product modal): ledger, gallery thumbnails with
 *     the copy and messages seen on each, audience / promise / use cases.
 * Pure presentation: data comes from useMarketingAssets / useProductMarketingAssets.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  AssetLedger,
  ExperiencedVsClaimed,
  ExperiencedVsClaimedItem,
  MarketingAssetsCategoryRow,
  MarketingAssetsProductRow,
  MessageCluster,
  SeenOn,
  Verdict,
} from "@/hooks/useMarketingAssets";

const nf = new Intl.NumberFormat("en-US");
const n = (v: number | null | undefined) => (v == null ? "–" : nf.format(v));

function Chip({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-3.5 py-2 rounded-lg bg-muted/50 min-w-[110px]">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground tabular-nums">{sub}</span>}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">{children}</p>;
}

export function AssetLedgerChips({ ledger, scope }: { ledger: AssetLedger; scope: "category" | "product" }) {
  const aplusImgs = ledger.a_plus_images_available ?? 0;
  const lowerBound = (ledger.products_failed ?? 0) + (ledger.products_not_attempted ?? 0);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {scope === "category" && (
          <Chip
            label="Products"
            value={`${n(ledger.products_analyzed)} / ${n(ledger.products)}`}
            sub={ledger.scope?.mode === "selection" ? "selected competitors" : ledger.scope?.mode === "top_bsr" ? "top by BSR" : "analysed"}
          />
        )}
        <Chip
          label="Images read"
          value={`${n(ledger.images_analyzed)} / ${n(ledger.images_available)}`}
          sub={`${n(ledger.gallery_images_available)} gallery · ${n(aplusImgs)} A+ · ${n(ledger.brand_story_images_available)} brand`}
        />
        <Chip
          label="A+ content"
          value={scope === "category" ? `${n(ledger.a_plus_available)} products` : ledger.a_plus_available ? "Yes" : ledger.a_plus_unknown ? "Unknown" : "No"}
          sub={`${n(ledger.a_plus_images_analyzed)} of ${n(aplusImgs)} A+ images read`}
        />
        <Chip label="Videos" value={`${n(ledger.videos_analyzed ?? 0)} / ${n(ledger.videos_available ?? 0)}`} sub="inventoried, not analysed" />
        <Chip label="Dropped" value={n(ledger.claims_dropped_unevidenced ?? 0)} sub="claims with no image evidence" />
      </div>
      {lowerBound > 0 && (
        <p className="text-xs text-chart-2">
          {n(ledger.products_failed ?? 0)} products failed and {n(ledger.products_not_attempted ?? 0)} were not attempted — counts below are a lower bound.
        </p>
      )}
      {(ledger.videos_available ?? 0) > 0 && ledger.videos_note && <p className="text-[11px] text-muted-foreground">{ledger.videos_note}</p>}
    </div>
  );
}

const SEEN_LABEL: Record<string, string> = { main: "main", gallery: "gallery", "a+": "A+", brand: "brand story" };

function SeenOnLine({ seen }: { seen?: SeenOn }) {
  const parts = Object.entries(seen ?? {}).filter(([, v]) => v && v > 0);
  if (!parts.length) return <span className="text-muted-foreground">–</span>;
  return (
    <span className="flex flex-wrap gap-1 justify-end">
      {parts.map(([k, v]) => (
        <Badge key={k} variant="outline" className="text-[10px] tabular-nums whitespace-nowrap">{SEEN_LABEL[k] ?? k} {n(v)}</Badge>
      ))}
    </span>
  );
}

function CountTable({
  title, rows, total, withSeen, extra, limit = 10,
}: {
  title: string;
  rows: MessageCluster[];
  total: number;
  withSeen?: boolean;
  extra?: (r: MessageCluster) => React.ReactNode;
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, limit);
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[52%]">{title.split(" (")[0]}</TableHead>
            <TableHead className="text-right">Products</TableHead>
            {withSeen && <TableHead className="text-right">Where seen (products)</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((r, i) => (
            <TableRow key={`${r.label}-${i}`}>
              <TableCell className="align-top">
                <span className="text-sm font-medium text-foreground">{r.label}</span>
                {r.variants && r.variants.length > 0 && r.variants[0] !== r.label && (
                  <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-2">"{r.variants.slice(0, 2).join('" · "')}"</p>
                )}
                {extra?.(r)}
              </TableCell>
              <TableCell className="align-top text-right tabular-nums text-sm">
                {n(r.products)} <span className="text-muted-foreground text-xs">/ {n(total)}</span>
              </TableCell>
              {withSeen && <TableCell className="align-top text-right text-sm"><SeenOnLine seen={r.seen_on} /></TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > limit && (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 mt-1">
          {all ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}

const VERDICT: Record<Verdict, { label: string; cls: string; hint: string }> = {
  experienced: { label: "Experienced", cls: "border-chart-4/40 text-chart-4 bg-chart-4/10", hint: "A customer praise theme backs this claim" },
  claimed_only: { label: "Claimed only", cls: "border-chart-2/40 text-chart-2 bg-chart-2/10", hint: "Claiming products have reviews, but no review theme mentions it" },
  contradicted: { label: "Contradicted", cls: "border-destructive/40 text-destructive bg-destructive/10", hint: "Complaint reviews on this topic outnumber praise" },
  no_review_signal: { label: "No review signal", cls: "border-border text-muted-foreground", hint: "No review synthesis, or none of the claiming products has analysed reviews" },
};

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  const v = VERDICT[verdict];
  return (
    <span title={v.hint} className={cn("inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap", v.cls)}>
      {v.label}
    </span>
  );
}

const SURFACE_LABEL: Record<ExperiencedVsClaimedItem["claim_surface"], string | null> = {
  shown_in_images: null,
  comparison_table_only: "comparison table only",
  comparison_table_and_bullets_only: "comparison table + bullets only",
  bullets_only: "bullets only",
};

export function ExperiencedVsClaimedTable({ evc, total }: { evc: ExperiencedVsClaimed; total: number }) {
  const [filter, setFilter] = useState<Verdict | "all">("all");
  const rows = filter === "all" ? evc.items : evc.items.filter((i) => i.verdict === filter);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn("px-2.5 py-1 rounded-md text-xs border", filter === "all" ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground")}
        >
          All ({evc.items.length})
        </button>
        {(Object.keys(VERDICT) as Verdict[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setFilter(v)}
            className={cn("px-2.5 py-1 rounded-md text-xs border", filter === v ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground")}
          >
            {VERDICT[v].label} ({evc.counts?.[v] ?? 0})
          </button>
        ))}
      </div>
      {!evc.available && (
        <p className="text-xs text-chart-2">No review synthesis for this category yet, so no claim can be confirmed or contradicted.</p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground/80 py-1">No claims in this view.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[30%]">Claimed benefit</TableHead>
              <TableHead className="text-right">Products claiming</TableHead>
              <TableHead className="w-[36%]">Review evidence</TableHead>
              <TableHead className="text-right">Verdict</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i, idx) => {
              const rs = i.review_support;
              const surface = SURFACE_LABEL[i.claim_surface];
              return (
                <TableRow key={`${i.claim}-${idx}`}>
                  <TableCell className="align-top">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{i.claim}</span>
                      {surface && <Badge variant="secondary" className="text-[10px]">{surface}</Badge>}
                    </div>
                    {i.variants && i.variants[0] && i.variants[0] !== i.claim && (
                      <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-2">"{i.variants.slice(0, 2).join('" · "')}"</p>
                    )}
                  </TableCell>
                  <TableCell className="align-top text-right tabular-nums text-sm">
                    {n(i.products_claiming)} <span className="text-muted-foreground text-xs">/ {n(total)}</span>
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {rs ? (
                      <>
                        <span className="text-foreground">"{rs.theme_label}"</span>{" "}
                        <span className="text-muted-foreground text-xs">
                          {rs.polarity} · {n(rs.review_count)} reviews · {n(rs.distinct_products)} products
                        </span>
                        <p className="text-[11px] text-muted-foreground mt-0.5" title="The lexical rule that matched this claim to the review theme">
                          matched by {rs.rule}
                          {i.verdict === "experienced" && i.complaint_reviews > 0 ? ` · ${n(i.complaint_reviews)} reviews say the opposite` : ""}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {i.verdict === "claimed_only"
                          ? `No matching theme, although ${n(i.claiming_products_with_reviews)} claiming products have analysed reviews`
                          : "No review data for the claiming products"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="align-top text-right"><VerdictChip verdict={i.verdict} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <p className="text-[11px] text-muted-foreground">
        A claim is matched to a review theme only by a named rule — a shared benefit synonym group, a shared specific review-lexicon term, or
        topic-word overlap. Attributes a customer cannot feel (Non-GMO, certifications, origin) are left out
        {evc.excluded_attribute_claims ? ` (${n(evc.excluded_attribute_claims)} excluded)` : ""}.
      </p>
    </div>
  );
}

export function MarketingAssetsCategory({ row }: { row: MarketingAssetsCategoryRow }) {
  const R = row.rollup;
  const total = R?.products_analyzed ?? row.ledger.products_analyzed ?? 0;
  const imageMessages = (R?.recurring_messages ?? []).filter((m) => Object.values(m.seen_on ?? {}).some((v) => (v ?? 0) > 0));
  return (
    <div className="space-y-5">
      <AssetLedgerChips ledger={row.ledger} scope="category" />
      {!R || !R.products_analyzed ? (
        <p className="text-sm text-muted-foreground/80">
          No images have been read yet{row.status === "inventory_only" ? " — only the asset inventory was built (no vision pass ran)" : ""}.
        </p>
      ) : (
        <>
          {row.experienced_vs_claimed && row.experienced_vs_claimed.items.length > 0 && (
            <div>
              <SectionLabel>Experienced vs claimed — claimed benefits checked against customer review themes</SectionLabel>
              <ExperiencedVsClaimedTable evc={row.experienced_vs_claimed} total={total} />
            </div>
          )}
          <CountTable title="Recurring messages (on the images)" rows={imageMessages} total={total} withSeen />
          <div className="grid gap-5 lg:grid-cols-2">
            <CountTable title="Main promises" rows={R.main_promises ?? []} total={total} limit={8} />
            <div>
              {(R.audience_segments ?? []).length > 0 && (
                <>
                  <SectionLabel>Target audience (from visual and verbatim cues)</SectionLabel>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Segment</TableHead>
                        <TableHead className="text-right">Products</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {R.audience_segments.slice(0, 10).map((s) => (
                        <TableRow key={s.segment}>
                          <TableCell className="align-top">
                            <span className="text-sm font-medium text-foreground">{s.segment}</span>
                            {s.unmatched && <Badge variant="outline" className="ml-1.5 text-[10px]">as described</Badge>}
                            {s.example_cues && s.example_cues.length > 0 && (
                              <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-2">"{s.example_cues.slice(0, 2).join('" · "')}"</p>
                            )}
                          </TableCell>
                          <TableCell className="align-top text-right tabular-nums text-sm">
                            {n(s.products)} <span className="text-muted-foreground text-xs">/ {n(total)}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </div>
          </div>
          <CountTable
            title="Demonstrated use cases"
            rows={R.use_cases ?? []}
            total={total}
            limit={8}
            extra={(r) => (r.evidence && r.evidence[0] ? <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">shown: {r.evidence[0]}</p> : null)}
          />
          <CountTable
            title="Comparison-table claims (asserted only in comparison charts)"
            rows={R.comparison_table_claims ?? []}
            total={total}
            limit={8}
            extra={(r) => (r.vs_who && r.vs_who.length ? <p className="text-xs text-muted-foreground mt-0.5">vs {r.vs_who.slice(0, 3).join(", ")}</p> : null)}
          />
          {R.packaging && ((R.packaging.formats ?? []).length > 0 || (R.packaging.certifications_shown ?? []).length > 0) && (
            <div>
              <SectionLabel>Packaging seen on the images</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {(R.packaging.formats ?? []).slice(0, 6).map((f) => <Badge key={`f-${f.value}`} variant="outline" className="text-[11px]">{f.value} · {n(f.products)}</Badge>)}
                {(R.packaging.colours ?? []).slice(0, 6).map((c) => <Badge key={`c-${c.value}`} variant="secondary" className="text-[11px]">{c.value} · {n(c.products)}</Badge>)}
                {(R.packaging.certifications_shown ?? []).slice(0, 8).map((c) => <Badge key={`s-${c.value}`} variant="outline" className="text-[11px]">seal: {c.value} · {n(c.products)}</Badge>)}
              </div>
            </div>
          )}
        </>
      )}
      <p className="text-[11px] text-muted-foreground">
        Counts are products. Every message is tied to the image it was read on; anything the model could not point to an image for was dropped.
        {row.model ? ` Vision model: ${row.model}.` : ""}
      </p>
    </div>
  );
}

export function ProductMarketingAssets({ row }: { row: MarketingAssetsProductRow }) {
  const a = row.analysis;
  const images = row.assets?.per_image ?? [];
  return (
    <div className="space-y-4">
      <AssetLedgerChips ledger={row.ledger} scope="product" />
      {row.status !== "complete" && (
        <p className="text-xs text-chart-2">
          {row.status === "failed" ? "The vision read failed for this product; it is retried on the next run." :
            row.status === "not_attempted" ? "Not read yet (the run stopped before this product); it resumes next run." :
              row.status === "no_images" ? "No listing images were found for this product." :
                "Inventory only — no vision pass ran for this product."}
        </p>
      )}
      {images.length > 0 && (
        <div>
          <SectionLabel>Images read — with the copy and messages seen on each</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {images.map((img) => (
              <div key={img.label} className="rounded-lg border border-border/60 overflow-hidden bg-card">
                <a href={img.url} target="_blank" rel="noopener noreferrer" className="block bg-muted/40">
                  <img src={img.url} alt={img.label} loading="lazy" className="w-full h-28 object-contain" />
                </a>
                <div className="p-2 space-y-1">
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px]">{img.label}</Badge>
                    {img.unreadable && <Badge variant="secondary" className="text-[10px]">unreadable</Badge>}
                  </div>
                  {img.messages.map((m) => <p key={m} className="text-xs font-medium text-foreground leading-snug">{m}</p>)}
                  {img.comparison_claims.map((c) => <p key={c} className="text-xs text-chart-2 leading-snug">table: {c}</p>)}
                  {img.text_seen.slice(0, 2).map((t) => <p key={t} className="text-[11px] text-muted-foreground italic leading-snug line-clamp-3">"{t}"</p>)}
                  {!img.messages.length && !img.text_seen.length && !img.comparison_claims.length && (
                    <p className="text-[11px] text-muted-foreground/70">nothing recorded</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {a && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <SectionLabel>Main promise</SectionLabel>
            <p className="text-sm text-foreground">{a.main_promise ? <>{a.main_promise.text} <span className="text-xs text-muted-foreground">({a.main_promise.where_seen})</span></> : "–"}</p>
          </div>
          <div className="space-y-1">
            <SectionLabel>Target audience</SectionLabel>
            <p className="text-sm text-foreground">{a.target_audience?.who ?? "–"}</p>
            {a.target_audience?.cues?.length ? <p className="text-xs text-muted-foreground italic">"{a.target_audience.cues.slice(0, 3).join('" · "')}"</p> : null}
          </div>
          <div className="space-y-1">
            <SectionLabel>Demonstrated use cases</SectionLabel>
            {a.demonstrated_use_cases.length ? a.demonstrated_use_cases.map((u) => (
              <p key={u.use_case} className="text-sm text-foreground">{u.use_case} <span className="text-xs text-muted-foreground">— {u.evidence}{u.seen_on.length ? ` (${u.seen_on.join(", ")})` : ""}</span></p>
            )) : <p className="text-sm text-muted-foreground">–</p>}
          </div>
          <div className="space-y-1">
            <SectionLabel>On the pack</SectionLabel>
            <p className="text-sm text-foreground">{a.packaging.format ?? "–"}{a.packaging.colours.length ? <span className="text-xs text-muted-foreground"> · {a.packaging.colours.join(", ")}</span> : null}</p>
            <div className="flex flex-wrap gap-1">
              {a.packaging.claims_on_pack.map((c) => <Badge key={c.claim} variant="outline" className="text-[10px]">{c.claim}</Badge>)}
              {a.packaging.certifications_shown.map((c) => <Badge key={c.name} variant="secondary" className="text-[10px]">seal: {c.name}</Badge>)}
            </div>
          </div>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Read from the listing images by {row.model ?? "the vision pass"} on {new Date(row.generated_at).toLocaleDateString()}. Claims without an image label were dropped
        {a?.validation?.dropped_total ? ` (${n(a.validation.dropped_total)} here)` : ""}.
      </p>
    </div>
  );
}
