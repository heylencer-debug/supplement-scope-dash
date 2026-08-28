/**
 * DataCompletenessChecklist — the real per-phase data completeness view.
 *
 * Unlike PipelineStatus.tsx (which proxies off legacy `products` columns and
 * scout_jobs status), this queries the raw Scout pipeline tables directly —
 * the same tables and thresholds as scout/phase-audit.mjs, the proven-correct
 * audit script — so a phase can never read "complete" over thin/empty data.
 */

import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDataCompleteness } from "@/hooks/useDataCompleteness";

interface DataCompletenessChecklistProps {
  keyword: string;
}

export function DataCompletenessChecklist({ keyword }: DataCompletenessChecklistProps) {
  const { data, isLoading, error } = useDataCompleteness(keyword);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Auditing pipeline data for "{keyword}"...
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Failed to audit data completeness for "{keyword}".
        </CardContent>
      </Card>
    );
  }

  const completeCount = data.phases.filter((p) => p.status === "complete").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            🔍 Data Completeness Audit
          </CardTitle>
          <CardDescription>
            Real per-phase data checks for "{keyword}"
            {data.categoryName ? ` (resolved category: ${data.categoryName})` : ""} — computed directly
            from the underlying Supabase tables, not job status.
          </CardDescription>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 gap-1.5 text-xs font-semibold",
            data.overallComplete
              ? "bg-chart-4/10 text-chart-4 border-chart-4/20"
              : "bg-destructive/10 text-destructive border-destructive/20"
          )}
        >
          {data.overallComplete ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {data.overallComplete ? "Complete" : `${completeCount}/${data.phases.length} phases`}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {!data.categoryId && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            No category resolved yet for this keyword — P6-P12 checks will read as incomplete until P1 creates it.
          </div>
        )}
        {data.phases.map((phase) => {
          const ok = phase.status === "complete";
          return (
            <div
              key={phase.phase}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                ok ? "border-chart-4/20 bg-chart-4/5" : "border-border bg-muted/20"
              )}
            >
              {ok ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-chart-4" />
              ) : (
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-muted-foreground tracking-wide">P{phase.phase}</span>
                  <span className="text-sm font-semibold text-foreground">{phase.label}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-wide px-1.5 py-0",
                      ok
                        ? "bg-chart-4/10 text-chart-4 border-chart-4/30"
                        : "bg-muted text-muted-foreground border-border"
                    )}
                  >
                    {ok ? "Complete" : "Incomplete"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{phase.detail}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
