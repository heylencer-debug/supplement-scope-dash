/**
 * FormulaQATab — P9 Formula QA & Competitive Benchmarking
 * Renders the QA specialist report: verdict, issues, dose analysis,
 * competitor head-to-head, adjustments, and adjusted formula.
 */

import { useRef, useCallback } from "react";
import { useFormulaQA } from "@/hooks/useFormulaQA";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle, CheckCircle2, AlertTriangle, FlaskConical,
  Download, ShieldCheck, Beaker, Scale, Target, Wrench, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props { categoryId: string; categoryName?: string; }

// ─── Verdict config ────────────────────────────────────────────────────────────

function getVerdictCfg(verdict: string) {
  const v = verdict?.toUpperCase() || "";
  if (v.includes("APPROVED WITH")) return {
    color: "text-chart-2", bg: "bg-chart-2/10 border-chart-2/30",
    icon: AlertTriangle, label: "Approved with Adjustments",
  };
  if (v.includes("APPROVED")) return {
    color: "text-chart-4", bg: "bg-chart-4/10 border-chart-4/30",
    icon: CheckCircle2, label: "Approved",
  };
  return {
    color: "text-destructive", bg: "bg-destructive/10 border-destructive/30",
    icon: AlertCircle, label: "Needs Major Revision",
  };
}

// ─── Markdown renderer (reused from FormulaBriefTab) ──────────────────────────

function renderInline(text: string): React.ReactNode {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**'))
          return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*'))
          return <em key={i} className="italic">{part.slice(1, -1)}</em>;
        if (part.startsWith('`') && part.endsWith('`'))
          return <code key={i} className="text-xs font-mono bg-muted px-1 py-0.5 rounded text-primary">{part.slice(1, -1)}</code>;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function renderMarkdownSection(text: string): React.ReactNode {
  if (!text) return null;
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let tableBuffer: string[] = [];

  const flushTable = (key: string) => {
    if (tableBuffer.length < 2) { tableBuffer = []; return; }
    const header = tableBuffer[0].split('|').map(c => c.trim()).filter(Boolean);
    const rows = tableBuffer.slice(2).map(r => r.split('|').map(c => c.trim()).filter(Boolean));
    elements.push(
      <div key={`t-${key}`} className="overflow-x-auto my-3">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/60 border-b border-border">
              {header.map((h, hi) => <th key={hi} className="text-left py-2 px-3 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>)}
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
    if (line.trim().startsWith('|')) {
      tableBuffer.push(line); i++; continue;
    } else if (tableBuffer.length > 0) {
      flushTable(`${i}`);
    }
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-sm font-bold text-foreground mt-5 mb-2 border-b border-border/50 pb-1">{renderInline(line.slice(4))}</h3>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-base font-bold text-foreground mt-6 mb-2 flex items-center gap-2"><span className="w-1 h-5 bg-primary rounded-full inline-block shrink-0" />{renderInline(line.slice(3))}</h2>);
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-lg font-bold text-foreground mb-3">{renderInline(line.slice(2))}</h1>);
    } else if (line.startsWith('---')) {
      elements.push(<hr key={i} className="border-border my-3" />);
    } else if (/^[-*] /.test(line)) {
      const bullets: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) { bullets.push(lines[i].replace(/^[-*] /, '')); i++; }
      elements.push(<ul key={`ul-${i}`} className="space-y-1 my-2 ml-3">{bullets.map((b, bi) => <li key={bi} className="flex items-start gap-2 text-sm"><span className="text-primary mt-0.5 shrink-0">•</span><span>{renderInline(b)}</span></li>)}</ul>);
      continue;
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />);
    } else {
      elements.push(<p key={i} className="text-sm text-foreground/90 leading-relaxed">{renderInline(line)}</p>);
    }
    i++;
  }
  if (tableBuffer.length > 0) flushTable('final');
  return <>{elements}</>;
}

// ─── PDF download ─────────────────────────────────────────────────────────────

