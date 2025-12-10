import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, CheckCircle2, Award, Tag, Shield, DollarSign, Palette, Hash, Eye, Zap } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface PackagingData {
  type?: string;
  quantity?: string | number;
  design_elements?: string[];
}

interface ProductData {
  packaging_type?: string | null;
  servings_per_container?: number | null;
  price?: number | null;
  brand?: string | null;
  title?: string | null;
  main_image_url?: string | null;
  claims?: string | null;
  claims_on_label?: string[] | null;
  monthly_revenue?: number | null;
  monthly_sales?: number | null;
  marketing_analysis?: {
    design_blueprint?: {
      trust_signals?: string;
      color_strategy?: string;
      visual_style?: string;
      conversion_triggers?: string;
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
  const CHART_COLORS = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
    "hsl(var(--primary))",
  ];
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
    
    // Full packaging type distribution for chart
    const typeDistribution = sortedTypes.slice(0, 6).map(([type, count], idx) => ({
      name: type.length > 12 ? type.substring(0, 12) + "..." : type,
      fullName: type,
      count,
      percentage: Math.round((count / productsData.length) * 100),
      fill: CHART_COLORS[idx % CHART_COLORS.length],
    }));

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
      typeDistribution,
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

  // Aggregate visual styles
  const visualStyles = useMemo(() => {
    if (!productsData || productsData.length === 0) return [];

    const styleFrequency = new Map<string, number>();

    productsData.forEach(product => {
      const visualStyle = product.marketing_analysis?.design_blueprint?.visual_style;
      if (!visualStyle) return;

      // Extract key style keywords
      const styleKeywords = visualStyle.match(/\b(premium|clean|clinical|natural|modern|minimalist|bold|vibrant|organic|professional|playful|elegant|rustic|sleek|luxurious|friendly|medical|scientific|wellness|holistic)\b/gi);
      
      if (styleKeywords) {
        styleKeywords.forEach(style => {
          const normalized = style.toLowerCase();
          styleFrequency.set(normalized, (styleFrequency.get(normalized) || 0) + 1);
        });
      }
    });

    return Array.from(styleFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([style, count]) => ({ style, count }));
  }, [productsData]);

  // Aggregate conversion triggers
  const conversionTriggers = useMemo(() => {
    if (!productsData || productsData.length === 0) return [];

    const triggerFrequency = new Map<string, number>();

    productsData.forEach(product => {
      const triggers = product.marketing_analysis?.design_blueprint?.conversion_triggers;
      if (!triggers) return;

      // Parse comma-separated triggers
      const triggerList = triggers.split(/[,;]/).map(t => t.trim()).filter(Boolean);
      
      triggerList.forEach(trigger => {
        const normalized = trigger.toLowerCase().trim();
        if (normalized.length > 2) {
          const existingKey = Array.from(triggerFrequency.keys()).find(
            k => k.toLowerCase() === normalized
          );
          if (existingKey) {
            triggerFrequency.set(existingKey, (triggerFrequency.get(existingKey) || 0) + 1);
          } else {
            triggerFrequency.set(trigger.trim(), 1);
          }
        }
      });
    });

    return Array.from(triggerFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([trigger, count]) => ({ trigger, count }));
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

        {/* Visual Styles */}
        {visualStyles.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <Eye className="w-4 h-4 text-chart-3" />
              Dominant Visual Styles
            </h4>
            <div className="flex flex-wrap gap-2">
              {visualStyles.map(({ style, count }, idx) => (
                <Badge 
                  key={idx} 
                  variant="secondary" 
                  className="text-xs py-1 px-2 bg-chart-3/10 text-chart-3 border-chart-3/20 capitalize"
                >
                  {style}
                  <span className="ml-1.5 text-chart-3/70">({count})</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Conversion Triggers */}
        {conversionTriggers.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4 text-chart-2" />
              Top Conversion Triggers
            </h4>
            <div className="flex flex-wrap gap-2">
              {conversionTriggers.map(({ trigger, count }, idx) => (
                <Badge 
                  key={idx} 
                  variant="secondary" 
                  className="text-xs py-1 px-2 bg-chart-2/10 text-chart-2 border-chart-2/20"
                >
                  {trigger}
                  <span className="ml-1.5 text-chart-2/70">({count})</span>
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

        {/* Packaging Type Distribution Chart */}
        {packagingStats?.typeDistribution && packagingStats.typeDistribution.length > 1 && (
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <Package className="w-4 h-4 text-chart-3" />
              Packaging Type Distribution
            </h4>
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={packagingStats.typeDistribution} 
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 5, bottom: 5 }}
                >
                  <XAxis 
                    type="number" 
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                    width={90}
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded-lg p-2 shadow-lg">
                            <p className="text-sm font-medium text-foreground">{data.fullName}</p>
                            <p className="text-xs text-muted-foreground">
                              {data.count} products ({data.percentage}%)
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
                    {packagingStats.typeDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
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

        {/* Competitor Packaging Audit */}
        {productsData && productsData.length > 0 && (() => {
          // Get top 5 competitors by revenue
          const topCompetitors = [...productsData]
            .filter(p => p.brand && (p.marketing_analysis?.design_blueprint?.trust_signals || p.claims || p.claims_on_label))
            .sort((a, b) => (b.monthly_sales || 0) - (a.monthly_sales || 0))
            .slice(0, 5);
          
          if (topCompetitors.length === 0) return null;

          return (
            <div>
              <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                <Award className="w-4 h-4 text-chart-5" />
                Competitor Packaging Audit
              </h4>
              
              {/* Mobile: Card layout */}
              <div className="md:hidden space-y-3">
                {topCompetitors.map((product, idx) => {
                  const trustSignalsRaw = product.marketing_analysis?.design_blueprint?.trust_signals || "";
                  const trustSignalsList = trustSignalsRaw
                    .split(/[,;]/)
                    .map(s => s.trim())
                    .filter(s => s.length > 2)
                    .slice(0, 3);
                  
                  const claimsList = product.claims_on_label?.slice(0, 3) || 
                    (product.claims?.split(/[,;]/).map(c => c.trim()).filter(Boolean).slice(0, 3)) || 
                    [];

                  const visualStyle = product.marketing_analysis?.design_blueprint?.visual_style || "";
                  const conversionTriggersRaw = product.marketing_analysis?.design_blueprint?.conversion_triggers || "";
                  const conversionTriggersList = conversionTriggersRaw
                    .split(/[,;]/)
                    .map(t => t.trim())
                    .filter(t => t.length > 2)
                    .slice(0, 2);

                  return (
                    <div key={idx} className="p-3 rounded-lg border border-border bg-muted/20">
                      <div className="flex items-center gap-2 mb-2">
                        {product.main_image_url && (
                          <img 
                            src={product.main_image_url} 
                            alt={product.brand || ""} 
                            className="w-10 h-10 rounded object-cover border border-border/50"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground text-sm truncate">
                            {product.brand || "Unknown"}
                          </p>
                          {product.price && (
                            <p className="text-xs text-muted-foreground">${product.price.toFixed(2)}</p>
                          )}
                        </div>
                      </div>
                      
                      {visualStyle && (
                        <div className="mb-2">
                          <p className="text-[10px] text-muted-foreground mb-1">Visual Style</p>
                          <p className="text-xs text-foreground line-clamp-2">{visualStyle}</p>
                        </div>
                      )}

                      {conversionTriggersList.length > 0 && (
                        <div className="mb-2">
                          <p className="text-[10px] text-muted-foreground mb-1">Conversion Focus</p>
                          <div className="flex flex-wrap gap-1">
                            {conversionTriggersList.map((trigger, tIdx) => (
                              <Badge 
                                key={tIdx} 
                                variant="outline" 
                                className="text-[10px] py-0.5 px-1.5 bg-chart-2/5 border-chart-2/20 text-chart-2"
                              >
                                {trigger.length > 20 ? trigger.substring(0, 20) + "..." : trigger}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {trustSignalsList.length > 0 && (
                        <div className="mb-2">
                          <p className="text-[10px] text-muted-foreground mb-1">Trust Signals</p>
                          <div className="flex flex-wrap gap-1">
                            {trustSignalsList.map((signal, sIdx) => (
                              <Badge 
                                key={sIdx} 
                                variant="outline" 
                                className="text-[10px] py-0.5 px-1.5 bg-chart-1/5 border-chart-1/20 text-chart-1"
                              >
                                {signal.length > 25 ? signal.substring(0, 25) + "..." : signal}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {claimsList.length > 0 && (
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-1">Key Claims</p>
                          <div className="flex flex-wrap gap-1">
                            {claimsList.map((claim, cIdx) => (
                              <Badge 
                                key={cIdx} 
                                variant="secondary" 
                                className="text-[10px] py-0.5 px-1.5"
                              >
                                {claim.length > 25 ? claim.substring(0, 25) + "..." : claim}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop: Table layout */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">Brand</th>
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">Visual Style</th>
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">Conversion Focus</th>
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground hidden lg:table-cell">Trust Signals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCompetitors.map((product, idx) => {
                      const trustSignalsRaw = product.marketing_analysis?.design_blueprint?.trust_signals || "";
                      const trustSignalsList = trustSignalsRaw
                        .split(/[,;]/)
                        .map(s => s.trim())
                        .filter(s => s.length > 2)
                        .slice(0, 2);
                      
                      const visualStyle = product.marketing_analysis?.design_blueprint?.visual_style || "";
                      const conversionTriggersRaw = product.marketing_analysis?.design_blueprint?.conversion_triggers || "";
                      const conversionTriggersList = conversionTriggersRaw
                        .split(/[,;]/)
                        .map(t => t.trim())
                        .filter(t => t.length > 2)
                        .slice(0, 2);

                      return (
                        <tr key={idx} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              {product.main_image_url && (
                                <img 
                                  src={product.main_image_url} 
                                  alt={product.brand || ""} 
                                  className="w-8 h-8 rounded object-cover border border-border/50"
                                />
                              )}
                              <div className="min-w-0">
                                <p className="font-medium text-foreground truncate max-w-[100px]">
                                  {product.brand || "Unknown"}
                                </p>
                                {product.price && (
                                  <p className="text-xs text-muted-foreground">${product.price.toFixed(2)}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-2 max-w-[180px]">
                            {visualStyle ? (
                              <p className="text-xs text-foreground line-clamp-2">{visualStyle}</p>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex flex-wrap gap-1">
                              {conversionTriggersList.length > 0 ? conversionTriggersList.map((trigger, tIdx) => (
                                <Badge 
                                  key={tIdx} 
                                  variant="outline" 
                                  className="text-[10px] py-0.5 px-1.5 bg-chart-2/5 border-chart-2/20 text-chart-2"
                                >
                                  {trigger.length > 18 ? trigger.substring(0, 18) + "..." : trigger}
                                </Badge>
                              )) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-2 hidden lg:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {trustSignalsList.length > 0 ? trustSignalsList.map((signal, sIdx) => (
                                <Badge 
                                  key={sIdx} 
                                  variant="outline" 
                                  className="text-[10px] py-0.5 px-1.5 bg-chart-1/5 border-chart-1/20 text-chart-1"
                                >
                                  {signal.length > 18 ? signal.substring(0, 18) + "..." : signal}
                                </Badge>
                              )) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
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
