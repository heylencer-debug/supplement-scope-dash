/**
 * PipelineStatus
 * Shows real-time Scout pipeline phase completion for the selected category.
 * All data comes from Supabase — no hardcoded values.
 */

import { usePipelineStatus } from "@/hooks/usePipelineStatus";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineStatusProps {
  categoryId: string;
  keyword: string;
}

const STATUS_CONFIG = {
  complete: {
    icon: CheckCircle2,
    iconClass: "text-emerald-500",
    badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    barClass: "bg-emerald-500",
    label: "Complete",
  },
  partial: {
    icon: RefreshCw,
    iconClass: "text-amber-400",
    badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    barClass: "bg-amber-400",
    label: "Partial",
  },
  not_started: {
    icon: Circle,
    iconClass: "text-slate-500",
    badgeClass: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    barClass: "bg-slate-600",
    label: "Not Started",
  },
  pending: {
    icon: Clock,
    iconClass: "text-slate-600",
    badgeClass: "bg-slate-700/10 text-slate-500 border-slate-600/20",
    barClass: "bg-slate-700",
    label: "Pending",
  },
} as const;

export function PipelineStatus({ categoryId, keyword }: PipelineStatusProps) {
  const { data: phases, isLoading, error, dataUpdatedAt } = usePipelineStatus(
    categoryId,
    keyword
  );

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
      <div className="flex items-center gap-2 text-sm text-red-400 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Failed to load pipeline status
      </div>
    );
  }

  const completedCount = phases.filter((p) => p.status === "complete").length;
  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <div className="space-y-3">
      {/* Header summary */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {completedCount}/{phases.length} phases complete
        </span>
        {lastUpdated && (
          <span className="text-xs text-slate-500">
            Checked {lastUpdated}
          </span>
        )}
      </div>

      {/* Phase rows */}
      <div className="space-y-2">
        {phases.map((phase) => {
          const config = STATUS_CONFIG[phase.status];
          const Icon = config.icon;

          return (
            <div
              key={phase.phase}
              className={cn(
                "flex items-center gap-3 p-2.5 rounded-lg border transition-colors",
                phase.status === "complete"
                  ? "border-emerald-500/15 bg-emerald-500/5"
                  : phase.status === "partial"
                  ? "border-amber-500/15 bg-amber-500/5"
                  : phase.status === "pending"
                  ? "border-slate-700/30 bg-slate-800/20 opacity-50"
                  : "border-slate-700/30 bg-slate-800/20"
              )}
            >
              {/* Phase number + icon */}
              <div className="flex items-center gap-1.5 w-7 shrink-0">
                <span className="text-[10px] font-bold text-slate-500 leading-none">
                  P{phase.phase}
                </span>
              </div>

              <Icon className={cn("h-4 w-4 shrink-0", config.iconClass)} />

              {/* Label + description */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-200 truncate">
                    {phase.label}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0",
                      config.badgeClass
                    )}
                  >
                    {config.label}
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate">
                  {phase.description}
                </p>
              </div>

              {/* Count + progress bar */}
              {phase.status !== "pending" && phase.total > 0 && (
                <div className="flex items-center gap-2 shrink-0 w-28">
                  <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        config.barClass
                      )}
                      style={{ width: `${phase.pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 w-14 text-right tabular-nums">
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
