/**
 * MarketIntelligenceReport — P6 Market Demand Analysis (Claude Sonnet 5)
 * Structured, formatted display of the AI market intelligence report.
 * Market tab only — Products tab is untouched.
 * Design system tokens only.
 */

import { useQuery } from "@tanstack/react-query";
import { Brain, AlertCircle, Clock, TrendingUp, FlaskConical, DollarSign, Users, Target, ShieldAlert, Lightbulb, BarChart3, Star, CheckCircle2, AlertTriangle, Zap } from "lucide-react";
import { CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useProductIntelligence } from "@/hooks/useProductIntelligence";

interface MarketIntelligenceReportProps {
  categoryId: string;
  categoryName?: string;
}

interface MarketIntelligence {
  grok_model: string;
  generated_at: string;
  review_coverage: string;
  products_analyzed: number;
  ai_market_analysis: string;
}

function useMarketIntelligence(categoryId: string) {
  return useQuery({
    queryKey: ["market_intelligence", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formula_briefs")
        .select("ingredients")
        .eq("category_id", categoryId)
        .single();
      if (error) throw error;
      return (data?.ingredients as Record<string, unknown>)?.market_intelligence as MarketIntelligence | null;
    },
    enabled: !!categoryId,
    staleTime: 5 * 60 * 1000,
  });
}

function parseSections(md: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const parts = md.split(/^## \d+\. /m);
  parts.forEach(part => {
    const newline = part.indexOf('\n');
    if (newline < 0) return;
    const title = part.slice(0, newline).trim().toUpperCase();
    const body = part.slice(newline + 1).trim();
    sections[title] = body;
  });
  return sections;
}

function extractBullets(text: string): string[] {
  return text
    .split('\n')
    .filter(l => l.trim().startsWith('-') || l.trim().startsWith('•'))
    .map(l => l.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean);
}

function extractLabeledParagraphs(text: string): Array<{ label: string; content: string }> {
  const results: Array<{ label: string; content: string }> = [];
  const regex = /\*\*([^*]+)\*\*[:\s]+([\s\S]*?)(?=\n\*\*|\n##|$)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    results.push({ label: match[1].trim(), content: match[2].trim() });
  }
  return results;
}

// ── Lightweight markdown-lite renderer ──────────────────────────────────────
// The AI reports sometimes embed raw markdown tables ("| Brand | BSR | ... |")
// and "- bullet" lines inside a labeled paragraph's body. `boldify()` alone
// only handles **bold** and collapses newlines to spaces, so tables rendered
// as literal pipe-delimited text and bullets ran together on one line. This
// splits the text into table / bullet-list / paragraph blocks and renders
// each with real markup instead of dumping raw markdown into the DOM.
function renderInlineBold(text: string) {
  // Bold alternative is tried first at each split position, so "**x**" is
  // never mistaken for a single-star italic run — only bare "*x*" (e.g. the
  // AI's occasional "out-*trusting*" emphasis) falls through to the italic
  // branch, which was previously left as literal, unrendered asterisks.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i} className="text-foreground">{bold[1]}</strong>;
    const italic = part.match(/^\*([^*]+)\*$/);
    if (italic) return <em key={i}>{italic[1]}</em>;
    return <span key={i}>{part}</span>;
  });
}

