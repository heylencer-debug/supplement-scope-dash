/**
 * PipelineStatus — P1 through P10
 * Auto-refreshes every 30s. Shows live pulse on in-progress phases.
 * Design system tokens only.
 */

import { useState } from "react";
import { usePipelineStatus } from "@/hooks/usePipelineStatus";
import { useLatestJobForKeyword, useRerunFromPhase } from "@/hooks/useScoutJobs";
import { useAiUsageCost } from "@/hooks/useAiUsageCost";
import { SCOUT_PHASE_NAMES } from "@/types/scoutJobs";
import { humanizeJobError, deriveRetryPhase } from "@/lib/jobErrorMessages";
import { Skeleton } from "@/components/ui/skeleton";
import { PearlButton } from "@/components/ui/pearl-button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2, Circle, Clock, AlertCircle, RefreshCw, RotateCcw, FlaskConical, XCircle,
  ShoppingCart, BarChart3, MessageSquare, ScanText, Search,
  Dna, TrendingUp, Package, ClipboardList, CheckSquare, BarChart, Shield, Stamp,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineStatusProps {
  categoryId: string;
  keyword: string;
}

export const PHASE_META: Record<number, { icon: LucideIcon; shortLabel: string }> = {
  1:  { icon: ShoppingCart,   shortLabel: "Scrape"        },
  2:  { icon: BarChart3,      shortLabel: "Keepa"         },
  3:  { icon: MessageSquare,  shortLabel: "Reviews"       },
  4:  { icon: ScanText,       shortLabel: "OCR"           },
  5:  { icon: Search,         shortLabel: "Research"      },
  6:  { icon: Dna,            shortLabel: "Product AI"    },
  7:  { icon: TrendingUp,     shortLabel: "Market Intel"  },
  8:  { icon: Package,        shortLabel: "Packaging"     },
  9:  { icon: ClipboardList,  shortLabel: "Formula Brief" },
  10: { icon: CheckSquare,    shortLabel: "Formula QA"    },
  11: { icon: BarChart,       shortLabel: "Benchmark"     },
  12: { icon: Shield,         shortLabel: "FDA"           },
  13: { icon: Stamp,          shortLabel: "Sign-off"      },
};

type StatusKey = "complete" | "partial" | "not_started" | "pending";

const STATUS_CFG: Record<StatusKey, {
  bar: string;
  card: string;
  badge: string;
  label: string;
}> = {
  complete:    { bar: "bg-chart-4",              card: "border-border bg-card",                    badge: "bg-chart-4/10 text-chart-4 border-chart-4/30",         label: "Done"    },
  partial:     { bar: "bg-chart-2",              card: "border-border bg-card",                    badge: "bg-chart-2/10 text-chart-2 border-chart-2/30",         label: "Running" },
  not_started: { bar: "bg-muted-foreground/25",  card: "border-border bg-card",                     badge: "bg-muted text-muted-foreground border-border",         label: "Pending" },
  pending:     { bar: "bg-transparent",          card: "border-dashed border-border/40 opacity-45", badge: "bg-transparent text-muted-foreground/50 border-border/30", label: "TBD"  },
};

