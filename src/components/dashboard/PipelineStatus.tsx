/**
 * PipelineStatus
 * Shows real-time Scout pipeline phase completion.
 * Design system tokens only — no hardcoded colors.
 */

import { usePipelineStatus } from "@/hooks/usePipelineStatus";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Circle, Clock, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineStatusProps {
  categoryId: string;
  keyword: string;
}

const PHASE_ICONS: Record<string, string> = {
  "1": "🛒", "2": "📊", "3": "💬", "4": "🔬",
  "5": "🔎", "6": "🧬", "7": "📦", "8": "📋",
};

type StatusKey = "complete" | "partial" | "not_started" | "pending";

const STATUS: Record<StatusKey, {
  bar: string; badge: string; row: string; label: string;
}> = {
  complete:    { bar: "bg-chart-4",             badge: "bg-chart-4/10 text-chart-4 border-chart-4/30",            row: "bg-chart-4/5 border-chart-4/15",   label: "Done"       },
  partial:     { bar: "bg-chart-2",             badge: "bg-chart-2/10 text-chart-2 border-chart-2/30",            row: "bg-chart-2/5 border-chart-2/15",   label: "Partial"    },
  not_started: { bar: "bg-muted-foreground/30", badge: "bg-muted text-muted-foreground border-border",            row: "bg-muted/30 border-border",        label: "Pending"    },
  pending:     { bar: "bg-muted-foreground/15", badge: "bg-muted/50 text-muted-foreground/50 border-border/50",   row: "bg-transparent border-border/30 opacity-40", label: "—" },
};

export function PipelineStatus({ categoryId, keyword }: PipelineStatusProps) {
  const { data: phases, isLoading, error, dataUpdatedAt } = usePipelineStatus(categoryId, keyword);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
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
  const overallPct = Math.round(completedCount / phases.length * 100);
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="space-y-4">
      {/* Overall progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-700"
            style={{ width: `${overallPct}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-foreground tabular-nums whitespace-nowrap">
          {completedCount}/{phases.length} phases
        </span>
        {lastUpdated && (
          <span className="text-[10px] text-muted-foreground hidden sm:block whitespace-nowrap">
            {lastUpdated}
          </span>
        )}
      </div>

      {/* Phase cards — 2-col on mobile, 4-col on md+ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {phases.map(phase => {
          const cfg = STATUS[phase.status];
          const icon = PHASE_ICONS[String(phase.phase)];
          const isDone = phase.status === "complete";
          const isPartial = phase.status === "partial";

          return (
            <div
              key={phase.phase}
              className={cn(
                "relative rounded-lg border p-3 flex flex-col gap-1.5 transition-colors",
                cfg.row
              )}
            >
              {/* Phase number + status icon */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-base leading-none">{icon}</span>
                  <span className="text-[10px] font-bold text-muted-foreground">P{phase.phase}</span>
                </div>
                {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-chart-4 shrink-0" />}
                {isPartial && <Loader2 className="h-3.5 w-3.5 text-chart-2 shrink-0 animate-spin" />}
                {phase.status === "not_started" && <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
                {phase.status === "pending" && <Clock className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />}
              </div>

              {/* Label */}
              <p className="text-xs font-medium text-foreground leading-tight truncate">{phase.label}</p>

              {/* Progress bar + count */}
              {phase.total > 0 && phase.status !== "pending" && (
                <div className="space-y-0.5">
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", cfg.bar)}
                      style={{ width: `${phase.pct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {phase.complete.toLocaleString()}/{phase.total.toLocaleString()}
                    <span className="ml-1 opacity-70">({phase.pct}%)</span>
                  </p>
                </div>
              )}

              {/* Badge */}
              <span className={cn("self-start text-[9px] font-semibold px-1.5 py-0.5 rounded border", cfg.badge)}>
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
