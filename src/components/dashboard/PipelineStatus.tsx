/**
 * PipelineStatus — P1 through P10
 * Auto-refreshes every 30s. Shows live pulse on in-progress phases.
 * Design system tokens only.
 */

import { usePipelineStatus } from "@/hooks/usePipelineStatus";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Circle, Clock, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineStatusProps {
  categoryId: string;
  keyword: string;
}

const PHASE_META: Record<number, { icon: string; shortLabel: string }> = {
  1:  { icon: "🛒", shortLabel: "Scrape"      },
  2:  { icon: "📊", shortLabel: "Keepa"       },
  3:  { icon: "💬", shortLabel: "Reviews"     },
  4:  { icon: "🔬", shortLabel: "OCR"         },
  5:  { icon: "🔎", shortLabel: "Research"    },
  6:  { icon: "🧬", shortLabel: "Product AI"  },
  7:  { icon: "📦", shortLabel: "Packaging"   },
  8:  { icon: "📋", shortLabel: "Formula"     },
  9:  { icon: "📈", shortLabel: "QA"      },
  10: { icon: "🚀", shortLabel: "Launch"      },
};

type StatusKey = "complete" | "partial" | "not_started" | "pending";

const STATUS_CFG: Record<StatusKey, {
  bar: string;
  card: string;
  badge: string;
  label: string;
}> = {
  complete:    { bar: "bg-chart-4",              card: "border-chart-4/20 bg-chart-4/5",           badge: "bg-chart-4/10 text-chart-4 border-chart-4/30",         label: "Done"    },
  partial:     { bar: "bg-chart-2",              card: "border-chart-2/30 bg-chart-2/5",           badge: "bg-chart-2/10 text-chart-2 border-chart-2/30",         label: "Running" },
  not_started: { bar: "bg-muted-foreground/25",  card: "border-border bg-muted/20",                badge: "bg-muted text-muted-foreground border-border",         label: "Pending" },
  pending:     { bar: "bg-transparent",          card: "border-dashed border-border/40 opacity-45", badge: "bg-transparent text-muted-foreground/50 border-border/30", label: "TBD"  },
};

export function PipelineStatus({ categoryId, keyword }: PipelineStatusProps) {
  const { data: phases, isLoading, error, isFetching, dataUpdatedAt } = usePipelineStatus(categoryId, keyword);

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
  const runningCount   = phases.filter(p => p.status === "partial").length;
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

      {/* Live badge when a phase is running */}
      {runningCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-chart-2/10 border border-chart-2/20 text-xs text-chart-2 font-medium">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-chart-2 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-chart-2" />
          </span>
          {runningCount} phase{runningCount > 1 ? "s" : ""} running · auto-refreshing every 30s
        </div>
      )}

      {/* Phase cards — 2 rows of 5 on desktop, 5 rows of 2 on mobile */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {phases.map(phase => {
          const cfg  = STATUS_CFG[phase.status];
          const meta = PHASE_META[phase.phase];
          const isDone    = phase.status === "complete";
          const isRunning = phase.status === "partial";
          const isPending = phase.status === "pending";

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
                  <span className="text-sm leading-none">{meta.icon}</span>
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

              {/* Status badge */}
              <span className={cn(
                "self-start text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide",
                cfg.badge
              )}>
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
