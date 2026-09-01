/**
 * DataCompletenessChecklist — the real per-phase data completeness view.
 *
 * Unlike PipelineStatus.tsx (which proxies off legacy `products` columns and
 * scout_jobs status), this queries the raw Scout pipeline tables directly —
 * the same tables and thresholds as scout/phase-audit.mjs, the proven-correct
 * audit script — so a phase can never read "complete" over thin/empty data.
 */

import { useState } from "react";
import { CheckCircle2, AlertTriangle, Loader2, Search, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDataCompleteness, type PhaseCompleteness } from "@/hooks/useDataCompleteness";
import { useAiUsageCost } from "@/hooks/useAiUsageCost";
import { SidePanelShell } from "@/components/ui/side-panel-shell";

/** "$0.02", "<$0.01" for genuinely tiny non-zero amounts, "$12.40" for larger. */
function formatCost(usd: number): string {
  if (usd <= 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function AiCostCard({ categoryId }: { categoryId: string | null }) {
  const { data, isLoading } = useAiUsageCost(categoryId);

  if (!categoryId || isLoading) return null;

  if (!data || !data.ledgerAvailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            AI Cost
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Cost tracking isn't available for this category yet — it was analyzed before the AI cost ledger
            existed, or the ledger hasn't finished setting up. New runs will show real per-phase costs here.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (data.totalCalls === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            AI Cost
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No AI calls logged for this category yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            AI Cost
          </CardTitle>
          <CardDescription>Total for this category — every pipeline phase plus Formulator chat, all-time.</CardDescription>
        </div>
        <span className="text-2xl font-bold text-foreground tabular-nums shrink-0">{formatCost(data.totalCostUsd)}</span>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left font-semibold py-1.5 pr-3">Phase</th>
                <th className="text-left font-semibold py-1.5 pr-3">Model</th>
                <th className="text-right font-semibold py-1.5 pr-3">Calls</th>
                <th className="text-right font-semibold py-1.5 pr-3">Tokens in</th>
                <th className="text-right font-semibold py-1.5 pr-3">Tokens out</th>
                <th className="text-right font-semibold py-1.5">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.breakdown.map((row) => (
                <tr key={`${row.phase}::${row.model}`} className="border-b border-border/50">
                  <td className="py-1.5 pr-3 text-foreground font-medium">{row.phase}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{row.model}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">{row.calls}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{row.prompt_tokens.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{row.completion_tokens.toLocaleString()}</td>
                  <td className="py-1.5 text-right tabular-nums text-foreground font-medium">{formatCost(row.cost_usd || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

interface DataCompletenessChecklistProps {
  keyword: string;
}

export function DataCompletenessChecklist({ keyword }: DataCompletenessChecklistProps) {
  const { data, isLoading, error } = useDataCompleteness(keyword);
  const [activePhase, setActivePhase] = useState<PhaseCompleteness | null>(null);

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
    <div className="space-y-4">
      <AiCostCard categoryId={data.categoryId} />
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
            <button
              type="button"
              key={phase.phase}
              onClick={() => setActivePhase(phase)}
              className={cn("check-item w-full text-left cursor-pointer", ok ? "done" : "warn")}
            >
              <div className="dot" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="ci-title text-xs font-bold text-muted-foreground tracking-wide">P{phase.phase}</span>
                  <span className="ci-title text-sm font-semibold text-foreground">{phase.label}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{phase.detail}</p>
              </div>
              <span className="ci-pct shrink-0 text-[10px] font-bold uppercase tracking-wide">
                {ok ? "Complete" : "Incomplete"}
              </span>
            </button>
          );
        })}
      </CardContent>

      {activePhase && (
        <SidePanelShell
          title={`P${activePhase.phase} — ${activePhase.label}`}
          icon={<Search className="h-[18px] w-[18px]" />}
          onClose={() => setActivePhase(null)}
        >
          <div className="p-5 space-y-4">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-bold uppercase tracking-wide px-1.5 py-0",
                activePhase.status === "complete"
                  ? "bg-chart-4/10 text-chart-4 border-chart-4/30"
                  : "bg-muted text-muted-foreground border-border"
              )}
            >
              {activePhase.status === "complete" ? "Complete" : "Incomplete"}
            </Badge>
            <div>
              <h3 className="text-xs font-bold text-muted-foreground tracking-wide uppercase mb-1">
                Audit detail
              </h3>
              <p className="text-sm text-foreground leading-relaxed">{activePhase.detail}</p>
            </div>
            <div>
              <h3 className="text-xs font-bold text-muted-foreground tracking-wide uppercase mb-1">
                Keyword
              </h3>
              <p className="text-sm text-foreground">{keyword}</p>
            </div>
          </div>
        </SidePanelShell>
      )}
      </Card>
    </div>
  );
}
