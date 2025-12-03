import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, TrendingUp, Pill, Target, MessageSquare, Package, Users, Megaphone, AlertTriangle } from "lucide-react";
import { useProducts, Product } from "@/hooks/useProducts";
import ProductDetailModal from "@/components/ProductDetailModal";
import { useToast } from "@/hooks/use-toast";

interface EnhancedBenchmarkComparisonProps {
  categoryId?: string;
  analysisData?: {
    key_insights?: {
      go_to_market?: {
        positioning?: string;
        messaging?: string[];
      };
    };
    analysis_1_category_scores?: {
      product_development?: {
        formulation?: {
          recommended_ingredients?: Array<{ ingredient?: string; name?: string }>;
        };
      };
      customer_insights?: {
        buyer_profile?: string;
      };
    };
  } | null;
  isLoading?: boolean;
}

const MAX_COMPETITORS = 3;

export function EnhancedBenchmarkComparison({
  categoryId,
  analysisData,
  isLoading = false,
}: EnhancedBenchmarkComparisonProps) {
  const { data: products, isLoading: productsLoading } = useProducts(categoryId);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { toast } = useToast();
  
  // Get top products by reviews for selection
  const topProducts = products
    ?.sort((a, b) => (b.reviews || 0) - (a.reviews || 0))
    .slice(0, 10) || [];

  // Get selected products or default to top 3
  const displayedProducts = selectedIds.length > 0 
    ? topProducts.filter(p => selectedIds.includes(p.id))
    : topProducts.slice(0, MAX_COMPETITORS);

  const loading = isLoading || productsLoading;

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setModalOpen(true);
  };

  const handleProductSelect = (productId: string) => {
    if (selectedIds.includes(productId)) {
      setSelectedIds(selectedIds.filter(id => id !== productId));
    } else {
      if (selectedIds.length >= MAX_COMPETITORS) {
        toast({
          title: "Selection limit reached",
          description: "You can only compare 3 products at a time.",
          variant: "destructive",
        });
        return;
      }
      setSelectedIds([...selectedIds, productId]);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-[480px] w-[240px] shrink-0" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Helper functions for Our Concept data
  const getOurPositioning = (): string => {
    return analysisData?.key_insights?.go_to_market?.positioning || 'Pending analysis';
  };

  const getOurIngredients = (): string[] => {
    const ingredients = analysisData?.analysis_1_category_scores?.product_development?.formulation?.recommended_ingredients;
    if (!ingredients || !Array.isArray(ingredients)) return ['Pending analysis'];
    return ingredients.slice(0, 3).map(ing => ing.ingredient || ing.name || 'Unknown');
  };

  const getOurMessaging = (): string => {
    const messaging = analysisData?.key_insights?.go_to_market?.messaging;
    if (!messaging || !Array.isArray(messaging) || messaging.length === 0) return 'Pending analysis';
    return messaging[0];
  };

  const getOurBuyerProfile = (): string => {
    const profile = analysisData?.analysis_1_category_scores?.customer_insights?.buyer_profile;
    if (!profile) return 'Pending analysis';
    // Truncate to first sentence
    const firstSentence = profile.split(/[.!?]/)[0];
    return firstSentence ? firstSentence + '.' : profile.substring(0, 100) + '...';
  };

  // Helper functions for Competitor data
  const getCompetitorPositioning = (product: Product): string => {
    const marketingAnalysis = product.marketing_analysis as Record<string, unknown> | null;
    if (!marketingAnalysis) return 'No data';
    
    // Try lifestyle_positioning.primary_lifestyle first
    const lifestylePos = marketingAnalysis.lifestyle_positioning as Record<string, unknown> | undefined;
    if (lifestylePos?.primary_lifestyle) {
      return lifestylePos.primary_lifestyle as string;
    }
    
    // Fallback to target_demographics.primary_audience
    const targetDemo = marketingAnalysis.target_demographics as Record<string, unknown> | undefined;
    if (targetDemo?.primary_audience) {
      return targetDemo.primary_audience as string;
    }
    
    return 'No data';
  };

  const parseCompetitorIngredients = (ingredientsStr: string | null): string[] => {
    if (!ingredientsStr) return [];
    // Split by comma and take first 3, or truncate to 80 chars
    const parts = ingredientsStr.split(/[,;]/).map(i => i.trim()).filter(Boolean);
    if (parts.length >= 3) {
      return parts.slice(0, 3);
    }
    // If less than 3 parts, truncate original string
    const truncated = ingredientsStr.substring(0, 80);
    return [truncated + (ingredientsStr.length > 80 ? '...' : '')];
  };

  const getCompetitorMessaging = (product: Product): string => {
    const marketingAnalysis = product.marketing_analysis as Record<string, unknown> | null;
    if (!marketingAnalysis) return 'No data';
    
    const messagingAnalysis = marketingAnalysis.messaging_analysis as Record<string, unknown> | undefined;
    const keyClaims = messagingAnalysis?.key_claims_shown as string[] | undefined;
    
    if (keyClaims && keyClaims.length > 0) {
      return keyClaims[0];
    }
    
    // Fallback to USPs
    const usps = marketingAnalysis.usps as string[] | undefined;
    if (usps && usps.length > 0) {
      return usps[0];
    }
    
    return 'No data';
  };

  const getCompetitorAudience = (product: Product): string => {
    const marketingAnalysis = product.marketing_analysis as Record<string, unknown> | null;
    if (!marketingAnalysis) return 'No data';
    
    const targetDemo = marketingAnalysis.target_demographics as Record<string, unknown> | undefined;
    if (targetDemo?.primary_audience) {
      return targetDemo.primary_audience as string;
    }
    
    return 'No data';
  };

  const getCompetitorPainPoints = (product: Product): Array<{ issue: string }> => {
    const reviewAnalysis = product.review_analysis as Record<string, unknown> | null;
    if (!reviewAnalysis) return [];
    
    const painPoints = reviewAnalysis.pain_points as Array<{ pain_point?: string; issue?: string }> | undefined;
    if (!painPoints || !Array.isArray(painPoints)) return [];
    
    return painPoints.slice(0, 2).map(pp => ({
      issue: pp.issue || pp.pain_point || 'Unknown issue'
    }));
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <Package className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            Benchmark Comparison
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            Compare your concept against top {MAX_COMPETITORS} competitors • Click any product for details
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 md:px-6">
          <div className="flex gap-2 md:gap-3">
            {/* Our Concept Column - Fixed */}
            <div className="w-[200px] md:w-[240px] shrink-0 rounded-lg border-2 border-amber-500/50 bg-gradient-to-b from-amber-50/50 to-background dark:from-amber-950/20 overflow-hidden">
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
              
              <div className="p-2 md:p-3 space-y-3">
                <div className="w-full aspect-square rounded-lg bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-800/20 flex items-center justify-center">
                  <div className="text-center">
                    <Target className="w-10 h-10 md:w-12 md:h-12 text-amber-500/50 mx-auto" />
                    <p className="text-[10px] text-amber-600/70 mt-1">Your Product</p>
                  </div>
                </div>

                {/* Positioning */}
                <div>
                  <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3 text-primary" />
                    Positioning
                  </p>
                  <p className="text-[10px] text-muted-foreground line-clamp-3">
                    {getOurPositioning()}
                  </p>
                </div>

                {/* Ingredients */}
                <div>
                  <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                    <Pill className="w-3 h-3 text-emerald-500" />
                    Key Ingredients
                  </p>
                  <div className="space-y-0.5">
                    {getOurIngredients().map((ing, i) => (
                      <div key={i} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                        <span className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                        <span className="line-clamp-1">{ing}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Marketing Strategy */}
                <div>
                  <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                    <Megaphone className="w-3 h-3 text-blue-500" />
                    Marketing Strategy
                  </p>
                  <p className="text-[10px] text-muted-foreground line-clamp-2">
                    {getOurMessaging()}
                  </p>
                </div>

                {/* Target Audience */}
                <div>
                  <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                    <Users className="w-3 h-3 text-violet-500" />
                    Target Audience
                  </p>
                  <p className="text-[10px] text-muted-foreground line-clamp-2">
                    {getOurBuyerProfile()}
                  </p>
                </div>
              </div>
            </div>

            {/* Competitor Columns - Scrollable */}
            <ScrollArea className="flex-1">
              <div className="flex gap-2 md:gap-3 pb-4">
                {displayedProducts.map((product, idx) => (
                  <div 
                    key={product.id} 
                    className="w-[200px] md:w-[240px] shrink-0 rounded-lg border border-border bg-card overflow-hidden cursor-pointer transition-all hover:border-primary hover:shadow-md"
                    onClick={() => handleProductClick(product)}
                  >
                    <div className="bg-gradient-to-r from-muted to-muted/80 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                          #{idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-xs md:text-sm truncate">{product.brand || 'Unknown'}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{product.title?.substring(0, 25)}...</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-2 md:p-3 space-y-3">
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

                      {/* Positioning */}
                      <div>
                        <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-primary" />
                          Positioning
                        </p>
                        <p className="text-[10px] text-muted-foreground line-clamp-2">{getCompetitorPositioning(product)}</p>
                      </div>

                      {/* Ingredients */}
                      <div>
                        <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                          <Pill className="w-3 h-3 text-emerald-500" />
                          Ingredients
                        </p>
                        <div className="space-y-0.5">
                          {parseCompetitorIngredients(product.ingredients).map((ing, i) => (
                            <div key={i} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                              <span className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                              <span className="line-clamp-1">{ing}</span>
                            </div>
                          ))}
                          {parseCompetitorIngredients(product.ingredients).length === 0 && (
                            <p className="text-[10px] text-muted-foreground italic">No data</p>
                          )}
                        </div>
                      </div>

                      {/* Marketing Strategy */}
                      <div>
                        <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                          <Megaphone className="w-3 h-3 text-blue-500" />
                          Marketing
                        </p>
                        <p className="text-[10px] text-muted-foreground line-clamp-2">{getCompetitorMessaging(product)}</p>
                      </div>

                      {/* Target Audience */}
                      <div>
                        <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                          <Users className="w-3 h-3 text-violet-500" />
                          Target Audience
                        </p>
                        <p className="text-[10px] text-muted-foreground line-clamp-2">{getCompetitorAudience(product)}</p>
                      </div>

                      {/* Pain Points */}
                      <div>
                        <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-500" />
                          Suffers From
                        </p>
                        <div className="space-y-0.5">
                          {getCompetitorPainPoints(product).map((pp, i) => (
                            <div key={i} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                              <span className="w-1 h-1 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                              <span className="line-clamp-1">{pp.issue}</span>
                            </div>
                          ))}
                          {getCompetitorPainPoints(product).length === 0 && (
                            <p className="text-[10px] text-muted-foreground italic">No data</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Empty slots to show capacity */}
                {Array.from({ length: Math.max(0, MAX_COMPETITORS - displayedProducts.length) }).map((_, idx) => (
                  <div key={`empty-${idx}`} className="w-[200px] md:w-[240px] shrink-0 rounded-lg border border-dashed border-border bg-muted/20 flex items-center justify-center min-h-[480px]">
                    <p className="text-xs text-muted-foreground">No data</p>
                  </div>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </CardContent>
      </Card>

      {/* Product Detail Modal */}
      <ProductDetailModal 
        product={selectedProduct}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </>
  );
}
