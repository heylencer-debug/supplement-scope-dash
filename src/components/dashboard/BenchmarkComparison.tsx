import { X, Trophy, DollarSign, FlaskConical, Megaphone, HeartCrack, Sparkles, Check, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { Product } from "@/hooks/useProducts";
import type { CategoryAnalysis } from "@/hooks/useCategoryAnalyses";

interface BenchmarkComparisonProps {
  selectedProducts: Product[];
  analysis: CategoryAnalysis | null;
  onRemoveProduct: (productId: string) => void;
  onClearAll: () => void;
}

interface AnalysisScores {
  product_development?: {
    pricing?: {
      recommended_price?: number;
      positioning_tier?: string;
    };
    formulation?: {
      recommended_ingredients?: Array<{ ingredient: string; dosage?: string; rationale?: string }>;
      key_features?: string[];
    };
  };
  go_to_market?: {
    positioning?: string;
  };
  customer_insights?: {
    primary_pain_points?: Array<{ pain_point: string; frequency?: number }>;
  };
}

interface ReviewAnalysis {
  pain_points?: Array<{ theme: string; affected_percentage?: number }>;
}

interface MarketingAnalysis {
  competitive_positioning?: string;
  lifestyle_positioning?: {
    primary_lifestyle?: string;
  };
}

export default function BenchmarkComparison({
  selectedProducts,
  analysis,
  onRemoveProduct,
  onClearAll,
}: BenchmarkComparisonProps) {
  if (selectedProducts.length === 0) {
    return null;
  }

  const analysisScores = analysis?.analysis_1_category_scores as AnalysisScores | null;

  const getRecommendedPrice = () => {
    return analysisScores?.product_development?.pricing?.recommended_price;
  };

  const getPricingTier = () => {
    return analysisScores?.product_development?.pricing?.positioning_tier || "Mid-Premium";
  };

  const getRecommendedIngredients = () => {
    const ingredients = analysisScores?.product_development?.formulation?.recommended_ingredients;
    if (!ingredients || !Array.isArray(ingredients)) return [];
    return ingredients.slice(0, 3);
  };

  const getKeyFeatures = () => {
    const features = analysisScores?.product_development?.formulation?.key_features;
    if (!features || !Array.isArray(features)) return [];
    return features.slice(0, 3);
  };

  const getPositioning = () => {
    return analysisScores?.go_to_market?.positioning || "Premium Quality Focus";
  };

  const getOurPainPoints = () => {
    const painPoints = analysisScores?.customer_insights?.primary_pain_points;
    if (!painPoints || !Array.isArray(painPoints)) return [];
    return painPoints.slice(0, 3).map(p => typeof p === 'string' ? p : p.pain_point);
  };

  const getCompetitorPainPoints = (product: Product) => {
    const reviewAnalysis = product.review_analysis as ReviewAnalysis | null;
    const painPoints = reviewAnalysis?.pain_points;
    if (!painPoints || !Array.isArray(painPoints)) return [];
    return painPoints.slice(0, 2).map(p => typeof p === 'string' ? p : p.theme);
  };

  const getCompetitorPositioning = (product: Product) => {
    const marketingAnalysis = product.marketing_analysis as MarketingAnalysis | null;
    return marketingAnalysis?.lifestyle_positioning?.primary_lifestyle 
      || marketingAnalysis?.competitive_positioning 
      || "N/A";
  };

  const parseIngredients = (ingredientsStr: string | null) => {
    if (!ingredientsStr) return [];
    return ingredientsStr.split(',').slice(0, 3).map(i => i.trim());
  };

  const getFeatureBullets = (product: Product) => {
    if (product.feature_bullets && Array.isArray(product.feature_bullets)) {
      return product.feature_bullets.slice(0, 3);
    }
    return [];
  };

  return (
    <Card className="mt-6">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <CardTitle>Benchmark Comparison</CardTitle>
            <Badge variant="secondary">{selectedProducts.length} of 5 selected</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={onClearAll}>
            Clear All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <div className="flex min-w-max">
            {/* Our Concept Column - Fixed */}
            <div className="w-64 flex-shrink-0 border-r-2 border-amber-500/30">
              {/* Header */}
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white p-4 rounded-tl-lg border-l-4 border-[#1e3a5f]">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5" />
                  <span className="font-bold">OUR CONCEPT</span>
                </div>
                <p className="text-xs text-amber-100 mt-1">Winning Strategy</p>
              </div>

              {/* Price & Value Row */}
              <div className="p-4 border-b bg-emerald-50/50 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                  <DollarSign className="w-4 h-4" />
                  PRICE & VALUE
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-lg">
                    ${getRecommendedPrice()?.toFixed(2) || "TBD"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{getPricingTier()}</p>
              </div>

              {/* Core Formula Row */}
              <div className="p-4 border-b bg-emerald-50/50 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                  <FlaskConical className="w-4 h-4" />
                  CORE FORMULA
                </div>
                <div className="space-y-1">
                  {getRecommendedIngredients().length > 0 ? (
                    getRecommendedIngredients().map((ing, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        <Check className="w-3 h-3 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <span className="truncate">{typeof ing === 'string' ? ing : ing.ingredient}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">Analysis pending</span>
                  )}
                </div>
              </div>

              {/* Marketing Strategy Row */}
              <div className="p-4 border-b bg-emerald-50/50 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                  <Megaphone className="w-4 h-4" />
                  MARKETING
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <Check className="w-3 h-3 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <span>{getPositioning()}</span>
                </div>
              </div>

              {/* Pain Gap Row */}
              <div className="p-4 border-b bg-emerald-50/50 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                  <HeartCrack className="w-4 h-4" />
                  PAIN GAP
                </div>
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-1">Solves For:</p>
                <div className="space-y-1">
                  {getOurPainPoints().length > 0 ? (
                    getOurPainPoints().map((point, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs">
                        <Check className="w-3 h-3 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2">{point}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">Analysis pending</span>
                  )}
                </div>
              </div>

              {/* Key Features Row */}
              <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-bl-lg">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                  <Sparkles className="w-4 h-4" />
                  KEY FEATURES
                </div>
                <div className="space-y-1">
                  {getKeyFeatures().length > 0 ? (
                    getKeyFeatures().map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs">
                        <Check className="w-3 h-3 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-2">{feature}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">Analysis pending</span>
                  )}
                </div>
              </div>
            </div>

            {/* Competitor Columns */}
            {selectedProducts.map((product, index) => (
              <div key={product.id} className="w-56 flex-shrink-0 border-r last:border-r-0">
                {/* Header */}
                <div className="bg-muted p-4 relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6"
                    onClick={() => onRemoveProduct(product.id)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                  <p className="font-medium text-sm truncate pr-6">{product.brand || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground truncate">{product.title?.slice(0, 30)}...</p>
                </div>

                {/* Price & Value Row */}
                <div className="p-4 border-b">
                  <div className="text-sm font-medium text-muted-foreground mb-2 opacity-0">Price</div>
                  <span className="font-bold text-lg">${(product.price ?? 0).toFixed(2)}</span>
                  <p className="text-xs text-muted-foreground mt-1">
                    {product.price && product.price > 100 ? "Premium" : product.price && product.price > 50 ? "Mid-Range" : "Budget"}
                  </p>
                </div>

                {/* Core Formula Row */}
                <div className="p-4 border-b">
                  <div className="text-sm font-medium text-muted-foreground mb-2 opacity-0">Formula</div>
                  <div className="space-y-1">
                    <Badge variant="outline" className="text-xs">
                      {product.nutrients_count ?? 0} nutrients
                    </Badge>
                    {parseIngredients(product.ingredients).map((ing, idx) => (
                      <p key={idx} className="text-xs text-muted-foreground truncate">{ing}</p>
                    ))}
                  </div>
                </div>

                {/* Marketing Strategy Row */}
                <div className="p-4 border-b">
                  <div className="text-sm font-medium text-muted-foreground mb-2 opacity-0">Marketing</div>
                  <span className="text-sm">{getCompetitorPositioning(product)}</span>
                </div>

                {/* Pain Gap Row */}
                <div className="p-4 border-b">
                  <div className="text-sm font-medium text-muted-foreground mb-2 opacity-0">Pain</div>
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">Suffers From:</p>
                  <div className="space-y-1">
                    {getCompetitorPainPoints(product).length > 0 ? (
                      getCompetitorPainPoints(product).map((point, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs">
                          <AlertTriangle className="w-3 h-3 text-amber-600 mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-2">{point}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No data</span>
                    )}
                  </div>
                </div>

                {/* Key Features Row */}
                <div className="p-4">
                  <div className="text-sm font-medium text-muted-foreground mb-2 opacity-0">Features</div>
                  <div className="space-y-1">
                    {getFeatureBullets(product).length > 0 ? (
                      getFeatureBullets(product).map((bullet, idx) => (
                        <p key={idx} className="text-xs text-muted-foreground line-clamp-2">
                          • {typeof bullet === 'string' ? bullet.slice(0, 50) : bullet}...
                        </p>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">No features listed</span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Empty slots */}
            {Array.from({ length: Math.max(0, 5 - selectedProducts.length) }).map((_, idx) => (
              <div key={`empty-${idx}`} className="w-56 flex-shrink-0 border-r last:border-r-0 bg-muted/30">
                <div className="h-full flex items-center justify-center p-4">
                  <p className="text-sm text-muted-foreground text-center">
                    Select a product to compare
                  </p>
                </div>
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
