import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, CheckCircle2, Award, Tag, Shield, DollarSign, Palette, Hash } from "lucide-react";

interface PackagingData {
  type?: string;
  quantity?: string | number;
  design_elements?: string[];
}

interface ProductData {
  packaging_type?: string | null;
  servings_per_container?: number | null;
  price?: number | null;
  marketing_analysis?: {
    design_blueprint?: {
      trust_signals?: string;
      color_strategy?: string;
      visual_style?: string;
    };
  } | null;
}

interface PackagingIntelligenceProps {
  packagingData: PackagingData | null;
  productsClaims: (string | null | undefined)[];
  productsData?: ProductData[];
  isLoading?: boolean;
}

export function PackagingIntelligence({ packagingData, productsClaims, productsData = [], isLoading }: PackagingIntelligenceProps) {
  // Aggregate claims and calculate frequency
  const topClaims = useMemo(() => {
    const claimFrequency = new Map<string, number>();
    
    productsClaims.forEach(claimsString => {
      if (!claimsString) return;
      
      // Parse claims - they might be comma-separated or already individual
      const claims = claimsString.split(/[,;]/).map(c => c.trim()).filter(Boolean);
      
      claims.forEach(claim => {
        // Normalize claim text
        const normalizedClaim = claim.toLowerCase().trim();
        if (normalizedClaim.length > 2) {
          // Use original casing for display but count normalized versions
          const existingKey = Array.from(claimFrequency.keys()).find(
            k => k.toLowerCase() === normalizedClaim
          );
          if (existingKey) {
            claimFrequency.set(existingKey, (claimFrequency.get(existingKey) || 0) + 1);
          } else {
            claimFrequency.set(claim.trim(), 1);
          }
        }
      });
    });

    // Sort by frequency and take top 10
    return Array.from(claimFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([claim, count]) => ({ claim, count }));
  }, [productsClaims]);

  // Aggregate packaging types
  const packagingStats = useMemo(() => {
    if (!productsData || productsData.length === 0) return null;

    const typeFrequency = new Map<string, number>();
    const servingCounts: number[] = [];
    const prices: number[] = [];

    productsData.forEach(product => {
      // Packaging types
      if (product.packaging_type) {
        const type = product.packaging_type.trim();
        typeFrequency.set(type, (typeFrequency.get(type) || 0) + 1);
      }
      // Serving counts
      if (product.servings_per_container && product.servings_per_container > 0) {
        servingCounts.push(product.servings_per_container);
      }
      // Prices
      if (product.price && product.price > 0) {
        prices.push(product.price);
      }
    });

    // Most common packaging type
    const sortedTypes = Array.from(typeFrequency.entries()).sort((a, b) => b[1] - a[1]);
    const mostCommonType = sortedTypes[0] ? { type: sortedTypes[0][0], count: sortedTypes[0][1] } : null;

    // Serving count distribution
    const servingFrequency = new Map<number, number>();
    servingCounts.forEach(count => {
      servingFrequency.set(count, (servingFrequency.get(count) || 0) + 1);
    });
    const topServings = Array.from(servingFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([count, freq]) => ({ count, frequency: freq }));

    // Price sweet spot (median and range)
    const sortedPrices = prices.sort((a, b) => a - b);
    const medianPrice = sortedPrices.length > 0 
      ? sortedPrices[Math.floor(sortedPrices.length / 2)] 
      : null;
    const minPrice = sortedPrices[0] || null;
    const maxPrice = sortedPrices[sortedPrices.length - 1] || null;
    
    // Calculate 25th and 75th percentile for sweet spot
    const p25 = sortedPrices.length > 0 
      ? sortedPrices[Math.floor(sortedPrices.length * 0.25)] 
      : null;
    const p75 = sortedPrices.length > 0 
      ? sortedPrices[Math.floor(sortedPrices.length * 0.75)] 
      : null;

    return {
      mostCommonType,
      topServings,
      priceRange: { min: minPrice, max: maxPrice, median: medianPrice, p25, p75 },
    };
  }, [productsData]);

  // Aggregate trust signals from design_blueprint
  const trustSignals = useMemo(() => {
    if (!productsData || productsData.length === 0) return [];

    const signalFrequency = new Map<string, number>();

    productsData.forEach(product => {
      const signals = product.marketing_analysis?.design_blueprint?.trust_signals;
      if (!signals) return;

      // Parse comma-separated signals
      const signalList = signals.split(/[,;]/).map(s => s.trim()).filter(Boolean);
      
      signalList.forEach(signal => {
        const normalized = signal.toLowerCase().trim();
        if (normalized.length > 2) {
          const existingKey = Array.from(signalFrequency.keys()).find(
            k => k.toLowerCase() === normalized
          );
          if (existingKey) {
            signalFrequency.set(existingKey, (signalFrequency.get(existingKey) || 0) + 1);
          } else {
            signalFrequency.set(signal.trim(), 1);
          }
        }
      });
    });

    return Array.from(signalFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([signal, count]) => ({ signal, count }));
  }, [productsData]);

  // Aggregate color strategies
  const colorStrategies = useMemo(() => {
    if (!productsData || productsData.length === 0) return [];

    const colorFrequency = new Map<string, number>();

    productsData.forEach(product => {
      const colorStrategy = product.marketing_analysis?.design_blueprint?.color_strategy;
      if (!colorStrategy) return;

      // Extract key color words from the strategy text
      const colorKeywords = colorStrategy.match(/\b(purple|blue|green|gold|white|black|red|orange|yellow|pink|natural|earth|warm|cool|vibrant|muted|pastel|bold)\b/gi);
      
      if (colorKeywords) {
        colorKeywords.forEach(color => {
          const normalized = color.toLowerCase();
          colorFrequency.set(normalized, (colorFrequency.get(normalized) || 0) + 1);
        });
      }
    });

    const colorMeanings: Record<string, string> = {
      purple: "Calm, premium, sleep",
      blue: "Trust, clinical, reliability",
      green: "Natural, health, organic",
      gold: "Quality, premium, certification",
      white: "Purity, clean, clinical",
      black: "Luxury, sophistication",
      red: "Energy, urgency, power",
      orange: "Vitality, enthusiasm",
      yellow: "Optimism, clarity",
      pink: "Gentle, feminine",
      natural: "Organic, earth-friendly",
      earth: "Grounded, natural",
      warm: "Approachable, inviting",
      cool: "Professional, calm",
      vibrant: "Energetic, eye-catching",
      muted: "Sophisticated, subtle",
      pastel: "Gentle, calming",
      bold: "Confident, attention-grabbing",
    };

    return Array.from(colorFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([color, count]) => ({ 
        color, 
        count, 
        meaning: colorMeanings[color] || "Brand differentiation" 
      }));
  }, [productsData]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Package className="w-5 h-5 text-primary" />
            Winning Packaging Strategy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasData = packagingData || topClaims.length > 0 || (packagingStats && packagingStats.mostCommonType);

  if (!hasData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Package className="w-5 h-5 text-primary" />
            Winning Packaging Strategy
          </CardTitle>
          <CardDescription>Packaging intelligence not yet available</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Packaging analysis will appear here once the analysis is complete.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Package className="w-5 h-5 text-primary" />
          Winning Packaging Strategy
        </CardTitle>
        <CardDescription>Market intelligence for optimal packaging format, pricing, and positioning</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Top Row: Format Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Recommended Format */}
          {(packagingData?.type || packagingStats?.mostCommonType) && (
            <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <Award className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Recommended Format</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-primary">
                  {packagingData?.type || packagingStats?.mostCommonType?.type || "N/A"}
                </span>
                {packagingData?.quantity && (
                  <span className="text-sm text-muted-foreground">
                    ({packagingData.quantity} count)
                  </span>
                )}
              </div>
              {packagingStats?.mostCommonType && !packagingData?.type && (
                <p className="text-xs text-muted-foreground mt-1">
                  {packagingStats.mostCommonType.count} products use this format
                </p>
              )}
            </div>
          )}

          {/* Optimal Serving Count */}
          {packagingStats?.topServings && packagingStats.topServings.length > 0 && (
            <div className="p-4 bg-chart-4/5 rounded-xl border border-chart-4/20">
              <div className="flex items-center gap-2 mb-2">
                <Hash className="w-4 h-4 text-chart-4" />
                <span className="text-sm font-medium text-foreground">Optimal Quantity</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-chart-4">
                  {packagingStats.topServings[0].count}-count
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {packagingStats.topServings.slice(0, 3).map(({ count, frequency }, idx) => (
                  <Badge key={idx} variant="outline" className="text-[10px] py-0.5">
                    {count}ct ({frequency})
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Price Sweet Spot */}
          {packagingStats?.priceRange?.p25 && packagingStats?.priceRange?.p75 && (
            <div className="p-4 bg-chart-2/5 rounded-xl border border-chart-2/20">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-chart-2" />
                <span className="text-sm font-medium text-foreground">Price Sweet Spot</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-chart-2">
                  ${Math.round(packagingStats.priceRange.p25)}-${Math.round(packagingStats.priceRange.p75)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Median: ${packagingStats.priceRange.median?.toFixed(0)} • Range: ${packagingStats.priceRange.min?.toFixed(0)}-${packagingStats.priceRange.max?.toFixed(0)}
              </p>
            </div>
          )}
        </div>

        {/* Key Design Elements */}
        {packagingData?.design_elements && packagingData.design_elements.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-chart-4" />
              Key Design Elements
            </h4>
            <ul className="space-y-2">
              {packagingData.design_elements.map((element, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-chart-4 mt-2 shrink-0" />
                  <span className="text-foreground">{element}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Trust Signals */}
        {trustSignals.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-chart-1" />
              Most Common Trust Signals
            </h4>
            <div className="flex flex-wrap gap-2">
              {trustSignals.map(({ signal, count }, idx) => (
                <Badge 
                  key={idx} 
                  variant="secondary" 
                  className="text-xs py-1 px-2 bg-chart-1/10 text-chart-1 border-chart-1/20"
                >
                  {signal}
                  <span className="ml-1.5 text-chart-1/70">({count})</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Color Strategies */}
        {colorStrategies.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <Palette className="w-4 h-4 text-chart-5" />
              Winning Color Strategies
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {colorStrategies.map(({ color, count, meaning }, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border/50"
                >
                  <div 
                    className="w-4 h-4 rounded-full border border-border/50"
                    style={{ 
                      backgroundColor: getColorHex(color)
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground capitalize">{color}</span>
                    <span className="text-xs text-muted-foreground ml-1">({count})</span>
                    <p className="text-[10px] text-muted-foreground truncate">{meaning}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Claims */}
        {topClaims.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4 text-chart-2" />
              Top Claims in Category
            </h4>
            <div className="flex flex-wrap gap-2">
              {topClaims.map(({ claim, count }, idx) => (
                <Badge 
                  key={idx} 
                  variant="secondary" 
                  className="text-xs py-1 px-2"
                >
                  {claim}
                  <span className="ml-1.5 text-muted-foreground">({count})</span>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Helper function to get approximate hex color for color names
function getColorHex(colorName: string): string {
  const colorMap: Record<string, string> = {
    purple: "#9333ea",
    blue: "#3b82f6",
    green: "#22c55e",
    gold: "#eab308",
    white: "#f8fafc",
    black: "#1e293b",
    red: "#ef4444",
    orange: "#f97316",
    yellow: "#facc15",
    pink: "#ec4899",
    natural: "#a3a380",
    earth: "#8b7355",
    warm: "#fb923c",
    cool: "#67e8f9",
    vibrant: "#f472b6",
    muted: "#94a3b8",
    pastel: "#c4b5fd",
    bold: "#dc2626",
  };
  return colorMap[colorName] || "#94a3b8";
}
