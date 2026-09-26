/**
 * Market tab: "Web evidence" — the P5b category web research. Shows how much
 * of the web was actually read (ledger), every source with who is speaking
 * (independent / brand-owned / affiliate / sponsored) and whether it is a copy,
 * and the roll-up of claims counted by distinct websites per owner type.
 * Renders one honest line when the research has not been generated yet.
 */
import { Fragment, useMemo, useState } from "react";
import { Globe, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  useWebResearch,
  type Ownership,
  type PageType,
  type RollupRow,
  type WebLedger,
  type WebResearchRow,
  type WebSource,
} from "@/hooks/useWebResearch";

const OWNER_LABEL: Record<Ownership, string> = {
  independent: "Independent",
  brand_owned: "Brand-owned",
  affiliate: "Affiliate",
  sponsored: "Sponsored",
  unknown: "Unlabelled",
};

const OWNER_CLASS: Record<Ownership, string> = {
  independent: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  brand_owned: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  affiliate: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  sponsored: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

const TYPE_LABEL: Record<PageType, string> = {
  review_article: "Review",
  comparison: "Comparison",
  category_guide: "Guide",
  specialist_blog: "Specialist",
  brand_page: "Brand page",
  retailer: "Retailer",
  forum: "Forum",
  news: "News",
  other: "Other",
};

type RollupKind = "ingredient_claims" | "comparison_criteria" | "strengths" | "weaknesses";
const KIND_LABEL: Record<RollupKind, string> = {
  ingredient_claims: "Ingredient claims",
  comparison_criteria: "Comparison criteria",
  strengths: "Strengths",
  weaknesses: "Weaknesses",
};

const nf = new Intl.NumberFormat("en-US");
const n = (v: number | null | undefined) => (v == null ? "–" : nf.format(v));
const sum = (o?: Record<string, number>) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);

function Chip({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-3.5 py-2 rounded-lg bg-muted/50 min-w-[110px]">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">{value}</span>
      {sub && <span className="text-[11px] text-muted-foreground tabular-nums">{sub}</span>}
    </div>
  );
}