function usePDFDownload(ref: React.RefObject<HTMLDivElement>, filename: string) {
  return useCallback(() => {
    if (!ref.current) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>${filename}</title><style>
      body{font-family:-apple-system,sans-serif;margin:32px;color:#111;font-size:13px;line-height:1.6}
      h1{font-size:20px;font-weight:700;margin:0 0 8px}h2{font-size:16px;font-weight:700;margin:24px 0 6px;border-bottom:2px solid #e5e7eb;padding-bottom:4px}
      h3{font-size:14px;font-weight:600;margin:16px 0 4px}p,li{margin:3px 0}table{width:100%;border-collapse:collapse;margin:10px 0;font-size:11px}
      th{background:#f3f4f6;padding:5px 8px;border:1px solid #d1d5db;text-align:left;font-weight:600}
      td{padding:4px 8px;border:1px solid #e5e7eb}tr:nth-child(even) td{background:#fafafa}
      strong{font-weight:600}hr{border:none;border-top:1px solid #e5e7eb;margin:12px 0}
      code{background:#f3f4f6;padding:1px 4px;border-radius:3px;font-size:10px}
      @media print{body{margin:12px}}
    </style></head><body>`);
    w.document.write(ref.current.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.onload = () => w.print();
  }, [ref, filename]);
}

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number | null }) {
  if (!score) return null;
  const pct = (score / 10) * 100;
  const color = score >= 8 ? "text-chart-4" : score >= 6 ? "text-chart-2" : "text-destructive";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn("text-3xl font-bold tabular-nums", color)}>{score.toFixed(1)}</div>
      <div className="text-xs text-muted-foreground">QA Score /10</div>
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", score >= 8 ? "bg-chart-4" : score >= 6 ? "bg-chart-2" : "bg-destructive")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function FormulaQATab({ categoryId, categoryName }: Props) {
  const { data: qa, isLoading, error } = useFormulaQA(categoryId);
  const fullRef = useRef<HTMLDivElement>(null);
  const adjRef  = useRef<HTMLDivElement>(null);
  const downloadFull = usePDFDownload(fullRef, `${categoryName}-qa-report`);
  const downloadAdj  = usePDFDownload(adjRef, `${categoryName}-adjusted-formula`);

  if (isLoading) return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
    </div>
  );

  if (error) return (
    <div className="flex items-center gap-2 text-sm text-destructive p-4 bg-destructive/10 rounded-xl border border-destructive/20">
      <AlertCircle className="h-4 w-4 shrink-0" />Failed to load QA report
    </div>
  );

  if (!qa) return (
    <div className="text-center py-16 space-y-3">
      <Beaker className="h-12 w-12 text-muted-foreground/40 mx-auto" />
      <p className="text-foreground font-medium">No QA report yet for {categoryName}</p>
      <p className="text-muted-foreground text-sm">
        Run: <code className="text-foreground text-xs bg-muted px-1.5 py-0.5 rounded">
          node phase9-formula-qa.js --keyword "{categoryName}"
        </code>
      </p>
      <p className="text-xs text-muted-foreground">Requires P8 formula brief to be complete first.</p>
    </div>
  );

  const verdictCfg = getVerdictCfg(qa.qa_verdict?.verdict || "");
  const VerdictIcon = verdictCfg.icon;
  const genDate = qa.qa_generated_at ? new Date(qa.qa_generated_at).toLocaleDateString() : "";

  return (
    <div className="space-y-5">

      {/* Verdict banner */}
      <div className={cn("flex items-start justify-between gap-4 p-5 rounded-xl border flex-wrap", verdictCfg.bg)}>
        <div className="flex items-start gap-4">
          <VerdictIcon className={cn("h-8 w-8 shrink-0 mt-0.5", verdictCfg.color)} />
          <div>
            <h2 className={cn("text-lg font-bold", verdictCfg.color)}>
              {verdictCfg.label}
            </h2>
            <p className="text-sm text-foreground/80 mt-1 max-w-2xl">{qa.qa_verdict?.summary}</p>
            {genDate && <p className="text-xs text-muted-foreground mt-1.5">QA run: {genDate} · Grok-3 formulator</p>}
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <ScoreRing score={qa.qa_verdict?.score || null} />
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" onClick={downloadFull} className="flex items-center gap-2">
              <Download className="h-3.5 w-3.5" />Full QA Report
            </Button>
            {qa.adjusted_formula && (
              <Button variant="outline" size="sm" onClick={downloadAdj} className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" />Adjusted Formula
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: ShieldCheck, label: "QA Gate", value: verdictCfg.label.split(" ").slice(-1)[0], color: verdictCfg.color },
          { icon: Scale,      label: "Scored Against", value: "Top 20 competitors", color: "text-foreground" },
          { icon: FlaskConical, label: "Formulator AI", value: "Grok-3 (grok-3)", color: "text-foreground" },
          { icon: Target,     label: "Category", value: categoryName || "—", color: "text-foreground" },
        ].map(({ icon: Icon, label, value, color }) => (
          <Card key={label}>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                <p className={cn("text-sm font-semibold", color)}>{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Two-panel layout: full report + adjusted formula */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

        {/* Full QA report (3/5 width) */}
        <Card className="xl:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Beaker className="h-4 w-4 text-primary" />Full QA Report
            </CardTitle>
            <CardDescription className="text-xs">
              Dose analysis · Manufacturability · Competitor head-to-head · Adjustments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div ref={fullRef} className="space-y-1 max-h-[800px] overflow-y-auto pr-2 scrollbar-thin">
              {renderMarkdownSection(qa.qa_report)}
            </div>
          </CardContent>
        </Card>

        {/* Adjusted formula (2/5 width) */}
        <Card className="xl:col-span-2 border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Wrench className="h-4 w-4 text-primary" />Adjusted Formula
            </CardTitle>
            <CardDescription className="text-xs">
              P9-revised specification — what changed and why
            </CardDescription>
          </CardHeader>
          <CardContent>
            {qa.adjusted_formula ? (
              <div ref={adjRef} className="space-y-1 max-h-[800px] overflow-y-auto pr-1 scrollbar-thin">
                {renderMarkdownSection(qa.adjusted_formula)}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No formula adjustments — P8 formula approved as-is.
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Adjustments table (if separate) */}
      {qa.adjustments_table && (
        <Card className="border-chart-2/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Wrench className="h-4 w-4 text-chart-2" />What Changed & Why
            </CardTitle>
          </CardHeader>
          <CardContent>
            {renderMarkdownSection(qa.adjustments_table)}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
