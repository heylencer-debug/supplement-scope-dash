/**
 * FormulaBriefTab — P8 Formula Brief
 * Renders AI-generated formula spec with proper formatting + PDF download.
 * Handles both ai_generated_brief (markdown string) and legacy structured data.
 */

import { useRef, useCallback, useState } from "react";
import { useFormulaBrief, type IngredientRow } from "@/hooks/useFormulaBrief";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle, FlaskConical, Target, ShieldCheck, Package,
  DollarSign, AlertTriangle, Zap, Star, ChevronRight, Download, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
      elements.push(
        <h2 key={i} className="text-lg font-bold text-foreground mt-8 mb-3 flex items-center gap-2">
          <span className="w-1 h-6 bg-primary rounded-full shrink-0 inline-block" />
          {renderInline(line.slice(3))}
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
    <Card className={accent}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4 text-primary" />{title}
        </CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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

  if (!brief) {
    return (
      <div className="text-center py-16 space-y-3">
        <FlaskConical className="h-12 w-12 text-muted-foreground/40 mx-auto" />
        <p className="text-foreground font-medium">No formula brief yet for {categoryName}</p>
        <p className="text-muted-foreground text-sm">Run the full P1–P7 pipeline, then: <code className="text-foreground text-xs bg-muted px-1.5 py-0.5 rounded">node phase8-formula-brief.js --keyword "{categoryName}"</code></p>
      </div>
    );
  }

  const f = brief.ingredients as Record<string, unknown> | null;
  const grokBrief = (f?.ai_generated_brief_grok as string) || undefined;
  const claudeBrief = (f?.ai_generated_brief_claude as string) || undefined;
  const legacyBrief = (f?.ai_generated_brief as string) || undefined;
  const dataSources = f?.data_sources as any;
  const generatedAt = (f?.generated_at as string) || undefined;

  // ── Dual-model brief (Grok 4.2 + Claude Opus 4.6) ──
  if (grokBrief || claudeBrief || legacyBrief) {
    const hasDual = !!(grokBrief && claudeBrief);

    const BriefPanel = ({ content, model, color }: { content: string; model: string; color: string }) => (
      <div className="space-y-4">
        <div className={`flex items-start justify-between gap-4 flex-wrap p-4 rounded-xl border ${color}`}>
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              DOVIVE Formula Brief
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {categoryName} · {model}{generatedAt ? ` · ${new Date(generatedAt).toLocaleDateString()}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {dataSources && (
              <div className="flex gap-1.5 flex-wrap">
                {[
                  `${dataSources.top5_used} top performers`,
                  `${dataSources.new_winners_used} new winners`,
                  `${dataSources.ingredients_analyzed} ingredients`,
                ].map(s => (
                  <span key={s} className="text-[11px] px-2 py-1 rounded bg-muted border border-border text-muted-foreground">{s}</span>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={downloadPDF} className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div ref={contentRef} className="space-y-1">
              {renderMarkdown(content)}
            </div>
          </CardContent>
        </Card>
      </div>
    );

    if (hasDual) {
      return (
        <div className="space-y-4">
          {/* Dual model header */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border flex items-center gap-2 text-sm text-muted-foreground">
            <FlaskConical className="h-4 w-4 text-primary shrink-0" />
            <span><strong className="text-foreground">Dual-Model Formulation</strong> — Grok 4.2 (deep reasoning) + Claude Opus 4.6 (1M context) ran in parallel. QA adjudicates below.</span>
          </div>

          {/* Side-by-side model switcher */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              id="tab-grok"
              onClick={() => { document.getElementById('panel-grok')?.scrollIntoView({ behavior: 'smooth' }); }}
              className="flex items-center gap-2 p-3 rounded-lg border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 text-left"
            >
              <span className="text-lg">🤖</span>
              <div><p className="text-sm font-semibold text-foreground">Formula A — Grok 4.2</p><p className="text-xs text-muted-foreground">Deep scientific reasoning · {Math.round(grokBrief.length / 1000)}k chars</p></div>
            </button>
            <button
              id="tab-claude"
              onClick={() => { document.getElementById('panel-claude')?.scrollIntoView({ behavior: 'smooth' }); }}
              className="flex items-center gap-2 p-3 rounded-lg border border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 text-left"
            >
              <span className="text-lg">🧠</span>
              <div><p className="text-sm font-semibold text-foreground">Formula B — Claude Opus 4.6</p><p className="text-xs text-muted-foreground">1M context synthesis · {Math.round(claudeBrief.length / 1000)}k chars</p></div>
            </button>
          </div>

          {/* Grok panel */}
          <div id="panel-grok">
            <BriefPanel content={grokBrief} model="🤖 Grok 4.2 — Formula A" color="border-blue-500/20 bg-blue-500/5" />
          </div>

          {/* Claude panel */}
          <div id="panel-claude" className="pt-4 border-t border-border">
            <BriefPanel content={claudeBrief} model="🧠 Claude Opus 4.6 — Formula B" color="border-purple-500/20 bg-purple-500/5" />
          </div>
        </div>
      );
    }

    // Single model fallback
    const content = grokBrief || claudeBrief || legacyBrief!;
    const model = grokBrief ? "🤖 Grok 4.2" : claudeBrief ? "🧠 Claude Opus 4.6" : "AI-Generated";
    return <BriefPanel content={content} model={model} color="border-primary/20 bg-primary/5" />;
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
      <Card className="border-chart-2/20">
        <CardContent className="py-8 text-center space-y-2">
          <FlaskConical className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">This brief uses the old format. Re-run <code className="text-foreground text-xs bg-muted px-1.5 py-0.5 rounded">phase8-formula-brief.js --force</code> to generate the full AI brief.</p>
        </CardContent>
      </Card>
    </div>
  );
}
