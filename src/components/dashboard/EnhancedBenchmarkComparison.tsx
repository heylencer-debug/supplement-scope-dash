import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, TrendingUp, BarChart3, Pill, Target, MessageSquare, ShoppingCart } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { useProducts, Product } from "@/hooks/useProducts";

interface EnhancedBenchmarkComparisonProps {
  categoryId?: string;
  analysisData?: {
    recommended_price?: number;
    positioning?: string;
    key_differentiators?: string[];
    primary_pain_points?: Array<{ pain_point?: string; issue?: string }>;
  } | null;
  isLoading?: boolean;
}

export function EnhancedBenchmarkComparison({
  categoryId,
  analysisData,
  isLoading = false,
}: EnhancedBenchmarkComparisonProps) {
  const { data: products, isLoading: productsLoading } = useProducts(categoryId);
  
  // Get top 5 products by reviews
  const topProducts = products
    ?.sort((a, b) => (b.reviews || 0) - (a.reviews || 0))
    .slice(0, 5) || [];

  const loading = isLoading || productsLoading;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-[500px] w-[280px] shrink-0" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const parseIngredients = (ingredientsStr: string | null): string[] => {
    if (!ingredientsStr) return [];
    return ingredientsStr
      .split(/[,;]/)
      .map(i => i.trim())
      .filter(Boolean)
      .slice(0, 5);
  };

  const getPainPoints = (product: Product): string[] => {
    const reviewAnalysis = product.review_analysis as Record<string, unknown> | null;
    const painPoints = reviewAnalysis?.pain_points as Array<{ pain_point?: string; issue?: string }> | undefined;
    return painPoints?.slice(0, 3).map(p => p.pain_point || p.issue || '') || [];
  };

  const getPositioning = (product: Product): string => {
    const marketingAnalysis = product.marketing_analysis as Record<string, unknown> | null;
    return (marketingAnalysis?.lifestyle_positioning as string) || 
           (marketingAnalysis?.competitive_positioning as string) || 
           'Standard positioning';
  };

  const getUSPs = (product: Product): string[] => {
    const marketingAnalysis = product.marketing_analysis as Record<string, unknown> | null;
    return (marketingAnalysis?.usps as string[])?.slice(0, 3) || [];
  };

  const getPositiveThemes = (product: Product): string[] => {
    const reviewAnalysis = product.review_analysis as Record<string, unknown> | null;
    const themes = reviewAnalysis?.positive_themes as Array<{ theme?: string }> | undefined;
    return themes?.slice(0, 3).map(t => t.theme || '') || [];
  };

  // Create sales/BSR chart data for a product
  const getSalesChartData = (product: Product) => [
    { name: 'Sales', value: product.monthly_sales || 0, fill: 'hsl(var(--chart-1))' },
    { name: 'BSR', value: Math.min(product.bsr_current || 0, 50000) / 100, fill: 'hsl(var(--chart-2))' },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="w-5 h-5 text-primary" />
          Benchmark Comparison
        </CardTitle>
        <CardDescription>
          Compare your concept against top 5 competitors in the category
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-4 pb-4">
            {/* Our Concept Column */}
            <div className="w-[280px] shrink-0 rounded-lg border-2 border-amber-500/50 bg-gradient-to-b from-amber-50/50 to-background dark:from-amber-950/20 overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                    <Target className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">OUR CONCEPT</p>
                    <p className="text-white/80 text-xs">Recommended Strategy</p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 space-y-4">
                {/* Recommended Price */}
                <div className="p-3 bg-amber-100/50 dark:bg-amber-900/20 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Target Price</p>
                  <p className="text-2xl font-bold text-amber-600">
                    ${analysisData?.recommended_price?.toFixed(2) || 'TBD'}
                  </p>
                </div>

                {/* Positioning */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <MessageSquare className="w-3.5 h-3.5 text-primary" />
                    <p className="text-xs font-semibold">Positioning</p>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {analysisData?.positioning || 'Positioning strategy pending analysis'}
                  </p>
                </div>

                {/* Key Differentiators */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Pill className="w-3.5 h-3.5 text-emerald-500" />
                    <p className="text-xs font-semibold">Key Differentiators</p>
                  </div>
                  <div className="space-y-1.5">
                    {(analysisData?.key_differentiators || ['Premium formulation', 'Clinical dosages', 'Clean label']).slice(0, 4).map((diff, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                        <span className="line-clamp-2">{diff}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pain Points to Address */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Target className="w-3.5 h-3.5 text-rose-500" />
                    <p className="text-xs font-semibold">Pain Points to Solve</p>
                  </div>
                  <div className="space-y-1.5">
                    {(analysisData?.primary_pain_points || []).slice(0, 3).map((pp, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                        <span className="line-clamp-2">{pp.pain_point || pp.issue}</span>
                      </div>
                    ))}
                    {(!analysisData?.primary_pain_points || analysisData.primary_pain_points.length === 0) && (
                      <p className="text-xs text-muted-foreground italic">Pending analysis</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Competitor Columns */}
            {topProducts.map((product, idx) => (
              <div key={product.id} className="w-[280px] shrink-0 rounded-lg border border-border bg-card overflow-hidden">
                <div className="bg-gradient-to-r from-muted to-muted/80 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      #{idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{product.brand || 'Unknown Brand'}</p>
                      <p className="text-xs text-muted-foreground truncate">{product.title?.substring(0, 30)}...</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  {/* Price & Rating */}
                  <div className="flex items-center justify-between">
                    <div className="p-2 bg-secondary rounded-lg">
                      <p className="text-xs text-muted-foreground">Price</p>
                      <p className="text-lg font-bold">${product.price?.toFixed(2) || 'N/A'}</p>
                    </div>
                    <div className="p-2 bg-secondary rounded-lg text-right">
                      <p className="text-xs text-muted-foreground">Rating</p>
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                        <span className="text-lg font-bold">{product.rating?.toFixed(1) || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Sales/BSR Mini Chart */}
                  <div className="bg-secondary/50 rounded-lg p-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <TrendingUp className="w-3.5 h-3.5 text-primary" />
                      <p className="text-xs font-semibold">Sales & BSR</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-xs">
                        <p className="text-muted-foreground">Monthly Sales</p>
                        <p className="font-semibold text-emerald-600">{(product.monthly_sales || 0).toLocaleString()}</p>
                      </div>
                      <div className="text-xs">
                        <p className="text-muted-foreground">BSR</p>
                        <p className="font-semibold">#{(product.bsr_current || 0).toLocaleString()}</p>
                      </div>
                      <div className="text-xs">
                        <p className="text-muted-foreground">Reviews</p>
                        <p className="font-semibold">{(product.reviews || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  {/* Ingredients */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Pill className="w-3.5 h-3.5 text-emerald-500" />
                      <p className="text-xs font-semibold">Top Ingredients</p>
                    </div>
                    <div className="space-y-1">
                      {parseIngredients(product.ingredients).slice(0, 4).map((ing, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                          <span className="line-clamp-1">{ing}</span>
                        </div>
                      ))}
                      {parseIngredients(product.ingredients).length === 0 && (
                        <p className="text-xs text-muted-foreground italic">No data</p>
                      )}
                    </div>
                  </div>

                  {/* Marketing Positioning */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <MessageSquare className="w-3.5 h-3.5 text-primary" />
                      <p className="text-xs font-semibold">Positioning</p>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{getPositioning(product)}</p>
                    {getUSPs(product).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {getUSPs(product).slice(0, 2).map((usp, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {usp.substring(0, 20)}...
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pain Points from Reviews */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Target className="w-3.5 h-3.5 text-rose-500" />
                      <p className="text-xs font-semibold">Customer Pain Points</p>
                    </div>
                    <div className="space-y-1">
                      {getPainPoints(product).slice(0, 3).map((pp, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                          <span className="line-clamp-1">{pp}</span>
                        </div>
                      ))}
                      {getPainPoints(product).length === 0 && (
                        <p className="text-xs text-muted-foreground italic">No data</p>
                      )}
                    </div>
                  </div>

                  {/* Positive Reviews */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Star className="w-3.5 h-3.5 text-amber-500" />
                      <p className="text-xs font-semibold">What Customers Love</p>
                    </div>
                    <div className="space-y-1">
                      {getPositiveThemes(product).slice(0, 3).map((theme, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                          <span className="line-clamp-1">{theme}</span>
                        </div>
                      ))}
                      {getPositiveThemes(product).length === 0 && (
                        <p className="text-xs text-muted-foreground italic">No data</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Empty slots if less than 5 competitors */}
            {Array.from({ length: Math.max(0, 5 - topProducts.length) }).map((_, idx) => (
              <div key={`empty-${idx}`} className="w-[280px] shrink-0 rounded-lg border border-dashed border-border bg-muted/20 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">No competitor data</p>
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
