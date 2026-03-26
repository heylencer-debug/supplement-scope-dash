/**
 * FormulaValidationTab — P11 Competitive Benchmarking + P12 FDA Compliance
 * Shows ingredient-by-ingredient competitor analysis and FDA regulatory compliance,
 * both grounded in real data (P4 OCR + live NIH ODS fact sheets).
 * Dual-model: Claude Sonnet 4.6 (draft/validation) + Claude Opus 4.6 (primary).
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle, CheckCircle2, AlertTriangle,
  ShieldCheck, Scale, ChevronRight, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { generateManufacturerPDF } from "@/lib/manufacturerPDF";

interface Props {
  categoryId: string;
  categoryName?: string;
  activeVersionInfo?: { versionNumber: number; changeSummary: string | null } | null;
}

// ─── Data fetcher ──────────────────────────────────────────────────────────────

interface ValidationRow {
  form_type: string | null;
  servings_per_container: number | null;
  target_price: number | null;
  positioning: string | null;
  ingredients: Record<string, any> | null;
}

async function fetchValidationData(categoryId: string): Promise<ValidationRow | null> {
  const { data, error } = await supabase
    .from("formula_briefs")
    .select("form_type, servings_per_container, target_price, positioning, ingredients")
    .eq("category_id", categoryId)
    .maybeSingle();
  if (error) throw error;
  return data as ValidationRow | null;
}

function useValidationData(categoryId: string) {
  return useQuery({
    queryKey: ["formula_validation", categoryId],
    queryFn: () => fetchValidationData(categoryId),
    enabled: !!categoryId,
    staleTime: 30_000,
  });
}

// ─── Markdown renderer ─────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
        if (part.startsWith("*") && part.endsWith("*"))
          return <em key={i} className="italic">{part.slice(1, -1)}</em>;
        if (part.startsWith("`") && part.endsWith("`"))
          return <code key={i} className="text-xs font-mono bg-muted px-1 py-0.5 rounded text-primary">{part.slice(1, -1)}</code>;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function renderMarkdown(text: unknown): React.ReactNode {
  if (!text || typeof text !== "string") return null;
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let tableBuffer: string[] = [];

  const flushTable = (key: string) => {
    if (tableBuffer.length < 2) { tableBuffer = []; return; }
    const header = tableBuffer[0].split("|").map((c) => c.trim()).filter(Boolean);
    const rows = tableBuffer.slice(2).map((r) => r.split("|").map((c) => c.trim()).filter(Boolean));
    elements.push(
      <div key={`t-${key}`} className="overflow-x-auto my-3">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/60 border-b border-border">
              {header.map((h, hi) => (
                <th key={hi} className="text-left py-2 px-3 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={cn("border-b border-border/40", ri % 2 === 0 ? "bg-muted/10" : "")}>
                {row.map((cell, ci) => (
                  <td key={ci} className="py-1.5 px-3 text-foreground align-top text-xs">{renderInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableBuffer = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("|")) { tableBuffer.push(line); i++; continue; }
    else if (tableBuffer.length > 0) flushTable(`${i}`);

    if (line.startsWith("### "))
      elements.push(<h3 key={i} className="text-sm font-bold text-foreground mt-5 mb-2 border-b border-border/50 pb-1">{renderInline(line.slice(4))}</h3>);
    else if (line.startsWith("## "))
      elements.push(<h2 key={i} className="text-base font-bold text-foreground mt-6 mb-2 flex items-center gap-2"><span className="w-1 h-5 bg-primary rounded-full inline-block shrink-0" />{renderInline(line.slice(3))}</h2>);
    else if (line.startsWith("# "))
      elements.push(<h1 key={i} className="text-lg font-bold text-foreground mb-3">{renderInline(line.slice(2))}</h1>);
    else if (line.startsWith("---"))
      elements.push(<hr key={i} className="border-border my-3" />);
    else if (/^[-*] /.test(line)) {
      const bullets: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) { bullets.push(lines[i].replace(/^[-*] /, "")); i++; }
      elements.push(<ul key={`ul-${i}`} className="space-y-1 my-2 ml-3">{bullets.map((b, bi) => <li key={bi} className="flex items-start gap-2 text-sm"><span className="text-primary mt-0.5 shrink-0">•</span><span>{renderInline(b)}</span></li>)}</ul>);
      continue;
    } else if (line.trim() === "")
      elements.push(<div key={i} className="h-1.5" />);
    else
      elements.push(<p key={i} className="text-sm text-foreground/90 leading-relaxed">{renderInline(line)}</p>);
    i++;
  }
  if (tableBuffer.length > 0) flushTable("final");
  return <>{elements}</>;
}

// ─── Expandable section card ──────────────────────────────────────────────────

function ExpandableCard({
  emoji, title, subtitle, badge, badgeColor, borderColor, bgColor, children,
}: {
  emoji: string; title: string; subtitle: string; badge: string;
  badgeColor: string; borderColor: string; bgColor: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card className={`border ${borderColor} transition-all duration-200`}>
      <button
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-t-lg ${bgColor} hover:brightness-105 transition-all`}
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl shrink-0">{emoji}</span>
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{title}</p>
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${badgeColor}`}>{badge}</span>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
        </div>
      </button>
      {open && <CardContent className="pt-4 pb-4">{children}</CardContent>}
    </Card>
  );
}

// ─── Score stat ───────────────────────────────────────────────────────────────

function ScoreStat({ label, score, max, color }: { label: string; score: number; max: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn("text-3xl font-bold tabular-nums", color)}>{score}</div>
      <div className="text-xs text-muted-foreground">{label} /{max}</div>
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", color.replace("text-", "bg-"))} style={{ width: `${(score / max) * 100}%` }} />
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function FormulaValidationTab({ categoryId, categoryName, activeVersionInfo }: Props) {
  const { data, isLoading, error } = useValidationData(categoryId);
  const ing = data?.ingredients ?? null;

  if (isLoading) return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-2 text-sm text-destructive p-4 bg-destructive/10 rounded-xl border border-destructive/20">
      <AlertCircle className="h-4 w-4 shrink-0" />Failed to load validation data
    </div>
  );

  const benchmarking = ing?.competitive_benchmarking as Record<string, any> | null;
  const fda = ing?.fda_compliance as Record<string, any> | null;
  const finalBrief = ing?.final_formula_brief as string | null;
  const adjustedFormula = ing?.adjusted_formula as string | null;

  const hasP11 = !!(benchmarking?.sonnet_draft || benchmarking?.grok_draft);
  const hasP12 = !!(fda?.opus_analysis);

  if (!hasP11 && !hasP12) return (
    <div className="text-center py-16 space-y-3">
      <ShieldCheck className="h-12 w-12 text-muted-foreground/40 mx-auto" />
      <p className="text-foreground font-medium">No validation data yet for {categoryName}</p>
      <p className="text-muted-foreground text-sm">Run P11 and P12 after completing P10 QA:</p>
      <code className="text-foreground text-xs bg-muted px-2 py-1 rounded block w-fit mx-auto">
        node phase10-competitive-benchmarking.js --keyword "{categoryName}"
      </code>
      <code className="text-foreground text-xs bg-muted px-2 py-1 rounded block w-fit mx-auto">
        node phase11-fda-compliance.js --keyword "{categoryName}"
      </code>
    </div>
  );

  // ── Scores ────────────────────────────────────────────────────────────────
  const p11Score = benchmarking?.formula_score as number | null;
  const p11Result = benchmarking?.validation_result as string | null;
  const p11Date = benchmarking?.generated_at ? new Date(benchmarking.generated_at).toLocaleDateString() : null;
  const p12Score = fda?.compliance_score as number | null;
  const p12Status = fda?.compliance_status as string | null;
  const p12Date = fda?.generated_at ? new Date(fda.generated_at).toLocaleDateString() : null;

  const p11Color = p11Score != null ? (p11Score >= 8 ? "text-chart-4" : p11Score >= 6 ? "text-chart-2" : "text-destructive") : "text-muted-foreground";
  const p12Color = p12Score != null ? (p12Score >= 80 ? "text-chart-4" : p12Score >= 60 ? "text-chart-2" : "text-destructive") : "text-muted-foreground";

  const p12StatusColor = p12Status?.includes("REVISIONS") ? "text-chart-2 bg-chart-2/10 border-chart-2/30"
    : p12Status === "COMPLIANT" ? "text-chart-4 bg-chart-4/10 border-chart-4/30"
    : "text-destructive bg-destructive/10 border-destructive/30";

  // ── Manufacturer PDF ──────────────────────────────────────────────────────
  const handleManufacturerPDF = () => {
    generateManufacturerPDF({
      categoryName: categoryName || "Formula",
      formType: data?.form_type,
      servingsPerContainer: data?.servings_per_container,
      targetPrice: data?.target_price,
      positioning: data?.positioning,
      finalFormulaBrief: ing?.final_formula_brief,
      adjustedFormula: ing?.adjusted_formula,
      flavorQA: ing?.flavor_qa,
      qaVerdict: ing?.qa_verdict,
      p11Score,
      p11ValidationResult: p11Result,
      p11OpusValidation: benchmarking?.opus_validation,
      p12Score,
      p12Status,
      p12OpusAnalysis: fda?.opus_analysis,
      p12NihFetched: fda?.nih_coverage?.fetched ?? null,
    });
  };

  return (
    <div className="space-y-5">
      {/* Active version indicator */}
      {activeVersionInfo && (
        <div className="flex items-center gap-2 text-xs bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 text-primary">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>Analyzing against <strong>Active Version {activeVersionInfo.versionNumber}</strong></span>
          {activeVersionInfo.changeSummary && <span className="text-muted-foreground">— {activeVersionInfo.changeSummary}</span>}
        </div>
      )}

      {/* Score banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {hasP11 && (
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardContent className="py-4 px-5 flex items-center gap-4">
              <Scale className="h-6 w-6 text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">P11 Competitive Benchmark</p>
                {p11Score != null
                  ? <p className={cn("text-2xl font-bold tabular-nums", p11Color)}>{p11Score}<span className="text-sm font-normal text-muted-foreground">/10</span></p>
                  : <p className="text-sm text-muted-foreground">No score</p>}
                {p11Result && <p className="text-xs text-muted-foreground truncate">{p11Result} · {p11Date}</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {hasP12 && (
          <Card className="border-green-500/30 bg-green-500/5">
            <CardContent className="py-4 px-5 flex items-center gap-4">
              <ShieldCheck className="h-6 w-6 text-green-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">P12 FDA Compliance</p>
                {p12Score != null
                  ? <p className={cn("text-2xl font-bold tabular-nums", p12Color)}>{p12Score}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
                  : <p className="text-sm text-muted-foreground">No score</p>}
                {p12Status && <p className="text-xs text-muted-foreground truncate">{p12Status} · {p12Date}</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Download card */}
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="py-4 px-5 flex flex-col justify-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Manufacturer Brief</p>
            <Button
              variant="default"
              size="sm"
              className="flex items-center gap-2 w-full"
              onClick={handleManufacturerPDF}
            >
              <FileText className="h-3.5 w-3.5" />
              Download Manufacturer PDF
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">Full brief · P11 · P12 · Print-ready</p>
          </CardContent>
        </Card>
      </div>

      {/* P12 compliance status pill */}
      {p12Status && (
        <div className={cn("flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium", p12StatusColor)}>
          {p12Status === "COMPLIANT"
            ? <CheckCircle2 className="h-4 w-4 shrink-0" />
            : p12Status?.includes("REVISIONS")
            ? <AlertTriangle className="h-4 w-4 shrink-0" />
            : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>FDA Status: {p12Status}</span>
          {fda?.nih_coverage && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {fda.nih_coverage.fetched} NIH fact sheets fetched live
            </span>
          )}
        </div>
      )}

      {/* P11: Opus validation (primary — most accurate) */}
      {benchmarking?.opus_validation && (
        <ExpandableCard
          emoji="📊"
          title="P11 — Competitive Benchmarking · Opus Validation"
          subtitle={`Claude Opus 4.6 reviewed Sonnet's analysis · ${p11Date || ""}`}
          badge={p11Score != null ? `${p11Score}/10` : "Validated"}
          badgeColor="bg-blue-500/10 text-blue-400"
          borderColor="border-blue-500/30"
          bgColor="bg-blue-500/5"
        >
          <div className="max-h-[700px] overflow-y-auto pr-1 space-y-1">
            {renderMarkdown(benchmarking.opus_validation)}
          </div>
        </ExpandableCard>
      )}

      {/* P11: Sonnet draft */}
      {(benchmarking?.sonnet_draft || benchmarking?.grok_draft) && (
        <ExpandableCard
          emoji="🔬"
          title="P11 — Competitive Benchmarking · Sonnet Draft"
          subtitle="Claude Sonnet 4.6 ingredient-by-ingredient analysis · grounded in P4 OCR data"
          badge={`${Math.round(((benchmarking.sonnet_draft || benchmarking.grok_draft) as string).length / 1000)}k chars`}
          badgeColor="bg-blue-500/10 text-blue-400"
          borderColor="border-blue-500/20"
          bgColor="bg-blue-500/3"
        >
          <div className="max-h-[700px] overflow-y-auto pr-1 space-y-1">
            {renderMarkdown(benchmarking.sonnet_draft || benchmarking.grok_draft)}
          </div>
        </ExpandableCard>
      )}

      {/* P12: FDA compliance analysis */}
      {fda?.opus_analysis && (
        <ExpandableCard
          emoji="⚖️"
          title="P12 — FDA Compliance Analysis"
          subtitle={`Claude Opus 4.6 · NIH ODS fact sheets fetched live · ${p12Date || ""}`}
          badge={p12Score != null ? `${p12Score}/100` : "Analyzed"}
          badgeColor="bg-green-500/10 text-green-400"
          borderColor="border-green-500/30"
          bgColor="bg-green-500/5"
        >
          <div className="max-h-[700px] overflow-y-auto pr-1 space-y-1">
            {renderMarkdown(fda.opus_analysis)}
          </div>
        </ExpandableCard>
      )}

      {/* P12: Sonnet validation */}
      {(fda?.sonnet_validation || fda?.grok_validation) && (
        <ExpandableCard
          emoji="✅"
          title="P12 — Compliance Validation"
          subtitle="Claude Sonnet 4.6 cross-check on Opus findings"
          badge="Validated"
          badgeColor="bg-green-500/10 text-green-400"
          borderColor="border-green-500/20"
          bgColor="bg-green-500/3"
        >
          <div className="max-h-[700px] overflow-y-auto pr-1 space-y-1">
            {renderMarkdown(fda.sonnet_validation || fda.grok_validation)}
          </div>
        </ExpandableCard>
      )}

    </div>
  );
}
