/**
 * PipelineStatus
 * Shows real-time Scout pipeline phase completion for the selected category.
 * All data comes from Supabase — no hardcoded values.
 */

import { usePipelineStatus } from "@/hooks/usePipelineStatus";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Circle, Clock, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineStatusProps {
  categoryId: string;
  keyword: string;
}

const STATUS_CONFIG = {
  complete: {
    icon: CheckCircle2,
    iconClass: "text-chart-4",
    badgeClass: "bg-chart-4/10 text-chart-4 border-chart-4/20",
    barClass: "bg-chart-4",
    rowClass: "border-chart-4/15 bg-chart-4/5",
    label: "Complete",
  },
  partial: {
    icon: RefreshCw,
    iconClass: "text-chart-2",
    badgeClass: "bg-chart-2/10 text-chart-2 border-chart-2/20",
    barClass: "bg-chart-2",
    rowClass: "border-chart-2/15 bg-chart-2/5",
    label: "Partial",
  },
  not_started: {
    icon: Circle,
    iconClass: "text-muted-foreground",
    badgeClass: "bg-muted text-muted-foreground border-border",
    barClass: "bg-muted-foreground/30",
    rowClass: "border-border bg-muted/30",
    label: "Not Started",
  },
  pending: {
    icon: Clock,
    iconClass: "text-muted-foreground/50",
    badgeClass: "bg-muted/50 text-muted-foreground/50 border-border/50",
    barClass: "bg-muted-foreground/20",
    rowClass: "border-border/50 bg-muted/20 opacity-50",
    label: "Pending",
  },
} as const;

export function PipelineStatus({ categoryId, keyword }: PipelineStatusProps) {
  const { data: phases, isLoading, error, dataUpdatedAt } = usePipelineStatus(categoryId, keyword);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error || !phases) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive p-3 bg-destructive/10 rounded-lg border border-destructive/20">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Failed to load pipeline status
      </div>
    );
  }

  const completedCount = phases.filter((p) => p.status === "complete").length;
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {completedCount}/{phases.length} phases complete
        </span>
        {lastUpdated && (
          <span className="text-xs text-muted-foreground/70">Checked {lastUpdated}</span>
        )}
      </div>

      <div className="space-y-2">
        {phases.map((phase) => {
          const config = STATUS_CONFIG[phase.status];
          const Icon = config.icon;

          return (
            <div
              key={phase.phase}
              className={cn(
                "flex items-center gap-3 p-2.5 rounded-lg border transition-colors",
                config.rowClass
              )}
            >
              <div className="flex items-center gap-1.5 w-7 shrink-0">
                <span className="text-[10px] font-bold text-muted-foreground leading-none">
                  P{phase.phase}
                </span>
              </div>

              <Icon className={cn("h-4 w-4 shrink-0", config.iconClass)} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {phase.label}
                  </span>
                  <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0", config.badgeClass)}>
                    {config.label}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{phase.description}</p>
              </div>

              {phase.status !== "pending" && phase.total > 0 && (
                <div className="flex items-center gap-2 shrink-0 w-28">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", config.barClass)}
                      style={{ width: `${phase.pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-14 text-right tabular-nums">
                    {phase.complete}/{phase.total}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
