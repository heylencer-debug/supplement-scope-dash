/**
 * FormulaJourneyTab — the "Formula" tab, "one formula, one audit trail" IA.
 *
 * TOP: "The Formula" — the ONE canonical formula for this category, resolved
 * by src/lib/canonicalFormula.ts (P13 sign-off > QA-adjusted > draft brief).
 * Rendered inline with zero clicks; "Open full document" opens the complete
 * document in DocumentModal. A compact Factory Handoff row sits directly
 * beneath it so the next action stays reachable without expanding anything.
 *
 * BELOW: "How this formula was made" — a single collapsed (default closed)
 * disclosure containing the full formula lifecycle timeline (Formulation →
 * QA Review → Competitive Benchmark → FDA/DSHEA Compliance → Factory
 * Handoff), internally unchanged from the original Formula Journey design —
 * this is the audit trail, not the deliverable.
 *
 * This does not replace any of the underlying report components — it
 * surfaces them. FormulaBriefTab, FormulaQATab, and FormulaValidationTab are
 * rendered exactly as they always were (each fetches/renders its own data);
 * this tab only adds the timeline chrome + expand/collapse around them.
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
import type { CanonicalFormulaSource } from "@/lib/canonicalFormula";
import { BrandLoader } from "@/components/ui/brand-loader";
import { DelayedBrandLoader } from "@/components/ui/delayed-brand-loader";
import { FormulaBriefTab, TriFormulaView } from "@/components/dashboard/FormulaBriefTab";
import { FormulaQATab } from "@/components/dashboard/FormulaQATab";
import { FormulaValidationTab } from "@/components/dashboard/FormulaValidationTab";
import { GenerateFormulaBriefButton } from "@/components/dashboard/GenerateFormulaBriefButton";

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

/** The exact maturity chip copy for "The Formula" panel. */
const MATURITY_CHIP: Record<Exclude<CanonicalFormulaSource, null>, { text: string; className: string }> = {
  signoff: { text: "Signed off ✓", className: "border-chart-4/30 text-chart-4 bg-chart-4/10" },
  qa_adjusted: { text: "QA-adjusted — sign-off pending", className: "border-chart-2/30 text-chart-2 bg-chart-2/10" },
  brief: { text: "Draft — QA pending", className: "border-border bg-muted text-muted-foreground" },
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
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[hsl(var(--brand-ink))] text-[hsl(var(--brand-neon))]">
        <BrandLoader size={11} label="In progress" />
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
  const { stages, hasAnyData, canonicalFormula, isLoading } = useFormulaJourney(categoryId);
  const [openStage, setOpenStage] = useState<JourneyStage["id"] | null>(null);
  const [formulaDocOpen, setFormulaDocOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const complianceRef = useRef<HTMLDivElement>(null);

  const openCombinedReport = () => {
    setAuditOpen(true);
    setOpenStage("compliance");
    requestAnimationFrame(() => {
      complianceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
        <DelayedBrandLoader size={40} />
        Loading formula journey…
      </div>
    );
  }

  const cleanCategoryName = (categoryName || "Formula").replace(/^=+/, "").trim();
  const factoryStage = stages.find((s) => s.id === "factory");
  const chip = canonicalFormula.source ? MATURITY_CHIP[canonicalFormula.source] : null;

  return (
    <div className="space-y-3">
      {/* TOP: The Formula — the ONE canonical answer, zero clicks. */}
      {canonicalFormula.source && chip && (
        <div className="pearl-gradient-border rounded-xl">
          <div className="pearl-gradient-border-inner rounded-[11px] bg-card p-5 space-y-3.5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <FlaskConical className="h-5 w-5 text-primary shrink-0" />
                <h2 className="text-base font-semibold text-foreground">The Formula</h2>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap",
                    chip.className
                  )}
                >
                  {canonicalFormula.source === "signoff" && <Stamp className="h-2.5 w-2.5" />}
                  {chip.text}
                </span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setFormulaDocOpen(true)}>
                Open full document
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>

            {canonicalFormula.source === "signoff" && (canonicalFormula.verdict || canonicalFormula.generatedAt) && (
              <p className="text-xs text-muted-foreground -mt-2.5">
                {canonicalFormula.verdict || "Reviewed"}
                {canonicalFormula.generatedAt ? ` · ${new Date(canonicalFormula.generatedAt).toLocaleDateString()}` : ""}
              </p>
            )}

            <div className="border-t border-border/60 pt-3.5">
              {/* 2026-09-03: tri-formula tabs (Proven/Edge/Recommended) when
                  P9 produced formula_variants — Recommended preselected,
                  since it's still the canonical formula. Falls back to the
                  single inline excerpt exactly as before on any brief that
                  predates this (variants undefined). */}
              {canonicalFormula.variants ? (
                <TriFormulaView
                  variants={canonicalFormula.variants}
                  signoff={canonicalFormula.perFormulaSignoff}
                  comparativeVerdict={canonicalFormula.comparativeVerdict}
                />
              ) : (
                <MarkdownDoc content={canonicalFormula.inlineExcerpt} />
              )}
            </div>
          </div>
        </div>
      )}

      {canonicalFormula.source && (
        <DocumentModal
          open={formulaDocOpen}
          onOpenChange={setFormulaDocOpen}
          title={`${cleanCategoryName} — Final Formula`}
          subtitle={
            canonicalFormula.source === "signoff"
              ? "Chief-formulator sign-off · compliance corrections applied"
              : chip?.text
          }
          chips={[
            ...(chip ? [{ value: chip.text }] : []),
            ...(canonicalFormula.generatedAt ? [{ value: new Date(canonicalFormula.generatedAt).toLocaleDateString() }] : []),
          ]}
        >
          <MarkdownDoc content={canonicalFormula.fullDocument} />
        </DocumentModal>
      )}

      {/* Compact Factory row — stays reachable directly under The Formula,
          even while the audit trail below is collapsed. */}
      {canonicalFormula.source && factoryStage && (
        <Panel>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Factory
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  factoryStage.state === "done" && "text-chart-4",
                  factoryStage.state === "current" && "text-primary",
                  factoryStage.state === "pending" && "text-muted-foreground/50"
                )}
              />
              <span className="text-xs font-semibold text-foreground shrink-0">Factory Handoff</span>
              <StateBadge state={factoryStage.state} />
              <span className="text-xs text-muted-foreground truncate hidden sm:inline">{factoryStage.headline}</span>
            </div>
            <FactoryControl
              state={factoryStage.state}
              generatingLink={generatingLink}
              onGenerateLink={handleGenerateLink}
              onViewManufacturer={() => setActiveTab("manufacturer")}
            />
          </div>
        </Panel>
      )}

      {!hasAnyData && (
        <Panel className="border-dashed">
          <div className="px-4 py-6 text-center space-y-3">
            <FlaskConical className="h-8 w-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm font-medium text-foreground">No formula data yet for {categoryName || "this category"}</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              If research (scraping + market intelligence) is done for this category, generate the formula
              brief, QA, competitive benchmarking, FDA compliance, and final sign-off now.
            </p>
            <div className="flex justify-center pt-1">
              <GenerateFormulaBriefButton categoryId={categoryId} />
            </div>
          </div>
        </Panel>
      )}

      {/* BELOW: audit trail — collapsed by default. */}
      <Collapsible open={auditOpen} onOpenChange={setAuditOpen}>
        <Panel className="overflow-visible">
          <CollapsibleTrigger asChild>
            <button type="button" className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">How this formula was made</p>
                <p className="text-xs text-muted-foreground mt-0.5">Working documents and checks that produced the formula above — for audit and trust</p>
              </div>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform", auditOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
        </Panel>

        <CollapsibleContent>
          <div className="relative pt-3">
            {/* Left rail line */}
            <div className="absolute left-[7px] top-5 bottom-2 w-px bg-border" aria-hidden="true" />

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
        </CollapsibleContent>
      </Collapsible>
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
