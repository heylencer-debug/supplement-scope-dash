/**
 * FormulaPassport — Option C of the redesign. Compact status card at the top
 * of the Products tab: category + active formula version, 5 stage pills
 * (same useFormulaJourney state machine as the Formula tab), available
 * scores, and one stage-aware CTA. Renders nothing when the category has no
 * formula data at all — this is a status surface, not an empty state.
 */
import { Check, FlaskConical, Beaker, BarChart, Shield, Factory, ArrowRight, Link2 } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFormulaJourney, type JourneyStage, type JourneyStageState } from "@/hooks/useFormulaJourney";

interface Props {
  categoryId?: string;
  categoryName?: string;
  activeVersionNumber?: number | null;
  setActiveTab: (tab: string) => void;
}

const STAGE_ICON: Record<JourneyStage["id"], typeof FlaskConical> = {
  formulation: FlaskConical,
  qa: Beaker,
  benchmark: BarChart,
  compliance: Shield,
  factory: Factory,
};

const STAGE_PILL_LABEL: Record<JourneyStage["id"], string> = {
  formulation: "Formulated",
  qa: "QA'd",
  benchmark: "Benchmarked",
  compliance: "Compliance",
  factory: "Factory",
};

function StagePill({ stage }: { stage: JourneyStage }) {
  const Icon = STAGE_ICON[stage.id];
  const state: JourneyStageState = stage.state;
  return (
    <span
      title={stage.headline}
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap",
        state === "done" && "border-chart-4/30 text-chart-4 bg-chart-4/10",
        state === "current" && "bg-[hsl(var(--brand-ink))] text-[hsl(var(--brand-neon))] border-transparent",
        state === "pending" && "border-border bg-muted text-muted-foreground"
      )}
    >
      {state === "done" ? <Check className="h-3 w-3" strokeWidth={3} /> : <Icon className="h-3 w-3" />}
      {STAGE_PILL_LABEL[stage.id]}
      {stage.score && state === "done" && <span className="tabular-nums opacity-80">{stage.score}</span>}
    </span>
  );
}

export function FormulaPassport({ categoryId, categoryName, activeVersionNumber, setActiveTab }: Props) {
  const { stages, hasAnyData, p11Score, p12Score, isLoading } = useFormulaJourney(categoryId);

  if (isLoading || !hasAnyData) return null;

  const analysisStages = stages.filter((s) => s.id !== "factory");
  const allAnalysisDone = analysisStages.every((s) => s.state === "done");
  const currentStage = stages.find((s) => s.state === "current") || analysisStages[0];

  return (
    <Panel className="overflow-hidden">
      {/* Header strip — dark ink/iris gradient, kept subtle per design rules */}
      <div className="px-4 py-2.5 bg-gradient-to-r from-[hsl(var(--brand-ink))] to-[hsl(var(--brand-ink))]/85 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <FlaskConical className="h-3.5 w-3.5 text-[hsl(var(--brand-neon))] shrink-0" />
          <p className="text-xs font-semibold text-white truncate">
            {categoryName || "Category"}
            <span className="text-white/50 font-normal ml-1.5">
              FORMULA v{activeVersionNumber ?? 1} (active)
            </span>
          </p>
        </div>
      </div>

      <div className="px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {stages.map((stage) => (
            <StagePill key={stage.id} stage={stage} />
          ))}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Benchmark</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">{p11Score != null ? `${p11Score}/10` : "—"}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">FDA</p>
              <p className="text-sm font-semibold tabular-nums text-foreground">{p12Score != null ? `${p12Score}/100` : "—"}</p>
            </div>
          </div>

          {allAnalysisDone ? (
            <button
              type="button"
              className="pearl-pill pearl-neon"
              onClick={() => setActiveTab("manufacturer")}
            >
              <Link2 className="w-3.5 h-3.5" />
              Send to factory ↗
            </button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setActiveTab("formula")}>
              Next: {currentStage?.label || "Formulation"} <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}
