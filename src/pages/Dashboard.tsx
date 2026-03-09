import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollAnimate, ScrollSection, ScrollCounter } from "@/components/ui/scroll-animate";
import { 
  Loader2, RefreshCw, CheckCircle2, Circle, Clock,
  Building2, Package, Eye, MessageSquare, BarChart3, Sparkles, GitBranch, AlertTriangle
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
import { PackagingIntelligence } from "@/components/dashboard/PackagingIntelligence";
import { VersionBadge } from "@/components/dashboard/VersionBadge";
import { VersionHistoryTimeline } from "@/components/dashboard/VersionHistoryTimeline";
import { VersionComparisonView } from "@/components/dashboard/VersionComparisonView";
import { LowConfidenceProducts } from "@/components/dashboard/LowConfidenceProducts";

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
import { useFormulaBrief } from "@/hooks/useFormulaBrief";
import { useAnalysisProgress } from "@/hooks/useAnalysisProgress";
import { useFormulaBriefVersions } from "@/hooks/useFormulaBriefVersions";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Target } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const rawUrlCategoryName = searchParams.get("category");
  const urlCategoryName = rawUrlCategoryName ? rawUrlCategoryName.replace(/^=+/, "").trim() : null;
  const { setCategoryContext, categoryName: contextCategoryName } = useCategoryContext();
  const queryClient = useQueryClient();
  
  // Formula version state
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [activeTab, setActiveTab] = useState("products");

  const categoryName = urlCategoryName || contextCategoryName;

  const { data: category, isLoading: categoryLoading } = useCategoryByName(categoryName || undefined);
  
  // Formula brief versions
  const { versions, activeVersion, isLoading: versionsLoading } = useFormulaBriefVersions(category?.id);

  // Set selected version to active version when loaded
  useEffect(() => {
    if (activeVersion && !selectedVersionId) {
      setSelectedVersionId(activeVersion.id);
    }
  }, [activeVersion, selectedVersionId]);

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
  
  // Get the formula version ID to pass to analysis components
  // null means "original analysis" (no version), otherwise use the selected version
  const formulaVersionId = selectedVersionId || null;
  
  // Get current selected version info for display
  const selectedVersion = selectedVersionId 
    ? versions.find(v => v.id === selectedVersionId) 
    : null;

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
    const analysis3 = analysis?.analysis_3_formula_brief as Record<string, unknown> | null;
    const keyInsights = analysis?.key_insights as Record<string, unknown> | null;
    const formulaBriefContent = (analysis3?.formula_brief_content as string) || null;
    
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
        formula_brief_content: formulaBriefContent,
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

  return (
    <div className="space-y-6 md:space-y-10 pb-12 md:pb-16 overflow-x-hidden">
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

      {/* Formula Version Selector */}
      {versions.length > 0 && (
        <div className="flex items-center justify-between gap-3 p-4 bg-muted/50 rounded-lg border border-border">
          <div className="flex items-center gap-3">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Formula Version:</span>
            <Select
              value={selectedVersionId || "original"}
              onValueChange={(value) => setSelectedVersionId(value === "original" ? null : value)}
            >
              <SelectTrigger className="w-[200px] bg-background">
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent className="bg-popover border border-border">
                <SelectItem value="original">Original Analysis</SelectItem>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    Version {v.version_number} {v.is_active && "(Active)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedVersionId && versions.find(v => v.id === selectedVersionId)?.change_summary && (
              <Badge variant="secondary" className="text-xs max-w-[200px] truncate">
                {versions.find(v => v.id === selectedVersionId)?.change_summary}
              </Badge>
            )}
          </div>
          <button
            onClick={() => setShowComparison(!showComparison)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              showComparison 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-background border border-border hover:bg-muted'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 3h5v5M8 3H3v5M3 16v5h5M21 16v5h-5M21 3l-7 7M3 21l7-7" />
            </svg>
            {showComparison ? 'Hide Comparison' : 'Compare Versions'}
          </button>
        </div>
      )}

      {/* Version Comparison View */}
      {showComparison && versions.length > 0 && category?.id && (
        <VersionComparisonView
          categoryId={category.id}
          versions={versions}
          onClose={() => setShowComparison(false)}
        />
      )}

      {/* Version History Timeline */}
      {versions.length > 0 && !showComparison && (
        <VersionHistoryTimeline
          versions={versions}
          selectedVersionId={selectedVersionId}
          onSelectVersion={setSelectedVersionId}
        />
      )}

      {/* Outdated Version Warning Banner */}
      {selectedVersion && !selectedVersion.is_active && (
        <div className="flex items-center gap-3 p-4 bg-warning/10 rounded-lg border border-warning/30">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-foreground text-sm">
              Viewing Outdated Formula Version
            </p>
            <p className="text-xs text-muted-foreground">
              You are viewing analyses for Version {selectedVersion.version_number}, which is no longer active. 
              {activeVersion && (
                <> The current active version is Version {activeVersion.version_number}.</>
              )}
            </p>
          </div>
          {activeVersion && (
            <button
              onClick={() => setSelectedVersionId(activeVersion.id)}
              className="text-xs font-medium text-primary hover:underline shrink-0"
            >
              Switch to Active
            </button>
          )}
        </div>
      )}

      {/* Progress Banner */}
      {!progress.isComplete && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 sm:p-6">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 mt-4">
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="products">📦 Products Analysis</TabsTrigger>
          <TabsTrigger value="market">📈 Market Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-6 md:space-y-10 mt-4">
      {/* SECTION 2: KPI Metrics Grid (Scoreboards) */}
      <ScrollAnimate delay={100} variant="fade-up" duration={500}>
        <KPIMetricsGrid
        marketSize={totalRevenue}
        profitMargin={dashboardData.margins?.year_1 || null}
        competitionLevel={dashboardData.competitionLevel}
        brandCount={uniqueBrands}
        riskScore={dashboardData.riskScore}
        isLoading={isDataLoading && !hasAnalysis}
        />
      </ScrollAnimate>

      {/* SECTION 3: Benchmark Comparison - Top 5 Competitors */}
      <ScrollAnimate delay={50} variant="scale-up" duration={600}>
        <EnhancedBenchmarkComparison
        categoryId={category?.id}
        analysisData={dashboardData.benchmarkData}
        isLoading={productsLoading}
        formulaVersionId={formulaVersionId}
        versionInfo={selectedVersion ? {
          versionNumber: selectedVersion.version_number,
          isActive: selectedVersion.is_active,
          changeSummary: selectedVersion.change_summary
        } : undefined}
        />
      </ScrollAnimate>

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

      {/* SECTION 6: Packaging Intelligence */}
      <ScrollAnimate delay={100} variant="fade-right" duration={600}>
        <PackagingIntelligence
          packagingData={(() => {
            const analysis1 = analysis?.analysis_1_category_scores as Record<string, unknown> | null;
            const productDev = analysis1?.product_development as Record<string, unknown> | null;
            return productDev?.packaging as { type?: string; quantity?: string | number; design_elements?: string[] } | null;
          })()}
          productsClaims={products?.map(p => p.claims) || []}
          productsData={products?.map(p => ({
            packaging_type: p.packaging_type,
            servings_per_container: p.servings_per_container,
            price: p.price,
            brand: p.brand,
            title: p.title,
            main_image_url: p.main_image_url,
            claims: p.claims,
            claims_on_label: p.claims_on_label,
            monthly_revenue: p.monthly_revenue,
            monthly_sales: p.monthly_sales,
            marketing_analysis: p.marketing_analysis as {
              design_blueprint?: {
                trust_signals?: string;
                color_strategy?: string;
                visual_style?: string;
              };
            } | null,
          })) || []}
          isLoading={analysisLoading && !hasAnalysis}
          categoryId={category?.id}
          formulaVersionId={formulaVersionId}
          versionInfo={selectedVersion ? {
            versionNumber: selectedVersion.version_number,
            isActive: selectedVersion.is_active,
            changeSummary: selectedVersion.change_summary
          } : undefined}
          formulaBriefContent={selectedVersion?.formula_brief_content || (analysis?.analysis_3_formula_brief as Record<string, unknown> | null)?.formula_brief_content as string | null}
        />
      </ScrollAnimate>

      {/* SECTION 6: 18-Point Analysis */}
      <ScrollAnimate delay={100} variant="flip-up" duration={700}>
        <DeepDiveSection
        criteriaScores={dashboardData.criteriaScores}
        criteriaBreakdown={dashboardData.criteriaBreakdown}
        executiveSummary={analysis?.executive_summary || null}
        topOpportunities={dashboardData.topOpportunities}
        criticalRisks={dashboardData.criticalRisks}
        isLoading={analysisLoading && !hasAnalysis}
        />
      </ScrollAnimate>

      {/* SECTION 7: Customer Intelligence */}
      <ScrollAnimate delay={100} variant="blur-in" duration={600}>
        <CustomerIntelligence
        customerInsights={dashboardData.customerIntelligence}
        isLoading={analysisLoading && !hasAnalysis}
        />
      </ScrollAnimate>

      {/* SECTION 8: Financial Projections */}
      <ScrollAnimate delay={100} variant="scale-up" duration={600}>
        <FinancialProjections 
          financials={dashboardData.financials as Record<string, unknown> | null} 
          isLoading={analysisLoading && !hasAnalysis}
        />
      </ScrollAnimate>

      {/* SECTION 9: Launch Strategy + Action Plan */}
      <ScrollAnimate delay={100} variant="fade-left" duration={600}>
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

      {/* SECTION 10: Risk Analysis */}
      <ScrollAnimate delay={100} variant="fade-right" duration={600}>
        <RiskAnalysis
          risks={dashboardData.risks as Record<string, unknown> | null}
          isLoading={analysisLoading && !hasAnalysis}
        />
      </ScrollAnimate>
        </TabsContent>

        <TabsContent value="market" className="space-y-6 mt-4">
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
                      <p className="text-2xl font-bold">{marketAnalysisData.total}</p>
                      <p className="text-xs text-muted-foreground">Total Products</p>
                    </div>
                    <div className="text-center p-3 bg-secondary/50 rounded-lg">
                      <p className="text-2xl font-bold">${marketAnalysisData.avgPrice.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">Avg Price</p>
                    </div>
                    <div className="text-center p-3 bg-secondary/50 rounded-lg">
                      <p className="text-2xl font-bold">{marketAnalysisData.avgRating.toFixed(1)}★</p>
                      <p className="text-xs text-muted-foreground">Avg Rating</p>
                    </div>
                    <div className="text-center p-3 bg-secondary/50 rounded-lg">
                      <p className="text-2xl font-bold">{Math.round(marketAnalysisData.avgReviews).toLocaleString()}</p>
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
                    <span className="text-3xl font-bold">{marketAnalysisData.launchScore}</span>
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
      </Tabs>
    </div>
  );
}
