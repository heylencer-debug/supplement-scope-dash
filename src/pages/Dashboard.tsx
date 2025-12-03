import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, TrendingDown, Target, DollarSign, Star, Package, Loader2, RefreshCw,
  Zap, AlertTriangle, Crown, ShoppingCart, BarChart3, Users, CheckCircle2, Circle, Clock,
  ThumbsUp, ThumbsDown, MessageSquare, Building2, Crosshair, Shield
} from "lucide-react";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { useCategoryByName } from "@/hooks/useCategoryByName";
import { useCategoryAnalysis } from "@/hooks/useCategoryAnalyses";
import { useProducts } from "@/hooks/useProducts";
import { useCategoryContext } from "@/contexts/CategoryContext";
import { useCategoryScores } from "@/hooks/useCategoryScores";
import { useCategorySales } from "@/hooks/useCategorySales";
import { useTopProducts } from "@/hooks/useTopProducts";
import { useBreakoutCompetitors } from "@/hooks/useBreakoutCompetitors";
import { useFormulaBrief } from "@/hooks/useFormulaBrief";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export default function Dashboard() {
  const [searchParams] = useSearchParams();
  const urlCategoryName = searchParams.get("category");
  const { setCategoryContext, currentCategoryId, categoryName: contextCategoryName } = useCategoryContext();
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
  const { data: categoryScores, isLoading: scoresLoading } = useCategoryScores(category?.id);
  const { data: categorySales, isLoading: salesLoading } = useCategorySales(categoryName || undefined);
  const { data: topProducts, isLoading: topProductsLoading } = useTopProducts(categoryName || undefined, 5);
  const { data: breakoutCompetitors, isLoading: breakoutLoading } = useBreakoutCompetitors(categoryName || undefined, 5);
  const { data: formulaBrief } = useFormulaBrief(category?.id);

  const hasCategory = !!category;
  const hasAnalysis = !!analysis;
  const hasProducts = products && products.length > 0;

  // Progress calculation
  const progress = useMemo(() => {
    const steps = [
      { name: "Category Created", done: hasCategory },
      { name: "Products Scraped", done: hasProducts || (category?.total_products ?? 0) > 0 },
      { name: "Reviews Analyzed", done: (analysis?.reviews_analyzed ?? 0) > 0 },
      { name: "Scores Calculated", done: !!categoryScores },
      { name: "Analysis Complete", done: !!analysis?.executive_summary && !!analysis?.opportunity_index },
      { name: "Formula Brief Ready", done: !!formulaBrief },
    ];
    const completed = steps.filter(s => s.done).length;
    return { 
      percentage: Math.round((completed / steps.length) * 100), 
      steps, 
      completed 
    };
  }, [hasCategory, hasProducts, category?.total_products, analysis, categoryScores, formulaBrief]);

  // KPI calculations
  const totalProducts = products?.length ?? 0;
  const opportunityScore = analysis?.opportunity_index ?? 0;
  const totalRevenue = categorySales?.total_monthly_revenue ?? products?.reduce((sum, p) => sum + (p.monthly_revenue ?? 0), 0) ?? 0;
  const avgRating = products?.length
    ? (products.reduce((sum, p) => sum + (p.rating ?? 0), 0) / products.length).toFixed(1)
    : "0";

  const kpiData = [
    { label: "Total Products", value: totalProducts.toLocaleString(), icon: Package, trend: "+12%", up: true },
    { label: "Opportunity Score", value: Math.round(opportunityScore).toString(), icon: Target, trend: "+5.2%", up: true },
    { label: "Market Revenue", value: `$${(totalRevenue / 1000000).toFixed(2)}M`, icon: DollarSign, trend: "+18%", up: true },
    { label: "Avg. Rating", value: avgRating, icon: Star, trend: "-0.2", up: false },
  ];

  // Aggregated sentiment data from review_analysis across all products
  const sentimentData = useMemo(() => {
    if (!products || products.length === 0) {
      return [
        { name: "Positive", value: 0, fill: "hsl(var(--chart-2))" },
        { name: "Neutral", value: 0, fill: "hsl(var(--chart-4))" },
        { name: "Negative", value: 0, fill: "hsl(var(--destructive))" },
      ];
    }

    let totalPositive = 0;
    let totalNeutral = 0;
    let totalNegative = 0;
    let productCount = 0;

    products.forEach(product => {
      const reviewAnalysis = product.review_analysis as Record<string, unknown> | null;
      if (!reviewAnalysis) return;

      const sentiment = reviewAnalysis.sentiment_distribution as Record<string, unknown> | null;
      if (sentiment) {
        // Handle both simple (positive/neutral/negative) and detailed (5-star) formats
        if (typeof sentiment.positive === 'number') {
          totalPositive += sentiment.positive;
          totalNeutral += (sentiment.neutral as number) || 0;
          totalNegative += (sentiment.negative as number) || 0;
          productCount++;
        } else if (typeof sentiment['5_star'] === 'number') {
          // Convert 5-star to positive/neutral/negative
          totalPositive += ((sentiment['5_star'] as number) || 0) + ((sentiment['4_star'] as number) || 0);
          totalNeutral += (sentiment['3_star'] as number) || 0;
          totalNegative += ((sentiment['2_star'] as number) || 0) + ((sentiment['1_star'] as number) || 0);
          productCount++;
        }
      }
    });

    if (productCount === 0) {
      return [
        { name: "Positive", value: 0, fill: "hsl(var(--chart-2))" },
        { name: "Neutral", value: 0, fill: "hsl(var(--chart-4))" },
        { name: "Negative", value: 0, fill: "hsl(var(--destructive))" },
      ];
    }

    // Calculate averages and normalize to percentages
    const avgPositive = totalPositive / productCount;
    const avgNeutral = totalNeutral / productCount;
    const avgNegative = totalNegative / productCount;
    const total = avgPositive + avgNeutral + avgNegative;

    if (total === 0) {
      return [
        { name: "Positive", value: 0, fill: "hsl(var(--chart-2))" },
        { name: "Neutral", value: 0, fill: "hsl(var(--chart-4))" },
        { name: "Negative", value: 0, fill: "hsl(var(--destructive))" },
      ];
    }

    return [
      { name: "Positive", value: Math.round((avgPositive / total) * 100), fill: "hsl(var(--chart-2))" },
      { name: "Neutral", value: Math.round((avgNeutral / total) * 100), fill: "hsl(var(--chart-4))" },
      { name: "Negative", value: Math.round((avgNegative / total) * 100), fill: "hsl(var(--destructive))" },
    ];
  }, [products]);

  // Aggregated pain points and positive themes from review_analysis
  const { painPoints, positiveThemes } = useMemo(() => {
    const painPointsMap = new Map<string, { count: number; quotes: string[] }>();
    const positiveThemesMap = new Map<string, { count: number; quotes: string[] }>();

    if (!products || products.length === 0) {
      return { painPoints: [], positiveThemes: [] };
    }

    products.forEach(product => {
      const reviewAnalysis = product.review_analysis as Record<string, unknown> | null;
      if (!reviewAnalysis) return;

      // Extract pain points
      const productPainPoints = reviewAnalysis.pain_points as Array<{ theme?: string; issue?: string; quote?: string; representative_quotes?: string[] }> | null;
      if (productPainPoints && Array.isArray(productPainPoints)) {
        productPainPoints.forEach(pp => {
          const theme = pp.theme || pp.issue || "Unknown";
          const existing = painPointsMap.get(theme) || { count: 0, quotes: [] };
          existing.count++;
          if (pp.quote && existing.quotes.length < 2) existing.quotes.push(pp.quote);
          if (pp.representative_quotes) {
            pp.representative_quotes.slice(0, 2 - existing.quotes.length).forEach(q => existing.quotes.push(q));
          }
          painPointsMap.set(theme, existing);
        });
      }

      // Extract positive themes
      const productPositiveThemes = reviewAnalysis.positive_themes as Array<{ theme?: string; strength?: string; quote?: string; representative_quotes?: string[] }> | null;
      if (productPositiveThemes && Array.isArray(productPositiveThemes)) {
        productPositiveThemes.forEach(pt => {
          const theme = pt.theme || pt.strength || "Unknown";
          const existing = positiveThemesMap.get(theme) || { count: 0, quotes: [] };
          existing.count++;
          if (pt.quote && existing.quotes.length < 2) existing.quotes.push(pt.quote);
          if (pt.representative_quotes) {
            pt.representative_quotes.slice(0, 2 - existing.quotes.length).forEach(q => existing.quotes.push(q));
          }
          positiveThemesMap.set(theme, existing);
        });
      }
    });

    // Convert to sorted arrays (top 5)
    const painPoints = Array.from(painPointsMap.entries())
      .map(([theme, data]) => ({ theme, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const positiveThemes = Array.from(positiveThemesMap.entries())
      .map(([theme, data]) => ({ theme, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { painPoints, positiveThemes };
  }, [products]);

  // Radar chart data from category_scores
  const radarData = categoryScores ? [
    { criteria: "Demand", score: Number(categoryScores.demand_score) || 0, fullMark: 10 },
    { criteria: "Competition", score: Number(categoryScores.competition_score) || 0, fullMark: 10 },
    { criteria: "Breakout", score: Number(categoryScores.breakout_score) || 0, fullMark: 10 },
    { criteria: "Differentiation", score: Number(categoryScores.differentiation_potential) || 0, fullMark: 10 },
    { criteria: "Profitability", score: Number(categoryScores.profitability) || 0, fullMark: 10 },
    { criteria: "Pain Points", score: Number(categoryScores.pain_points_score) || 0, fullMark: 10 },
    { criteria: "Consumer Fit", score: Number(categoryScores.consumer_fit) || 0, fullMark: 10 },
    { criteria: "Trust", score: Number(categoryScores.trust_level) || 0, fullMark: 10 },
  ].filter(d => d.score > 0) : [];

  // Fallback radar data from analysis criteria_scores
  const criteriaScores = analysis?.criteria_scores as Record<string, number> | null;
  const fallbackRadarData = criteriaScores
    ? Object.entries(criteriaScores).slice(0, 8).map(([key, value]) => ({
        criteria: key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()).substring(0, 12),
        score: typeof value === "number" ? value : 0,
        fullMark: 10,
      }))
    : [];

  const finalRadarData = radarData.length > 0 ? radarData : fallbackRadarData;

  // Revenue metrics bar chart
  const revenueMetrics = categorySales ? [
    { name: "Avg Sales", value: categorySales.avg_monthly_sales || 0, fill: "hsl(var(--chart-1))" },
    { name: "Max Sales", value: categorySales.max_monthly_sales || 0, fill: "hsl(var(--chart-2))" },
    { name: "75th %", value: categorySales.sales_75th_percentile || 0, fill: "hsl(var(--chart-3))" },
    { name: "90th %", value: categorySales.sales_90th_percentile || 0, fill: "hsl(var(--chart-4))" },
  ] : [];

  const getOpportunityLabel = (score: number) => {
    if (score >= 70) return "High Opportunity";
    if (score >= 50) return "Medium Opportunity";
    return "Low Opportunity";
  };

  if (categoryLoading && !hasCategory) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!categoryName) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Target className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">No category selected. Start a new analysis to see the dashboard.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard: {categoryName}</h1>
        <p className="text-muted-foreground">
          {analysis?.executive_summary?.substring(0, 150) || "Market analysis results and insights"}
          {analysis?.executive_summary && analysis.executive_summary.length > 150 ? "..." : ""}
        </p>
      </div>

      {/* Progress Banner */}
      {progress.percentage < 100 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-6">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RefreshCw className="h-5 w-5 text-primary animate-spin" />
                  <div>
                    <p className="font-medium text-foreground">Analysis in Progress</p>
                    <p className="text-sm text-muted-foreground">
                      {progress.percentage}% Complete • {6 - progress.completed} steps remaining
                    </p>
                  </div>
                </div>
                <Badge variant="outline">{progress.completed}/6 Steps</Badge>
              </div>
              
              {/* Progress Bar */}
              <Progress value={progress.percentage} className="h-3" />
              
              {/* Step Indicators */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {progress.steps.map((step, idx) => (
                  <div 
                    key={idx} 
                    className={`flex items-center gap-2 text-sm ${step.done ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}
                  >
                    {step.done ? (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span className="truncate">{step.name}</span>
                  </div>
                ))}
              </div>
              
              {/* Time Estimate */}
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Estimated time remaining: ~{Math.max(1, Math.round((6 - progress.completed) * 1.5))} minutes
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiData.map((kpi, idx) => (
          <Card key={idx}>
            <CardContent className="p-6">
              {productsLoading && !hasProducts ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{kpi.label}</p>
                      <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <kpi.icon className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    {kpi.up ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                    <span className={kpi.up ? "text-green-500 text-sm" : "text-red-500 text-sm"}>{kpi.trend}</span>
                    <span className="text-muted-foreground text-sm">vs last month</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue Metrics from v_category_sales */}
      {categorySales && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Revenue & Sales Metrics
            </CardTitle>
            <CardDescription>Monthly sales performance from category data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-4 bg-secondary rounded-lg">
                <p className="text-2xl font-bold text-foreground">
                  ${((categorySales.total_monthly_revenue || 0) / 1000000).toFixed(2)}M
                </p>
                <p className="text-xs text-muted-foreground">Total Monthly Revenue</p>
              </div>
              <div className="text-center p-4 bg-secondary rounded-lg">
                <p className="text-2xl font-bold text-foreground">
                  ${((categorySales.avg_monthly_revenue || 0) / 1000).toFixed(1)}K
                </p>
                <p className="text-xs text-muted-foreground">Avg Revenue/Product</p>
              </div>
              <div className="text-center p-4 bg-secondary rounded-lg">
                <p className="text-2xl font-bold text-foreground">
                  ${categorySales.avg_price?.toFixed(2) || "N/A"}
                </p>
                <p className="text-xs text-muted-foreground">Avg Price</p>
              </div>
              <div className="text-center p-4 bg-secondary rounded-lg">
                <p className="text-2xl font-bold text-foreground">
                  {categorySales.products_above_2x_avg || 0}
                </p>
                <p className="text-xs text-muted-foreground">Products Above 2x Avg</p>
              </div>
            </div>
            {revenueMetrics.length > 0 && (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={revenueMetrics} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={80} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <Tooltip 
                    formatter={(value: number) => value.toLocaleString()}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {revenueMetrics.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Opportunity Score Gauge */}
        <Card>
          <CardHeader>
            <CardTitle>Opportunity Score</CardTitle>
            <CardDescription>Overall market opportunity rating (0-100)</CardDescription>
          </CardHeader>
          <CardContent>
            {analysisLoading && !hasAnalysis ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Skeleton className="w-48 h-48 rounded-full" />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="relative w-48 h-48">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--secondary))" strokeWidth="12" />
                    <circle
                      cx="50" cy="50" r="40" fill="none"
                      stroke="hsl(var(--primary))" strokeWidth="12" strokeLinecap="round"
                      strokeDasharray={`${opportunityScore * 2.51} 251`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-foreground">{Math.round(opportunityScore)}</span>
                    <span className="text-sm text-muted-foreground">out of 100</span>
                  </div>
                </div>
                <Badge className="mt-4 bg-primary/10 text-primary">{getOpportunityLabel(opportunityScore)}</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sentiment Analysis */}
        <Card>
          <CardHeader>
            <CardTitle>Sentiment Analysis</CardTitle>
            <CardDescription>Customer review sentiment breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {analysisLoading && !hasAnalysis ? (
              <div className="flex flex-col items-center justify-center h-[250px]">
                <Skeleton className="w-44 h-44 rounded-full" />
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={sentimentData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {sentimentData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-6 mt-2">
                  {sentimentData.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }} />
                      <span className="text-sm text-muted-foreground">{item.name}: {item.value}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Category Scores Radar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Category Scores
            </CardTitle>
            <CardDescription>Performance across key analysis dimensions</CardDescription>
          </CardHeader>
          <CardContent>
            {(scoresLoading || analysisLoading) && !hasAnalysis ? (
              <div className="flex items-center justify-center h-[300px]">
                <Skeleton className="w-64 h-64 rounded-full" />
              </div>
            ) : finalRadarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={finalRadarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="criteria" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <Radar name="Score" dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} strokeWidth={2} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No category scores available yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Products Quick View */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-yellow-500" />
              Top Products
            </CardTitle>
            <CardDescription>Best performing products in category</CardDescription>
          </CardHeader>
          <CardContent>
            {topProductsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : topProducts && topProducts.length > 0 ? (
              <div className="space-y-3">
                {topProducts.slice(0, 5).map((product, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-muted-foreground">#{idx + 1}</span>
                        <p className="text-sm font-medium text-foreground truncate">{product.brand || "Unknown"}</p>
                        {product.bestseller && <Badge variant="default" className="text-xs">Bestseller</Badge>}
                        {product.amazon_choice && <Badge variant="secondary" className="text-xs">Choice</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{product.title?.substring(0, 50)}...</p>
                    </div>
                    <div className="flex items-center gap-4 text-right shrink-0">
                      <div>
                        <p className="text-sm font-bold">${product.price?.toFixed(2) || "N/A"}</p>
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          <span className="text-xs text-muted-foreground">{product.rating?.toFixed(1)}</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {(product.reviews || 0).toLocaleString()} reviews
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">No top products data available</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Breakout Competitors Alert Section */}
      {breakoutCompetitors && breakoutCompetitors.length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              Breakout Competitors
              <Badge variant="outline" className="ml-2">{breakoutCompetitors.length} detected</Badge>
            </CardTitle>
            <CardDescription>Fast-growing competitors gaining market share rapidly</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {breakoutCompetitors.map((competitor, idx) => (
                <div key={idx} className="p-4 bg-background rounded-lg border border-yellow-500/20">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{competitor.brand || "Unknown Brand"}</p>
                      <p className="text-xs text-muted-foreground truncate">{competitor.title?.substring(0, 40)}...</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 ml-2 bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      Breakout
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="text-center p-2 bg-secondary/50 rounded">
                      <p className="text-lg font-bold text-foreground">{competitor.reviews_per_day?.toFixed(1) || "0"}</p>
                      <p className="text-xs text-muted-foreground">Reviews/Day</p>
                    </div>
                    <div className="text-center p-2 bg-secondary/50 rounded">
                      <p className="text-lg font-bold text-foreground">{competitor.reviews_gained || 0}</p>
                      <p className="text-xs text-muted-foreground">Reviews Gained</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                    <span>${competitor.price?.toFixed(2) || "N/A"}</span>
                    <div className="flex items-center gap-1">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                      <span>{competitor.rating?.toFixed(1) || "N/A"}</span>
                    </div>
                    <span>{competitor.age_months || "?"} months old</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Competitive Landscape Section */}
      {(() => {
        const analysis1 = analysis?.analysis_1_category_scores as Record<string, unknown> | null;
        const competitiveLandscape = analysis1?.competitive_landscape as Record<string, unknown> | null;
        
        if (!competitiveLandscape) return null;

        const dominantPlayers = competitiveLandscape.dominant_players as Array<{ name?: string; market_share?: string; strength?: string }> | null;
        const marketGaps = competitiveLandscape.market_gaps as string[] | null;
        const weaknesses = competitiveLandscape.weaknesses as Array<{ player?: string; weakness?: string; exploitability?: string }> | string[] | null;

        if (!dominantPlayers?.length && !marketGaps?.length && !weaknesses?.length) return null;

        return (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                Competitive Landscape
              </CardTitle>
              <CardDescription>Market structure, dominant players, and exploitable opportunities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                {/* Dominant Players */}
                {dominantPlayers && dominantPlayers.length > 0 && (
                  <div>
                    <h4 className="font-medium text-foreground flex items-center gap-2 mb-3">
                      <Crown className="w-4 h-4 text-yellow-500" />
                      Dominant Players
                    </h4>
                    <div className="space-y-2">
                      {dominantPlayers.slice(0, 5).map((player, idx) => (
                        <div key={idx} className="p-2 bg-secondary/50 rounded-lg">
                          <p className="text-sm font-medium text-foreground">{player.name || `Player ${idx + 1}`}</p>
                          {player.market_share && (
                            <p className="text-xs text-muted-foreground">Share: {player.market_share}</p>
                          )}
                          {player.strength && (
                            <p className="text-xs text-muted-foreground">{player.strength}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Market Gaps */}
                {marketGaps && marketGaps.length > 0 && (
                  <div>
                    <h4 className="font-medium text-foreground flex items-center gap-2 mb-3">
                      <Crosshair className="w-4 h-4 text-green-500" />
                      Market Gaps
                    </h4>
                    <div className="space-y-2">
                      {marketGaps.slice(0, 5).map((gap, idx) => (
                        <div key={idx} className="p-2 bg-green-500/5 border border-green-500/20 rounded-lg">
                          <p className="text-sm text-foreground">{gap}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Exploitable Weaknesses */}
                {weaknesses && weaknesses.length > 0 && (
                  <div>
                    <h4 className="font-medium text-foreground flex items-center gap-2 mb-3">
                      <Shield className="w-4 h-4 text-orange-500" />
                      Exploitable Weaknesses
                    </h4>
                    <div className="space-y-2">
                      {weaknesses.slice(0, 5).map((weakness, idx) => (
                        <div key={idx} className="p-2 bg-orange-500/5 border border-orange-500/20 rounded-lg">
                          {typeof weakness === 'string' ? (
                            <p className="text-sm text-foreground">{weakness}</p>
                          ) : (
                            <>
                              {weakness.player && (
                                <p className="text-xs font-medium text-muted-foreground">{weakness.player}</p>
                              )}
                              <p className="text-sm text-foreground">{weakness.weakness}</p>
                              {weakness.exploitability && (
                                <Badge variant="outline" className="mt-1 text-xs">
                                  {weakness.exploitability}
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Category Pain Points & Positive Themes */}
      {(painPoints.length > 0 || positiveThemes.length > 0) && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Pain Points */}
          <Card className="border-red-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ThumbsDown className="w-5 h-5 text-red-500" />
                Top Pain Points
                <Badge variant="outline" className="ml-2">{painPoints.length} issues</Badge>
              </CardTitle>
              <CardDescription>Common customer complaints across all products</CardDescription>
            </CardHeader>
            <CardContent>
              {painPoints.length > 0 ? (
                <div className="space-y-4">
                  {painPoints.map((pp, idx) => (
                    <div key={idx} className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-foreground">{pp.theme}</p>
                        <Badge variant="outline" className="text-red-500">
                          {pp.count} product{pp.count > 1 ? "s" : ""}
                        </Badge>
                      </div>
                      {pp.quotes.length > 0 && (
                        <div className="space-y-1">
                          {pp.quotes.slice(0, 2).map((quote, qIdx) => (
                            <p key={qIdx} className="text-xs text-muted-foreground italic flex items-start gap-1">
                              <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                              "{quote.substring(0, 100)}{quote.length > 100 ? "..." : ""}"
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">No pain points data available</p>
              )}
            </CardContent>
          </Card>

          {/* Positive Themes */}
          <Card className="border-green-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ThumbsUp className="w-5 h-5 text-green-500" />
                Top Strengths
                <Badge variant="outline" className="ml-2">{positiveThemes.length} themes</Badge>
              </CardTitle>
              <CardDescription>Positive feedback themes across all products</CardDescription>
            </CardHeader>
            <CardContent>
              {positiveThemes.length > 0 ? (
                <div className="space-y-4">
                  {positiveThemes.map((pt, idx) => (
                    <div key={idx} className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-foreground">{pt.theme}</p>
                        <Badge variant="outline" className="text-green-500">
                          {pt.count} product{pt.count > 1 ? "s" : ""}
                        </Badge>
                      </div>
                      {pt.quotes.length > 0 && (
                        <div className="space-y-1">
                          {pt.quotes.slice(0, 2).map((quote, qIdx) => (
                            <p key={qIdx} className="text-xs text-muted-foreground italic flex items-start gap-1">
                              <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                              "{quote.substring(0, 100)}{quote.length > 100 ? "..." : ""}"
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">No positive themes data available</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Recommendations / Insights */}
      {analysis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Analysis Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 bg-secondary/50 rounded-lg">
                <p className="text-sm font-medium text-foreground mb-1">Recommendation</p>
                <Badge variant={analysis.recommendation === "HIGH PRIORITY" ? "default" : "secondary"}>
                  {analysis.recommendation || "Pending"}
                </Badge>
              </div>
              <div className="p-4 bg-secondary/50 rounded-lg">
                <p className="text-sm font-medium text-foreground mb-1">Opportunity Tier</p>
                <Badge variant="outline">{analysis.opportunity_tier_label || analysis.opportunity_tier || "N/A"}</Badge>
              </div>
              <div className="p-4 bg-secondary/50 rounded-lg">
                <p className="text-sm font-medium text-foreground mb-1">Confidence</p>
                <Badge variant="outline">{analysis.confidence || "N/A"}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