function OwnerBadge({ ownership, source }: { ownership: Ownership; source?: WebSource }) {
  const badge = (
    <Badge variant="outline" className={cn("text-[10px] font-medium whitespace-nowrap", OWNER_CLASS[ownership])}>
      {OWNER_LABEL[ownership]}
    </Badge>
  );
  const markers = source?.ownership_markers ?? [];
  if (!markers.length) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span>{badge}</span></TooltipTrigger>
      <TooltipContent className="max-w-sm text-xs space-y-1">
        {markers.slice(0, 4).map((m, i) => (
          <div key={i}>
            <span className="font-medium">{OWNER_LABEL[m.kind] ?? m.kind}:</span> {m.marker}
            {m.snippet && <div className="text-muted-foreground truncate">{m.snippet}</div>}
          </div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

function Ledger({ ledger, status }: { ledger: WebLedger; status: WebResearchRow["status"] }) {
  const own = ledger.by_ownership ?? {};
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Chip label="Searches" value={`${n(ledger.queries_run)} / ${n(ledger.queries_planned)}`} sub={ledger.queries_failed ? `${ledger.queries_failed} failed` : undefined} />
        <Chip label="Sources found" value={n(ledger.sources_found)} sub={sum(ledger.sources_skipped) ? `${sum(ledger.sources_skipped)} not fetched` : undefined} />
        <Chip label="Pages read" value={n(ledger.fetched)} sub={[ledger.fetch_failed ? `${ledger.fetch_failed} failed` : null, ledger.robots_disallowed ? `${ledger.robots_disallowed} robots` : null].filter(Boolean).join(" · ") || undefined} />
        <Chip label="Extracted" value={n(ledger.extracted)} sub={sum(ledger.items_dropped_unquoted) ? `${sum(ledger.items_dropped_unquoted)} unquoted items dropped` : undefined} />
        <Chip label="Copies removed" value={n(ledger.duplicates_removed)} sub={ledger.copied_marketing_quotes ? `${ledger.copied_marketing_quotes} Amazon-copy quotes` : undefined} />
        <Chip label="Cost" value={ledger.cost_usd?.total != null ? `$${ledger.cost_usd.total.toFixed(2)}` : "–"} sub={ledger.model ?? undefined} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span>Counted pages by owner:</span>
        {(Object.keys(OWNER_LABEL) as Ownership[]).map((o) => (
          <Badge key={o} variant="outline" className={cn("text-[10px]", OWNER_CLASS[o])}>{OWNER_LABEL[o]} {own[o] ?? 0}</Badge>
        ))}
        {status !== "complete" && (
          <span className="text-amber-600 dark:text-amber-400">
            · {status === "no_model" ? "sources classified only — claims not extracted yet" : `partial run${ledger.stopped ? ` (${ledger.stopped})` : ""}`}
          </span>
        )}
      </div>
    </div>
  );
}

function RollupTable({ rows, kind }: { rows: RollupRow[]; kind: RollupKind }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!rows.length) return <p className="text-sm text-muted-foreground/80 py-3">Nothing extracted for this category yet.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{kind === "comparison_criteria" ? "Criterion" : kind === "ingredient_claims" ? "Claim" : "Point"}</TableHead>
          <TableHead className="text-right">Independent</TableHead>
          <TableHead className="text-right">Brand-owned</TableHead>
          <TableHead className="text-right">Affiliate / sponsored</TableHead>
          <TableHead className="text-right">Not counted</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 40).map((r, i) => (
          <Fragment key={i}>
            <TableRow className="cursor-pointer" onClick={() => setOpen(open === i ? null : i)}>
              <TableCell className="max-w-[420px]">
                <div className="font-medium text-sm">{r.label}</div>
                <div className="text-[11px] text-muted-foreground">
                  {[r.ingredient, r.product, ...(r.products ?? []).filter((p) => p !== r.product)].filter(Boolean).slice(0, 4).join(" · ")}
                </div>
              </TableCell>
              <TableCell className={cn("text-right tabular-nums", r.independent_sources ? "font-semibold text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>{r.independent_sources}</TableCell>
              <TableCell className="text-right tabular-nums">{r.brand_owned_sources}</TableCell>
              <TableCell className="text-right tabular-nums">{r.affiliate_sources + r.sponsored_sources}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{r.duplicate_sources_excluded + r.copied_marketing_excluded || "–"}</TableCell>
            </TableRow>
            {open === i && (
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell colSpan={5} className="space-y-1.5">
                  {(r.quotes ?? []).map((q, k) => (
                    <div key={k} className="text-xs flex gap-2 items-start">
                      <OwnerBadge ownership={q.ownership} />
                      <span className={cn("italic", q.excluded && "line-through text-muted-foreground")}>“{q.quote}”</span>
                      <a href={q.url} target="_blank" rel="noreferrer noopener" className="text-muted-foreground hover:text-foreground whitespace-nowrap">{q.domain}</a>
                      {q.excluded && <span className="text-muted-foreground whitespace-nowrap">({q.excluded === "duplicate" ? "syndicated copy" : "copied from Amazon listing"})</span>}
                    </div>
                  ))}
                </TableCell>
              </TableRow>
            )}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}

function SourcesTable({ sources }: { sources: WebSource[] }) {
  const [all, setAll] = useState(false);
  const fetched = sources.filter((s) => s.fetch_status === "fetched");
  const shown = all ? sources : fetched;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Sources</h4>
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setAll(!all)}>
          {all ? `Show pages read (${fetched.length})` : `Show all found (${sources.length})`}
        </button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Page</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.slice(0, 80).map((s) => (
            <TableRow key={s.url}>
              <TableCell className="max-w-[420px]">
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-sm font-medium hover:underline inline-flex items-center gap-1">
                  <span className="truncate max-w-[360px]">{s.title || s.url}</span>
                  <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground" />
                </a>
                <div className="text-[11px] text-muted-foreground">{s.domain}</div>
              </TableCell>
              <TableCell>
                {s.page_type ? <Badge variant="secondary" className="text-[10px]" title={s.page_type_evidence}>{TYPE_LABEL[s.page_type]}</Badge> : <span className="text-xs text-muted-foreground">–</span>}
              </TableCell>
              <TableCell>{s.ownership ? <OwnerBadge ownership={s.ownership} source={s} /> : <span className="text-xs text-muted-foreground">–</span>}</TableCell>
              <TableCell className="text-xs">
                {s.duplicate_of ? (
                  <Badge variant="outline" className="text-[10px] border-dashed" title={`${s.duplicate_kind} → ${s.duplicate_of}${s.duplicate_similarity != null ? ` (${Math.round(s.duplicate_similarity * 100)}% similar)` : ""}`}>
                    {s.duplicate_kind === "amazon_listing_copy" ? "Copy of Amazon listing" : "Syndicated copy"}
                  </Badge>
                ) : s.fetch_status === "fetched" ? (
                  <span className="text-muted-foreground">{s.extraction_status === "ok" ? "Read + extracted" : "Read"}</span>
                ) : (
                  <span className="text-muted-foreground">{s.skip_reason || s.fetch_error || s.fetch_status}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function WebEvidence({ row }: { row: WebResearchRow }) {
  const [kind, setKind] = useState<RollupKind>("ingredient_claims");
  const rows = useMemo(() => row.rollup?.[kind] ?? [], [row, kind]);
  const checks = (row.verification ?? []).filter((v) => v.status !== "not_checked");
  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-5">
        <Ledger ledger={row.ledger ?? {}} status={row.status} />
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(KIND_LABEL) as RollupKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn("text-xs px-2.5 py-1 rounded-md border", k === kind ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted")}
              >
                {KIND_LABEL[k]} ({row.rollup?.[k]?.length ?? 0})
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Counts are distinct websites. Only independent sources are evidence; syndicated copies and text copied from Amazon listings are not counted. Click a row for quotes.</p>
          <RollupTable rows={rows} kind={kind} />
        </div>
        {checks.length > 0 && (
          <div className="space-y-1.5">
            <h4 className="text-sm font-semibold">Claim checks against original sources</h4>
            {checks.map((v, i) => (
              <div key={i} className="text-xs flex flex-wrap gap-2 items-center">
                <Badge variant="outline" className={cn("text-[10px]", v.status === "supported" ? OWNER_CLASS.independent : OWNER_CLASS.sponsored)}>
                  {v.status === "supported" ? "Supported" : "Not found"}
                </Badge>
                <span>{v.claim}</span>
                {v.evidence_url && <a className="text-muted-foreground hover:underline" href={v.evidence_url} target="_blank" rel="noreferrer noopener">evidence</a>}
                {v.note && <span className="text-muted-foreground">— {v.note}</span>}
              </div>
            ))}
          </div>
        )}
        <SourcesTable sources={row.sources ?? []} />
      </div>
    </TooltipProvider>
  );
}

export function WebEvidenceCard({ categoryId, keyword }: { categoryId: string; keyword?: string | null }) {
  const { data, isLoading } = useWebResearch(categoryId, keyword);
  const generated = data?.generated_at ? new Date(data.generated_at).toLocaleDateString() : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Globe className="w-5 h-5 text-primary" />
          Web evidence
        </CardTitle>
        <CardDescription>
          Review articles, comparisons, guides, forums and brand pages, labelled by who is speaking
          {generated ? ` · updated ${generated}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[160px] w-full" />
        ) : !data ? (
          <p className="text-sm text-muted-foreground/80">Web evidence has not been generated for this category yet (runs after Deep Research).</p>
        ) : (
          <WebEvidence row={data} />
        )}
      </CardContent>
    </Card>
  );
}
