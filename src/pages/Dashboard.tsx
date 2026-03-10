import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollAnimate } from "@/components/ui/scroll-animate";
import { Building2 } from "lucide-react";

// Dashboard components
import { HeroHeader } from "@/components/dashboard/HeroHeader";
import { KPIMetricsGrid } from "@/components/dashboard/KPIMetricsGrid";
import { EnhancedBenchmarkComparison } from "@/components/dashboard/EnhancedBenchmarkComparison";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { LowConfidenceProducts } from "@/components/dashboard/LowConfidenceProducts";
import { PipelineStatus } from "@/components/dashboard/PipelineStatus";
import { ScoutPackagingIntelligence } from "@/components/dashboard/ScoutPackagingIntelligence";

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
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Target } from "lucide-react";


export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const rawUrlCategoryName = searchParams.get("category");
  const urlCategoryName = rawUrlCategoryName ? rawUrlCategoryName.replace(/^=+/, "").trim() : null;
  const { setCategoryContext, categoryName: contextCategoryName } = useCategoryContext();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState("products");

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

  const hasAnalysis = !!analysis;
  const hasProducts = products && products.length > 0;

  // Parse analysis data for benchmark comparison component
  const dashboardData = useMemo(() => {
    const analysis1 = analysis?.analysis_1_category_scores as Record<string, unknown> | null;
    const analysis3 = analysis?.analysis_3_formula_brief as Record<string, unknown> | null;
    const keyInsights = analysis?.key_insights as Record<string, unknown> | null;
    const formulaBriefContent = (analysis3?.formula_brief_content as string) || null;

    return {
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

      {/* SCOUT PIPELINE STATUS — live phase completion from Supabase */}
      {category?.id && (
        <ScrollAnimate delay={50} variant="fade-up" duration={400}>
          <Card className="border-slate-700/40 bg-slate-900/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                <span>🔍</span> Scout Pipeline
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Live phase completion for <span className="text-slate-300 font-medium">{categoryName}</span> — sourced from Supabase
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PipelineStatus
                categoryId={category.id}
                keyword={categoryName || ""}
              />
            </CardContent>
          </Card>
        </ScrollAnimate>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="products">📦 Products</TabsTrigger>
          <TabsTrigger value="market">📈 Market</TabsTrigger>
          <TabsTrigger value="packaging">📦 Packaging</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-6 md:space-y-10 mt-4">
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
          analysisData={dashboardData.benchmarkData}
          isLoading={productsLoading}
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

        {/* TAB 3: Packaging Intelligence (P7 Scout) */}
        <TabsContent value="packaging" className="space-y-6 mt-4">
          {category?.id ? (
            <ScoutPackagingIntelligence categoryId={category.id} />
          ) : (
            <div className="text-center py-12 text-slate-500">
              Select a category to view packaging intelligence.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
