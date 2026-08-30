/**
 * CockpitHero — "Cockpit Split" redesign of the category header + Scout
 * Pipeline section (replaces HeroHeader + PipelineCollapsible on Dashboard).
 *
 * Left panel: real `BrandCard` identity surface — score dial, category name,
 * verdict pill, clamped strategy + "Read full strategy" modal, top-brand
 * thumbnails. Right panel: a tiny 12-phase micro-grid + coverage meters,
 * expanding into the existing detailed PipelineStatus/OcrCoveragePanel.
 *
 * HONEST-DATA RULE: category_analyses can be entirely missing for a category
 * that already has a real formula_briefs row (confirmed live: Apple Cider
 * Vinegar Gummies has 0 category_analyses rows but a full formula brief) —
 * rendering `opportunity_index || 0` in that case reads as a real "0.0 Tier D
 * (Poor)" score next to a real strategy, which is a lie. When that happens
 * this shows "—" / "Pending refresh" instead of a fabricated score.
 */
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandCard } from "@/components/ui/brand-card";
import { DocumentModal } from "@/components/ui/document-modal";
import { MarkdownDoc } from "@/lib/markdownDoc";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Search, ChevronsUpDown, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PHASE_META, PipelineStatus } from "@/components/dashboard/PipelineStatus";
import { OcrCoveragePanel } from "@/components/dashboard/OcrCoveragePanel";
import { usePipelineStatus } from "@/hooks/usePipelineStatus";
import { useActiveScoutJobs } from "@/hooks/useScoutJobs";
import { useOcrCoverage } from "@/hooks/useOcrCoverage";
import type { CategoryAnalysis } from "@/hooks/useCategoryAnalyses";
import type { FormulaBriefData } from "@/hooks/useFormulaBrief";

interface TopProduct {
  main_image_url: string | null;
  brand: string | null;
  title: string | null;
}

interface CockpitHeroProps {
  categoryId: string;
  categoryName: string;
  analysis: CategoryAnalysis | null | undefined;
  analysisLoading: boolean;
  formulaBrief: FormulaBriefData | null | undefined;
  topProducts?: TopProduct[];
}

const TIER_VERDICT: Record<string, string> = {
  A: "Strong opportunity",
  B: "Worth pursuing",
  C: "Fair opportunity",
  D: "Weak opportunity",
};

