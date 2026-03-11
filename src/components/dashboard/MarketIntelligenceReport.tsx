/**
 * MarketIntelligenceReport — P6 Grok Market Analysis
 * Renders the AI-generated market intelligence report from formula_briefs.ingredients.market_intelligence
 * Displays at the top of the Market tab so data is always visible.
 * Design system tokens only.
 */

import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Brain, RefreshCw, AlertCircle, Clock } from "lucide-react";
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

export function MarketIntelligenceReport({ categoryId, categoryName }: MarketIntelligenceReportProps) {
  const { data: mi, isLoading, error } = useMarketIntelligence(categoryId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-48 mt-1" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (error || !mi) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-muted-foreground" />
            <CardTitle className="text-muted-foreground">Market Intelligence Report</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-4 bg-muted/50 rounded-lg border border-border">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>No market intelligence data yet. Run <code className="text-xs bg-muted px-1 rounded">node phase6-market-analysis.js --keyword "{categoryName}"</code> to generate it.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const generatedAt = mi.generated_at
    ? new Date(mi.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <CardTitle>Market Demand Analysis</CardTitle>
            <Badge className="bg-primary/10 text-primary border border-primary/30 text-xs">
              {mi.grok_model || "Grok AI"}
            </Badge>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline" className="text-xs gap-1">
              📦 {mi.products_analyzed} products analyzed
            </Badge>
            <Badge variant="outline" className="text-xs gap-1">
              ⭐ {mi.review_coverage} reviews
            </Badge>
            {generatedAt && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {generatedAt}
              </div>
            )}
          </div>
        </div>
        <CardDescription>
          AI-generated market intelligence for <span className="font-medium text-foreground">{categoryName || "this category"}</span> — sourced from P6 Grok analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="prose prose-sm dark:prose-invert max-w-none
          prose-headings:text-foreground prose-headings:font-semibold
          prose-h2:text-base prose-h2:mt-6 prose-h2:mb-2 prose-h2:border-b prose-h2:border-border prose-h2:pb-1
          prose-h3:text-sm prose-h3:mt-4 prose-h3:mb-1
          prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:my-1
          prose-strong:text-foreground prose-strong:font-semibold
          prose-li:text-muted-foreground prose-li:my-0.5
          prose-ul:my-2 prose-ol:my-2
          prose-table:text-xs prose-th:text-foreground prose-td:text-muted-foreground
          prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:rounded prose-code:text-xs
        ">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {mi.ai_market_analysis}
          </ReactMarkdown>
        </div>
      </CardContent>
    </Card>
  );
}

export default MarketIntelligenceReport;
