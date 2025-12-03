import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, TrendingUp, Pill, Target, MessageSquare, Package } from "lucide-react";
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
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-[420px] w-[220px] shrink-0" />
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
      .slice(0, 4);
  };

  const getPainPoints = (product: Product): string[] => {
    const reviewAnalysis = product.review_analysis as Record<string, unknown> | null;
    const painPoints = reviewAnalysis?.pain_points as Array<{ pain_point?: string; issue?: string }> | undefined;
    return painPoints?.slice(0, 3).map(p => p.pain_point || p.issue || '') || [];
  };

  const getPositioning = (product: Product): string => {
    const marketingAnalysis = product.marketing_analysis as Record<string, unknown> | null;
    const lifestyle = marketingAnalysis?.lifestyle_positioning;
    // Handle case where lifestyle_positioning is an object
    if (lifestyle && typeof lifestyle === 'object') {
      const lifestyleObj = lifestyle as Record<string, unknown>;
      return (lifestyleObj.primary_lifestyle as string) || 
             (marketingAnalysis?.competitive_positioning as string) || 
             'Standard positioning';
    }
    return (lifestyle as string) || 
           (marketingAnalysis?.competitive_positioning as string) || 
           'Standard positioning';
  };

  const getUSPs = (product: Product): string[] => {
    const marketingAnalysis = product.marketing_analysis as Record<string, unknown> | null;
    return (marketingAnalysis?.usps as string[])?.slice(0, 2) || [];
  };

  const getPositiveThemes = (product: Product): string[] => {
    const reviewAnalysis = product.review_analysis as Record<string, unknown> | null;
    const themes = reviewAnalysis?.positive_themes as Array<{ theme?: string }> | undefined;
    return themes?.slice(0, 2).map(t => t.theme || '') || [];
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base md:text-lg">
          <Package className="w-4 h-4 md:w-5 md:h-5 text-primary" />
          Benchmark Comparison
        </CardTitle>
        <CardDescription className="text-xs md:text-sm">
          Compare your concept against top 5 competitors
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 md:px-6">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-2 md:gap-3 pb-4">
            {/* Our Concept Column */}
            <div className="w-[180px] md:w-[200px] lg:w-[220px] shrink-0 rounded-lg border-2 border-amber-500/50 bg-gradient-to-b from-amber-50/50 to-background dark:from-amber-950/20 overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-white/20 flex items-center justify-center">
                    <Target className="w-3 h-3 md:w-4 md:h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-xs md:text-sm truncate">OUR CONCEPT</p>
                    <p className="text-white/80 text-[10px] md:text-xs truncate">Strategy</p>
                  </div>
                </div>
              </div>
              
              {/* Concept Image Placeholder */}
              <div className="p-2 md:p-3">
                <div className="w-full aspect-square rounded-lg bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-800/20 flex items-center justify-center mb-3">
                  <div className="text-center">
                    <Target className="w-10 h-10 md:w-12 md:h-12 text-amber-500/50 mx-auto" />
                    <p className="text-[10px] text-amber-600/70 mt-1">Your Product</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Target Price */}
                  <div className="p-2 bg-amber-100/50 dark:bg-amber-900/20 rounded-lg text-center">
                    <p className="text-[10px] text-muted-foreground">Target Price</p>
                    <p className="text-lg md:text-xl font-bold text-amber-600">
                      ${analysisData?.recommended_price?.toFixed(2) || 'TBD'}
                    </p>
                  </div>

                  {/* Positioning */}
                  <div>
                    <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-primary" />
                      Positioning
                    </p>
                    <p className="text-[10px] text-muted-foreground line-clamp-2">
                      {analysisData?.positioning || 'Pending analysis'}
                    </p>
                  </div>

                  {/* Key Differentiators */}
                  <div>
                    <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                      <Pill className="w-3 h-3 text-emerald-500" />
                      Differentiators
                    </p>
                    <div className="space-y-0.5">
                      {(analysisData?.key_differentiators || ['Premium formula', 'Clinical doses']).slice(0, 3).map((diff, i) => (
                        <div key={i} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                          <span className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                          <span className="line-clamp-1">{diff}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pain Points */}
                  <div>
                    <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                      <Target className="w-3 h-3 text-rose-500" />
                      Pain Points to Solve
                    </p>
                    <div className="space-y-0.5">
                      {(analysisData?.primary_pain_points || []).slice(0, 2).map((pp, i) => (
                        <div key={i} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                          <span className="w-1 h-1 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                          <span className="line-clamp-1">{pp.pain_point || pp.issue}</span>
                        </div>
                      ))}
                      {(!analysisData?.primary_pain_points || analysisData.primary_pain_points.length === 0) && (
                        <p className="text-[10px] text-muted-foreground italic">Pending</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Competitor Columns */}
            {topProducts.map((product, idx) => (
              <div key={product.id} className="w-[180px] md:w-[200px] lg:w-[220px] shrink-0 rounded-lg border border-border bg-card overflow-hidden">
                <div className="bg-gradient-to-r from-muted to-muted/80 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                      #{idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-xs md:text-sm truncate">{product.brand || 'Unknown'}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{product.title?.substring(0, 20)}...</p>
                    </div>
                  </div>
                </div>

                <div className="p-2 md:p-3 space-y-3">
                  {/* Product Image */}
                  <div className="w-full aspect-square rounded-lg bg-white border overflow-hidden">
                    {product.main_image_url ? (
                      <img 
                        src={product.main_image_url} 
                        alt={product.title || 'Product'} 
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <Package className="w-8 h-8 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>

                  {/* Price & Rating Row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="p-1.5 bg-secondary rounded text-center flex-1">
                      <p className="text-[10px] text-muted-foreground">Price</p>
                      <p className="text-sm md:text-base font-bold">${product.price?.toFixed(2) || 'N/A'}</p>
                    </div>
                    <div className="p-1.5 bg-secondary rounded text-center flex-1">
                      <p className="text-[10px] text-muted-foreground">Rating</p>
                      <div className="flex items-center justify-center gap-0.5">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span className="text-sm md:text-base font-bold">{product.rating?.toFixed(1) || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Sales Stats */}
                  <div className="bg-secondary/50 rounded p-1.5">
                    <div className="flex items-center gap-1 mb-1">
                      <TrendingUp className="w-3 h-3 text-primary" />
                      <p className="text-[10px] font-semibold">Sales</p>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      <div>
                        <p className="text-muted-foreground">Monthly</p>
                        <p className="font-semibold text-emerald-600">{(product.monthly_sales || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Reviews</p>
                        <p className="font-semibold">{(product.reviews || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  {/* Ingredients */}
                  <div>
                    <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                      <Pill className="w-3 h-3 text-emerald-500" />
                      Ingredients
                    </p>
                    <div className="space-y-0.5">
                      {parseIngredients(product.ingredients).slice(0, 3).map((ing, i) => (
                        <div key={i} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                          <span className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                          <span className="line-clamp-1">{ing}</span>
                        </div>
                      ))}
                      {parseIngredients(product.ingredients).length === 0 && (
                        <p className="text-[10px] text-muted-foreground italic">No data</p>
                      )}
                    </div>
                  </div>

                  {/* Positioning */}
                  <div>
                    <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3 text-primary" />
                      Positioning
                    </p>
                    <p className="text-[10px] text-muted-foreground line-clamp-2">{getPositioning(product)}</p>
                  </div>

                  {/* Pain Points */}
                  <div>
                    <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                      <Target className="w-3 h-3 text-rose-500" />
                      Pain Points
                    </p>
                    <div className="space-y-0.5">
                      {getPainPoints(product).slice(0, 2).map((pp, i) => (
                        <div key={i} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                          <span className="w-1 h-1 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                          <span className="line-clamp-1">{pp}</span>
                        </div>
                      ))}
                      {getPainPoints(product).length === 0 && (
                        <p className="text-[10px] text-muted-foreground italic">No data</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Empty slots */}
            {Array.from({ length: Math.max(0, 5 - topProducts.length) }).map((_, idx) => (
              <div key={`empty-${idx}`} className="w-[180px] md:w-[200px] lg:w-[220px] shrink-0 rounded-lg border border-dashed border-border bg-muted/20 flex items-center justify-center min-h-[420px]">
                <p className="text-xs text-muted-foreground">No data</p>
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