function IdentityPanel({ categoryName, analysis, analysisLoading, formulaBrief, topProducts = [] }: Omit<CockpitHeroProps, "categoryId">) {
  const [strategyOpen, setStrategyOpen] = useState(false);
  const cleanCategoryName = categoryName.replace(/^=+/, "").trim();

  // See file header — a missing category_analyses row next to a real
  // formula brief is a pending-refresh state, not a genuine zero score.
  const hasRealScore = !!analysis;
  const hasBrief = !!(formulaBrief?.positioning || formulaBrief?.ingredients?.final_formula_brief || formulaBrief?.ingredients?.ai_generated_brief_claude);

  const rawIndex = analysis?.opportunity_index ?? null;
  const score10 = rawIndex != null ? (rawIndex > 10 ? rawIndex / 10 : rawIndex) : null;
  const dialPct = score10 != null ? Math.min(100, Math.max(0, score10 * 10)) : 0;
  const displayScore = score10 != null ? score10.toFixed(1) : "—";

  const verdict = hasRealScore
    ? (analysis?.opportunity_tier && TIER_VERDICT[analysis.opportunity_tier]) || analysis?.opportunity_tier_label || "Analyzed"
    : hasBrief
      ? "Pending refresh"
      : "Awaiting data";

  const strategyText = formulaBrief?.positioning || analysis?.executive_summary || null;

  return (
    <BrandCard even className="flex flex-col p-4 gap-3 h-full">
      {isLoadingState(analysisLoading) ? (
        <>
          <Skeleton className="h-20 w-20 rounded-full mx-auto bg-white/10" />
          <Skeleton className="h-5 w-32 mx-auto bg-white/10" />
        </>
      ) : (
        <>
          {/* Score dial — SVG donut stroke. The previous conic-gradient +
              semi-transparent overlay let the neon wedge bleed through the
              center, reading as an ugly "pie chart" (user report). An SVG
              ring keeps the center transparent so the BrandCard gradient
              shows through, with a crisp 5px neon arc. */}
          <div className="relative h-20 w-20 shrink-0 mx-auto">
            <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
              <circle cx="40" cy="40" r="35" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="5" />
              {dialPct > 0 && (
                <circle
                  cx="40" cy="40" r="35" fill="none"
                  stroke="hsl(var(--brand-neon))" strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={`${(dialPct / 100) * 2 * Math.PI * 35} ${2 * Math.PI * 35}`}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold tabular-nums text-white leading-none">{displayScore}</span>
              <span className="text-[8px] uppercase tracking-wide text-white/50 mt-1">
                {hasRealScore ? "Opportunity" : "Pending refresh"}
              </span>
            </div>
          </div>

          {/* Category name + verdict */}
          <div className="text-center space-y-1.5">
            <h1 className="text-base font-semibold tracking-tight text-white leading-tight">{cleanCategoryName}</h1>
            <span className="inline-flex items-center h-5 px-2.5 rounded-full bg-white/10 text-white/80 text-[11px] font-medium">
              {verdict}
            </span>
          </div>

          {/* Strategy, clamped */}
          {strategyText && (
            <div className="space-y-1.5 pt-1 border-t border-white/10">
              <p className="text-[12px] leading-relaxed text-white/70 line-clamp-3">{strategyText}</p>
              <button
                className="pearl-quiet w-full h-7 text-[11px] justify-center"
                onClick={() => setStrategyOpen(true)}
              >
                Read full strategy
                <ArrowRight className="w-3 h-3 ml-1" />
              </button>
            </div>
          )}

          {/* Top brands */}
          {topProducts.length > 0 && (
            <div className="pt-1 border-t border-white/10 space-y-1.5">
              <p className="text-[10px] font-medium text-white/50 uppercase tracking-wide">Top Brands</p>
              <div className="flex -space-x-3">
                {topProducts.slice(0, 4).map((p, i) => (
                  <div
                    key={i}
                    title={p.brand || "Product"}
                    className="w-9 h-9 rounded-lg ring-1 ring-white/20 bg-black/40 overflow-hidden shrink-0"
                  >
                    {p.main_image_url ? (
                      <img src={p.main_image_url} alt={p.brand || "Product"} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/50 text-[10px] font-medium">
                        {(p.brand || "P").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                ))}
                {topProducts.length > 4 && (
                  <div className="w-9 h-9 rounded-lg ring-1 ring-white/20 bg-white/10 shrink-0 flex items-center justify-center text-white/70 text-[10px] font-bold">
                    +{topProducts.length - 4}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <DocumentModal
        open={strategyOpen}
        onOpenChange={setStrategyOpen}
        title={`${cleanCategoryName} — Strategy`}
        subtitle={hasRealScore ? verdict : "Full formula strategy — opportunity score is pending a category-analysis refresh."}
        chips={hasRealScore && score10 != null ? [{ label: "Opportunity", value: `${displayScore}/10` }] : undefined}
      >
        {strategyText ? (
          <MarkdownDoc content={strategyText} />
        ) : (
          <p className="text-sm text-muted-foreground">No strategy text available yet.</p>
        )}
      </DocumentModal>
    </BrandCard>
  );
}

function isLoadingState(loading: boolean) {
  return loading;
}

type MicroStatus = "done" | "partial" | "running" | "next";

function PipelineMicroGrid({ categoryId, categoryName, open, onExpand }: { categoryId: string; categoryName: string; open: boolean; onExpand: () => void }) {
  const { data: phases, isLoading } = usePipelineStatus(categoryId, categoryName);
  const { data: activeJobs } = useActiveScoutJobs();
  const { data: ocr } = useOcrCoverage(categoryId);

  const normKw = (s: string | null | undefined) => (s || "").replace(/^[=\s]+/, "").trim().toLowerCase();
  const activeJob = (activeJobs ?? []).find(
    (j) => normKw(j.keyword) === normKw(categoryName) && (j.status === "running" || j.status === "claimed")
  );
  const runningPhaseNum = activeJob?.current_phase ?? null;

  if (isLoading || !phases) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-1.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const doneCount = phases.filter((p) => p.status === "complete").length;

  return (
    // h-full + auto-rows-fr: the phase tiles stretch to fill the panel's
    // height (matching the BrandCard next to it) and the meters sit at the
    // bottom — no dead whitespace when the identity panel is taller.
    <div className="h-full flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-1.5 flex-1 auto-rows-fr">
        {phases.map((phase) => {
          const meta = PHASE_META[phase.phase];
          const isRunning = runningPhaseNum === phase.phase;
          let statusKind: MicroStatus = "next";
          let statusText = "Next";
          let statusClass = "text-muted-foreground";

          if (isRunning) {
            statusKind = "running";
            statusText = "Running";
            statusClass = "text-foreground";
          } else if (phase.status === "complete") {
            statusKind = "done";
            // P1 (Amazon Scrape) reads better as a raw product count; every
            // other phase reads better as a coverage percentage.
            statusText = phase.phase === 1 ? `${phase.complete.toLocaleString()} · Done` : `${phase.pct}% · Done`;
            statusClass = "text-chart-4";
          } else if (phase.status === "partial") {
            statusKind = "partial";
            statusText = `${phase.pct}% · Partial`;
            statusClass = "text-chart-2";
          }

          return (
            <button
              key={phase.phase}
              type="button"
              onClick={onExpand}
              className="text-left bg-card border border-border rounded-lg p-2 flex flex-col gap-1 justify-center min-w-0 h-full transition-colors hover:bg-muted/40"
            >
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-[10px] font-bold text-muted-foreground tracking-wide shrink-0">P{phase.phase}</span>
                <span className="text-[11px] font-medium text-foreground truncate">{meta?.shortLabel}</span>
                {statusKind === "running" && (
                  <span className="relative flex h-1.5 w-1.5 shrink-0 ml-auto">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--brand-neon))] opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--brand-neon))]" />
                  </span>
                )}
              </div>
              <span className={cn("text-[10px] font-medium tabular-nums", statusClass)}>{statusText}</span>
            </button>
          );
        })}
      </div>

      {/* Coverage meters — always visible, 6px bars, iris fill on smoke track */}
      {ocr && ocr.total > 0 && (
        <div className="space-y-2.5">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Formula data</span>
              <span className="font-medium text-foreground tabular-nums">
                {ocr.withOcr}/{ocr.total} · {ocr.pct}%
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-[hsl(var(--brand-smoke))]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${ocr.pct}%`,
                  background: `linear-gradient(90deg, hsl(var(--brand-electric)), var(--brand-iris-purple))`,
                }}
              />
            </div>
          </div>
          {ocr.top50Total > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Top-{ocr.top50Total} best sellers</span>
                <span className="font-medium text-foreground tabular-nums">
                  {ocr.top50WithOcr}/{ocr.top50Total} · {ocr.top50Pct}%
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-[hsl(var(--brand-smoke))]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${ocr.top50Pct}%`,
                    background: `linear-gradient(90deg, hsl(var(--brand-electric)), var(--brand-iris-purple))`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {doneCount}/{phases.length} phases complete
      </p>
    </div>
  );
}

export function CockpitHero({ categoryId, categoryName, analysis, analysisLoading, formulaBrief, topProducts = [] }: CockpitHeroProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const { data: phases } = usePipelineStatus(categoryId, categoryName);
  const doneCount = phases?.filter((p) => p.status === "complete").length ?? 0;
  const totalCount = phases?.length ?? 12;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-3 items-stretch">
      <IdentityPanel
        categoryName={categoryName}
        analysis={analysis}
        analysisLoading={analysisLoading}
        formulaBrief={formulaBrief}
        topProducts={topProducts}
      />

      <div className="rounded-xl border border-border bg-card p-3.5 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setDetailOpen((o) => !o)}
          className="flex items-center justify-between gap-2 w-full text-left"
        >
          <span className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" /> Scout Pipeline
          </span>
          <span className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground tabular-nums">{doneCount}/{totalCount}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </button>

        <div className="flex-1 min-h-0">
          <PipelineMicroGrid
            categoryId={categoryId}
            categoryName={categoryName}
            open={detailOpen}
            onExpand={() => setDetailOpen(true)}
          />
        </div>

        <Collapsible open={detailOpen} onOpenChange={setDetailOpen}>
          <CollapsibleContent className="pt-1 space-y-2 border-t border-border/60 mt-1">
            <PipelineStatus categoryId={categoryId} keyword={categoryName} />
            <OcrCoveragePanel categoryId={categoryId} keyword={categoryName} />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