function isTableRow(line: string) {
  return /^\s*\|.*\|\s*$/.test(line);
}
function isTableDivider(line: string) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-');
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const rows = lines
    .filter(l => !isTableDivider(l))
    .map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
  if (rows.length === 0) return null;
  const [header, ...body] = rows;
  return (
    <div className="overflow-x-auto rounded-lg border border-border/60 my-1">
      {/* No w-full / no cell wrapping on purpose: AI-generated tables have
          unpredictable column counts and a free-text "notes" column — letting
          the table size to its natural content width and scroll horizontally
          (instead of squeezing into the panel and wrapping every cell into a
          10-line-tall row) keeps rows readable at any table shape. */}
      <table className="text-xs">
        <thead className="bg-muted/50">
          <tr>
            {header.map((h, i) => (
              <th key={i} className="text-left font-semibold text-foreground px-2.5 py-1.5 whitespace-nowrap">{renderInlineBold(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className="border-t border-border/40">
              {row.map((cell, ci) => (
                <td key={ci} className="px-2.5 py-1.5 text-muted-foreground align-top whitespace-nowrap max-w-[360px] overflow-hidden text-ellipsis" title={cell}>{renderInlineBold(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormattedText({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  // A numbered pain-point/step list is sometimes written inline as
  // "intro: 1. First point... 2. Second point..." on a single logical line
  // rather than one "N. " marker per source line — split those out into
  // separate items too, or "1. 2. 3." runs together into one unreadable blob.
  const splitInlineOrdered = (line: string): string[] => {
    if (!/(^|\s)\d+\.\s+\S/.test(line) || !/\d+\.\s+\S[\s\S]*\d+\.\s+\S/.test(line)) return [line];
    const parts = line.split(/(?:^|\s)(?=\d+\.\s+)/g).map(s => s.trim()).filter(Boolean);
    return parts.length > 1 ? parts : [line];
  };
  const lines = text.split('\n').flatMap(splitInlineOrdered);
  const bulletRe = /^\s*[-•]\s+/;
  const orderedRe = /^\s*\d+\.\s+/;
  const blocks: Array<{ type: 'table' | 'bullets' | 'ordered' | 'p'; lines: string[] }> = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isTableRow(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && (isTableRow(lines[i]) || isTableDivider(lines[i]))) {
        tableLines.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: 'table', lines: tableLines });
      continue;
    }
    if (bulletRe.test(line)) {
      const bulletLines: string[] = [];
      while (i < lines.length && bulletRe.test(lines[i])) {
        bulletLines.push(lines[i].replace(bulletRe, ''));
        i += 1;
      }
      blocks.push({ type: 'bullets', lines: bulletLines });
      continue;
    }
    if (orderedRe.test(line)) {
      const orderedLines: string[] = [];
      while (i < lines.length && orderedRe.test(lines[i])) {
        orderedLines.push(lines[i].replace(orderedRe, ''));
        i += 1;
      }
      blocks.push({ type: 'ordered', lines: orderedLines });
      continue;
    }
    const pLines: string[] = [];
    while (i < lines.length && !isTableRow(lines[i]) && !bulletRe.test(lines[i]) && !orderedRe.test(lines[i])) {
      if (lines[i].trim()) pLines.push(lines[i].trim());
      i += 1;
    }
    if (pLines.length) blocks.push({ type: 'p', lines: pLines });
  }

  return (
    <div className={className || "text-sm text-muted-foreground leading-relaxed space-y-2"}>
      {blocks.map((block, bi) => {
        if (block.type === 'table') return <MarkdownTable key={bi} lines={block.lines} />;
        if (block.type === 'bullets') {
          return (
            <ul key={bi} className="space-y-1.5">
              {block.lines.map((l, li) => (
                <li key={li} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-primary shrink-0" />
                  <span>{renderInlineBold(l)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ordered') {
          return (
            <ol key={bi} className="space-y-1.5 list-decimal list-inside marker:text-muted-foreground/70">
              {block.lines.map((l, li) => (
                <li key={li}>{renderInlineBold(l)}</li>
              ))}
            </ol>
          );
        }
        return <p key={bi}>{renderInlineBold(block.lines.join(' '))}</p>;
      })}
    </div>
  );
}

// ── Live KPI stats (was previously 4 hardcoded constants — $5.2M/#420 Goli/
// 5.5/10/1k–3k — that never changed between categories). Computed straight
// from `products` so the numbers are always honest for the selected category. ──
interface MarketKpiStats {
  totalRevenue: number | null;
  revenueProductCount: number;
  leaderBsr: number | null;
  leaderBrand: string | null;
  leaderRevenue: number | null;
  medianBsr: number | null;
}

function useMarketKpiStats(categoryId: string) {
  return useQuery({
    queryKey: ["market_kpi_stats", categoryId],
    queryFn: async (): Promise<MarketKpiStats> => {
      const { data, error } = await supabase
        .from("products")
        .select("brand, bsr_current, monthly_revenue")
        .eq("category_id", categoryId)
        .limit(1000);
      if (error) throw error;
      const rows = data || [];

      const revenues = rows.map(r => r.monthly_revenue).filter((v): v is number => typeof v === "number" && v > 0);
      const totalRevenue = revenues.length ? revenues.reduce((a, b) => a + b, 0) : null;

      const withBsr = rows.filter((r): r is typeof r & { bsr_current: number } => typeof r.bsr_current === "number" && r.bsr_current > 0);
      const leader = withBsr.length ? withBsr.reduce((best, r) => (r.bsr_current < best.bsr_current ? r : best)) : null;

      const sortedBsr = withBsr.map(r => r.bsr_current).sort((a, b) => a - b);
      const medianBsr = sortedBsr.length ? sortedBsr[Math.floor(sortedBsr.length / 2)] : null;

      return {
        totalRevenue,
        revenueProductCount: revenues.length,
        leaderBsr: leader?.bsr_current ?? null,
        leaderBrand: leader?.brand ?? null,
        leaderRevenue: leader?.monthly_revenue ?? null,
        medianBsr,
      };
    },
    enabled: !!categoryId,
    staleTime: 5 * 60 * 1000,
  });
}

function formatMoney(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function SectionCard({ icon, title, children }: {
  icon: React.ReactNode; title: string; children: React.ReactNode;
}) {
  return (
    <Panel>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Panel>
  );
}

function LabeledGrid({ items }: { items: Array<{ label: string; content: string }> }) {
  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i}>
          <p className="text-sm font-semibold text-foreground mb-1">{item.label}</p>
          <FormattedText text={item.content} />
        </div>
      ))}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
          <span>{renderInlineBold(item.replace(/^\*\*[^*]+\*\*:\s*/, ''))}</span>
        </li>
      ))}
    </ul>
  );
}

export function MarketIntelligenceReport({ categoryId, categoryName }: MarketIntelligenceReportProps) {
  const { data: mi, isLoading, error } = useMarketIntelligence(categoryId);
  const { data: kpiStats } = useMarketKpiStats(categoryId);
  const { data: productIntel } = useProductIntelligence(categoryId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (error || !mi?.ai_market_analysis || typeof mi.ai_market_analysis !== 'string') {
    return (
      <Panel>
        <CardContent className="py-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4" />
            <span>No market intelligence data yet. Run <code className="text-xs bg-muted px-1 rounded">node phase6-market-analysis.js --keyword "{categoryName}"</code> to generate.</span>
          </div>
        </CardContent>
      </Panel>
    );
  }

  const sections = parseSections(mi.ai_market_analysis);
  const generatedAt = mi.generated_at
    ? new Date(mi.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const avgQualityScore = productIntel?.summary.avg_quality_score ?? null;
  const kpis = [
    {
      label: "Monthly Revenue",
      value: formatMoney(kpiStats?.totalRevenue ?? null),
      sub: kpiStats?.revenueProductCount ? `across ${kpiStats.revenueProductCount} products` : "no revenue data",
      icon: <DollarSign className="w-4 h-4 text-chart-2" />, color: "text-chart-2",
    },
    {
      label: "Market Leader BSR",
      value: kpiStats?.leaderBsr != null ? `#${kpiStats.leaderBsr.toLocaleString()}` : "—",
      sub: kpiStats?.leaderBrand ? `${kpiStats.leaderBrand} — ${formatMoney(kpiStats.leaderRevenue)}/mo` : "no BSR data",
      icon: <TrendingUp className="w-4 h-4 text-chart-4" />, color: "text-chart-4",
    },
    {
      label: "Avg Formula Score",
      value: avgQualityScore != null ? `${avgQualityScore}/10` : "—",
      sub: avgQualityScore != null && avgQualityScore < 7 ? "room for premium entry" : "strong category baseline",
      icon: <FlaskConical className="w-4 h-4 text-primary" />, color: "text-primary",
    },
    {
      label: "Category Median BSR",
      value: kpiStats?.medianBsr != null ? `#${kpiStats.medianBsr.toLocaleString()}` : "—",
      sub: "current field benchmark",
      icon: <Target className="w-4 h-4 text-chart-5" />, color: "text-chart-5",
    },
  ];

  const formulaBullets = extractBullets(sections["FORMULA ANALYSIS"] || "");
  const pricingItems = extractLabeledParagraphs(sections["PRICING INTELLIGENCE"] || "");
  const momentumItems = extractLabeledParagraphs(sections["MARKET MOMENTUM"] || "");
  const consumerItems = extractLabeledParagraphs(sections["CONSUMER DEMAND SIGNALS"] || "");
  const whitespaceItems = extractLabeledParagraphs(sections["COMPETITIVE WHITE SPACE"] || "");
  const riskItems = extractLabeledParagraphs(sections["MARKET RISKS & WATCH-OUTS"] || "");
  const recItems = extractLabeledParagraphs(sections["DOVIVE STRATEGIC RECOMMENDATION"] || "");

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Market Demand Analysis</h2>
          <Badge className="bg-primary/10 text-primary border border-primary/30 text-xs">{mi.grok_model || "Grok AI"}</Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">📦 {mi.products_analyzed} products</Badge>
          <Badge variant="outline" className="text-xs">⭐ {mi.review_coverage} reviews</Badge>
          {generatedAt && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />{generatedAt}
            </div>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <Panel key={i} className="p-4">
            <div className="flex items-center gap-2 mb-1">{kpi.icon}<span className="text-xs text-muted-foreground">{kpi.label}</span></div>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>
          </Panel>
        ))}
      </div>

      {/* Executive Summary */}
      {sections["EXECUTIVE SUMMARY"] && (
        <SectionCard icon={<BarChart3 className="w-4 h-4 text-primary" />} title="Executive Summary">
          <FormattedText text={sections["EXECUTIVE SUMMARY"]} />
        </SectionCard>
      )}

      {/* 2-col grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections["CATEGORY LANDSCAPE"] && (
          <SectionCard icon={<TrendingUp className="w-4 h-4 text-chart-4" />} title="Category Landscape">
            <LabeledGrid items={extractLabeledParagraphs(sections["CATEGORY LANDSCAPE"])} />
          </SectionCard>
        )}
        {formulaBullets.length > 0 && (
          <SectionCard icon={<FlaskConical className="w-4 h-4 text-primary" />} title="Formula Analysis">
            <BulletList items={formulaBullets} />
          </SectionCard>
        )}
        {pricingItems.length > 0 && (
          <SectionCard icon={<DollarSign className="w-4 h-4 text-chart-2" />} title="Pricing Intelligence">
            <LabeledGrid items={pricingItems} />
          </SectionCard>
        )}
        {momentumItems.length > 0 && (
          <SectionCard icon={<Zap className="w-4 h-4 text-chart-5" />} title="Market Momentum">
            <LabeledGrid items={momentumItems} />
          </SectionCard>
        )}
        {consumerItems.length > 0 && (
          <SectionCard icon={<Users className="w-4 h-4 text-chart-1" />} title="Consumer Demand Signals">
            <LabeledGrid items={consumerItems} />
          </SectionCard>
        )}
        {whitespaceItems.length > 0 && (
          <SectionCard icon={<Lightbulb className="w-4 h-4 text-chart-2" />} title="Competitive White Space">
            <LabeledGrid items={whitespaceItems} />
          </SectionCard>
        )}
      </div>

      {/* Risks — full width */}
      {riskItems.length > 0 && (
        <SectionCard icon={<ShieldAlert className="w-4 h-4 text-destructive" />} title="Market Risks & Watch-outs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {riskItems.map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <FormattedText text={item.content} className="text-xs text-muted-foreground mt-0.5 space-y-1.5" />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* DOVIVE Strategic Recommendation */}
      {recItems.length > 0 && (
        <Panel className="border-2 border-chart-2/40 bg-chart-2/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-chart-2">
              <Star className="w-4 h-4" />
              DOVIVE Strategic Recommendation
            </CardTitle>
            <CardDescription>Claude Sonnet 5 — actionable steps to win in this category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recItems.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-chart-2 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{item.label}</p>
                    <FormattedText text={item.content} className="text-xs text-muted-foreground mt-0.5 leading-relaxed space-y-1.5" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Panel>
      )}

    </div>
  );
}

export default MarketIntelligenceReport;
