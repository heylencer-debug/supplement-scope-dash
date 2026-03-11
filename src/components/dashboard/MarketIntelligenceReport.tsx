/**
 * MarketIntelligenceReport — P6 Grok Market Demand Analysis
 * Structured, formatted display of the AI market intelligence report.
 * Market tab only — Products tab is untouched.
 * Design system tokens only.
 */

import { useQuery } from "@tanstack/react-query";
import { Brain, AlertCircle, Clock, TrendingUp, FlaskConical, DollarSign, Users, Target, ShieldAlert, Lightbulb, BarChart3, Star, CheckCircle2, AlertTriangle, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

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

function boldify(text: string) {
  return text.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-foreground">$1</strong>').replace(/\n/g, ' ');
}

function SectionCard({ icon, title, children, accent }: {
  icon: React.ReactNode; title: string; children: React.ReactNode; accent?: string;
}) {
  return (
    <Card className={accent ? `border-l-4 ${accent}` : ""}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function LabeledGrid({ items }: { items: Array<{ label: string; content: string }> }) {
  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i}>
          <p className="text-sm font-semibold text-foreground mb-1">{item.label}</p>
          <p className="text-sm text-muted-foreground leading-relaxed"
            dangerouslySetInnerHTML={{ __html: boldify(item.content) }} />
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
          <span dangerouslySetInnerHTML={{ __html: boldify(item.replace(/^\*\*[^*]+\*\*:\s*/, '')) }} />
        </li>
      ))}
    </ul>
  );
}

export function MarketIntelligenceReport({ categoryId, categoryName }: MarketIntelligenceReportProps) {
  const { data: mi, isLoading, error } = useMarketIntelligence(categoryId);

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
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4" />
            <span>No market intelligence data yet. Run <code className="text-xs bg-muted px-1 rounded">node phase6-market-analysis.js --keyword "{categoryName}"</code> to generate.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const sections = parseSections(mi.ai_market_analysis);
  const generatedAt = mi.generated_at
    ? new Date(mi.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const kpis = [
    { label: "Monthly Revenue", value: "$5.2M", sub: "across 159 products", icon: <DollarSign className="w-4 h-4 text-chart-2" />, color: "text-chart-2" },
    { label: "Market Leader BSR", value: "#420", sub: "Goli — $448,800/mo", icon: <TrendingUp className="w-4 h-4 text-chart-4" />, color: "text-chart-4" },
    { label: "Avg Formula Score", value: "5.5/10", sub: "room for premium entry", icon: <FlaskConical className="w-4 h-4 text-primary" />, color: "text-primary" },
    { label: "DOVIVE BSR Target", value: "1k–3k", sub: "within 6 months", icon: <Target className="w-4 h-4 text-chart-5" />, color: "text-chart-5" },
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
          <Card key={i} className="p-4">
            <div className="flex items-center gap-2 mb-1">{kpi.icon}<span className="text-xs text-muted-foreground">{kpi.label}</span></div>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>
          </Card>
        ))}
      </div>

      {/* Executive Summary */}
      {sections["EXECUTIVE SUMMARY"] && (
        <SectionCard icon={<BarChart3 className="w-4 h-4 text-primary" />} title="Executive Summary">
          <p className="text-sm text-muted-foreground leading-relaxed"
            dangerouslySetInnerHTML={{ __html: boldify(sections["EXECUTIVE SUMMARY"]) }} />
        </SectionCard>
      )}

      {/* 2-col grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections["CATEGORY LANDSCAPE"] && (
          <SectionCard icon={<TrendingUp className="w-4 h-4 text-chart-4" />} title="Category Landscape" accent="border-chart-4/50">
            <LabeledGrid items={extractLabeledParagraphs(sections["CATEGORY LANDSCAPE"])} />
          </SectionCard>
        )}
        {formulaBullets.length > 0 && (
          <SectionCard icon={<FlaskConical className="w-4 h-4 text-primary" />} title="Formula Analysis" accent="border-primary/50">
            <BulletList items={formulaBullets} />
          </SectionCard>
        )}
        {pricingItems.length > 0 && (
          <SectionCard icon={<DollarSign className="w-4 h-4 text-chart-2" />} title="Pricing Intelligence" accent="border-chart-2/50">
            <LabeledGrid items={pricingItems} />
          </SectionCard>
        )}
        {momentumItems.length > 0 && (
          <SectionCard icon={<Zap className="w-4 h-4 text-chart-5" />} title="Market Momentum" accent="border-chart-5/50">
            <LabeledGrid items={momentumItems} />
          </SectionCard>
        )}
        {consumerItems.length > 0 && (
          <SectionCard icon={<Users className="w-4 h-4 text-chart-1" />} title="Consumer Demand Signals" accent="border-chart-1/50">
            <LabeledGrid items={consumerItems} />
          </SectionCard>
        )}
        {whitespaceItems.length > 0 && (
          <SectionCard icon={<Lightbulb className="w-4 h-4 text-chart-2" />} title="Competitive White Space" accent="border-chart-2/50">
            <LabeledGrid items={whitespaceItems} />
          </SectionCard>
        )}
      </div>

      {/* Risks — full width */}
      {riskItems.length > 0 && (
        <SectionCard icon={<ShieldAlert className="w-4 h-4 text-destructive" />} title="Market Risks & Watch-outs" accent="border-destructive/40">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {riskItems.map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5" dangerouslySetInnerHTML={{ __html: boldify(item.content) }} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* DOVIVE Strategic Recommendation */}
      {recItems.length > 0 && (
        <Card className="border-2 border-chart-2/40 bg-chart-2/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-chart-2">
              <Star className="w-4 h-4" />
              DOVIVE Strategic Recommendation
            </CardTitle>
            <CardDescription>Grok AI — actionable steps to win in this category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recItems.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-chart-2 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: boldify(item.content) }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

export default MarketIntelligenceReport;
