/**
 * FormulaJourneyTab — the "Formula" tab (Option B of the redesign).
 *
 * One linear vertical timeline through the pipeline's formula lifecycle:
 * Formulation (P8) → QA Review (P9) → Competitive Benchmark (P11) →
 * FDA/DSHEA Compliance (P12) → Factory Handoff.
 *
 * This does not replace any of the underlying report components — it
 * surfaces them. FormulaBriefTab, FormulaQATab, and FormulaValidationTab are
 * rendered exactly as they always were (each fetches/renders its own data);
 * this tab only adds the timeline chrome + expand/collapse around them, and
 * — critically — finally mounts FormulaBriefTab, which was imported by
 * Dashboard.tsx but never rendered anywhere.
 */
import { useRef, useState } from "react";
import { Check, ChevronDown, FlaskConical, Beaker, BarChart, Shield, Factory, Link2, ArrowRight, Stamp } from "lucide-react";
import { DocumentModal } from "@/components/ui/document-modal";
import { MarkdownDoc } from "@/lib/markdownDoc";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { useFormulaJourney, type JourneyStage, type JourneyStageState } from "@/hooks/useFormulaJourney";
import { FormulaBriefTab } from "@/components/dashboard/FormulaBriefTab";
import { FormulaQATab } from "@/components/dashboard/FormulaQATab";
import { FormulaValidationTab } from "@/components/dashboard/FormulaValidationTab";

interface Props {
  categoryId: string;
  categoryName?: string;
  activeVersionInfo?: { versionNumber: number; changeSummary: string | null } | null;
  setActiveTab: (tab: string) => void;
  handleGenerateLink: () => void | Promise<void>;
  generatingLink: boolean;
}

const STAGE_ICON: Record<JourneyStage["id"], typeof FlaskConical> = {
  formulation: FlaskConical,
  qa: Beaker,
  benchmark: BarChart,
  compliance: Shield,
  factory: Factory,
};

function StateBadge({ state }: { state: JourneyStageState }) {
  if (state === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-chart-4/30 text-chart-4 bg-chart-4/10">
        <Check className="h-2.5 w-2.5" /> Done
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[hsl(var(--brand-ink))] text-[hsl(var(--brand-neon))]">
        In Progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground">
      Pending
    </span>
  );
}

function StageDot({ state }: { state: JourneyStageState }) {
  return (
    <span
      className={cn(
        "relative flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 mt-1",
        state === "done" && "bg-chart-4 border-chart-4",
        state === "current" && "bg-[hsl(var(--brand-ink))] border-[hsl(var(--brand-ink))]",
        state === "pending" && "bg-muted border-border"
      )}
    >
      {state === "done" && <Check className="h-2 w-2 text-white" strokeWidth={3} />}
      {state === "current" && <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--brand-neon))]" />}
    </span>
  );
}