export function PipelineStatus({ categoryId, keyword }: PipelineStatusProps) {
  const { data: phases, isLoading, error, isFetching, dataUpdatedAt } = usePipelineStatus(categoryId, keyword);
  // "Running" must mean a REAL in-flight scout job for this keyword — not
  // "the data looks partial" (partial data is normal for capped phases like
  // reviews/OCR and for old categories; the widget used to pulse RUNNING
  // forever on finished categories because of that heuristic).
  //
  // 2026-09-02 UX fix: sourced from useLatestJobForKeyword (any status), not
  // useActiveScoutJobs (running/claimed only) — the latter meant a
  // freshly-queued rerun produced ZERO visible change here until a Cloud Run
  // execution actually claimed it, which is exactly the "not very UX
  // friendly" gap the user hit on their first real "Rerun from P3" click.
  // `activeJob` keeps its EXACT prior meaning (running/claimed) so every
  // existing render path below (the phase grid, the "Running" badge) is
  // unchanged; `latestJob` adds the queued/error visibility on top.
  const { data: latestJob } = useLatestJobForKeyword(keyword);
  const activeJob = latestJob && (latestJob.status === "running" || latestJob.status === "claimed") ? latestJob : undefined;
  const isQueued = latestJob?.status === "queued";
  // Any in-flight state (queued/claimed/running) — hides the per-phase rerun
  // icons AND the failure banner's retry action so a click can't race a job
  // that's already on its way.
  const hasInFlightJob = isQueued || !!activeJob;

  // "Rerun from here" (2026-09-02) — per-phase continuation via from_phase,
  // same pattern as "Generate formula brief" generalized to any phase. Cost
  // estimate is LEDGER-BASED: this category's own historical ai_usage_log
  // spend for every phase >= the rerun point (P1-P3 rarely appear — they're
  // scrape/sync phases with no AI calls, so they estimate at $0, which is
  // honest, not a bug). Real spend on a rerun can differ (fewer/more
  // products in scope, different model routing) — framed as an estimate,
  // never a guarantee.
  const [rerunPhase, setRerunPhase] = useState<number | null>(null);
  const rerun = useRerunFromPhase();
  const { data: aiCost } = useAiUsageCost(categoryId);
  const estimateRerunCost = (fromPhase: number): number => {
    if (!aiCost?.breakdown) return 0;
    return aiCost.breakdown
      .filter((r) => {
        const n = parseInt(r.phase.replace(/^P/i, ""), 10);
        return Number.isFinite(n) && n >= fromPhase;
      })
      .reduce((sum, r) => sum + (r.cost_usd || 0), 0);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !phases) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive p-3 bg-destructive/10 rounded-lg border border-destructive/20">
        <AlertCircle className="h-4 w-4 shrink-0" />Failed to load pipeline status
      </div>
    );
  }

  const completedCount = phases.filter(p => p.status === "complete").length;
  const runningPhaseNum = activeJob?.current_phase ?? null;
  const runningCount = activeJob ? 1 : 0;
  const overallPct     = Math.round((completedCount / phases.length) * 100);
  const lastUpdated    = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <div className="space-y-4">

      {/* Overall progress row */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-700"
            style={{ width: `${overallPct}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-foreground tabular-nums whitespace-nowrap">
          {completedCount}/{phases.length}
        </span>
        {/* Live refresh indicator */}
        <div className="flex items-center gap-1 shrink-0">
          {isFetching ? (
            <RefreshCw className="h-3 w-3 text-primary animate-spin" />
          ) : runningCount > 0 ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-chart-2 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-chart-2" />
            </span>
          ) : null}
          {lastUpdated && (
            <span className="text-[10px] text-muted-foreground hidden sm:block">{lastUpdated}</span>
          )}
        </div>
      </div>

      {/* "Queued — starting up…" (2026-09-02) — the click just landed and a
          Cloud Run execution hasn't claimed it yet. Distinct amber/flask
          treatment from the green "Running" badge below so a successful
          click is VISIBLY successful the instant it happens, not just once
          claim() fires (which can take a minute or two). */}
      {isQueued && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-chart-2/10 border border-chart-2/20 text-xs text-chart-2 font-medium">
          <FlaskConical className="h-3.5 w-3.5 shrink-0 animate-pulse" />
          Queued — starting up… usually claims within a minute or two.
        </div>
      )}

      {/* Live badge when a phase is running */}
      {runningCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-chart-2/10 border border-chart-2/20 text-xs text-chart-2 font-medium">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-chart-2 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-chart-2" />
          </span>
          Running{activeJob?.current_phase_name ? `: ${activeJob.current_phase_name}` : ""}
          {activeJob?.phase_progress?.total ? ` — ${activeJob.phase_progress.done}/${activeJob.phase_progress.total}` : ""}
          {" "}· auto-refreshing every 30s
        </div>
      )}

      {/* Friendly failure banner (2026-09-02) — only when the LAST run for
          this keyword ended in error and nothing newer is queued/running
          (latestJob is, by definition, the single most recent row — if it's
          "error", that terminal state is current). Plain-language title +
          one-sentence explanation up front, raw scout_jobs.error tucked
          behind "Technical details", and a one-click "Retry from P<n>" that
          reuses the SAME confirm dialog + cost estimate as the per-phase
          rerun icons below. */}
      {latestJob?.status === "error" && !hasInFlightJob && (() => {
        const humanized = humanizeJobError(latestJob.error);
        const retryPhase = deriveRetryPhase(latestJob);
        return (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-2.5">
            <div className="flex items-start gap-2">
              <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {humanized?.title ?? "This run stopped early"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {humanized?.description ?? "See technical details below for exactly what happened."}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pl-6">
              <PearlButton
                className="!text-[11px] !px-3 !py-1.5"
                onClick={() => setRerunPhase(retryPhase)}
              >
                Retry from P{retryPhase}
              </PearlButton>
              {humanized?.raw && (
                <details className="text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer select-none hover:text-foreground">
                    Technical details
                  </summary>
                  <p className="mt-1.5 max-w-md font-mono text-[10px] leading-relaxed text-muted-foreground/80 whitespace-pre-wrap break-words">
                    {humanized.raw}
                  </p>
                </details>
              )}
            </div>
          </div>
        );
      })()}

      {/* Phase cards — 2 rows of 6 on desktop (P1-P11), 2 cols on mobile */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {phases.map(phase => {
          const meta = PHASE_META[phase.phase];
          const isDone    = phase.status === "complete";
          // Running = the actual in-flight job is ON this phase right now.
          const isRunning = runningPhaseNum === phase.phase;
          const isPending = phase.status === "pending" && !isRunning;
          const cfg = isRunning
            ? STATUS_CFG.partial
            : phase.status === "partial"
              ? { ...STATUS_CFG.partial, label: "Partial" }
              : STATUS_CFG[phase.status];

          return (
            <div
              key={phase.phase}
              className={cn(
                "relative rounded-lg border p-3 flex flex-col gap-1.5 transition-all duration-300",
                cfg.card
              )}
            >
              {/* Top row: phase num + icon + status icon */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <meta.icon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      isDone ? "text-primary" : "text-muted-foreground/50"
                    )}
                  />
                  <span className="text-[10px] font-bold text-muted-foreground tracking-wide">P{phase.phase}</span>
                </div>
                {isDone    && <CheckCircle2 className="h-3.5 w-3.5 text-chart-4 shrink-0" />}
                {isRunning && (
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-chart-2 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-chart-2" />
                  </span>
                )}
                {phase.status === "not_started" && <Circle className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
                {isPending && <Clock className="h-3 w-3 text-muted-foreground/30 shrink-0" />}
              </div>

              {/* Short label */}
              <p className="text-xs font-semibold text-foreground leading-tight truncate">
                {meta.shortLabel}
              </p>

              {/* Progress bar + count (skip for pending/not_started with 0 total) */}
              {phase.total > 0 && !isPending && (
                <div className="space-y-0.5">
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", cfg.bar)}
                      style={{ width: `${phase.pct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {phase.complete.toLocaleString()}
                    <span className="opacity-60">/{phase.total.toLocaleString()}</span>
                    <span className="ml-1 opacity-50">({phase.pct}%)</span>
                  </p>
                </div>
              )}

              {/* Status badge + "Rerun from here" */}
              <div className="flex items-center justify-between gap-1">
                <span className={cn(
                  "self-start text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide",
                  cfg.badge
                )}>
                  {cfg.label}
                </span>
                {!isPending && !hasInFlightJob && (
                  <button
                    type="button"
                    onClick={() => setRerunPhase(phase.phase)}
                    title={`Rerun from P${phase.phase} (${SCOUT_PHASE_NAMES[phase.phase] ?? "Phase " + phase.phase})`}
                    className="shrink-0 p-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* "Rerun from here" confirm dialog — ledger-based cost estimate from
          THIS category's own ai_usage_log history (see estimateRerunCost
          above). Same from_phase continuation pattern as "Generate formula
          brief", generalized to any phase. */}
      <AlertDialog open={rerunPhase !== null} onOpenChange={(open) => !open && setRerunPhase(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {rerunPhase !== null
                ? `Rerun from P${rerunPhase} — ${SCOUT_PHASE_NAMES[rerunPhase] ?? "Phase " + rerunPhase}`
                : "Rerun from here"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>
                  Picks up at P{rerunPhase}{rerunPhase && rerunPhase < 13 ? `–P13` : ""} for "{keyword}" — earlier
                  phases are left untouched. If there still isn't enough data to continue, we'll
                  automatically stop early again instead of spending on a run that can't finish.
                </p>
                <p className="font-medium text-foreground">
                  {rerunPhase !== null && estimateRerunCost(rerunPhase) > 0
                    ? `Estimated cost: ~$${estimateRerunCost(rerunPhase).toFixed(2)} (based on what this category has cost before for this step onward)`
                    : "No cost history for this range yet — this step may not use paid AI calls, or this category hasn't run before."}
                </p>
                <p className="text-xs text-muted-foreground">
                  Actual cost can vary a little — this is an estimate, not a guarantee.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={rerun.isPending}
              onClick={() => {
                // categoryId, not the display-name `keyword` prop above (that's
                // for the confirmation text only) — useRerunFromPhase resolves
                // the REAL job keyword (categories.search_term) itself. See the
                // hook's 2026-09-02 comment for why passing a display-name
                // string directly here broke case-sensitive keyword lookups.
                if (rerunPhase !== null) rerun.mutate({ categoryId, fromPhase: rerunPhase });
                setRerunPhase(null);
              }}
            >
              {rerun.isPending ? "Queuing…" : "Rerun"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
