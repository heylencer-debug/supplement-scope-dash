/**
 * OcrCoveragePanel
 * Shows formula / OCR coverage for a category inside the Pipeline card.
 * Red alert if any top-10 BSR products are missing formula data.
 * Collapsible table of all missing products with fix command.
 */

import { useState } from "react";
import { useOcrCoverage } from "@/hooks/useOcrCoverage";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AlertTriangle, ChevronDown, ChevronUp, FlaskConical, Terminal, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  categoryId: string;
  keyword: string;
}

export function OcrCoveragePanel({ categoryId, keyword }: Props) {
  const { data, isLoading } = useOcrCoverage(categoryId);
  const [tableOpen, setTableOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-2 pt-3">
        <Skeleton className="h-4 w-44 rounded" />
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
    );
  }

  if (!data || data.total === 0) return null;

  const pct = data.pct;
  const barColor = pct >= 90 ? "bg-chart-4" : pct >= 70 ? "bg-chart-2" : "bg-destructive";
  const badgeVariant = pct >= 90
    ? "bg-chart-4/10 text-chart-4 border-chart-4/30"
    : pct >= 70
    ? "bg-chart-2/10 text-chart-2 border-chart-2/30"
    : "bg-destructive/10 text-destructive border-destructive/30";

  return (
    <div className="space-y-3 pt-4 border-t border-border/40">

      {/* Header */}
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold text-foreground">Formula / OCR Coverage</span>
        <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wide", badgeVariant)}>
          {pct}%
        </span>
      </div>

      {/* Critical alert — top-10 BSR has gaps */}
      {data.top10Missing.length > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            <strong>{data.top10Missing.length} top-10 BSR</strong> {data.top10Missing.length === 1 ? "product is" : "products are"} missing formula data:{" "}
            <span className="font-medium">{data.top10Missing.map(p => p.brand || p.asin).slice(0, 3).join(", ")}</span>
            {data.top10Missing.length > 3 && <span className="opacity-70"> +{data.top10Missing.length - 3} more</span>}
          </span>
        </div>
      )}

      {/* Overall bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{data.withOcr} / {data.total} products have formula data</span>
          <span className="font-semibold text-foreground">{pct}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Top-50 sub-bar */}
      {data.top50Total > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Top-{data.top50Total} BSR: {data.top50WithOcr} / {data.top50Total} have formula data</span>
            <span className="font-semibold text-foreground">{data.top50Pct}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all",
                data.top50Pct >= 90 ? "bg-chart-4" : data.top50Pct >= 70 ? "bg-chart-2" : "bg-destructive"
              )}
              style={{ width: `${data.top50Pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Missing products table */}
      {data.missingProducts.length > 0 ? (
        <Collapsible open={tableOpen} onOpenChange={setTableOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground px-2">
              {tableOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {tableOpen ? "Hide" : "Show"} {data.missingProducts.length} products missing OCR
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-3">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Rank</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Brand</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">ASIN</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Title</th>
                  </tr>
                </thead>
                <tbody>
                  {data.missingProducts.map((p) => (
                    <tr
                      key={p.asin}
                      className={cn(
                        "border-b border-border/50 hover:bg-muted/30 transition-colors",
                        p.bsrRank <= 10 && "bg-destructive/5"
                      )}
                    >
                      <td className="px-3 py-2">
                        <Badge
                          variant={p.bsrRank <= 10 ? "destructive" : "secondary"}
                          className="text-[10px] h-5 px-1.5"
                        >
                          #{p.bsrRank}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-medium max-w-[120px] truncate">{p.brand ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[10px] text-primary">{p.asin}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">
                        {p.title ? (p.title.length > 55 ? p.title.slice(0, 55) + "…" : p.title) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Fix command */}
            <div className="rounded-lg border border-border bg-muted/60 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                <Terminal className="h-3 w-3" />
                Re-scrape missing products (P1 → P4)
              </div>
              <code className="block text-[11px] font-mono text-foreground break-all select-all">
                node run-pipeline.js --keyword "{keyword}" --from 1 --force
              </code>
              <p className="text-[10px] text-muted-foreground">
                Products not in dovive_research need a full re-scrape. P4 text-extract is idempotent — already-done products are skipped.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <div className="flex items-center gap-2 text-[11px] text-chart-4 font-medium">
          <CheckCircle2 className="h-3.5 w-3.5" />
          All {data.total} products have formula data extracted.
        </div>
      )}
    </div>
  );
}
