import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, TrendingDown, Target, DollarSign, Star, Package, Loader2, RefreshCw,
  Zap, AlertTriangle, Crown, ShoppingCart, BarChart3, Users
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

  const hasCategory = !!category;
  const hasAnalysis = !!analysis;
  const hasProducts = products && products.length > 0;

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

  // Sentiment data
  const sentimentData = [
    { name: "Positive", value: 65, fill: "hsl(var(--chart-2))" },
    { name: "Neutral", value: 25, fill: "hsl(var(--chart-4))" },
    { name: "Negative", value: 10, fill: "hsl(var(--destructive))" },
  ];

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

      {/* Processing Banner */}
      {(!hasCategory || !hasAnalysis) && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 text-primary animate-spin" />
              <div>
                <p className="font-medium text-foreground">Analysis in Progress</p>
                <p className="text-sm text-muted-foreground">
                  {!hasCategory 
                    ? "Waiting for category data to be created..."
                    : "Waiting for analysis results. Data will appear automatically."}
                </p>
              </div>
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
