import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollAnimate } from "@/components/ui/scroll-animate";
import { 
  Loader2, RefreshCw, CheckCircle2, Circle, Clock,
  Building2, Package, Eye, MessageSquare, BarChart3, Sparkles
} from "lucide-react";

// Dashboard components
import { HeroHeader } from "@/components/dashboard/HeroHeader";
import { KPIMetricsGrid } from "@/components/dashboard/KPIMetricsGrid";
import { DeepDiveSection } from "@/components/dashboard/DeepDiveSection";
import { EnhancedBenchmarkComparison } from "@/components/dashboard/EnhancedBenchmarkComparison";
import { FinancialProjections } from "@/components/dashboard/FinancialProjections";
import { RiskAnalysis } from "@/components/dashboard/RiskAnalysis";
import { LaunchPlanSection } from "@/components/dashboard/LaunchPlanSection";
import CustomerIntelligence from "@/components/dashboard/CustomerIntelligence";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { useCategoryByName } from "@/hooks/useCategoryByName";
import { useCategoryAnalysis } from "@/hooks/useCategoryAnalyses";
import { useProducts } from "@/hooks/useProducts";
import { useCategoryContext } from "@/contexts/CategoryContext";
import { useCategoryScores } from "@/hooks/useCategoryScores";
import { useCategorySales } from "@/hooks/useCategorySales";
import { useFormulaBrief } from "@/hooks/useFormulaBrief";
import { useAnalysisProgress } from "@/hooks/useAnalysisProgress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Target } from "lucide-react";

interface CriteriaBreakdown {
  name?: string;
  criterion?: string;
  category?: string;
  raw_score?: number;
  score?: number;
  weight?: number;
  weighted_score?: number;
}

interface PainPoint {
  pain_point?: string;
  issue?: string;
  theme?: string;
  frequency?: number | string;
  evidence?: string;
}

interface ActionItem {
  step?: number | string;
  action?: string;
  timeline?: string;
  month?: string;
  priority?: string;
  status?: string;
  description?: string;
}

