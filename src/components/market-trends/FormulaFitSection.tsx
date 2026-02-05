import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollAnimate } from "@/components/ui/scroll-animate";
import { RadialGauge } from "@/components/ui/radial-gauge";
import { AnimatedNumber } from "@/components/ui/animated-number";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2,
  XCircle,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Target,
  RefreshCw,
  Zap,
  Clock,
  ArrowRight,
  Building2,
  Package,
  Star,
  DollarSign,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useFormulaFitAnalysis, FormulaFitAnalysis, AnalyzedBrandData } from "@/hooks/useFormulaFitAnalysis";
import { cn } from "@/lib/utils";

interface FormulaFitSectionProps {
  categoryId: string;
}

export function FormulaFitSection({ categoryId }: FormulaFitSectionProps) {
  const {
    analysis,
    isLoadingFromDb,
    isProcessing,
    hasAnalysis,
    error,
    pollingStatus,
    triggerAnalysis,
    isTriggering,
  } = useFormulaFitAnalysis(categoryId);

  // Loading state
  if (isLoadingFromDb) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  // Processing state
  if (isProcessing || isTriggering) {
    const progressPercent = pollingStatus.isPolling 
      ? Math.min(Math.round((pollingStatus.attempt / pollingStatus.maxAttempts) * 95), 95)
      : 5;
    
    const stages = [
      { threshold: 0, label: "Initializing analysis..." },
      { threshold: 15, label: "Fetching formula brief..." },
      { threshold: 30, label: "Loading market trend data..." },
      { threshold: 45, label: "Sending data to AI..." },
      { threshold: 60, label: "Analyzing competitive position..." },
      { threshold: 75, label: "Generating recommendations..." },
      { threshold: 90, label: "Finalizing results..." },
    ];
    
    const currentStage = [...stages].reverse().find(s => progressPercent >= s.threshold)?.label || stages[0].label;
    const elapsedSeconds = pollingStatus.attempt * 10;
    const estimatedRemaining = Math.max(0, (pollingStatus.maxAttempts - pollingStatus.attempt) * 10);
    
    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };
    
    return (
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="relative h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <RefreshCw className="h-8 w-8 text-primary animate-spin" />
            </div>
          </div>
          
          <h3 className="text-xl font-semibold mb-2">Analyzing Formula Fit</h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            AI is comparing your formula against market trends, consumer demands, and competitive landscape.
          </p>
          
          {/* Progress bar */}
          <div className="w-full max-w-md mb-4">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary via-primary to-primary/70 rounded-full transition-all duration-500 ease-out relative"
                style={{ width: `${progressPercent}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]" 
                  style={{ 
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 2s infinite linear'
                  }} 
                />
              </div>
            </div>
          </div>
          
          {/* Stage indicator */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
            {currentStage}
          </div>
          
          {/* Stats row */}
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>Elapsed: {formatTime(elapsedSeconds)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-primary">{progressPercent}%</span>
              <span>complete</span>
            </div>
            {estimatedRemaining > 0 && (
              <div className="flex items-center gap-1.5">
                <span>~{formatTime(estimatedRemaining)} remaining</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Analysis Failed</h3>
          <p className="text-muted-foreground max-w-md mb-4">{error}</p>
          <Button onClick={() => triggerAnalysis()} disabled={isTriggering}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Analysis
          </Button>
        </CardContent>
      </Card>
    );
  }

  // No analysis yet
  if (!hasAnalysis) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Target className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">Formula Fit Analysis</h3>
          <p className="text-muted-foreground max-w-md mb-4">
            Compare your formula brief against current market trends, consumer demands, and
            competitive landscape. Get an honest, AI-powered assessment of your formula's market
            readiness.
          </p>
          <Button onClick={() => triggerAnalysis()} disabled={isTriggering}>
            <Zap className="h-4 w-4 mr-2" />
            Run Analysis
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Score Card */}
      <ScrollAnimate variant="fade-up">
        <FormulaFitScoreCard analysis={analysis!} onRefresh={triggerAnalysis} />
      </ScrollAnimate>

      {/* Brands Analyzed - Show which competitors were compared */}
      {analysis!.brands_analyzed && Object.keys(analysis!.brands_analyzed).length > 0 && (
        <ScrollAnimate variant="fade-up" delay={50}>
          <BrandsAnalyzedCard brandsData={analysis!.brands_analyzed} />
        </ScrollAnimate>
      )}

      {/* Strengths & Weaknesses Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScrollAnimate variant="fade-up" delay={100}>
          <StrengthsCard strengths={analysis!.strengths} />
        </ScrollAnimate>
        <ScrollAnimate variant="fade-up" delay={200}>
          <WeaknessesCard weaknesses={analysis!.weaknesses} />
        </ScrollAnimate>
      </div>

      {/* Trend Alignment Chart */}
      <ScrollAnimate variant="fade-up" delay={300}>
        <TrendAlignmentChart alignments={analysis!.trend_alignment} />
      </ScrollAnimate>

      {/* Pain Point Coverage */}
      <ScrollAnimate variant="fade-up" delay={400}>
        <PainPointCoverage painPoints={analysis!.pain_point_coverage} />
      </ScrollAnimate>

      {/* Competitive Position + Gaps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScrollAnimate variant="fade-up" delay={500}>
          <CompetitivePositionCard position={analysis!.competitive_position} />
        </ScrollAnimate>
        <ScrollAnimate variant="fade-up" delay={600}>
          <GapsCard gaps={analysis!.gaps} />
        </ScrollAnimate>
      </div>

      {/* Recommendations */}
      <ScrollAnimate variant="fade-up" delay={700}>
        <RecommendationsCard recommendations={analysis!.recommendations} />
      </ScrollAnimate>
    </div>
  );
}

// Brands Analyzed Card - Shows which competitor brands were compared
function BrandsAnalyzedCard({
  brandsData,
}: {
  brandsData: Record<string, AnalyzedBrandData>;
}) {
  const brands = Object.entries(brandsData);
  const totalProducts = brands.reduce((sum, [_, data]) => sum + data.summary.product_count, 0);
  const totalRevenue = brands.reduce((sum, [_, data]) => sum + data.summary.total_revenue, 0);

  const formatRevenue = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-primary" />
              Competitor Brands Analyzed
            </CardTitle>
            <CardDescription>
              Your formula was compared against actual product data from these brands
            </CardDescription>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-right">
              <p className="font-semibold text-primary">{brands.length}</p>
              <p className="text-xs text-muted-foreground">Brands</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-primary">{totalProducts}</p>
              <p className="text-xs text-muted-foreground">Products</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-primary">{formatRevenue(totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">Total Revenue</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <TooltipProvider>
            {brands.map(([brandName, data]) => (
              <UITooltip key={brandName}>
                <TooltipTrigger asChild>
                  <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-background border hover:border-primary/50 transition-colors cursor-default">
                    <span className="font-medium text-sm">{brandName}</span>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Package className="h-3 w-3" />
                      <span>{data.summary.product_count}</span>
                      <span className="text-muted-foreground/50">•</span>
                      <Star className="h-3 w-3" />
                      <span>{data.summary.avg_rating.toFixed(1)}</span>
                      <span className="text-muted-foreground/50">•</span>
                      <DollarSign className="h-3 w-3" />
                      <span>{formatRevenue(data.summary.total_revenue)}</span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="space-y-2">
                    <p className="font-semibold">{brandName}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span className="text-muted-foreground">Products:</span>
                      <span>{data.summary.product_count}</span>
                      <span className="text-muted-foreground">Avg Price:</span>
                      <span>${data.summary.avg_price.toFixed(2)}</span>
                      <span className="text-muted-foreground">Avg Rating:</span>
                      <span>{data.summary.avg_rating.toFixed(1)} ★</span>
                      <span className="text-muted-foreground">Total Reviews:</span>
                      <span>{data.summary.total_reviews.toLocaleString()}</span>
                      <span className="text-muted-foreground">Revenue:</span>
                      <span>{formatRevenue(data.summary.total_revenue)}</span>
                    </div>
                    {data.summary.packaging_types.length > 0 && (
                      <div className="pt-1 border-t">
                        <span className="text-xs text-muted-foreground">
                          Packaging: {data.summary.packaging_types.join(", ")}
                        </span>
                      </div>
                    )}
                    {data.top_products.length > 0 && (
                      <div className="pt-1 border-t">
                        <p className="text-xs font-medium mb-1">Top Products:</p>
                        {data.top_products.slice(0, 2).map((product, idx) => (
                          <p key={idx} className="text-xs text-muted-foreground truncate">
                            • {product.title.slice(0, 40)}...
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </UITooltip>
            ))}
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}

// Sub-components

function FormulaFitScoreCard({
  analysis,
  onRefresh,
}: {
  analysis: FormulaFitAnalysis;
  onRefresh: () => void;
}) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-500/10";
    if (score >= 50) return "bg-yellow-500/10";
    return "bg-red-500/10";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-xl">Market Fit Score</CardTitle>
          <CardDescription>How well your formula competes with market trends</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="flex-shrink-0">
            <RadialGauge
              value={analysis.overall_score}
              max={100}
              size={160}
              strokeWidth={14}
              showValue
            />
          </div>
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <Badge
                variant="secondary"
                className={cn("text-lg px-4 py-1", getScoreBg(analysis.overall_score))}
              >
                <span className={getScoreColor(analysis.overall_score)}>
                  {analysis.score_label}
                </span>
              </Badge>
            </div>
            <p className="text-muted-foreground">{analysis.executive_summary}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StrengthsCard({
  strengths,
}: {
  strengths: FormulaFitAnalysis["strengths"];
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-green-600">
          <CheckCircle2 className="h-5 w-5" />
          Strengths
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {strengths.map((strength, index) => (
          <div
            key={index}
            className="p-4 rounded-lg bg-green-500/5 border border-green-500/20"
          >
            <h4 className="font-semibold text-green-700 dark:text-green-400 mb-1">
              {strength.aspect}
            </h4>
            <p className="text-sm text-muted-foreground mb-2">{strength.explanation}</p>
            <p className="text-xs text-green-600/80 italic">
              Evidence: {strength.market_evidence}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function WeaknessesCard({
  weaknesses,
}: {
  weaknesses: FormulaFitAnalysis["weaknesses"];
}) {
  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case "high":
        return <Badge variant="destructive">High Impact</Badge>;
      case "medium":
        return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700">Medium</Badge>;
      default:
        return <Badge variant="outline">Low</Badge>;
    }
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-600">
          <XCircle className="h-5 w-5" />
          Weaknesses
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {weaknesses.map((weakness, index) => (
          <div
            key={index}
            className="p-4 rounded-lg bg-red-500/5 border border-red-500/20"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <h4 className="font-semibold text-red-700 dark:text-red-400">
                {weakness.aspect}
              </h4>
              {getImpactBadge(weakness.impact)}
            </div>
            <p className="text-sm text-muted-foreground">{weakness.explanation}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TrendAlignmentChart({
  alignments,
}: {
  alignments: FormulaFitAnalysis["trend_alignment"];
}) {
  const chartData = alignments.map((a) => ({
    name: a.trend_name.length > 20 ? a.trend_name.slice(0, 20) + "..." : a.trend_name,
    fullName: a.trend_name,
    score: a.alignment_score,
    notes: a.notes,
  }));

  const getBarColor = (score: number) => {
    if (score >= 70) return "hsl(var(--chart-2))";
    if (score >= 40) return "hsl(var(--chart-4))";
    return "hsl(var(--chart-5))";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Trend Alignment
        </CardTitle>
        <CardDescription>How well your formula addresses each market trend</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
            <XAxis type="number" domain={[0, 100]} />
            <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const data = payload[0].payload;
                return (
                  <div className="bg-popover border rounded-lg p-3 shadow-lg max-w-xs">
                    <p className="font-semibold">{data.fullName}</p>
                    <p className="text-sm text-primary">Score: {data.score}%</p>
                    <p className="text-xs text-muted-foreground mt-1">{data.notes}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="score" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function PainPointCoverage({
  painPoints,
}: {
  painPoints: FormulaFitAnalysis["pain_point_coverage"];
}) {
  const addressed = painPoints.filter((p) => p.addressed).length;
  const total = painPoints.length;
  const percentage = Math.round((addressed / total) * 100);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Consumer Pain Point Coverage
            </CardTitle>
            <CardDescription>How well your formula addresses consumer needs</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">
              <AnimatedNumber value={percentage} />%
            </div>
            <p className="text-xs text-muted-foreground">
              {addressed} of {total} addressed
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {painPoints.map((point, index) => (
            <div
              key={index}
              className={cn(
                "p-4 rounded-lg border",
                point.addressed
                  ? "bg-green-500/5 border-green-500/20"
                  : "bg-red-500/5 border-red-500/20"
              )}
            >
              <div className="flex items-start gap-3">
                {point.addressed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-medium">{point.pain_point}</p>
                  <p className="text-sm text-muted-foreground mt-1">{point.how_addressed}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CompetitivePositionCard({
  position,
}: {
  position: FormulaFitAnalysis["competitive_position"];
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Competitive Position
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground mb-1">Price Position</p>
            <p className="text-lg font-semibold">{position.price_position}</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground mb-1">Feature Position</p>
            <p className="text-lg font-semibold">{position.feature_position}</p>
          </div>
        </div>
        <p className="text-muted-foreground">{position.summary}</p>
      </CardContent>
    </Card>
  );
}

function GapsCard({ gaps }: { gaps: FormulaFitAnalysis["gaps"] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-600">
          <AlertTriangle className="h-5 w-5" />
          Market Gaps
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {gaps.map((gap, index) => (
          <div
            key={index}
            className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20"
          >
            <h4 className="font-semibold text-amber-700 dark:text-amber-400 mb-1">
              {gap.gap}
            </h4>
            <p className="text-sm text-muted-foreground">{gap.market_opportunity}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RecommendationsCard({
  recommendations,
}: {
  recommendations: FormulaFitAnalysis["recommendations"];
}) {
  const sortedRecs = [...recommendations].sort((a, b) => a.priority - b.priority);

  const getEffortBadge = (effort: string) => {
    switch (effort) {
      case "Easy":
        return <Badge variant="secondary" className="bg-green-500/20 text-green-700">Easy</Badge>;
      case "Medium":
        return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700">Medium</Badge>;
      case "Hard":
        return <Badge variant="secondary" className="bg-red-500/20 text-red-700">Hard</Badge>;
      default:
        return <Badge variant="outline">{effort}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          Recommendations
        </CardTitle>
        <CardDescription>Prioritized actions to improve market fit</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sortedRecs.map((rec, index) => (
            <div
              key={index}
              className="flex items-start gap-4 p-4 rounded-lg bg-muted/50 border"
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">{rec.priority}</span>
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="font-semibold">{rec.action}</h4>
                  {getEffortBadge(rec.effort)}
                </div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <ArrowRight className="h-3 w-3" />
                  {rec.expected_impact}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
