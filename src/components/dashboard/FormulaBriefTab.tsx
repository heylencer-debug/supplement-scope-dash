/**
 * FormulaBriefTab — P8 Formula Brief
 * Renders AI-generated formula spec with proper formatting + PDF download.
 * Handles both ai_generated_brief (markdown string) and legacy structured data.
 */

import React, { useRef, useCallback, useState } from "react";
import { useFormulaBrief, type IngredientRow, type FormulaBriefData } from "@/hooks/useFormulaBrief";
import { CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertCircle, FlaskConical, Target, ShieldCheck, Package,
  DollarSign, AlertTriangle, Zap, Star, ChevronRight, Download, FileText, Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { generateManufacturerPDF } from "@/lib/manufacturerPDF";
import { DocumentModal } from "@/components/ui/document-modal";
import { MarkdownDoc } from "@/lib/markdownDoc";
import { GenerateFormulaBriefButton } from "@/components/dashboard/GenerateFormulaBriefButton";

interface Props { categoryId: string; categoryName?: string; }

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let tableBuffer: string[] = [];

  const flushTable = (key: string) => {
    if (tableBuffer.length < 2) { tableBuffer = []; return; }
    const header = tableBuffer[0].split('|').map(c => c.trim()).filter(Boolean);
    const rows = tableBuffer.slice(2).map(r => r.split('|').map(c => c.trim()).filter(Boolean));
    elements.push(
      <div key={`table-${key}`} className="overflow-x-auto my-3">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {header.map((h, hi) => (
                <th key={hi} className="text-left py-2 px-3 text-muted-foreground font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-b border-border/50 hover:bg-muted/20">
                {row.map((cell, ci) => (
                  <td key={ci} className="py-1.5 px-3 text-foreground align-top">{renderInline(cell)}</td>
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

    // Table detection
    if (line.trim().startsWith('|')) {
      if (tableBuffer.length === 0 || tableBuffer[tableBuffer.length - 1].trim().startsWith('|')) {
        tableBuffer.push(line);
        i++;
        continue;
      }
    } else if (tableBuffer.length > 0) {
      flushTable(`${i}`);
    }

    // Headings
    if (line.startsWith('#### ')) {
      elements.push(<h4 key={i} className="text-sm font-bold text-foreground mt-5 mb-2">{renderInline(line.slice(5))}</h4>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-base font-bold text-foreground mt-6 mb-2 border-b border-border pb-1">{renderInline(line.slice(4))}</h3>);
    } else if (line.startsWith('## ')) {
      // Cohort-split sections (2026-09-03) — "1B. PROVEN BASELINE" /
      // "1C. EMERGING EDGE" get a themed accent bar + chip instead of the
      // default blue bar, so they read as a distinct, deliberate part of
      // the brief rather than just another generic heading. Purely
      // additive to the default branch below (keyed off heading TEXT, not
      // position) — a brief without these headings renders byte-identical
      // to before, which is the "old briefs render exactly as before"
      // fallback this was built to guarantee.
      const headingText = line.slice(3);
      const isBaseline = /PROVEN BASELINE/i.test(headingText);
      const isEdge = /EMERGING EDGE/i.test(headingText);
      elements.push(
        <h2
          key={i}
          className={cn(
            "text-lg font-bold text-foreground mt-8 mb-3 flex items-center gap-2",
            (isBaseline || isEdge) && "pl-3 py-1.5 rounded-r-lg",
            isBaseline && "bg-chart-4/5",
            isEdge && "bg-chart-2/5",
          )}
        >
          <span className={cn(
            "w-1 h-6 rounded-full shrink-0 inline-block",
            isBaseline ? "bg-chart-4" : isEdge ? "bg-chart-2" : "bg-primary"
          )} />
          {renderInline(headingText)}
          {isBaseline && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-chart-4/30 text-chart-4 bg-chart-4/10">
              Baseline
            </span>
          )}
          {isEdge && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-chart-2/30 text-chart-2 bg-chart-2/10">
              Edge
            </span>
          )}
        </h2>
      );
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-xl font-bold text-foreground mb-4 mt-2">{renderInline(line.slice(2))}</h1>);
    } else if (line.startsWith('---')) {
      elements.push(<hr key={i} className="border-border my-4" />);
    } else if (/^[-*] /.test(line)) {
      // Collect bullet list
      const bullets: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        bullets.push(lines[i].replace(/^[-*] /, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="space-y-1 my-2 ml-4">
          {bullets.map((b, bi) => (
            <li key={bi} className="flex items-start gap-2 text-sm text-foreground">
              <span className="text-primary mt-1 shrink-0">•</span>
              <span>{renderInline(b)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    } else if (/^\d+\. /.test(line)) {
      // Ordered list
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="space-y-1 my-2 ml-4 list-decimal">
          {items.map((item, ii) => (
            <li key={ii} className="text-sm text-foreground ml-3">{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />);
    } else {
      elements.push(<p key={i} className="text-sm text-foreground/90 leading-relaxed my-1">{renderInline(line)}</p>);
    }
    i++;
  }

  // Flush any remaining table
  if (tableBuffer.length > 0) flushTable('final');

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode {
  if (!text) return null;
  // Bold + italic
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*')) return <em key={i} className="italic">{part.slice(1, -1)}</em>;
        if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="text-xs font-mono bg-muted px-1 py-0.5 rounded text-primary">{part.slice(1, -1)}</code>;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ─── PDF export ───────────────────────────────────────────────────────────────

function usePDFDownload(contentRef: React.RefObject<HTMLDivElement>, filename: string) {
  return useCallback(() => {
    if (!contentRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const styles = `
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 32px; color: #111; font-size: 13px; line-height: 1.6; }
      h1 { font-size: 22px; font-weight: 700; margin: 0 0 8px; }
      h2 { font-size: 17px; font-weight: 700; margin: 28px 0 8px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; }
      h3 { font-size: 14px; font-weight: 700; margin: 20px 0 6px; }
      h4 { font-size: 13px; font-weight: 600; margin: 16px 0 4px; }
      p, li { margin: 4px 0; }
      ul { padding-left: 20px; } li { margin: 2px 0; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px; }
      th { background: #f3f4f6; text-align: left; padding: 6px 8px; border: 1px solid #d1d5db; font-weight: 600; }
      td { padding: 5px 8px; border: 1px solid #e5e7eb; vertical-align: top; }
      tr:nth-child(even) td { background: #fafafa; }
      hr { border: none; border-top: 1px solid #e5e7eb; margin: 16px 0; }
      strong { font-weight: 600; }
      code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 11px; }
      .header { background: #f8faff; border: 1px solid #e0e7ff; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
      @media print { body { margin: 16px; } }
    `;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${filename}</title><style>${styles}</style></head><body>`);
    printWindow.document.write(`<div class="header"><h1>DOVIVE Formula Brief</h1><p style="color:#666;margin:0">Generated by Scout AI · ${new Date().toLocaleDateString()}</p></div>`);
    printWindow.document.write(contentRef.current.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.onload = () => { printWindow.print(); };
  }, [contentRef, filename]);
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ icon: Icon, title, description, children, accent }: {
  icon: any; title: string; description?: string; children: React.ReactNode; accent?: string;
}) {
  return (
    <Panel className={accent}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4 text-primary" />{title}
        </CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Panel>
  );
}

// ─── Tri-formula view (2026-09-04) ─────────────────────────────────────────────
// Renders P9's three adjudicated formulas — Proven / Edge / Recommended Blend
// — as Pearl-consistent segmented tabs, Recommended preselected (it's the
// canonical formula every downstream document already uses). Falls back to
// nothing (caller keeps rendering the single-blob markdown) whenever
// `formula_variants` is absent — i.e. any brief generated before this
// shipped renders exactly as it always has.

export interface FormulaVariants {
  proven: string | null;
  edge: string | null;
  recommended: string | null;
}

export interface PerFormulaSignoff {
  proven?: { verdict: string; review?: string | null };
  edge?: { verdict: string; review?: string | null };
  recommended?: { verdict: string; review?: string | null };
}

function SignoffVerdictBadge({ verdict }: { verdict?: string }) {
  if (!verdict || verdict === "UNKNOWN") return null;
  const isApproved = verdict === "APPROVED";
  const isCorrections = verdict === "APPROVED WITH CORRECTIONS";
  const isRejected = verdict === "REJECTED";
  return (
    <span
      className={cn(
        "text-[9px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0",
        isApproved && "border-chart-4/30 text-chart-4 bg-chart-4/10",
        isCorrections && "border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10",
        isRejected && "border-destructive/30 text-destructive bg-destructive/10",
      )}
    >
      {verdict}
    </span>
  );
}

const FORMULA_TAB_META = {
  recommended: { label: "Recommended", subtitle: "Our blend of both", emoji: "✅" },
  proven: { label: "Proven", subtitle: "What the established winners agree on", emoji: "🛡️" },
  edge: { label: "Edge", subtitle: "What the new winners are betting on", emoji: "🚀" },
} as const;

export function TriFormulaView({
  variants,
  signoff,
  comparativeVerdict,
}: {
  variants: FormulaVariants;
  signoff?: PerFormulaSignoff | null;
  comparativeVerdict?: string | null;
}) {
  const order: Array<keyof typeof FORMULA_TAB_META> = ["recommended", "proven", "edge"];
  const tabs = order
    .map((id) => ({ id, ...FORMULA_TAB_META[id], content: variants[id], verdict: signoff?.[id]?.verdict }))
    .filter((t) => !!t.content);

  if (tabs.length === 0) return null;

  return (
    <div className="space-y-3">
      {comparativeVerdict && (
        <div className="p-3 rounded-lg border border-border bg-muted/30">
          <p className="text-xs font-semibold text-foreground mb-1">Comparative verdict — when to launch which</p>
          <div className="text-xs text-muted-foreground [&_table]:text-[11px]">
            {renderMarkdown(comparativeVerdict)}
          </div>
        </div>
      )}
      <Tabs defaultValue="recommended" className="w-full">
        {/* Mobile fix: 3 tabs' full label+subtitle text doesn't fit a 390px
            viewport without clipping — scroll horizontally instead of
            compressing/cutting text (same pattern already used for wide
            markdown tables in this file). Desktop still shows all 3 at
            full width via sm:flex/sm:w-full. */}
        <TabsList className="flex w-max sm:w-full h-auto p-1 gap-1 overflow-x-auto max-w-full">
          {tabs.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="sm:flex-1 flex flex-col items-center gap-0.5 py-2 px-2.5 text-center h-auto min-w-[128px] shrink-0 data-[state=active]:shadow-sm"
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
                <span>{t.emoji}</span>
                {t.label}
                <SignoffVerdictBadge verdict={t.verdict} />
              </span>
              <span className="text-[10px] text-muted-foreground font-normal leading-tight">{t.subtitle}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.id} value={t.id} className="mt-3 space-y-1 max-h-[900px] overflow-y-auto pr-1">
            {renderMarkdown(t.content!)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ─── Expandable Formula Card ──────────────────────────────────────────────────

function FormulaCard({ card, categoryName, generatedAt, onManufacturerPDF }: {
  card: {
    id: string; emoji: string; title: string; subtitle: string; badge: string;
    borderColor: string; bgColor: string; badgeColor: string; content: string;
    downloadContent?: string; downloadLabel?: string;
    // Tri-formula (2026-09-04) — when present, the card renders Proven/Edge/
    // Recommended segmented tabs instead of one markdown blob, both inline
    // and in the full-document viewer. `content`/`downloadContent` above stay
    // the full combined text so PDF export/print is unaffected either way.
    variants?: FormulaVariants;
    perFormulaSignoff?: PerFormulaSignoff | null;
    comparativeVerdict?: string | null;
  };
  categoryName?: string;
  generatedAt?: string;
  onManufacturerPDF?: () => void;
}) {
  const hasVariants = !!(card.variants && (card.variants.proven || card.variants.edge || card.variants.recommended));
  const [open, setOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  // Display ref — scoped to this card's visible content
  const cardRef = useRef<HTMLDivElement>(null);
  // Download ref — uses downloadContent (full package) if available, else display content
  const downloadRef = useRef<HTMLDivElement>(null);
  const download = usePDFDownload(downloadRef, `${categoryName || 'dovive'}-${card.id}-formula`);

  return (
    <Panel className={`border ${card.borderColor} transition-all duration-200`}>
      {/* Card header — always visible, click to toggle */}
      <div className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-t-lg ${card.bgColor}`}>
        <button
          className="flex items-center gap-3 min-w-0 flex-1 text-left hover:brightness-105 transition-all"
          onClick={() => setOpen(o => !o)}
        >
          <span className="text-2xl shrink-0">{card.emoji}</span>
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{card.title}</p>
            <p className="text-xs text-muted-foreground truncate">{card.subtitle}{generatedAt ? ` · ${new Date(generatedAt).toLocaleDateString()}` : ''}</p>
          </div>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${card.badgeColor}`}>{card.badge}</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px] px-2"
            onClick={(e) => { e.stopPropagation(); setDocOpen(true); }}
          >
            <Maximize2 className="h-3 w-3" />
            Open report
          </Button>
          <button onClick={() => setOpen(o => !o)} aria-label={open ? "Collapse" : "Expand"}>
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
          </button>
        </div>
      </div>

      {/* Full-document viewer — same content as the inline expander below,
          opened wide + clinical-light for actual reading. */}
      <DocumentModal
        open={docOpen}
        onOpenChange={setDocOpen}
        title={`${categoryName ? `${categoryName} — ` : ""}${card.title}`}
        subtitle={card.subtitle}
        chips={generatedAt ? [{ label: "Generated", value: new Date(generatedAt).toLocaleDateString() }] : undefined}
      >
        {hasVariants ? (
          <TriFormulaView variants={card.variants!} signoff={card.perFormulaSignoff} comparativeVerdict={card.comparativeVerdict} />
        ) : (
          <MarkdownDoc content={card.content} />
        )}
      </DocumentModal>

      {/* Expanded content */}
      {open && (
        <CardContent className="pt-4 pb-4">
          <div className="flex justify-end mb-3 gap-2 flex-wrap">
            {onManufacturerPDF && (
              <Button size="sm" onClick={onManufacturerPDF} className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" />
                Manufacturer PDF
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={download} className="flex items-center gap-2 text-xs">
              <Download className="h-3.5 w-3.5" />
              {card.downloadLabel || 'Download PDF'}
            </Button>
          </div>
          {/* Visible content */}
          <div ref={cardRef} className={hasVariants ? undefined : "space-y-1 max-h-[900px] overflow-y-auto pr-1"}>
            {hasVariants ? (
              <TriFormulaView variants={card.variants!} signoff={card.perFormulaSignoff} comparativeVerdict={card.comparativeVerdict} />
            ) : (
              renderMarkdown(card.content)
            )}
          </div>
          {/* Hidden full-package div for download (off-screen) */}
          {card.downloadContent && (
            <div ref={downloadRef} style={{ position: 'absolute', left: '-9999px', top: 0 }} aria-hidden="true">
              {renderMarkdown(card.downloadContent)}
            </div>
          )}
          {/* If no separate downloadContent, wire downloadRef to the visible content */}
          {!card.downloadContent && <div ref={downloadRef} style={{ display: 'none' }}>{renderMarkdown(card.content)}</div>}
        </CardContent>
      )}
    </Panel>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// 2026-09-01: a research-scope run (P1-P8) already leaves a REAL
// `formula_briefs` row behind — phase6-market-analysis.js writes
// `ingredients.market_intelligence` even though the formula chain (P9-P13)
// never ran. `!brief` alone was true only for a category with NO row at
// all, so this empty state (and its "Generate formula brief" button) was
// unreachable for the exact case it exists for — a fresh research-scope
// category. Checks for any of the fields that only a REAL formula-chain
// run ever populates (P9 drafts, the legacy structured shape, or a P10
// final formula) instead of just "does a row exist."
function hasRealFormulaContent(ingredients: FormulaBriefData["ingredients"]): boolean {
  if (!ingredients) return false;
  const ing = ingredients as Record<string, unknown>;
  return !!(
    ing.ai_generated_brief ||
    ing.ai_generated_brief_grok ||
    ing.ai_generated_brief_claude ||
    ing.final_formula_brief ||
    ing.adjusted_formula ||
    (ing as { master_formula_per_serving?: unknown }).master_formula_per_serving
  );
}

export function FormulaBriefTab({ categoryId, categoryName }: Props) {
  const { data: brief, isLoading, error } = useFormulaBrief(categoryId);
  const contentRef = useRef<HTMLDivElement>(null);
  const downloadPDF = usePDFDownload(contentRef, `${categoryName || 'formula'}-brief`);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive p-4 bg-destructive/10 rounded-xl border border-destructive/20">
        <AlertCircle className="h-4 w-4 shrink-0" />Failed to load formula brief
      </div>
    );
  }

  if (!brief || !hasRealFormulaContent(brief.ingredients)) {
    return (
      <div className="text-center py-16 space-y-4">
        <FlaskConical className="h-12 w-12 text-muted-foreground/40 mx-auto" />
        <p className="text-foreground font-medium">No formula brief yet for {categoryName}</p>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Research is in — generate the formula brief, QA, competitive benchmarking,
          FDA compliance, and final sign-off for this category.
        </p>
        <div className="flex justify-center">
          <GenerateFormulaBriefButton categoryId={categoryId} />
        </div>
      </div>
    );
  }

  const f = brief.ingredients as Record<string, unknown> | null;
  const grokBrief = (f?.ai_generated_brief_grok as string) || undefined;
  const claudeBrief = (f?.ai_generated_brief_claude as string) || undefined;
  const legacyBrief = (f?.ai_generated_brief as string) || undefined;
  const dataSources = f?.data_sources as any;
  const generatedAt = (f?.generated_at as string) || undefined;
  const qaReport = (f?.qa_report as string) || undefined;
  const qaVerdict = f?.qa_verdict as any;
  // final_formula_brief: full brief generated by P10 QA (preferred)
  // adjusted_formula: just the adjustments table (legacy fallback)
  // further fallback: extract from qa_report sections
  const finalFormulaBrief = (f?.final_formula_brief as string) || undefined;
  const adjustedFormula = (f?.adjusted_formula as string) ||
    qaReport?.match(/## ADJUSTED FORMULA SPECIFICATION([\s\S]*?)(?:\n## |$)/)?.[1]?.trim() ||
    qaReport?.match(/## MANUFACTURABILITY CHECK([\s\S]*?)(?:\n## COMPETITOR|$)/)?.[1]?.trim() ||
    undefined;
  // Final Formula card shows full brief when available, falls back to adjustments
  const finalFormulaContent = finalFormulaBrief || adjustedFormula;

  // Tri-formula fields (2026-09-04) — additive, null on any brief generated
  // before this shipped. `hasVariants` gates the tab UI; when false the
  // "final" card falls back to the single-blob markdown exactly as before.
  const formulaVariantsRaw = f?.formula_variants as { proven?: string | null; edge?: string | null; recommended?: string | null } | null | undefined;
  const formulaVariants: FormulaVariants | undefined = formulaVariantsRaw
    ? { proven: formulaVariantsRaw.proven || null, edge: formulaVariantsRaw.edge || null, recommended: formulaVariantsRaw.recommended || null }
    : undefined;
  const comparativeVerdict = (f?.comparative_verdict as string) || undefined;
  const finalSignoff = f?.final_signoff as { per_formula?: PerFormulaSignoff; verdict?: string } | undefined;
  const perFormulaSignoff = finalSignoff?.per_formula || null;

  // Pull QA analysis sections for combined download
  const comprehensiveComparison = (f?.comprehensive_comparison as string) || undefined;
  const flavorQA = (f?.flavor_qa as string) || undefined;

  // Complete P10 package: Final Brief + QA Verdict + All Analysis Sections
  const fullP10Package = finalFormulaContent ? [
    `# DOVIVE Formula — Final P10 QA Package`,
    `## ${categoryName || 'Category'} | Generated ${generatedAt ? new Date(generatedAt).toLocaleDateString() : 'N/A'}`,
    qaVerdict ? `\n### QA Verdict: ${qaVerdict.verdict} | Score: ${qaVerdict.score}/10\n${qaVerdict.summary}` : '',
    `\n---\n\n## FINAL FORMULA BRIEF\n\n${finalFormulaContent}`,
    comprehensiveComparison ? `\n---\n\n## COMPREHENSIVE INGREDIENT COMPARISON\n\n${comprehensiveComparison}` : '',
    flavorQA ? `\n---\n\n## FLAVOR & TASTE QA\n\n${flavorQA}` : '',
    adjustedFormula && adjustedFormula !== finalFormulaContent ? `\n---\n\n## ADJUSTED FORMULA SPECIFICATION\n\n${adjustedFormula}` : '',
  ].filter(Boolean).join('\n') : undefined;

  // ── Formula cards (expandable) ──
  if (grokBrief || claudeBrief || legacyBrief) {

    const cards = [
      grokBrief && {
        id: 'grok',
        emoji: '🤖',
        title: 'Working draft (Opus 5)',
        subtitle: 'Deep scientific reasoning',
        badge: `${Math.round(grokBrief.length / 1000)}k chars`,
        borderColor: 'border-blue-500/40',
        bgColor: 'bg-blue-500/5',
        badgeColor: 'bg-blue-500/10 text-blue-400',
        content: grokBrief,
      },
      claudeBrief && {
        id: 'claude',
        emoji: '🧠',
        title: 'Working draft (Sonnet 5)',
        subtitle: '1M context synthesis',
        badge: `${Math.round(claudeBrief.length / 1000)}k chars`,
        borderColor: 'border-purple-500/40',
        bgColor: 'bg-purple-500/5',
        badgeColor: 'bg-purple-500/10 text-purple-400',
        content: claudeBrief,
      },
      finalFormulaContent && {
        id: 'final',
        emoji: '✅',
        title: formulaVariants ? 'Final Formulas — Proven / Edge / Recommended' : 'Final Formula — QA Approved',
        // qaVerdict.verdict is AI-generated text that sometimes wraps itself in
        // markdown bold ("**APPROVED WITH ADJUSTMENTS**") — this subtitle line
        // is plain text (no markdown renderer), so strip the literal ** marks.
        subtitle: formulaVariants
          ? 'Three adjudicated formulas · Claude Opus 5 adjudication · ' + (qaVerdict?.verdict?.replace(/\*\*/g, '') || 'Reviewed')
          : (finalFormulaBrief ? 'Complete brief · ' : 'Adjustments only · ') + 'Claude Opus 5 adjudication · ' + (qaVerdict?.verdict?.replace(/\*\*/g, '') || 'Reviewed'),
        badge: qaVerdict?.score ? `${qaVerdict.score}/10` : 'QA',
        borderColor: 'border-green-500/40',
        bgColor: 'bg-green-500/5',
        badgeColor: 'bg-green-500/10 text-green-400',
        content: finalFormulaContent,
        // Download includes ALL P10 analysis: brief + verdict + comparison + flavor QA
        downloadContent: fullP10Package,
        downloadLabel: '⬇ Download Full P10 Package',
        variants: formulaVariants,
        perFormulaSignoff,
        comparativeVerdict,
      },
      !grokBrief && !claudeBrief && legacyBrief && {
        id: 'legacy',
        emoji: '📄',
        title: 'Formula Brief',
        subtitle: 'AI-Generated',
        badge: `${Math.round(legacyBrief.length / 1000)}k chars`,
        borderColor: 'border-primary/30',
        bgColor: 'bg-primary/5',
        badgeColor: 'bg-primary/10 text-primary',
        content: legacyBrief,
      },
    ].filter(Boolean) as any[];

    return (
      <div className="space-y-3">
        {/* Header */}
        <div className="p-3 rounded-lg bg-muted/50 border border-border flex items-center gap-2 text-sm text-muted-foreground">
          <FlaskConical className="h-4 w-4 text-primary shrink-0" />
          <span>
            <strong className="text-foreground">Formula Brief</strong>
            {grokBrief && claudeBrief ? ' — Dual-model: Claude Opus 5 + Claude Sonnet 5 ran in parallel. Click a card to expand.' : ' — Click a card to expand.'}
          </span>
          {dataSources && (
            <span className="ml-auto text-xs hidden sm:block">
              {dataSources.ingredients_analyzed} ingredients · {dataSources.top5_used} top performers
            </span>
          )}
        </div>

        {/* Expandable cards */}
        {cards.map((card) => (
          <FormulaCard
            key={card.id}
            card={card}
            categoryName={categoryName}
            generatedAt={generatedAt}
            onManufacturerPDF={card.id === "final" ? () => generateManufacturerPDF({
              categoryName: categoryName || "Formula",
              formType: brief.form_type,
              servingsPerContainer: brief.servings_per_container,
              targetPrice: brief.target_price,
              positioning: brief.positioning,
              finalFormulaBrief: finalFormulaBrief,
              adjustedFormula: adjustedFormula,
              flavorQA: flavorQA,
              qaVerdict: qaVerdict,
            }) : undefined}
          />
        ))}
      </div>
    );
  }

  // ── Legacy structured brief ──
  const mf = (f as any)?.master_formula_per_serving;
  const fs = mf?.formula_summary;

  return (
    <div className="space-y-6">
      {/* Header banner */}
      <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-primary/20 bg-primary/5 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-foreground">DOVIVE Formula Brief</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{categoryName} · v1.0</p>
          <p className="text-sm text-foreground/80 mt-2">{brief.positioning}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {(brief.certifications || []).slice(0, 5).map(c => (
            <Badge key={c} variant="outline" className="text-[10px] border-chart-4/30 text-chart-4">{c}</Badge>
          ))}
          <Button variant="outline" size="sm" onClick={downloadPDF} className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Executive Summary */}
      <SectionCard icon={Target} title="Executive Summary">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5 text-sm">
            {[
              { label: "Form", value: brief.form_type },
              { label: "Serving", value: mf?.serving_size || "2 gummies" },
              { label: "Servings", value: brief.servings_per_container },
              { label: "MSRP", value: `$${brief.target_price}`, accent: true },
            ].map(r => (
              <div key={r.label} className="flex justify-between">
                <span className="text-muted-foreground">{r.label}</span>
                <span className={cn("capitalize", r.accent ? "text-primary font-bold" : "text-foreground")}>{r.value}</span>
              </div>
            ))}
          </div>
          <div className="md:col-span-2 space-y-1.5">
            {(brief.key_differentiators || []).map((d, i) => (
              <div key={i} className="flex items-start gap-2">
                <ChevronRight className="h-3 w-3 text-chart-4 shrink-0 mt-0.5" />
                <span className="text-sm text-foreground">{d}</span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Placeholder for legacy structured sections */}
      <Panel className="border-chart-2/20">
        <CardContent className="py-8 text-center space-y-2">
          <FlaskConical className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">This brief uses the old format. Re-run <code className="text-foreground text-xs bg-muted px-1.5 py-0.5 rounded">phase8-formula-brief.js --force</code> to generate the full AI brief.</p>
        </CardContent>
      </Panel>
    </div>
  );
}
