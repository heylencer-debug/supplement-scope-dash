import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Package, CheckCircle2, Award, Tag, Shield, DollarSign, Hash, Eye, Zap, Sparkles, Loader2, RefreshCw, Trash2, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { usePackagingAnalysis } from "@/hooks/usePackagingAnalysis";
import { AIPackagingResults } from "./AIPackagingResults";

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
  categoryId?: string;
}

// Progress indicator component for AI analysis
function AnalysisProgressIndicator({ 
  startedAt, 
  attempt, 
  maxAttempts 
}: { 
  startedAt: Date; 
  attempt: number; 
  maxAttempts: number;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const estimatedTotalSeconds = 90; // ~90 seconds typical analysis time

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const elapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
      setElapsedSeconds(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

  const progressPercent = Math.min((elapsedSeconds / estimatedTotalSeconds) * 100, 95);
  const remainingSeconds = Math.max(estimatedTotalSeconds - elapsedSeconds, 5);
  
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getStageMessage = () => {
    if (elapsedSeconds < 10) return "Preparing data for AI analysis...";
    if (elapsedSeconds < 30) return "AI analyzing competitor packaging...";
    if (elapsedSeconds < 60) return "Generating design recommendations...";
    if (elapsedSeconds < 90) return "Finalizing packaging strategy...";
    return "Almost there, finishing up...";
  };

  return (
    <div className="p-5 bg-primary/5 rounded-xl border border-primary/20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary animate-pulse" />
          <span className="font-medium text-foreground">AI Packaging Analysis</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>~{formatTime(remainingSeconds)} remaining</span>
        </div>
      </div>
      
      <Progress value={progressPercent} className="h-2 mb-3" />
      
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{getStageMessage()}</span>
        <span className="text-xs text-muted-foreground">
          {formatTime(elapsedSeconds)} elapsed
        </span>
      </div>
    </div>
  );
}

export function PackagingIntelligence({ packagingData, productsClaims, productsData = [], isLoading, categoryId }: PackagingIntelligenceProps) {
  const {
    analysis: aiAnalysis,
    mockupImageUrl,
    saveMockupImage,
    isLoading: isAnalyzing,
    isLoadingFromDb,
    pollingStatus,
    runAnalysis,
    clearAnalysis,
    hasAnalysis
  } = usePackagingAnalysis(categoryId);

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
      const signals = product.marketing_analysis?.design_blueprint?.trust_signals as unknown;
      if (!signals) return;

      // Handle both string and array formats
      let signalList: string[] = [];
      if (typeof signals === 'string') {
        signalList = signals.split(/[,;]/).map(s => s.trim()).filter(Boolean);
      } else if (Array.isArray(signals)) {
        signalList = (signals as unknown[]).filter((s): s is string => typeof s === 'string').map(s => s.trim()).filter(Boolean);
      }
      
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
          {/* AI Analysis Status Indicator */}
          {hasAnalysis && (
            <Badge variant="secondary" className="ml-2 bg-chart-4/10 text-chart-4 border-chart-4/20 text-[10px] font-medium">
              <Sparkles className="w-3 h-3 mr-1" />
              AI Enhanced
            </Badge>
          )}
          {isLoadingFromDb && (
            <Badge variant="secondary" className="ml-2 bg-muted text-muted-foreground text-[10px] font-medium">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Loading...
            </Badge>
          )}
        </CardTitle>
        <CardDescription className="flex items-center justify-between flex-wrap gap-2">
          <span>Market intelligence for optimal packaging format, pricing, and positioning</span>
          <div className="flex items-center gap-2">
            {hasAnalysis && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAnalysis}
                className="text-xs h-7"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Clear
              </Button>
            )}
            <Button
              variant={hasAnalysis ? "outline" : "default"}
              size="sm"
              onClick={() => runAnalysis()}
              disabled={isAnalyzing || isLoadingFromDb || !categoryId}
              className="text-xs h-7"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  {pollingStatus.isPolling 
                    ? `Analyzing... (${pollingStatus.attempt}/${pollingStatus.maxAttempts})`
                    : 'Starting...'}
                </>
              ) : hasAnalysis ? (
                <>
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Refresh AI Analysis
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3 mr-1" />
                  Analyze with AI
                </>
              )}
            </Button>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* AI Analysis Progress Indicator */}
        {isAnalyzing && pollingStatus.isPolling && pollingStatus.startedAt && (
          <AnalysisProgressIndicator 
            startedAt={pollingStatus.startedAt}
            attempt={pollingStatus.attempt}
            maxAttempts={pollingStatus.maxAttempts}
          />
        )}

        {/* AI Analysis Loading State */}
        {isLoadingFromDb && (
          <div className="p-4 bg-muted/30 rounded-lg border border-border/50 animate-pulse">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading saved AI analysis...</span>
            </div>
          </div>
        )}

        {/* AI Analysis Available Indicator */}
        {aiAnalysis && !isLoadingFromDb && (
          <div className="p-3 bg-chart-4/5 rounded-lg border border-chart-4/20 mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-chart-4" />
              <span className="text-sm font-medium text-chart-4">AI Packaging Analysis Available</span>
              <span className="text-xs text-muted-foreground ml-auto">Scroll down to view results</span>
            </div>
          </div>
        )}

        {aiAnalysis && (
          <AIPackagingResults 
            analysis={aiAnalysis} 
            mockupImageUrl={mockupImageUrl} 
            onSaveMockup={saveMockupImage}
            onRegenerateCopy={(style) => runAnalysis(style)}
            isRegenerating={isAnalyzing}
          />
        )}

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

      </CardContent>
    </Card>
  );
}