export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const urlCategoryName = searchParams.get("category");
  const { setCategoryContext, categoryName: contextCategoryName } = useCategoryContext();
  const queryClient = useQueryClient();

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
  const { data: formulaBrief } = useFormulaBrief(category?.id);

  const hasCategory = !!category;
  const hasAnalysis = !!analysis;
  const hasProducts = products && products.length > 0;
  const hasScores = !!categoryScores;
  const hasFormulaBriefData = !!formulaBrief;

  // Granular progress tracking
  const { progress } = useAnalysisProgress(
    category?.id,
    hasCategory,
    hasAnalysis,
    hasScores,
    hasFormulaBriefData
  );

  // Parse analysis data for components
  const dashboardData = useMemo(() => {
    const analysis1 = analysis?.analysis_1_category_scores as Record<string, unknown> | null;
    const analysis2 = analysis?.analysis_2_opportunity_calculation as Record<string, unknown> | null;
    const keyInsights = analysis?.key_insights as Record<string, unknown> | null;
    
    // Customer insights for pain points and intelligence
    const customerInsights = analysis1?.customer_insights as Record<string, unknown> | null;
    const primaryPainPoints = (customerInsights?.primary_pain_points as PainPoint[]) || [];
    const unmetNeeds = (customerInsights?.unmet_needs as string[]) || [];
    const loveMost = (customerInsights?.love_most as string[]) || [];
    const buyerProfile = customerInsights?.buyer_profile as string | null;
    const decisionDrivers = (customerInsights?.decision_drivers as string[]) || [];

    // Criteria breakdown for radar chart
    const weightedScoring = analysis2?.weighted_scoring as Record<string, unknown> | null;
    const criteriaBreakdown = (weightedScoring?.criteria_breakdown as CriteriaBreakdown[]) || [];
    
    // Transform criteria for radar chart
    const criteriaScores = criteriaBreakdown.map(cb => ({
      name: cb.name || cb.criterion || cb.category || "Unknown",
      score: cb.raw_score || cb.score || 0,
      weight: cb.weight || 1,
      weighted_score: cb.weighted_score || 0,
    }));

    // Top strengths and weaknesses
    const rawStrengths = (analysis2?.top_strengths as unknown[]) || (analysis?.top_strengths as unknown[]) || [];
    const rawWeaknesses = (analysis2?.top_weaknesses as unknown[]) || (analysis?.top_weaknesses as unknown[]) || [];
    
    const extractStrings = (arr: unknown[]): string[] => {
      return arr.map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          return (obj.criterion || obj.justification || obj.name || String(obj.score || '')) as string;
        }
        return String(item);
      }).filter(Boolean);
    };
    
    const topStrengths = extractStrings(rawStrengths);
    const topWeaknesses = extractStrings(rawWeaknesses);
    
    // Risks
    const risks = keyInsights?.risks as Record<string, unknown> | null;
    const rawCategoryRisks = (risks?.category_challenges as unknown[]) || [];
    const categoryRisks = extractStrings(rawCategoryRisks);
    const criticalRisks = [...topWeaknesses.slice(0, 2), ...categoryRisks.slice(0, 2)];

    // Financial data
    const financials = keyInsights?.financials as Record<string, unknown> | null;
    const investmentBreakdown = financials?.startup_investment as Record<string, unknown> | null;
    const totalInvestment = (investmentBreakdown?.total as number) || null;
    const revenueTargets = financials?.revenue_targets as Record<string, number> | null;
    const margins = financials?.margins as Record<string, number> | null;

    // Action items
    const actionItems = (keyInsights?.action_items as ActionItem[]) || [];

    // Competition data
    const competitiveLandscape = analysis1?.competitive_landscape as Record<string, unknown> | null;
    const competitionLevel = (competitiveLandscape?.market_concentration as string) || 
                            (competitiveLandscape?.concentration as string) ||
                            (analysis2?.competition_level as string) || null;
    
    // Risk score
    const riskScore = (analysis2?.risk_score as number) || null;

    // Go to market
    const goToMarket = keyInsights?.go_to_market as Record<string, unknown> | null;

    // For benchmark comparison
    const recommendedPrice = analysis?.recommended_price;
    const keyDifferentiators = (keyInsights?.key_differentiators as string[]) || 
                               (analysis1?.key_differentiators as string[]) || [];

    return {
      criteriaScores,
      criteriaBreakdown,
      topOpportunities: topStrengths,
      criticalRisks,
      primaryPainPoints,
      unmetNeeds,
      customerIntelligence: {
        buyer_profile: buyerProfile || undefined,
        primary_pain_points: primaryPainPoints,
        unmet_needs: unmetNeeds,
        love_most: loveMost,
        decision_drivers: decisionDrivers,
      },
      investmentBreakdown: investmentBreakdown?.breakdown as Record<string, number> | null,
      totalInvestment,
      revenueTargets,
      margins,
      actionItems,
      competitionLevel,
      riskScore,
      financials,
      goToMarket,
      risks,
      // For benchmark - pass raw analysis objects
      benchmarkData: {
        key_insights: keyInsights as {
          go_to_market?: {
            positioning?: string;
            messaging?: string[];
          };
        } | null,
        analysis_1_category_scores: analysis1 as {
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
      },
    };
  }, [analysis]);

  // KPI calculations
  const totalRevenue = categorySales?.total_monthly_revenue ?? 
    products?.reduce((sum, p) => sum + (p.monthly_revenue ?? 0), 0) ?? 0;
  
  const uniqueBrands = products ? new Set(products.map(p => p.brand).filter(Boolean)).size : 0;

  // Brand market share data
  const brandMarketShare = useMemo(() => {
    if (!products || products.length === 0) return [];

    const brandRevenue = new Map<string, number>();
    let totalRev = 0;

    products.forEach(product => {
      const brand = product.brand || "Unknown";
      const revenue = product.monthly_revenue || product.estimated_revenue || 0;
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

  return (
    <div className="space-y-10 pb-16">
      {/* SECTION 1: Hero Header with Executive Summary */}
      <div className="animate-fade-in">
        <HeroHeader
        categoryName={categoryName}
        recommendation={analysis?.recommendation || null}
        opportunityIndex={analysis?.opportunity_index || 0}
        opportunityTier={analysis?.opportunity_tier || null}
        opportunityTierLabel={analysis?.opportunity_tier_label || null}
        executiveSummary={analysis?.executive_summary || null}
        topProducts={products?.slice(0, 5).map(p => ({
          main_image_url: p.main_image_url,
          brand: p.brand,
          title: p.title
        }))}
        isLoading={analysisLoading && !hasAnalysis}
        />
      </div>

      {/* Progress Banner */}
      {!progress.isComplete && (
        <Card className="border-primary/30 bg-primary/5 animate-pulse [animation-duration:3s]">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RefreshCw className="h-5 w-5 text-primary animate-spin" />
                  <div>
                    <p className="font-medium text-foreground">Analysis in Progress</p>
                    <p className="text-sm text-muted-foreground">
                      {progress.overallPercentage}% Complete • Est. {progress.estimatedMinutesRemaining} min remaining
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-sm">
                  {progress.overallPercentage}%
                </Badge>
              </div>
              <Progress value={progress.overallPercentage} className="h-2" />
              
              {/* Phase-by-phase breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                {progress.phases.map((phase, idx) => {
                  const PhaseIcon = [CheckCircle2, Package, Eye, BarChart3, MessageSquare, Sparkles][idx] || Circle;
                  const isComplete = phase.percentage >= 100;
                  const isActive = phase.percentage > 0 && phase.percentage < 100;
                  
                  return (
                    <div 
                      key={idx} 
                      className={`p-3 rounded-lg border ${
                        isComplete 
                          ? 'border-chart-4/30 bg-chart-4/5' 
                          : isActive 
                            ? 'border-primary/30 bg-primary/5' 
                            : 'border-border bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <PhaseIcon className={`w-4 h-4 ${
                          isComplete 
                            ? 'text-chart-4' 
                            : isActive 
                              ? 'text-primary' 
                              : 'text-muted-foreground'
                        }`} />
                        <span className={`text-xs font-medium ${
                          isComplete 
                            ? 'text-chart-4' 
                            : isActive 
                              ? 'text-primary' 
                              : 'text-muted-foreground'
                        }`}>
                          {phase.name}
                        </span>
                      </div>
                      <Progress 
                        value={phase.percentage} 
                        className={`h-1.5 ${isComplete ? '[&>div]:bg-chart-4' : ''}`}
                      />
                      <div className="flex justify-between items-center mt-1.5">
                        <span className="text-[10px] text-muted-foreground">
                          {phase.completed}/{phase.total}
                        </span>
                        <span className={`text-[10px] font-medium ${
                          isComplete ? 'text-chart-4' : 'text-muted-foreground'
                        }`}>
                          {phase.percentage}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Auto-refreshing every 5 seconds
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION 2: KPI Metrics Grid (Scoreboards) */}
      <div className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <KPIMetricsGrid
        marketSize={totalRevenue}
        profitMargin={dashboardData.margins?.year_1 || null}
        competitionLevel={dashboardData.competitionLevel}
        brandCount={uniqueBrands}
        riskScore={dashboardData.riskScore}
        isLoading={isDataLoading && !hasAnalysis}
        />
      </div>

      {/* SECTION 3: Benchmark Comparison - Top 5 Competitors */}
      <ScrollAnimate delay={50}>
        <EnhancedBenchmarkComparison
        categoryId={category?.id}
        analysisData={dashboardData.benchmarkData}
        isLoading={productsLoading}
        />
      </ScrollAnimate>

      {/* SECTION 4: Brand Market Share */}
      {brandMarketShare.length > 0 ? (
        <ScrollAnimate delay={100}>
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
                <div className="w-full md:w-1/2">
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
                                  ${(data.revenue / 1000).toFixed(1)}K/mo
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
        <ScrollAnimate delay={100}>
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

      {/* SECTION 5: 18-Point Analysis */}
      <ScrollAnimate delay={150}>
        <DeepDiveSection
        criteriaScores={dashboardData.criteriaScores}
        criteriaBreakdown={dashboardData.criteriaBreakdown}
        executiveSummary={analysis?.executive_summary || null}
        topOpportunities={dashboardData.topOpportunities}
        criticalRisks={dashboardData.criticalRisks}
        isLoading={analysisLoading && !hasAnalysis}
        />
      </ScrollAnimate>

      {/* SECTION 5: Customer Intelligence */}
      <ScrollAnimate delay={200}>
        <CustomerIntelligence
        customerInsights={dashboardData.customerIntelligence}
        isLoading={analysisLoading && !hasAnalysis}
        />
      </ScrollAnimate>

      {/* SECTION 6: Financial Projections */}
      <ScrollAnimate delay={250}>
        <FinancialProjections 
          financials={dashboardData.financials as Record<string, unknown> | null} 
          isLoading={analysisLoading && !hasAnalysis}
        />
      </ScrollAnimate>

      {/* SECTION 7: Launch Strategy + Action Plan */}
      <ScrollAnimate delay={300}>
        <LaunchPlanSection
        goToMarket={dashboardData.goToMarket as {
          positioning?: string;
          messaging?: string[];
          differentiation?: string[];
          launch_strategy?: {
            pricing_approach?: string;
            review_strategy?: string;
            advertising?: string;
          };
        } | null}
        actionItems={dashboardData.actionItems}
        isLoading={analysisLoading && !hasAnalysis}
        />
      </ScrollAnimate>

      {/* SECTION 8: Risk Analysis */}
      <ScrollAnimate delay={350}>
        <RiskAnalysis 
          risks={dashboardData.risks as Record<string, unknown> | null} 
          isLoading={analysisLoading && !hasAnalysis}
        />
      </ScrollAnimate>
    </div>
  );
}
