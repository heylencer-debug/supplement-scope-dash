import { cn } from "@/lib/utils";
import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Package, CheckCircle2, Award, Tag, Shield, DollarSign, Hash, Eye, Zap, Sparkles, Loader2, RefreshCw, Trash2, Clock, Camera, History } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { usePackagingAnalysis } from "@/hooks/usePackagingAnalysis";
import { usePackagingImageAnalysis } from "@/hooks/usePackagingImageAnalysis";
import { AIPackagingResults } from "./AIPackagingResults";
import { DualPackagingStrategies, isDualStrategyAnalysis } from "./DualPackagingStrategies";
import { DualMockupGenerator } from "./DualMockupGenerator";
import { CompetitorPackagingTable } from "./CompetitorPackagingTable";
import { formatDistanceToNow } from "date-fns";

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
          <Sparkles className="w-5 h-5 text-primary animate-pulse [animation-duration:3s]" />
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
    mockupImages,
    updatedAt: strategyUpdatedAt,
    saveMockupImage,
    isLoading: isAnalyzing,
    isLoadingFromDb,
    wasRestoredFromDb: strategyWasRestored,
    pollingStatus,
    runAnalysis,
    clearAnalysis,
    hasAnalysis
  } = usePackagingAnalysis(categoryId);

  const {
    analysis: imageAnalysis,
    updatedAt: imageAnalysisUpdatedAt,
    isLoading: isAnalyzingImages,
    isLoadingFromDb: isLoadingImagesFromDb,
    wasRestoredFromDb: imageAnalysisWasRestored,
    pollingStatus: imagePollingStatus,
    runAnalysis: runImageAnalysis,
    clearAnalysis: clearImageAnalysis,
    hasAnalysis: hasImageAnalysis
  } = usePackagingImageAnalysis(categoryId);

  // Show restored banner when any progress was restored
  const hasRestoredProgress = (strategyWasRestored || imageAnalysisWasRestored) && !isLoadingFromDb && !isLoadingImagesFromDb;
  const latestUpdatedAt = strategyUpdatedAt && imageAnalysisUpdatedAt 
    ? (strategyUpdatedAt > imageAnalysisUpdatedAt ? strategyUpdatedAt : imageAnalysisUpdatedAt)
    : strategyUpdatedAt || imageAnalysisUpdatedAt;

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
        <CardDescription>
          Market intelligence for optimal packaging format, pricing, and positioning
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Workflow Progress Indicator */}
        <div className="flex items-center justify-center gap-2 p-4 bg-muted/30 rounded-xl border border-border/50">
          {/* Step 1 */}
          <div className={cn(
            "flex flex-col items-center gap-1 px-4 py-2 rounded-lg text-xs font-medium transition-colors min-w-[120px]",
            hasImageAnalysis 
              ? "bg-chart-4/10 text-chart-4 border border-chart-4/30" 
              : isAnalyzingImages 
                ? "bg-primary/10 text-primary border border-primary/30" 
                : "bg-muted text-muted-foreground border border-border"
          )}>
            <div className="flex items-center gap-1.5">
              {hasImageAnalysis ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : isAnalyzingImages ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-muted-foreground/30 flex items-center justify-center text-[11px] font-bold">1</span>
              )}
              <span className="font-semibold">Competitor Analysis</span>
            </div>
            <span className={cn(
              "text-[10px]",
              hasImageAnalysis ? "text-chart-4/80" : isAnalyzingImages ? "text-primary/80" : "text-muted-foreground/60"
            )}>
              {hasImageAnalysis ? "✓ Saved" : isAnalyzingImages ? "Analyzing..." : "Not started"}
            </span>
          </div>
          
          <div className="w-6 h-px bg-border" />
          
          {/* Step 2 */}
          <div className={cn(
            "flex flex-col items-center gap-1 px-4 py-2 rounded-lg text-xs font-medium transition-colors min-w-[120px]",
            hasAnalysis 
              ? "bg-chart-4/10 text-chart-4 border border-chart-4/30" 
              : isAnalyzing 
                ? "bg-primary/10 text-primary border border-primary/30" 
                : "bg-muted text-muted-foreground border border-border"
          )}>
            <div className="flex items-center gap-1.5">
              {hasAnalysis ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : isAnalyzing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-muted-foreground/30 flex items-center justify-center text-[11px] font-bold">2</span>
              )}
              <span className="font-semibold">Our Strategy</span>
            </div>
            <span className={cn(
              "text-[10px]",
              hasAnalysis ? "text-chart-4/80" : isAnalyzing ? "text-primary/80" : "text-muted-foreground/60"
            )}>
              {hasAnalysis ? "✓ Saved" : isAnalyzing ? "Generating..." : "Not started"}
            </span>
          </div>
          
          <div className="w-6 h-px bg-border" />
          
          {/* Step 3 */}
          <div className={cn(
            "flex flex-col items-center gap-1 px-4 py-2 rounded-lg text-xs font-medium transition-colors min-w-[120px]",
            (mockupImages.match_leaders && mockupImages.match_disruptors)
              ? "bg-chart-4/10 text-chart-4 border border-chart-4/30" 
              : (mockupImages.match_leaders || mockupImages.match_disruptors)
                ? "bg-chart-2/10 text-chart-2 border border-chart-2/30"
                : "bg-muted text-muted-foreground border border-border"
          )}>
            <div className="flex items-center gap-1.5">
              {(mockupImages.match_leaders && mockupImages.match_disruptors) ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (mockupImages.match_leaders || mockupImages.match_disruptors) ? (
                <span className="text-[11px] font-bold">½</span>
              ) : (
                <span className="w-5 h-5 rounded-full bg-muted-foreground/30 flex items-center justify-center text-[11px] font-bold">3</span>
              )}
              <span className="font-semibold">Mockups</span>
            </div>
            <span className={cn(
              "text-[10px]",
              (mockupImages.match_leaders && mockupImages.match_disruptors) 
                ? "text-chart-4/80" 
                : (mockupImages.match_leaders || mockupImages.match_disruptors)
                  ? "text-chart-2/80"
                  : "text-muted-foreground/60"
            )}>
              {(mockupImages.match_leaders && mockupImages.match_disruptors) 
                ? "✓ Both Saved" 
                : (mockupImages.match_leaders || mockupImages.match_disruptors)
                  ? "½ Saved"
                  : "Not started"}
            </span>
          </div>
        </div>

        {/* Restored Progress Banner */}
        {hasRestoredProgress && latestUpdatedAt && (
          <div className="flex items-center gap-3 p-3 bg-chart-4/5 rounded-lg border border-chart-4/20 animate-enter">
            <History className="w-4 h-4 text-chart-4" />
            <div className="flex-1">
              <span className="text-sm font-medium text-chart-4">Progress restored from previous session</span>
              <span className="text-xs text-muted-foreground ml-2">
                Last updated {formatDistanceToNow(latestUpdatedAt, { addSuffix: true })}
              </span>
            </div>
            <Badge variant="secondary" className="bg-chart-4/10 text-chart-4 border-chart-4/20 text-[10px]">
              {hasImageAnalysis && hasAnalysis && mockupImages.match_leaders && mockupImages.match_disruptors ? '3/3 Complete' : 
               hasImageAnalysis && hasAnalysis ? '2/3 Complete' : 
               hasImageAnalysis ? '1/3 Complete' : 'In Progress'}
            </Badge>
          </div>
        )}

        {/* ============================================ */}
        {/* STEP 1: Per Product Packaging Content Analysis */}
        {/* ============================================ */}
        <div className="space-y-4 p-5 bg-muted/20 rounded-xl border border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                hasImageAnalysis ? "bg-chart-4 text-white" : "bg-primary text-white"
              )}>
                1
              </div>
              <div>
                <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Camera className="w-4 h-4 text-chart-3" />
                  Competitor Packaging Analysis
                  {hasImageAnalysis && imageAnalysisWasRestored && (
                    <Badge variant="secondary" className="ml-2 bg-chart-4/10 text-chart-4 border-chart-4/20 text-[10px] font-medium">
                      <History className="w-3 h-3 mr-1" />
                      Loaded from DB
                    </Badge>
                  )}
                  {hasImageAnalysis && !imageAnalysisWasRestored && (
                    <Badge variant="secondary" className="ml-2 bg-chart-3/10 text-chart-3 border-chart-3/20 text-[10px] font-medium">
                      <Sparkles className="w-3 h-3 mr-1" />
                      {imageAnalysis?.competitor_analyses?.length || 0} analyzed
                    </Badge>
                  )}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Analyze competitor product images to extract packaging details, colors, and messaging
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasImageAnalysis && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearImageAnalysis}
                  className="text-xs h-7"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Clear
                </Button>
              )}
              <Button
                variant={hasImageAnalysis ? "outline" : "default"}
                size="sm"
                onClick={() => runImageAnalysis()}
                disabled={isAnalyzingImages || isLoadingImagesFromDb || !categoryId}
                className={cn(
                  "text-xs h-7 transition-all duration-300",
                  !hasImageAnalysis && !isAnalyzingImages && "animate-glow-pulse hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)] hover:scale-105"
                )}
              >
                {isAnalyzingImages ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    {imagePollingStatus.isPolling 
                      ? `Analyzing... (${imagePollingStatus.attempt}/${imagePollingStatus.maxAttempts})`
                      : 'Starting...'}
                  </>
                ) : hasImageAnalysis ? (
                  <>
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Refresh
                  </>
                ) : (
                  <>
                    <Camera className="w-3 h-3 mr-1" />
                    Analyze Competitor Images
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Image Analysis Progress */}
          {isAnalyzingImages && imagePollingStatus.isPolling && imagePollingStatus.startedAt && (
            <AnalysisProgressIndicator 
              startedAt={imagePollingStatus.startedAt}
              attempt={imagePollingStatus.attempt}
              maxAttempts={imagePollingStatus.maxAttempts}
            />
          )}

          {/* Loading from DB - only show if loading AND no analysis yet */}
          {isLoadingImagesFromDb && !hasImageAnalysis && (
            <div className="p-4 bg-muted/30 rounded-lg border border-border/50 animate-pulse [animation-duration:3s]">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading saved image analysis...</span>
              </div>
            </div>
          )}

          {/* Image Analysis Results Table */}
          {hasImageAnalysis && imageAnalysis?.competitor_analyses && (
            <CompetitorPackagingTable analyses={imageAnalysis.competitor_analyses} />
          )}

          {/* Empty State */}
          {!hasImageAnalysis && !isAnalyzingImages && !isLoadingImagesFromDb && (
            <div className="p-6 bg-muted/20 rounded-xl border border-dashed border-border text-center">
              <Camera className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Click "Analyze Competitor Images" to have AI extract packaging details from competitor product images
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Includes label text, product form & shape, colors, badges, and packaging type
              </p>
            </div>
          )}
        </div>

        {/* ============================================ */}
        {/* STEP 2: Our Product Packaging Strategy */}
        {/* ============================================ */}
        <div className={cn(
          "space-y-4 p-5 rounded-xl border",
          hasImageAnalysis 
            ? "bg-muted/20 border-border/50" 
            : "bg-muted/10 border-dashed border-border/30 opacity-60"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                hasAnalysis ? "bg-chart-4 text-white" : hasImageAnalysis ? "bg-primary text-white" : "bg-muted-foreground/30 text-muted-foreground"
              )}>
                2
              </div>
              <div>
                <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Our Packaging Strategy
                  {hasAnalysis && strategyWasRestored && (
                    <Badge variant="secondary" className="ml-2 bg-chart-4/10 text-chart-4 border-chart-4/20 text-[10px] font-medium">
                      <History className="w-3 h-3 mr-1" />
                      Loaded from DB
                    </Badge>
                  )}
                  {hasAnalysis && !strategyWasRestored && (
                    <Badge variant="secondary" className="ml-2 bg-chart-4/10 text-chart-4 border-chart-4/20 text-[10px] font-medium">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Complete
                    </Badge>
                  )}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Generate AI-powered packaging design recommendations based on competitor insights
                </p>
              </div>
            </div>
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
                disabled={isAnalyzing || isLoadingFromDb || !categoryId || !hasImageAnalysis}
                className={cn(
                  "text-xs h-7 transition-all duration-300",
                  hasImageAnalysis && !hasAnalysis && !isAnalyzing && "animate-glow-pulse hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)] hover:scale-105"
                )}
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
                    Refresh Analysis
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 mr-1" />
                    Generate Strategy
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Show hint if Step 1 not done */}
          {!hasImageAnalysis && !isAnalyzingImages && (
            <div className="p-4 bg-muted/30 rounded-lg border border-border/50 text-center">
              <p className="text-sm text-muted-foreground">
                Complete Step 1 first to analyze competitor packaging
              </p>
            </div>
          )}

          {/* AI Analysis Progress Indicator */}
          {isAnalyzing && pollingStatus.isPolling && pollingStatus.startedAt && (
            <AnalysisProgressIndicator 
              startedAt={pollingStatus.startedAt}
              attempt={pollingStatus.attempt}
              maxAttempts={pollingStatus.maxAttempts}
            />
          )}

          {/* AI Analysis Loading State - only show if loading AND no analysis yet */}
          {isLoadingFromDb && !hasAnalysis && (
            <div className="p-4 bg-muted/30 rounded-lg border border-border/50 animate-pulse [animation-duration:3s]">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Loading saved AI analysis...</span>
              </div>
            </div>
          )}

          {/* AI Analysis Results - Check for dual strategies first */}
          {aiAnalysis && isDualStrategyAnalysis(aiAnalysis) ? (
            <DualPackagingStrategies 
              analysis={aiAnalysis}
              onSelectStrategy={(type, strategy) => {
                console.log('Selected strategy:', type, strategy);
              }}
            />
          ) : aiAnalysis ? (
            <AIPackagingResults 
              analysis={aiAnalysis} 
              mockupImageUrl={null}
              onSaveMockup={undefined}
              onRegenerateCopy={(style) => runAnalysis(style)}
              isRegenerating={isAnalyzing}
              hideMockupSection={true}
            />
          ) : null}
        </div>

        {/* ============================================ */}
        {/* STEP 3: Generate Packaging Mockups */}
        {/* ============================================ */}
        <div className={cn(
          "space-y-4 p-5 rounded-xl border",
          hasAnalysis 
            ? "bg-muted/20 border-border/50" 
            : "bg-muted/10 border-dashed border-border/30 opacity-60"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
              (mockupImages.match_leaders && mockupImages.match_disruptors) 
                ? "bg-chart-4 text-white" 
                : (mockupImages.match_leaders || mockupImages.match_disruptors)
                  ? "bg-chart-2 text-white"
                  : hasAnalysis 
                    ? "bg-primary text-white" 
                    : "bg-muted-foreground/30 text-muted-foreground"
            )}>
              3
            </div>
            <div>
              <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                <Package className="w-4 h-4 text-chart-2" />
                Product Mockups
                {mockupImages.match_leaders && mockupImages.match_disruptors ? (
                  <Badge variant="secondary" className="ml-2 bg-chart-4/10 text-chart-4 border-chart-4/20 text-[10px] font-medium">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Both Generated
                  </Badge>
                ) : (mockupImages.match_leaders || mockupImages.match_disruptors) ? (
                  <Badge variant="secondary" className="ml-2 bg-chart-2/10 text-chart-2 border-chart-2/20 text-[10px] font-medium">
                    1/2 Generated
                  </Badge>
                ) : null}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generate AI mockups for both Match Leaders and Match Disruptors strategies
              </p>
            </div>
          </div>

          {/* Show hint if Step 2 not done */}
          {!hasAnalysis && !isAnalyzing && (
            <div className="p-4 bg-muted/30 rounded-lg border border-border/50 text-center">
              <p className="text-sm text-muted-foreground">
                Complete Step 2 first to generate your packaging strategy
              </p>
            </div>
          )}

          {/* Dual Mockup Section - only show if Step 2 is done with dual strategies */}
          {aiAnalysis && isDualStrategyAnalysis(aiAnalysis) ? (
            <DualMockupGenerator
              analysis={aiAnalysis}
              mockupImages={mockupImages}
              onSaveMockup={saveMockupImage}
            />
          ) : aiAnalysis ? (
            // Fallback for legacy single-strategy analysis
            <AIPackagingResults 
              analysis={aiAnalysis} 
              mockupImageUrl={mockupImageUrl}
              onSaveMockup={(url) => saveMockupImage(url)}
              onRegenerateCopy={undefined}
              isRegenerating={false}
              showOnlyMockup={true}
            />
          ) : null}
        </div>

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
