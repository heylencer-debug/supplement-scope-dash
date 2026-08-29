import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollAnimate } from "@/components/ui/scroll-animate";
import { Building2, ChevronsUpDown, Link2, Package, TrendingUp, FlaskConical, Factory, ScanSearch, Search } from "lucide-react";
import { PHASE_META } from "@/components/dashboard/PipelineStatus";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Dashboard components
import { HeroHeader } from "@/components/dashboard/HeroHeader";
import { KPIMetricsGrid } from "@/components/dashboard/KPIMetricsGrid";
import { EnhancedBenchmarkComparison } from "@/components/dashboard/EnhancedBenchmarkComparison";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { LowConfidenceProducts } from "@/components/dashboard/LowConfidenceProducts";
import { PipelineStatus } from "@/components/dashboard/PipelineStatus";
import { usePipelineStatus } from "@/hooks/usePipelineStatus";
import { useActiveScoutJobs } from "@/hooks/useScoutJobs";
import { ProductFormulaIntelligence } from "@/components/dashboard/ProductFormulaIntelligence";
import { FormulaJourneyTab } from "@/components/dashboard/FormulaJourneyTab";
import { FormulaPassport } from "@/components/dashboard/FormulaPassport";
import { OcrCoveragePanel } from "@/components/dashboard/OcrCoveragePanel";
import { P9BenchmarkOverview } from "@/components/dashboard/P9BenchmarkOverview";
import { MarketIntelligenceReport } from "@/components/dashboard/MarketIntelligenceReport";
import { ManufacturerFeedback } from "@/components/document/ManufacturerFeedback";
import { DataCompletenessChecklist } from "@/components/dashboard/DataCompletenessChecklist";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCategoryByName } from "@/hooks/useCategoryByName";
import { useCategoryAnalysis } from "@/hooks/useCategoryAnalyses";
import { useProducts } from "@/hooks/useProducts";
import { useCategoryContext } from "@/contexts/CategoryContext";
import { useCategoryScores } from "@/hooks/useCategoryScores";
import { useCategorySales } from "@/hooks/useCategorySales";
import { useFormulaBriefVersions } from "@/hooks/useFormulaBriefVersions";
import { useFormulaBrief } from "@/hooks/useFormulaBrief";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function PipelineCollapsible({ categoryId, categoryName }: { categoryId: string; categoryName: string }) {
  const { data: phases } = usePipelineStatus(categoryId, categoryName);
  // "Running" = a REAL in-flight scout job for this keyword (same honesty
  // rule as PipelineStatus.tsx) — partial data is a coverage state, not
  // activity, and used to pulse "N running" forever on finished categories.
  const { data: activeJobs } = useActiveScoutJobs();
  const normKw = (s: string | null | undefined) => (s || "").replace(/^[=\s]+/, "").trim().toLowerCase();
  const activeJob = (activeJobs ?? []).find(
    (j) => normKw(j.keyword) === normKw(categoryName) && (j.status === "running" || j.status === "claimed")
  );
  const runningPhaseNum = activeJob?.current_phase ?? null;
  const completedCount = phases?.filter(p => p.status === "complete").length ?? 0;
  const runningCount = activeJob ? 1 : 0;
  const totalCount = phases?.length ?? 0;
  const overallPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <Collapsible>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" /> Scout Pipeline
              </CardTitle>
              {/* Compact summary visible when collapsed */}
              <div className="flex items-center gap-3 mt-2">
                {/* Phase icons */}
                {phases && phases.length > 0 && (
                  <div className="flex items-center gap-1">
                    {phases.map(phase => {
                      const meta = PHASE_META[phase.phase];
                      const isDone = phase.status === "complete";
                      const isRunning = runningPhaseNum === phase.phase;
                      if (!meta) return null;
                      const PhaseIcon = meta.icon;
                      return (
                        <PhaseIcon
                          key={phase.phase}
                          className={`h-3 w-3 shrink-0 transition-opacity duration-300 ${isDone ? "text-primary opacity-100" : isRunning ? "text-chart-2 opacity-90 animate-pulse" : "text-muted-foreground/40 opacity-60"}`}
                          aria-label={`P${phase.phase}: ${isDone ? "Done" : isRunning ? "Running" : "Pending"}`}
                        />
                      );
                    })}
                  </div>
                )}
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[120px]">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-700"
                    style={{ width: `${overallPct}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-muted-foreground tabular-nums whitespace-nowrap">
                  {completedCount}/{totalCount}
                </span>
                {runningCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-chart-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-chart-2 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-chart-2" />
                    </span>
                    Running{activeJob?.current_phase_name ? `: ${activeJob.current_phase_name}` : ""}
                  </span>
                )}
                {completedCount === totalCount && totalCount > 0 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-chart-4/30 text-chart-4 bg-chart-4/10">
                    ✓ Complete
                  </Badge>
                )}
              </div>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-2">
            <PipelineStatus categoryId={categoryId} keyword={categoryName} />
            <OcrCoveragePanel categoryId={categoryId} keyword={categoryName} />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}


export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const rawUrlCategoryName = searchParams.get("category");
  const urlCategoryName = rawUrlCategoryName ? rawUrlCategoryName.replace(/^=+/, "").trim() : null;
  const { setCategoryContext, categoryName: contextCategoryName } = useCategoryContext();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("products");
  const [generatingLink, setGeneratingLink] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const categoryName = urlCategoryName || contextCategoryName;

  const { data: category, isLoading: categoryLoading } = useCategoryByName(categoryName || undefined);

  useEffect(() => {
    if (category) {
      setCategoryContext(category.id, category.name);
    } else if (categoryName && !category && !categoryLoading) {
      setCategoryContext(null, categoryName);
    }
  }, [category, categoryName, categoryLoading, setCategoryContext]);

  // Real-time subscriptions
  useEffect(() => {
    if (!categoryName) return;

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'categories' }, () => {
        queryClient.invalidateQueries({ queryKey: ['category_by_name', categoryName] });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'category_analyses' }, () => {
        if (category?.id) queryClient.invalidateQueries({ queryKey: ['category_analysis', category.id] });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'products' }, () => {
        if (category?.id) queryClient.invalidateQueries({ queryKey: ['products', category.id] });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'category_analyses' }, () => {
        if (category?.id) queryClient.invalidateQueries({ queryKey: ['category_analysis', category.id] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [categoryName, category?.id, queryClient]);

  // Data fetching
  const { data: analysis, isLoading: analysisLoading } = useCategoryAnalysis(category?.id);
  const { data: products, isLoading: productsLoading } = useProducts(category?.id);
  const { data: categoryScores } = useCategoryScores(category?.id);
  const { data: categorySales } = useCategorySales(categoryName || undefined);
  const { versions, activeVersion } = useFormulaBriefVersions(category?.id);
  const { data: formulaBrief } = useFormulaBrief(category?.id);
  useEffect(() => {
    if (activeVersion && !selectedVersionId) setSelectedVersionId(activeVersion.id);
  }, [activeVersion, selectedVersionId]);
  const formulaVersionId = selectedVersionId || null;
  const selectedVersion = selectedVersionId ? versions.find(v => v.id === selectedVersionId) : undefined;

  const hasAnalysis = !!analysis;
  const hasProducts = products && products.length > 0;

  // Parse analysis data for benchmark comparison component
  const dashboardData = useMemo(() => {
    const analysis1 = analysis?.analysis_1_category_scores as Record<string, unknown> | null;
    const analysis3 = analysis?.analysis_3_formula_brief as Record<string, unknown> | null;
    const keyInsights = analysis?.key_insights as Record<string, unknown> | null;
    const formulaBriefContent = (analysis3?.formula_brief_content as string) || null;

    // formula_briefs (real, category-specific data written by the P8/P9 pipeline)
    // fills the "OUR CONCEPT" card fields — key_insights/analysis_1_category_scores
    // above come from the older category_analyses table and are frequently empty.
    let marketSummaryParsed: Record<string, unknown> | null = null;
    if (formulaBrief?.market_summary) {
      try {
        marketSummaryParsed = JSON.parse(formulaBrief.market_summary) as Record<string, unknown>;
      } catch {
        marketSummaryParsed = null;
      }
    }

    const fbPositioning = formulaBrief?.positioning || undefined;
    const fbTargetCustomer = formulaBrief?.target_customer || undefined;
    const fbOpportunityInsights = formulaBrief?.opportunity_insights || undefined;
    const fbKeyDifferentiators = formulaBrief?.key_differentiators?.length ? formulaBrief.key_differentiators : undefined;
    const fbRiskFactors = formulaBrief?.risk_factors?.length ? formulaBrief.risk_factors : undefined;

    const existingGoToMarket = (keyInsights as { go_to_market?: { positioning?: string; messaging?: string[] } } | null)?.go_to_market;

    // Fallback ingredient list for the "Key Ingredients" row, sourced from
    // formula_briefs.ingredients.formula_validation when analysis_1 has none.
    const existingFormulation = (analysis1 as { product_development?: { formulation?: { recommended_ingredients?: unknown[] } } } | null)?.product_development?.formulation;
    const fbValidationIngredients = formulaBrief?.ingredients?.formula_validation?.ingredients;
    const fallbackIngredients = (!existingFormulation?.recommended_ingredients?.length && fbValidationIngredients?.length)
      ? fbValidationIngredients.map(i => ({ ingredient: i.name, dosage: i.raw }))
      : undefined;

    return {
      benchmarkData: {
        key_insights: {
          ...(keyInsights || {}),
          go_to_market: {
            ...(existingGoToMarket || {}),
            positioning: fbPositioning || existingGoToMarket?.positioning,
            messaging: fbOpportunityInsights ? [fbOpportunityInsights] : existingGoToMarket?.messaging,
            key_differentiators: fbKeyDifferentiators,
          },
        } as {
          go_to_market?: {
            positioning?: string;
            messaging?: string[];
            key_differentiators?: string[];
          };
        } | null,
        analysis_1_category_scores: {
          ...(analysis1 || {}),
          product_development: fallbackIngredients ? {
            ...((analysis1 as Record<string, unknown> | null)?.product_development as Record<string, unknown> | undefined || {}),
            formulation: {
              ...existingFormulation,
              recommended_ingredients: fallbackIngredients,
            },
          } : (analysis1 as { product_development?: unknown } | null)?.product_development,
          customer_insights: {
            ...((analysis1 as Record<string, unknown> | null)?.customer_insights as Record<string, unknown> | undefined || {}),
            buyer_profile: fbTargetCustomer || (analysis1 as { customer_insights?: { buyer_profile?: string } } | null)?.customer_insights?.buyer_profile,
          },
        } as {
          product_development?: {
            formulation?: {
              recommended_ingredients?: Array<string | { ingredient?: string; name?: string }>;
              form_factor?: string;
              key_features?: string[];
              serving_size?: string;
            };
          };
          customer_insights?: {
            buyer_profile?: string;
          };
        } | null,
        formula_brief_content: formulaBriefContent,
        formula_brief: formulaBrief ? {
          key_differentiators: fbKeyDifferentiators,
          risk_factors: fbRiskFactors,
          target_price: formulaBrief.target_price ?? undefined,
          servings_per_container: formulaBrief.servings_per_container ?? undefined,
        } : undefined,
        // Primary source is formula_briefs (fbKeyDifferentiators/fbRiskFactors);
        // only fall back to the legacy category_analyses.top_strengths/top_weaknesses
        // columns when formula_briefs has nothing (that table is "frequently empty" —
        // see the note above dashboardData).
        top_strengths: fbKeyDifferentiators?.length
          ? fbKeyDifferentiators.map(d => ({ strength: d }))
          : (analysis?.top_strengths as Array<{ strength?: string; description?: string }> | null) ?? undefined,
        top_weaknesses: fbRiskFactors?.length
          ? fbRiskFactors.map(r => ({ weakness: r }))
          : (analysis?.top_weaknesses as Array<{ weakness?: string; description?: string }> | null) ?? undefined,
        market_summary: marketSummaryParsed,
        products_snapshot: analysis?.products_snapshot as {
          formula_references?: Array<{
            asin: string;
            age_months?: number;
            monthly_revenue?: number;
            monthly_sales?: number;
            brand?: string;
            title?: string;
          }>;
          top_performers?: Array<{
            asin: string;
            monthly_revenue?: number;
            monthly_sales?: number;
          }>;
        } | null,
      },
    };
  }, [analysis, formulaBrief]);

  // KPI calculations
  const totalRevenue = categorySales?.total_monthly_revenue ?? 
    products?.reduce((sum, p) => sum + (p.monthly_revenue ?? 0), 0) ?? 0;
  
  const uniqueBrands = products ? new Set(products.map(p => p.brand).filter(Boolean)).size : 0;

  // Compute from products data (P1/P2)
  const totalRevenueFromScout = products?.reduce((sum, p) => {
    const sales = (p as any).monthly_sales_est ?? 0;
    const price = p.price ?? 0;
    return sum + (sales * price);
  }, 0) ?? 0;

  const effectiveTotalRevenue = totalRevenue || totalRevenueFromScout;

  // Avg price
  const validPrices = products?.map(p => p.price ?? 0).filter(p => p > 0) ?? [];
  const avgPrice = validPrices.length ? validPrices.reduce((s, p) => s + p, 0) / validPrices.length : null;

  // Opportunity score: inverse of competition (lower avg BSR = higher opportunity)
  const avgBSRArr = products?.map(p => p.bsr_current ?? 0).filter(b => b > 0) ?? [];
  const avgBSRValue = avgBSRArr.length ? avgBSRArr.reduce((s, b) => s + b, 0) / avgBSRArr.length : null;
  const opportunityScore = avgBSRValue ? Math.min(100, Math.round(100 - (avgBSRValue / 500000) * 100)) : null;

  // Brand market share data
  const brandMarketShare = useMemo(() => {
    if (!products || products.length === 0) return [];

    const brandRevenue = new Map<string, number>();
    let totalRev = 0;

    products.forEach(product => {
      const brand = product.brand || "Unknown";
      const revenue = product.monthly_revenue ||
        ((product as any).monthly_sales_est ?? 0) * (product.price ?? 0) ||
        product.estimated_revenue || 0;
      brandRevenue.set(brand, (brandRevenue.get(brand) || 0) + revenue);
      totalRev += revenue;
    });

    if (totalRev === 0) return [];

    const CHART_COLORS = [
      "hsl(var(--chart-1))", "hsl(var(--chart-4))", "hsl(var(--chart-2))", "hsl(var(--chart-5))", "hsl(var(--destructive))", "hsl(var(--muted-foreground))"
    ];

    const sortedBrands = Array.from(brandRevenue.entries()).sort((a, b) => b[1] - a[1]);
    const topBrands = sortedBrands.slice(0, 5);
    const otherRevenue = sortedBrands.slice(5).reduce((sum, [_, rev]) => sum + rev, 0);

    const result = topBrands.map(([brand, revenue], idx) => ({
      name: brand.length > 15 ? brand.substring(0, 15) + "..." : brand,
      fullName: brand,
      value: Math.round((revenue / totalRev) * 100),
      revenue,
      fill: CHART_COLORS[idx % CHART_COLORS.length],
    }));

    if (otherRevenue > 0) {
      result.push({
        name: "Others",
        fullName: `${sortedBrands.length - 5} other brands`,
        value: Math.round((otherRevenue / totalRev) * 100),
        revenue: otherRevenue,
        fill: CHART_COLORS[5],
      });
    }

    return result;
  }, [products]);

  // Competition level from brand concentration
  const topBrandShare = brandMarketShare[0]?.value ?? 0;
  const computedCompetitionLevel = topBrandShare > 30 ? 'High' : topBrandShare > 15 ? 'Medium' : 'Low';

  // Market analysis computations
  const marketAnalysisData = useMemo(() => {
    if (!products || products.length === 0) return null;
    const total = products.length;
    const validPrices = products.map(p => p.price ?? 0).filter(p => p > 0);
    const validBSRs = products.map(p => p.bsr_current ?? 0).filter(b => b > 0);
    const avgPrice = validPrices.length ? validPrices.reduce((s, p) => s + p, 0) / validPrices.length : 0;
    const avgRating = products.reduce((s, p) => s + (p.rating ?? 0), 0) / total;
    const avgReviews = products.reduce((s, p) => s + (p.reviews ?? 0), 0) / total;
    const minPrice = validPrices.length ? Math.min(...validPrices) : 0;
    const maxPrice = validPrices.length ? Math.max(...validPrices) : 0;
    const minBSR = validBSRs.length ? Math.min(...validBSRs) : 0;
    const maxBSR = validBSRs.length ? Math.max(...validBSRs) : 0;

    // Brand rankings
    const brandMap = new Map<string, { count: number; bsrSum: number; bsrCount: number; ratingSum: number; reviewSum: number; priceSum: number; priceCount: number }>();
    products.forEach(p => {
      const brand = p.brand || "Unknown";
      const e = brandMap.get(brand) ?? { count: 0, bsrSum: 0, bsrCount: 0, ratingSum: 0, reviewSum: 0, priceSum: 0, priceCount: 0 };
      e.count++;
      if (p.bsr_current) { e.bsrSum += p.bsr_current; e.bsrCount++; }
      e.ratingSum += p.rating ?? 0;
      e.reviewSum += p.reviews ?? 0;
      if (p.price) { e.priceSum += p.price; e.priceCount++; }
      brandMap.set(brand, e);
    });
    const brandRankings = Array.from(brandMap.entries())
      .map(([name, d]) => ({
        name,
        productCount: d.count,
        avgBSR: d.bsrCount > 0 ? Math.round(d.bsrSum / d.bsrCount) : null,
        avgRating: (d.ratingSum / d.count).toFixed(1),
        avgReviews: Math.round(d.reviewSum / d.count),
        avgPrice: d.priceCount > 0 ? (d.priceSum / d.priceCount).toFixed(2) : null,
      }))
      .sort((a, b) => (a.avgBSR ?? 999999) - (b.avgBSR ?? 999999))
      .slice(0, 15);

    // Price vs BSR buckets
    const priceBSRData = [
      { label: "<$15", min: 0, max: 15 },
      { label: "$15-25", min: 15, max: 25 },
      { label: "$25-35", min: 25, max: 35 },
      { label: "$35+", min: 35, max: Infinity },
    ].map(bucket => {
      const bp = products.filter(p => (p.price ?? 0) >= bucket.min && (p.price ?? 0) < bucket.max);
      const bsrVals = bp.map(p => p.bsr_current ?? 0).filter(b => b > 0);
      return {
        label: bucket.label,
        avgBSR: bsrVals.length > 0 ? Math.round(bsrVals.reduce((s, b) => s + b, 0) / bsrVals.length) : 0,
        count: bp.length,
      };
    }).filter(d => d.count > 0);

    // Formula intelligence
    const withFacts = products.filter(p => p.supplement_facts_raw || p.all_nutrients).length;
    const supplementFactsPercent = Math.round((withFacts / total) * 100);
    const ingCounts = new Map<string, number>();
    const keywords = ['vitamin c', 'vitamin d', 'vitamin b12', 'magnesium', 'zinc', 'calcium', 'iron', 'omega-3', 'protein', 'collagen', 'probiotics', 'fiber', 'creatine', 'biotin', 'folate'];
    products.forEach(p => {
      const text = ((p.feature_bullets_text ?? '') + ' ' + (p.title ?? '')).toLowerCase();
      keywords.forEach(k => { if (text.includes(k)) ingCounts.set(k, (ingCounts.get(k) ?? 0) + 1); });
    });
    const topIngredients = Array.from(ingCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);

    // Rating distribution
    const ratingDistribution = [5, 4, 3, 2, 1].map(star => ({
      star: `${star}★`,
      count: products.filter(p => Math.round(p.rating ?? 0) === star).length,
    }));

    // Opportunity gap
    const opportunityGap = products
      .filter(p => (p.bsr_current ?? Infinity) < 10000 && (p.reviews ?? Infinity) < 500)
      .slice(0, 10)
      .map(p => ({
        asin: p.asin,
        title: (p.title ?? '').substring(0, 50) + ((p.title?.length ?? 0) > 50 ? '...' : ''),
        bsr: p.bsr_current,
        reviews: p.reviews,
        price: p.price,
      }));

    // Launch readiness score
    const marketSizeScore = Math.min(40, (total * avgReviews) / 1000);
    const competitionScore = avgReviews > 5000 ? 0 : avgReviews > 1000 ? 20 : 40;
    const priceScore = avgPrice >= 25 ? 20 : 10;
    const launchScore = Math.min(100, Math.round(marketSizeScore + competitionScore + priceScore));

    return { total, avgPrice, avgRating, avgReviews, minPrice, maxPrice, minBSR, maxBSR, brandRankings, priceBSRData, supplementFactsPercent, topIngredients, ratingDistribution, opportunityGap, launchScore };
  }, [products]);

  // Show full skeleton while initial data is loading
  const isInitialLoading = categoryLoading || (analysisLoading && !hasAnalysis && !hasProducts);
  
  if (isInitialLoading && categoryName) {
    return <DashboardSkeleton />;
  }

  if (!categoryName) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Target className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">No category selected. Start a new analysis to see the dashboard.</p>
      </div>
    );
  }

  const isDataLoading = analysisLoading || productsLoading;

  async function handleGenerateLink() {
    const name = window.prompt("Manufacturer name for this link:");
    if (!name || !name.trim()) return;
    setGeneratingLink(true);
    try {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
      const token = Array.from(crypto.getRandomValues(new Uint8Array(10)))
        .map((b) => chars[b % chars.length]).join("");
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await (supabase.from as any)("manufacturer_sessions")
        .insert({ token, manufacturer_name: name.trim(), expires_at: expiresAt });
      if (error) throw new Error(error.message);
      const url = `${window.location.origin}/mfr/${token}`;
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied to clipboard", description: url });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Failed to generate link", description: msg, variant: "destructive" });
    } finally {
      setGeneratingLink(false);
    }
  }

  return (
    <div className="space-y-3 md:space-y-4 pb-10 overflow-x-hidden bg-background text-foreground text-[13px]">
      {/* SECTION 1: Hero Header with Executive Summary */}
      <div className="animate-fade-in">
        <HeroHeader
        categoryName={categoryName}
        recommendation={analysis?.recommendation || null}
        opportunityIndex={analysis?.opportunity_index || 0}
        opportunityTier={analysis?.opportunity_tier || null}
        opportunityTierLabel={analysis?.opportunity_tier_label || null}
        // Primary source: formula_briefs.positioning (current pipeline data).
        // Falls back to the legacy category_analyses.executive_summary column,
        // which is "frequently empty" per the dashboardData memo's own note.
        // recommendation/opportunityIndex/opportunityTier have no formula_briefs
        // equivalent field today, so they remain category_analyses-sourced.
        executiveSummary={formulaBrief?.positioning || analysis?.executive_summary || null}
        topProducts={products?.slice(0, 5).map(p => ({
          main_image_url: p.main_image_url,
          brand: p.brand,
          title: p.title
        }))}
        isLoading={analysisLoading && !hasAnalysis}
        />
      </div>

      {/* SCOUT PIPELINE STATUS — live phase completion from Supabase */}
      {category?.id && (
        <ScrollAnimate delay={50} variant="fade-up" duration={400}>
          <PipelineCollapsible categoryId={category.id} categoryName={categoryName || ""} />
        </ScrollAnimate>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Pipeline tab strip — dark chrome extension of the app header,
            gliding smoke pill on the active tab (never yellow/accent), per
            takeout-design-spec.md §1 "The header". -mx cancels Layout's page
            gutter so this bar reads flush with the header above it. */}
        <div className="dark -mx-3 sm:-mx-4 md:-mx-6 lg:-mx-0 px-3 sm:px-4 md:px-6 lg:px-0 bg-background border-b border-border/60">
          <TabsList className="flex w-full items-center gap-1 h-auto py-2 bg-transparent overflow-x-auto scrollbar-hide">
            <TabsTrigger className="takeout-pipeline-tab" value="products"><Package className="h-3.5 w-3.5" /> Products</TabsTrigger>
            <TabsTrigger className="takeout-pipeline-tab" value="market"><TrendingUp className="h-3.5 w-3.5" /> Market</TabsTrigger>
            <TabsTrigger className="takeout-pipeline-tab" value="formula"><FlaskConical className="h-3.5 w-3.5" /> Formula</TabsTrigger>
            <TabsTrigger className="takeout-pipeline-tab" value="manufacturer"><Factory className="h-3.5 w-3.5" /> Manufacturer</TabsTrigger>
            <TabsTrigger className="takeout-pipeline-tab" value="data-audit"><ScanSearch className="h-3.5 w-3.5" /> Data Audit</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="products" className="space-y-4 mt-3">
      {/* FORMULA PASSPORT — Option C: compact status card at the top of
          Products, same useFormulaJourney state machine as the Formula tab.
          Renders nothing when the category has no formula data yet. */}
      {category?.id && (
        <ScrollAnimate delay={50} variant="fade-up" duration={400}>
          <FormulaPassport
            categoryId={category.id}
            categoryName={categoryName || undefined}
            activeVersionNumber={activeVersion?.version_number}
            setActiveTab={setActiveTab}
          />
        </ScrollAnimate>
      )}

      {/* SECTION 2: KPI Metrics Grid (Scoreboards) */}
      <ScrollAnimate delay={100} variant="fade-up" duration={500}>
        <KPIMetricsGrid
        marketSize={effectiveTotalRevenue}
        avgPrice={avgPrice}
        competitionLevel={computedCompetitionLevel}
        brandCount={uniqueBrands}
        opportunityScore={opportunityScore}
        isLoading={isDataLoading && !hasAnalysis}
        />
      </ScrollAnimate>

      {/* SECTION 3: Benchmark Comparison - Top 5 Competitors */}
      <ScrollAnimate delay={50} variant="scale-up" duration={600}>
        <EnhancedBenchmarkComparison
          categoryId={category?.id}
          keyword={categoryName || undefined}
          analysisData={dashboardData.benchmarkData}
          isLoading={productsLoading}
        />
      </ScrollAnimate>

      {/* SECTION 3b: P9 Benchmark Overview */}
      {category?.id && (
        <ScrollAnimate delay={100} variant="fade-up" duration={500}>
          <P9BenchmarkOverview
            categoryId={category.id}
            activeVersionContent={activeVersion?.formula_brief_content}
            activeVersionInfo={activeVersion ? {
              versionNumber: activeVersion.version_number,
              changeSummary: activeVersion.change_summary,
              createdAt: activeVersion.created_at,
            } : null}
          />
        </ScrollAnimate>
      )}

      {/* SECTION 4: Brand Market Share */}
      {brandMarketShare.length > 0 ? (
        <ScrollAnimate delay={100} variant="fade-left" duration={600}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <Building2 className="w-5 h-5 text-primary" />
                Brand Market Share
              </CardTitle>
              <CardDescription>Revenue distribution across top brands</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="w-full md:w-1/2" onTouchStart={(e) => e.stopPropagation()}>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={brandMarketShare}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {brandMarketShare.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip 
                        content={({ payload }) => {
                          if (payload && payload.length > 0) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-popover border border-border rounded-md p-2 shadow-md">
                                <p className="font-medium text-sm">{data.fullName}</p>
                                <p className="text-sm text-muted-foreground">Share: {data.value}%</p>
                                <p className="text-sm text-primary">
                                  ${(Number(data.revenue || 0) / 1000).toFixed(1)}K/mo
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full md:w-1/2">
                  {brandMarketShare.slice(0, 6).map((brand, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-secondary/50 rounded-lg">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: brand.fill }} />
                      <div className="min-w-0 flex-1">
                        <span className="text-xs text-foreground truncate block">{brand.fullName}</span>
                        <span className="text-sm font-bold">{brand.value}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </ScrollAnimate>
      ) : productsLoading ? (
        <ScrollAnimate delay={100} variant="fade-up">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <Building2 className="w-5 h-5 text-primary" />
                Brand Market Share
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[200px] w-full" />
            </CardContent>
          </Card>
        </ScrollAnimate>
      ) : null}

      {/* SECTION 5: Low Confidence Products */}
      <ScrollAnimate delay={100} variant="fade-up" duration={500}>
        <LowConfidenceProducts
          products={products?.map(p => ({
            id: p.id,
            asin: p.asin,
            title: p.title,
            brand: p.brand,
            main_image_url: p.main_image_url,
            ocr_confidence: p.ocr_confidence,
            nutrients_count: p.nutrients_count
          }))}
          categoryId={category?.id}
          isLoading={productsLoading}
        />
      </ScrollAnimate>

      {/* SECTION 6: P6 Product Formula Intelligence */}
      {category?.id && (
        <ScrollAnimate delay={100} variant="fade-up" duration={500}>
          <ProductFormulaIntelligence categoryId={category.id} categoryName={category.name} />
        </ScrollAnimate>
      )}

        </TabsContent>

        <TabsContent value="market" className="space-y-4 mt-3">

          {/* P6 Market Intelligence — always at top */}
          {category?.id && (
            <MarketIntelligenceReport categoryId={category.id} categoryName={categoryName || ""} />
          )}

          {productsLoading && !marketAnalysisData ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Loading market data...</CardContent></Card>
          ) : !marketAnalysisData ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No product data available for market analysis.</CardContent></Card>
          ) : (
            <>
              {/* Market Overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Market Overview</CardTitle>
                  <CardDescription>Key metrics across {marketAnalysisData.total} products in this category</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center p-3 bg-secondary/50 rounded-lg">
                      <p className="text-[20px] font-semibold tabular-nums text-foreground">{marketAnalysisData.total}</p>
                      <p className="text-xs text-muted-foreground">Total Products</p>
                    </div>
                    <div className="text-center p-3 bg-secondary/50 rounded-lg">
                      <p className="text-[20px] font-semibold tabular-nums text-foreground">${marketAnalysisData.avgPrice.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">Avg Price</p>
                    </div>
                    <div className="text-center p-3 bg-secondary/50 rounded-lg">
                      <p className="text-[20px] font-semibold tabular-nums text-foreground">{marketAnalysisData.avgRating.toFixed(1)}★</p>
                      <p className="text-xs text-muted-foreground">Avg Rating</p>
                    </div>
                    <div className="text-center p-3 bg-secondary/50 rounded-lg">
                      <p className="text-[20px] font-semibold tabular-nums text-foreground">{Math.round(marketAnalysisData.avgReviews).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Avg Reviews</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Price Range</p>
                      <p className="text-sm font-medium">${marketAnalysisData.minPrice.toFixed(2)} – ${marketAnalysisData.maxPrice.toFixed(2)}</p>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">BSR Range</p>
                      <p className="text-sm font-medium">{marketAnalysisData.minBSR.toLocaleString()} – {marketAnalysisData.maxBSR.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Brand Rankings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Brand Rankings</CardTitle>
                  <CardDescription>Sorted by average BSR (lower = better rank)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Brand</th>
                          <th className="text-right py-2 px-3 text-muted-foreground font-medium">Products</th>
                          <th className="text-right py-2 px-3 text-muted-foreground font-medium">Avg BSR</th>
                          <th className="text-right py-2 px-3 text-muted-foreground font-medium">Avg ★</th>
                          <th className="text-right py-2 px-3 text-muted-foreground font-medium">Avg Reviews</th>
                          <th className="text-right py-2 pl-3 text-muted-foreground font-medium">Avg Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {marketAnalysisData.brandRankings.map((brand, idx) => (
                          <tr key={idx} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-2 pr-3 font-medium max-w-[150px] truncate">{brand.name}</td>
                            <td className="text-right py-2 px-3 text-muted-foreground">{brand.productCount}</td>
                            <td className="text-right py-2 px-3">
                              {brand.avgBSR ? (
                                <Badge variant={brand.avgBSR < 5000 ? "default" : "secondary"} className="text-xs">
                                  #{brand.avgBSR.toLocaleString()}
                                </Badge>
                              ) : "-"}
                            </td>
                            <td className="text-right py-2 px-3">{brand.avgRating}</td>
                            <td className="text-right py-2 px-3 text-muted-foreground">{brand.avgReviews.toLocaleString()}</td>
                            <td className="text-right py-2 pl-3">{brand.avgPrice ? `$${brand.avgPrice}` : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Price vs BSR */}
              {marketAnalysisData.priceBSRData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold">Price vs BSR Insight</CardTitle>
                    <CardDescription>Average BSR by price bucket (lower BSR = better rank)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={marketAnalysisData.priceBSRData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => v.toLocaleString()} />
                        <Tooltip formatter={(v: number) => [v.toLocaleString(), "Avg BSR"]} />
                        <Bar dataKey="avgBSR" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Formula Intelligence */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Formula Intelligence</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${marketAnalysisData.supplementFactsPercent}%` }} />
                    </div>
                    <span className="text-sm font-medium shrink-0">{marketAnalysisData.supplementFactsPercent}% have supplement facts</span>
                  </div>
                  {marketAnalysisData.topIngredients.length > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Most common ingredients</p>
                      <div className="flex flex-wrap gap-2">
                        {marketAnalysisData.topIngredients.map(([name, count]) => (
                          <Badge key={name} variant="secondary" className="capitalize">
                            {name} <span className="ml-1 text-muted-foreground">({count})</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Review Sentiment */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Review Sentiment Summary</CardTitle>
                  <CardDescription>Rating distribution across all products</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={marketAnalysisData.ratingDistribution} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <XAxis dataKey="star" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v: number) => [v, "Products"]} />
                      <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Opportunity Gap */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Opportunity Gap</CardTitle>
                  <CardDescription>Products with BSR &lt; 10,000 AND reviews &lt; 500 — potential breakout opportunities</CardDescription>
                </CardHeader>
                <CardContent>
                  {marketAnalysisData.opportunityGap.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No products match the breakout criteria (BSR &lt; 10k, reviews &lt; 500).</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 pr-3 text-muted-foreground font-medium">ASIN</th>
                            <th className="text-left py-2 pr-3 text-muted-foreground font-medium">Title</th>
                            <th className="text-right py-2 px-3 text-muted-foreground font-medium">BSR</th>
                            <th className="text-right py-2 px-3 text-muted-foreground font-medium">Reviews</th>
                            <th className="text-right py-2 pl-3 text-muted-foreground font-medium">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {marketAnalysisData.opportunityGap.map((p, idx) => (
                            <tr key={idx} className="border-b border-border/50 hover:bg-muted/30">
                              <td className="py-2 pr-3 font-mono text-xs text-primary">{p.asin}</td>
                              <td className="py-2 pr-3 text-xs max-w-[200px] truncate">{p.title}</td>
                              <td className="text-right py-2 px-3"><Badge variant="default" className="text-xs">#{(p.bsr ?? 0).toLocaleString()}</Badge></td>
                              <td className="text-right py-2 px-3 text-muted-foreground">{(p.reviews ?? 0).toLocaleString()}</td>
                              <td className="text-right py-2 pl-3">{p.price ? `$${p.price.toFixed(2)}` : "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Launch Readiness */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Launch Readiness Score</CardTitle>
                  <CardDescription>Based on market size, competition level, and price opportunity</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[24px] font-semibold tabular-nums text-foreground">{marketAnalysisData.launchScore}</span>
                    <Badge variant={marketAnalysisData.launchScore >= 70 ? "default" : marketAnalysisData.launchScore >= 40 ? "secondary" : "destructive"}>
                      {marketAnalysisData.launchScore >= 70 ? "Ready" : marketAnalysisData.launchScore >= 40 ? "Moderate" : "Challenging"}
                    </Badge>
                  </div>
                  <Progress value={marketAnalysisData.launchScore} className="h-3" />
                  <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground mt-2">
                    <div className="p-2 bg-muted/50 rounded">
                      <p className="font-medium text-foreground">Market Size</p>
                      <p>{marketAnalysisData.total} products · {Math.round(marketAnalysisData.avgReviews).toLocaleString()} avg reviews</p>
                    </div>
                    <div className="p-2 bg-muted/50 rounded">
                      <p className="font-medium text-foreground">Competition</p>
                      <p>{marketAnalysisData.avgReviews > 5000 ? "High" : marketAnalysisData.avgReviews > 1000 ? "Medium" : "Low"}</p>
                    </div>
                    <div className="p-2 bg-muted/50 rounded">
                      <p className="font-medium text-foreground">Price Opportunity</p>
                      <p>{marketAnalysisData.avgPrice >= 25 ? "Good margin" : "Tight margin"} · avg ${marketAnalysisData.avgPrice.toFixed(2)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* TAB: Formula Journey — one linear timeline through Formulation (P8) →
            QA Review (P9) → Competitive Benchmark (P11) → FDA/DSHEA Compliance
            (P12) → Factory Handoff. Replaces the old separate "QA Review" and
            "Compliance" tabs; each stage's expander reuses the same
            FormulaBriefTab/FormulaQATab/FormulaValidationTab components as-is. */}
        <TabsContent value="formula" className="space-y-4 mt-3">
          {category?.id ? (
            <FormulaJourneyTab
              categoryId={category.id}
              categoryName={categoryName || undefined}
              activeVersionInfo={activeVersion ? { versionNumber: activeVersion.version_number, changeSummary: activeVersion.change_summary } : null}
              setActiveTab={setActiveTab}
              handleGenerateLink={handleGenerateLink}
              generatingLink={generatingLink}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">Select a category to view the formula journey.</div>
          )}
        </TabsContent>

        {/* TAB 7: Manufacturer Feedback — living formula brief */}
        <TabsContent value="manufacturer" className="space-y-4 mt-3">
          <div className="flex justify-end">
            {/* pearl-pill + pearl-neon is the project's own documented "one
                deliberate accent exception" tier (index.css PILL(neon)) —
                the shadcn Button's cva always injects a base pearl-button/
                pearl-quiet/pearl-secondary class alongside whatever className
                is passed, which collides with the `:not(.pearl-neon)`
                exclusions that keep this pill flat, so it stays a native
                button wearing the pearl-pill/pearl-neon component classes
                rather than being force-fit into the shadcn wrapper. */}
            <button
              type="button"
              className="pearl-pill pearl-neon"
              onClick={handleGenerateLink}
              disabled={generatingLink}
            >
              <Link2 className="w-3.5 h-3.5" />
              {generatingLink ? "Generating…" : "Generate Manufacturer Link ↗"}
            </button>
          </div>
          {category?.id && categoryName ? (
            <ManufacturerFeedback
              categoryId={category.id}
              keyword={categoryName}
              defaultExpanded
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">Select a category to view manufacturer feedback.</div>
          )}
        </TabsContent>

        {/* TAB 8: Data Completeness Audit — real per-phase data checks, not job status */}
        <TabsContent value="data-audit" className="space-y-4 mt-3">
          {categoryName ? (
            <DataCompletenessChecklist keyword={categoryName} />
          ) : (
            <div className="text-center py-12 text-muted-foreground">Select a category to run the data audit.</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
