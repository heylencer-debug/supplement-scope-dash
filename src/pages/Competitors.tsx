import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Zap, TrendingUp, TrendingDown, Star, Target, Users, Calendar, 
  Loader2, AlertTriangle, BarChart3, Activity, Award
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { useCategoryByName } from "@/hooks/useCategoryByName";
import { useCategoryContext } from "@/contexts/CategoryContext";
import { useBreakoutCompetitors, BreakoutCompetitor } from "@/hooks/useBreakoutCompetitors";
import { useCompetitorsByCategory } from "@/hooks/useCompetitors";
import { useProducts } from "@/hooks/useProducts";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Competitors() {
  const [searchParams] = useSearchParams();
  const urlCategoryName = searchParams.get("category");
  const { setCategoryContext, currentCategoryId, categoryName: contextCategoryName } = useCategoryContext();

  const categoryName = urlCategoryName || contextCategoryName;

  const { data: category, isLoading: categoryLoading } = useCategoryByName(categoryName || undefined);

  useEffect(() => {
    if (category) {
      setCategoryContext(category.id, category.name);
    } else if (categoryName && !category && !categoryLoading) {
      setCategoryContext(null, categoryName);
    }
  }, [category, categoryName, categoryLoading, setCategoryContext]);

  const effectiveCategoryId = currentCategoryId || category?.id;

  // Data fetching
  const { data: breakoutCompetitors, isLoading: breakoutLoading } = useBreakoutCompetitors(categoryName || undefined, 20);
  const { data: competitors, isLoading: competitorsLoading } = useCompetitorsByCategory(effectiveCategoryId);
  const { data: products, isLoading: productsLoading } = useProducts(effectiveCategoryId);

  const isLoading = categoryLoading || breakoutLoading || competitorsLoading || productsLoading;

  // Calculate stats
  const totalCompetitors = competitors?.length ?? 0;
  const avgReviewsPerDay = competitors?.length 
    ? (competitors.reduce((sum, c) => sum + (Number(c.reviews_per_day) || 0), 0) / competitors.length).toFixed(2)
    : "0";
  const breakoutCount = breakoutCompetitors?.length ?? 0;
  const avgGrowthRate = competitors?.length
    ? (competitors.reduce((sum, c) => sum + (Number(c.review_growth_rate) || 0), 0) / competitors.length).toFixed(1)
    : "0";

  // Growth rate distribution for bar chart
  const growthDistribution = competitors?.reduce((acc, c) => {
    const rate = Number(c.review_growth_rate) || 0;
    if (rate <= 0) acc["Declining"]++;
    else if (rate < 5) acc["Slow"]++;
    else if (rate < 15) acc["Moderate"]++;
    else if (rate < 30) acc["Fast"]++;
    else acc["Explosive"]++;
    return acc;
  }, { "Declining": 0, "Slow": 0, "Moderate": 0, "Fast": 0, "Explosive": 0 } as Record<string, number>) ?? {};

  const growthDistributionData = Object.entries(growthDistribution).map(([name, value]) => ({
    name,
    value,
    fill: name === "Explosive" ? "hsl(var(--chart-1))" :
          name === "Fast" ? "hsl(var(--chart-2))" :
          name === "Moderate" ? "hsl(var(--chart-3))" :
          name === "Slow" ? "hsl(var(--chart-4))" :
          "hsl(var(--destructive))"
  }));

  // Reviews per day scatter data
  const scatterData = breakoutCompetitors?.map(c => ({
    x: c.age_months || 0,
    y: Number(c.reviews_per_day) || 0,
    z: c.reviews || 100,
    name: c.brand || "Unknown",
    price: c.price || 0,
  })) ?? [];

  // Top performers by reviews gained
  const topByReviewsGained = [...(breakoutCompetitors || [])]
    .sort((a, b) => (b.reviews_gained || 0) - (a.reviews_gained || 0))
    .slice(0, 10);

  // Market position data (young competitors from products)
  const youngCompetitors = products?.filter(p => p.is_young_competitor) || [];

  if (isLoading && !breakoutCompetitors?.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!categoryName) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Users className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">No category selected. Start a new analysis to track competitors.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Users className="w-8 h-8 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Competitors</h1>
        </div>
        <p className="text-muted-foreground">
          Competitive intelligence and tracking for {categoryName}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tracked Competitors</p>
                <p className="text-2xl font-bold text-foreground">{totalCompetitors}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Breakout Competitors</p>
                <p className="text-2xl font-bold text-foreground">{breakoutCount}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <Zap className="h-6 w-6 text-yellow-500" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Fast-growing market entrants</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Reviews/Day</p>
                <p className="text-2xl font-bold text-foreground">{avgReviewsPerDay}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <Activity className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Growth Rate</p>
                <p className="text-2xl font-bold text-foreground">{avgGrowthRate}%</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Growth Rate Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Growth Rate Distribution
            </CardTitle>
            <CardDescription>Competitor performance by growth segment</CardDescription>
          </CardHeader>
          <CardContent>
            {growthDistributionData.some(d => d.value > 0) ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={growthDistributionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {growthDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No competitor growth data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Market Position Scatter */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Market Position Analysis
            </CardTitle>
            <CardDescription>Age vs Review velocity (bubble size = total reviews)</CardDescription>
          </CardHeader>
          <CardContent>
            {scatterData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    type="number" 
                    dataKey="x" 
                    name="Age (months)" 
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    label={{ value: "Age (months)", position: "bottom", fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="y" 
                    name="Reviews/Day" 
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    label={{ value: "Reviews/Day", angle: -90, position: "insideLeft", fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  />
                  <ZAxis type="number" dataKey="z" range={[50, 400]} />
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ payload }) => {
                      if (payload && payload.length > 0) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded-md p-2 shadow-md">
                            <p className="font-medium text-sm">{data.name}</p>
                            <p className="text-xs text-muted-foreground">Age: {data.x} months</p>
                            <p className="text-xs text-muted-foreground">Reviews/Day: {data.y?.toFixed(2)}</p>
                            <p className="text-xs text-muted-foreground">Price: ${data.price?.toFixed(2)}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter data={scatterData} fill="hsl(var(--primary))" fillOpacity={0.6} />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                No market position data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Breakout Competitors Detail */}
      {breakoutCompetitors && breakoutCompetitors.length > 0 && (
        <Card className="border-yellow-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              Breakout Competitors
              <Badge variant="outline" className="ml-2">{breakoutCompetitors.length} detected</Badge>
            </CardTitle>
            <CardDescription>Fast-growing competitors gaining significant market share</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[250px]">Brand / Product</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Rating</TableHead>
                    <TableHead className="text-right">Reviews</TableHead>
                    <TableHead className="text-right">Reviews/Day</TableHead>
                    <TableHead className="text-right">Reviews Gained</TableHead>
                    <TableHead className="text-right">Growth Rate</TableHead>
                    <TableHead className="text-right">Age</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakoutCompetitors.map((competitor, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{competitor.brand || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {competitor.title?.substring(0, 50)}...
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">${competitor.price?.toFixed(2) || "N/A"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          {competitor.rating?.toFixed(1) || "N/A"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{(competitor.reviews || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                          {competitor.reviews_per_day?.toFixed(2) || "0"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-green-500 font-medium">+{competitor.reviews_gained || 0}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {competitor.review_growth_rate ? (
                          <span className={Number(competitor.review_growth_rate) > 0 ? "text-green-500" : "text-red-500"}>
                            {Number(competitor.review_growth_rate) > 0 ? "+" : ""}
                            {Number(competitor.review_growth_rate).toFixed(1)}%
                          </span>
                        ) : "N/A"}
                      </TableCell>
                      <TableCell className="text-right">{competitor.age_months || "?"} mo</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Performers by Reviews Gained */}
      {topByReviewsGained.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" />
              Top Performers by Reviews Gained
            </CardTitle>
            <CardDescription>Competitors with the highest review acquisition</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topByReviewsGained} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis 
                  dataKey="brand" 
                  type="category" 
                  width={100} 
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  formatter={(value: number) => [value.toLocaleString(), "Reviews Gained"]}
                />
                <Bar dataKey="reviews_gained" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Young Competitors (from products) */}
      {youngCompetitors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Young Competitors
              <Badge variant="outline" className="ml-2">{youngCompetitors.length} products</Badge>
            </CardTitle>
            <CardDescription>Recently launched products in this category (less than 12 months old)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {youngCompetitors.slice(0, 9).map((product, idx) => (
                <div key={idx} className="p-4 bg-secondary/50 rounded-lg border">
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-medium text-sm truncate flex-1">{product.brand || "Unknown"}</p>
                    {product.age_months && (
                      <Badge variant="outline" className="shrink-0 ml-2 text-xs">
                        {product.age_months}mo old
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mb-3">
                    {product.title?.substring(0, 50)}...
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">${product.price?.toFixed(2) || "N/A"}</span>
                    <div className="flex items-center gap-1">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                      <span>{product.rating?.toFixed(1) || "N/A"}</span>
                    </div>
                    <span className="text-muted-foreground">{(product.reviews || 0).toLocaleString()} reviews</span>
                  </div>
                  {product.monthly_revenue && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground">
                        Est. Revenue: <span className="text-foreground font-medium">${(product.monthly_revenue / 1000).toFixed(1)}K/mo</span>
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Data State */}
      {!breakoutCompetitors?.length && !competitors?.length && !youngCompetitors.length && (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              No competitor tracking data available for "{categoryName}".
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Competitor data will appear once the analysis pipeline processes tracking information.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
