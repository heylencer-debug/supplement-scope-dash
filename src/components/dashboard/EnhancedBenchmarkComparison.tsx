import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, TrendingUp, Pill, Target, MessageSquare, Package, DollarSign, BarChart3, Calendar, Award, Beaker } from "lucide-react";
import { useProducts, Product } from "@/hooks/useProducts";
import ProductDetailModal from "@/components/ProductDetailModal";

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
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  
  // Get top 5 products by reviews
  const topProducts = products
    ?.sort((a, b) => (b.reviews || 0) - (a.reviews || 0))
    .slice(0, 5) || [];

  const loading = isLoading || productsLoading;

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setModalOpen(true);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[500px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const getPainPoints = (product: Product): string[] => {
    const reviewAnalysis = product.review_analysis as Record<string, unknown> | null;
    const painPoints = reviewAnalysis?.pain_points as Array<{ pain_point?: string; issue?: string }> | undefined;
    return painPoints?.slice(0, 3).map(p => p.pain_point || p.issue || '') || [];
  };

  const getUSPs = (product: Product): string[] => {
    const marketingAnalysis = product.marketing_analysis as Record<string, unknown> | null;
    return (marketingAnalysis?.usps as string[])?.slice(0, 3) || [];
  };

  const getLQSColor = (lqs: number | null) => {
    if (!lqs) return "text-muted-foreground";
    if (lqs >= 80) return "text-emerald-600";
    if (lqs >= 50) return "text-amber-600";
    return "text-rose-600";
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return "N/A";
    return `$${value.toLocaleString()}`;
  };

  const formatNumber = (value: number | null) => {
    if (!value) return "N/A";
    return value.toLocaleString();
  };

  // Metrics rows configuration
  const metricRows = [
    {
      label: "Price",
      icon: DollarSign,
      iconColor: "text-emerald-500",
      conceptValue: analysisData?.recommended_price ? `$${analysisData.recommended_price.toFixed(2)}` : "TBD",
      getValue: (p: Product) => p.price ? `$${p.price.toFixed(2)}` : "N/A",
      highlight: true,
    },
    {
      label: "Rating",
      icon: Star,
      iconColor: "text-amber-500",
      conceptValue: "Target: 4.5+",
      getValue: (p: Product) => p.rating ? `${p.rating.toFixed(1)} ★` : "N/A",
    },
    {
      label: "Reviews",
      icon: MessageSquare,
      iconColor: "text-primary",
      conceptValue: "—",
      getValue: (p: Product) => formatNumber(p.reviews),
    },
    {
      label: "Monthly Sales",
      icon: TrendingUp,
      iconColor: "text-emerald-500",
      conceptValue: "—",
      getValue: (p: Product) => formatNumber(p.monthly_sales),
      valueColor: "text-emerald-600",
    },
    {
      label: "Monthly Revenue",
      icon: DollarSign,
      iconColor: "text-emerald-500",
      conceptValue: "—",
      getValue: (p: Product) => formatCurrency(p.monthly_revenue),
      valueColor: "text-emerald-600",
    },
    {
      label: "BSR",
      icon: BarChart3,
      iconColor: "text-primary",
      conceptValue: "—",
      getValue: (p: Product) => formatNumber(p.bsr_current || p.bsr_primary),
    },
    {
      label: "Age (months)",
      icon: Calendar,
      iconColor: "text-muted-foreground",
      conceptValue: "New",
      getValue: (p: Product) => p.age_months ? `${p.age_months}mo` : "N/A",
    },
    {
      label: "LQS",
      icon: Award,
      iconColor: "text-primary",
      conceptValue: "Target: 85+",
      getValue: (p: Product) => p.lqs?.toString() || "N/A",
      getValueColor: (p: Product) => getLQSColor(p.lqs),
    },
    {
      label: "Servings",
      icon: Beaker,
      iconColor: "text-primary",
      conceptValue: "TBD",
      getValue: (p: Product) => p.servings_per_container?.toString() || "N/A",
    },
  ];

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <Package className="w-4 h-4 md:w-5 md:h-5 text-primary" />
            Benchmark Comparison
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            Side-by-side comparison of top 5 competitors • Click any product for details
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 md:px-4">
          <ScrollArea className="w-full">
            <div className="min-w-[800px]">
              {/* Header Row with Product Images & Names */}
              <div className="grid grid-cols-[140px_repeat(6,1fr)] gap-2 mb-4">
                <div className="font-semibold text-sm text-muted-foreground"></div>
                
                {/* Our Concept */}
                <div className="bg-gradient-to-b from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 rounded-lg p-3 border-2 border-amber-500/50">
                  <div className="aspect-square w-full max-w-[100px] mx-auto mb-2 rounded-lg bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-800/20 flex items-center justify-center">
                    <Target className="w-10 h-10 text-amber-500/50" />
                  </div>
                  <Badge className="w-full justify-center bg-amber-500 hover:bg-amber-600 text-[10px]">OUR CONCEPT</Badge>
                  <p className="text-[10px] text-center text-muted-foreground mt-1 truncate">Strategy</p>
                </div>

                {/* Competitor Products */}
                {topProducts.map((product, idx) => (
                  <div 
                    key={product.id} 
                    className="bg-card rounded-lg p-3 border border-border cursor-pointer hover:border-primary hover:shadow-md transition-all"
                    onClick={() => handleProductClick(product)}
                  >
                    <div className="aspect-square w-full max-w-[100px] mx-auto mb-2 rounded-lg bg-white border overflow-hidden">
                      {product.main_image_url ? (
                        <img 
                          src={product.main_image_url} 
                          alt={product.title || 'Product'} 
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                          <Package className="w-6 h-6 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className="w-full justify-center text-[10px]">#{idx + 1}</Badge>
                    <p className="text-[10px] text-center font-medium mt-1 truncate" title={product.brand || 'Unknown'}>
                      {product.brand || 'Unknown'}
                    </p>
                  </div>
                ))}

                {/* Empty slots */}
                {Array.from({ length: Math.max(0, 5 - topProducts.length) }).map((_, idx) => (
                  <div key={`empty-header-${idx}`} className="bg-muted/20 rounded-lg p-3 border border-dashed border-border flex items-center justify-center min-h-[140px]">
                    <p className="text-xs text-muted-foreground">—</p>
                  </div>
                ))}
              </div>

              {/* Metrics Rows */}
              <div className="space-y-1">
                {metricRows.map((row, rowIdx) => (
                  <div 
                    key={row.label} 
                    className={`grid grid-cols-[140px_repeat(6,1fr)] gap-2 py-2 px-2 rounded-lg ${rowIdx % 2 === 0 ? 'bg-muted/30' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <row.icon className={`w-4 h-4 ${row.iconColor}`} />
                      <span className="text-xs font-medium">{row.label}</span>
                    </div>
                    
                    {/* Our Concept Value */}
                    <div className={`text-center text-sm font-semibold ${row.highlight ? 'text-amber-600' : ''}`}>
                      {row.conceptValue}
                    </div>

                    {/* Competitor Values */}
                    {topProducts.map((product) => (
                      <div 
                        key={product.id} 
                        className={`text-center text-sm font-medium ${row.getValueColor ? row.getValueColor(product) : row.valueColor || ''}`}
                      >
                        {row.getValue(product)}
                      </div>
                    ))}

                    {/* Empty slots */}
                    {Array.from({ length: Math.max(0, 5 - topProducts.length) }).map((_, idx) => (
                      <div key={`empty-${row.label}-${idx}`} className="text-center text-sm text-muted-foreground">
                        —
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* USPs Section */}
              <div className="mt-4 pt-4 border-t">
                <div className="grid grid-cols-[140px_repeat(6,1fr)] gap-2">
                  <div className="flex items-start gap-2 pt-1">
                    <Target className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-medium">USPs</span>
                  </div>
                  
                  <div className="space-y-1">
                    {(analysisData?.key_differentiators || ['Premium formula', 'Clinical doses']).slice(0, 3).map((diff, i) => (
                      <div key={i} className="flex items-start gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1 shrink-0" />
                        <span className="line-clamp-1">{diff}</span>
                      </div>
                    ))}
                  </div>

                  {topProducts.map((product) => (
                    <div key={product.id} className="space-y-1">
                      {getUSPs(product).length > 0 ? getUSPs(product).map((usp, i) => (
                        <div key={i} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
                          <span className="line-clamp-1">{usp}</span>
                        </div>
                      )) : (
                        <p className="text-[10px] text-muted-foreground italic">No data</p>
                      )}
                    </div>
                  ))}

                  {Array.from({ length: Math.max(0, 5 - topProducts.length) }).map((_, idx) => (
                    <div key={`empty-usp-${idx}`} className="text-center text-muted-foreground">—</div>
                  ))}
                </div>
              </div>

              {/* Pain Points Section */}
              <div className="mt-4 pt-4 border-t">
                <div className="grid grid-cols-[140px_repeat(6,1fr)] gap-2">
                  <div className="flex items-start gap-2 pt-1">
                    <Target className="w-4 h-4 text-rose-500" />
                    <span className="text-xs font-medium">Pain Points</span>
                  </div>
                  
                  <div className="space-y-1">
                    {(analysisData?.primary_pain_points || []).slice(0, 3).map((pp, i) => (
                      <div key={i} className="flex items-start gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                        <span className="line-clamp-1">{pp.pain_point || pp.issue}</span>
                      </div>
                    ))}
                    {(!analysisData?.primary_pain_points || analysisData.primary_pain_points.length === 0) && (
                      <p className="text-[10px] text-muted-foreground italic">Pending</p>
                    )}
                  </div>

                  {topProducts.map((product) => (
                    <div key={product.id} className="space-y-1">
                      {getPainPoints(product).length > 0 ? getPainPoints(product).map((pp, i) => (
                        <div key={i} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1 shrink-0" />
                          <span className="line-clamp-1">{pp}</span>
                        </div>
                      )) : (
                        <p className="text-[10px] text-muted-foreground italic">No data</p>
                      )}
                    </div>
                  ))}

                  {Array.from({ length: Math.max(0, 5 - topProducts.length) }).map((_, idx) => (
                    <div key={`empty-pain-${idx}`} className="text-center text-muted-foreground">—</div>
                  ))}
                </div>
              </div>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
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