export function FormulaJourneyTab({ categoryId, categoryName, activeVersionInfo, setActiveTab, handleGenerateLink, generatingLink }: Props) {
  const { stages, hasAnyData, finalSignoff, isLoading } = useFormulaJourney(categoryId);
  const [openStage, setOpenStage] = useState<JourneyStage["id"] | null>(null);
  const [signoffOpen, setSignoffOpen] = useState(false);
  const complianceRef = useRef<HTMLDivElement>(null);

  const openCombinedReport = () => {
    setOpenStage("compliance");
    requestAnimationFrame(() => {
      complianceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-12 text-center">Loading formula journey…</div>;
  }

  return (
    <div className="space-y-3">
      {/* THE deliverable: the P13-signed-off, compliance-corrected final
          formula. When it exists it outranks everything else on this tab. */}
      {finalSignoff && (
        <div className="pearl-gradient-border rounded-xl">
          <div className="pearl-gradient-border-inner rounded-[11px] bg-card px-4 py-3.5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <Stamp className="h-5 w-5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Final Formula — signed off</p>
                <p className="text-xs text-muted-foreground">
                  {finalSignoff.verdict || "Reviewed"}
                  {finalSignoff.generated_at ? ` · ${new Date(finalSignoff.generated_at).toLocaleDateString()}` : ""}
                  {" · compliance corrections applied by Opus 5"}
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setSignoffOpen(true)}>
              Open final formula
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {finalSignoff && (
        <DocumentModal
          open={signoffOpen}
          onOpenChange={setSignoffOpen}
          title={`${(categoryName || "Formula").replace(/^=+/, "").trim()} — Final Formula`}
          subtitle="Chief-formulator sign-off · compliance corrections applied"
          chips={[
            { value: finalSignoff.verdict || "Reviewed" },
            ...(finalSignoff.model ? [{ value: finalSignoff.model.replace("anthropic/", "") }] : []),
            ...(finalSignoff.generated_at ? [{ value: new Date(finalSignoff.generated_at).toLocaleDateString() }] : []),
          ]}
        >
          <MarkdownDoc content={finalSignoff.opus_review || ""} />
        </DocumentModal>
      )}

      {!hasAnyData && (
        <Panel className="border-dashed">
          <div className="px-4 py-6 text-center space-y-1.5">
            <FlaskConical className="h-8 w-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm font-medium text-foreground">No formula data yet for {categoryName || "this category"}</p>
            <p className="text-xs text-muted-foreground">Run the pipeline first — start with <code className="text-foreground bg-muted px-1.5 py-0.5 rounded">phase8-formula-brief.js</code>.</p>
          </div>
        </Panel>
      )}

      <div className="relative">
        {/* Left rail line */}
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" aria-hidden="true" />

        <div className="space-y-3">
          {stages.map((stage) => {
            const Icon = STAGE_ICON[stage.id];
            const isOpen = openStage === stage.id;

            return (
              <div key={stage.id} className="relative flex gap-3 pl-0">
                <div className="relative z-10 bg-background">
                  <StageDot state={stage.state} />
                </div>

                <Panel
                  ref={stage.id === "compliance" ? complianceRef : undefined}
                  className="flex-1 min-w-0"
                >
                  <Collapsible open={isOpen} onOpenChange={(o) => setOpenStage(o ? stage.id : null)}>
                    <div className="flex items-start justify-between gap-3 px-4 py-3 flex-wrap">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 mt-0.5",
                            stage.state === "done" && "text-chart-4",
                            stage.state === "current" && "text-primary",
                            stage.state === "pending" && "text-muted-foreground/50"
                          )}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-foreground">{stage.label}</p>
                            <StateBadge state={stage.state} />
                            {stage.score && (
                              <span className="text-xs font-semibold tabular-nums text-foreground">{stage.score}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{stage.headline}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {stage.id === "benchmark" ? (
                          <Button variant="outline" size="sm" className="text-xs" onClick={openCombinedReport}>
                            Benchmark + compliance reports <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        ) : stage.id === "factory" ? (
                          <FactoryControl
                            state={stage.state}
                            generatingLink={generatingLink}
                            onGenerateLink={handleGenerateLink}
                            onViewManufacturer={() => setActiveTab("manufacturer")}
                          />
                        ) : (
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-xs gap-1">
                              {isOpen ? "Collapse" : "Expand"}
                              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                            </Button>
                          </CollapsibleTrigger>
                        )}
                      </div>
                    </div>

                    {stage.id !== "benchmark" && stage.id !== "factory" && (
                      <CollapsibleContent>
                        <div className="px-4 pb-4 pt-1 border-t border-border/60">
                          {stage.id === "formulation" && (
                            <FormulaBriefTab categoryId={categoryId} categoryName={categoryName} />
                          )}
                          {stage.id === "qa" && (
                            <FormulaQATab categoryId={categoryId} categoryName={categoryName} activeVersionInfo={activeVersionInfo} />
                          )}
                          {stage.id === "compliance" && (
                            <>
                              <p className="text-xs text-muted-foreground mb-3">Benchmark + compliance reports — covers both the Competitive Benchmark (P11) and FDA/DSHEA Compliance (P12) stages.</p>
                              <FormulaValidationTab categoryId={categoryId} categoryName={categoryName} activeVersionInfo={activeVersionInfo} />
                            </>
                          )}
                        </div>
                      </CollapsibleContent>
                    )}
                  </Collapsible>
                </Panel>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FactoryControl({
  state, generatingLink, onGenerateLink, onViewManufacturer,
}: {
  state: JourneyStageState;
  generatingLink: boolean;
  onGenerateLink: () => void | Promise<void>;
  onViewManufacturer: () => void;
}) {
  if (state === "pending") {
    return (
      <span className="text-xs text-muted-foreground italic">Waiting on compliance</span>
    );
  }
  if (state === "current") {
    return (
      // pearl-pill + pearl-neon is this repo's documented "one deliberate accent
      // exception" tier — shadcn Button's cva injects a base pearl-button/
      // pearl-quiet class that collides with the `:not(.pearl-neon)` exclusions,
      // so this stays a native <button> wearing the pearl-pill/pearl-neon classes.
      <button type="button" className="pearl-pill pearl-neon" onClick={onGenerateLink} disabled={generatingLink}>
        <Link2 className="w-3.5 h-3.5" />
        {generatingLink ? "Generating…" : "Generate Manufacturer Link ↗"}
      </button>
    );
  }
  return (
    <Button variant="outline" size="sm" className="text-xs" onClick={onViewManufacturer}>
      View in Manufacturer tab <ArrowRight className="h-3 w-3 ml-1" />
    </Button>
  );
}
