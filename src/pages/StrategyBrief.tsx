import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { 
  FileText, Download, Printer, CheckCircle, AlertTriangle, Target, 
  TrendingUp, DollarSign, Users, Loader2, Lightbulb, Package, Beaker,
  Factory, ShieldCheck, Clock, Boxes, AlertCircle, Database, Calendar,
  FileBarChart, BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useCategoryAnalysis } from "@/hooks/useCategoryAnalyses";
import { useCategoryDashboard } from "@/hooks/useCategoryDashboard";
import { useCategoryContext } from "@/contexts/CategoryContext";
import { useCategoryByName } from "@/hooks/useCategoryByName";
import { useFormulaBrief } from "@/hooks/useFormulaBrief";
import { useCategoryScores } from "@/hooks/useCategoryScores";
import { 
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, 
  ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, Cell
} from "recharts";

interface CriteriaScore {
  criterion: string;
  score: number;
  weight?: number;
  justification?: string;
}

interface CategoryContribution {
  category: string;
  revenue?: number;
  products?: number;
  percentage?: number;
}

interface WeightedScore {
  category: string;
  score: number;
  weight: number;
  weighted_score: number;
}

interface ProductsSnapshot {
  data_completeness?: {
    total_products?: number;
    total_reviews?: number;
    products_with_ocr?: number;
    products_with_keepa?: number;
    products_with_rainforest?: number;
    ocr_success_rate?: number;
    reviews_per_product?: number;
  };
  snapshot_timestamp?: string;
  top_performers?: Array<{
    asin: string;
    brand: string;
    title: string;
    price?: number;
    bsr_current?: number;
    rating?: number;
    reviews?: number;
  }>;
}

interface ReviewsSnapshot {
  total_reviews?: number;
  sample_size?: number;
  sampling_strategy?: string;
  snapshot_timestamp?: string;
  review_distribution?: {
    positive?: number;
    neutral?: number;
    negative?: number;
  };
}

export default function StrategyBrief() {
  const [searchParams] = useSearchParams();
  const urlCategoryName = searchParams.get("category");
  
  const { currentCategoryId, categoryName: contextCategoryName, setCategoryContext } = useCategoryContext();
  const categoryName = urlCategoryName || contextCategoryName;
  
  const { data: categoryFromName, isLoading: categoryLoading } = useCategoryByName(
    categoryName && !currentCategoryId ? categoryName : undefined
  );

  useEffect(() => {
    if (categoryFromName && !currentCategoryId) {
      setCategoryContext(categoryFromName.id, categoryFromName.name);
    } else if (urlCategoryName && !currentCategoryId && !categoryFromName) {
      setCategoryContext(null, urlCategoryName);
    }
  }, [categoryFromName, currentCategoryId, urlCategoryName, setCategoryContext]);

  const effectiveCategoryId = currentCategoryId || categoryFromName?.id;

  const { data: analysis, isLoading: analysisLoading } = useCategoryAnalysis(effectiveCategoryId);
  const { data: dashboardData, isLoading: dashboardLoading } = useCategoryDashboard();
  const { data: formulaBrief, isLoading: formulaLoading } = useFormulaBrief(effectiveCategoryId);
  const { data: categoryScores, isLoading: scoresLoading } = useCategoryScores(effectiveCategoryId);

  const isLoading = categoryLoading || analysisLoading || dashboardLoading || formulaLoading || scoresLoading;
  const categoryData = dashboardData?.find((d) => d.id === effectiveCategoryId);

  // Helper to safely convert JSONB to array
  const toArray = (value: unknown): string[] => {
    if (!value) return [];
    
    const extractString = (item: unknown): string | null => {
      if (typeof item === "string") return item;
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        if (typeof obj.criterion === "string") return obj.criterion;
        if (typeof obj.justification === "string") return obj.justification;
        if (typeof obj.description === "string") return obj.description;
        if (typeof obj.name === "string") return obj.name;
        if (typeof obj.text === "string") return obj.text;
        if (typeof obj.insight === "string") return obj.insight;
      }
      return null;
    };

    if (Array.isArray(value)) {
      return value.map(extractString).filter((v): v is string => v !== null);
    }
    if (typeof value === "object" && value !== null) {
      return Object.values(value).map(extractString).filter((v): v is string => v !== null);
    }
    return [];
  };

  // Parse criteria scores for radar chart
  const parseCriteriaScores = (value: unknown): CriteriaScore[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter((item): item is CriteriaScore => 
        typeof item === "object" && item !== null && "criterion" in item && "score" in item
      );
    }
    if (typeof value === "object" && value !== null) {
      return Object.entries(value).map(([key, val]) => ({
        criterion: key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
        score: typeof val === "number" ? val : (typeof val === "object" && val !== null && "score" in val ? (val as {score: number}).score : 0),
      }));
    }
    return [];
  };

  // Parse category contributions
  const parseCategoryContributions = (value: unknown): CategoryContribution[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter((item): item is CategoryContribution => 
        typeof item === "object" && item !== null && "category" in item
      );
    }
    return [];
  };

  // Parse weighted scoring
  const parseWeightedScoring = (value: unknown): WeightedScore[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter((item): item is WeightedScore => 
        typeof item === "object" && item !== null && "category" in item && "score" in item
      );
    }
    return [];
  };

  // Parse products snapshot
  const parseProductsSnapshot = (value: unknown): ProductsSnapshot | null => {
    if (!value || typeof value !== 'object') return null;
    return value as ProductsSnapshot;
  };

  // Parse reviews snapshot
  const parseReviewsSnapshot = (value: unknown): ReviewsSnapshot | null => {
    if (!value || typeof value !== 'object') return null;
    return value as ReviewsSnapshot;
  };

  const keyInsights = toArray(analysis?.key_insights);
  const topStrengths = toArray(analysis?.top_strengths);
  const topWeaknesses = toArray(analysis?.top_weaknesses);
  const criteriaScores = parseCriteriaScores(analysis?.criteria_scores);
  const categoryContributions = parseCategoryContributions(analysis?.category_contributions);
  const weightedScoring = parseWeightedScoring(analysis?.weighted_scoring);
  const productsSnapshot = parseProductsSnapshot(analysis?.products_snapshot);
  const reviewsSnapshot = parseReviewsSnapshot(analysis?.reviews_snapshot);

  // Build radar chart data from criteria_scores or category_scores table
  const radarData = criteriaScores.length > 0 
    ? criteriaScores.map(cs => ({
        subject: cs.criterion.length > 15 ? cs.criterion.substring(0, 15) + "..." : cs.criterion,
        fullName: cs.criterion,
        score: cs.score,
        fullMark: 10,
      }))
    : categoryScores 
    ? [
        { subject: "Demand", fullName: "Demand Score", score: Number(categoryScores.demand_score) || 0, fullMark: 10 },
        { subject: "Competition", fullName: "Competition Score", score: Number(categoryScores.competition_score) || 0, fullMark: 10 },
        { subject: "Breakout", fullName: "Breakout Score", score: Number(categoryScores.breakout_score) || 0, fullMark: 10 },
        { subject: "Differentiation", fullName: "Differentiation Potential", score: Number(categoryScores.differentiation_potential) || 0, fullMark: 10 },
        { subject: "Profitability", fullName: "Profitability", score: Number(categoryScores.profitability) || 0, fullMark: 10 },
        { subject: "Pain Points", fullName: "Pain Points Score", score: Number(categoryScores.pain_points_score) || 0, fullMark: 10 },
        { subject: "Consumer Fit", fullName: "Consumer Fit", score: Number(categoryScores.consumer_fit) || 0, fullMark: 10 },
        { subject: "Trust", fullName: "Trust Level", score: Number(categoryScores.trust_level) || 0, fullMark: 10 },
      ].filter(d => d.score > 0)
    : [];

  // Build bar chart data for weighted scoring
  const barData = weightedScoring.length > 0
    ? weightedScoring.map(ws => ({
        name: ws.category.length > 12 ? ws.category.substring(0, 12) + "..." : ws.category,
        score: ws.weighted_score,
        weight: ws.weight,
      }))
    : [];

  const analysisMetrics = {
    category: analysis?.category_name ?? categoryName ?? "No Analysis Available",
    date: analysis?.created_at
      ? new Date(analysis.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : "N/A",
    overallScore: analysis?.overall_score ?? analysis?.opportunity_index ?? 0,
    opportunityIndex: analysis?.opportunity_index ?? 0,
    marketSize: categoryData?.total_products ? `${categoryData.total_products} Products` : "N/A",
    avgPrice: categoryData?.avg_price ? `$${categoryData.avg_price.toFixed(2)}` : "N/A",
    uniqueBrands: categoryData?.unique_brands ?? 0,
    confidence: analysis?.confidence ?? "N/A",
  };

  const keyFindings = [
    {
      icon: Target,
      label: "Opportunity Tier",
      value: analysis?.opportunity_tier_label ?? analysis?.opportunity_tier ?? "N/A",
      detail: analysis?.recommendation ?? "No recommendation available",
    },
    {
      icon: TrendingUp,
      label: "Products Analyzed",
      value: analysis?.products_analyzed?.toString() ?? "0",
      detail: "Total products in analysis",
    },
    {
      icon: DollarSign,
      label: "Recommended Price",
      value: analysis?.recommended_price ? `$${Number(analysis.recommended_price).toFixed(2)}` : "N/A",
      detail: `Est. margin: ${analysis?.estimated_profit_margin ? `${Number(analysis.estimated_profit_margin).toFixed(0)}%` : "N/A"}`,
    },
    {
      icon: Users,
      label: "Reviews Analyzed",
      value: analysis?.reviews_analyzed?.toString() ?? "0",
      detail: "Customer feedback processed",
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!categoryName) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">No category selected. Start a new analysis to see the strategy brief.</p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">
          No analysis data available for "{categoryName}". Analysis may still be in progress.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <FileText className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Strategy Brief</h1>
            {analysis.confidence && (
              <Badge variant="outline">{analysis.confidence} confidence</Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            Factory specification and strategic recommendations for {analysisMetrics.category}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Printer className="w-4 h-4" />
            Print
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Executive Summary */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle>Executive Summary</CardTitle>
          <CardDescription>Analysis completed on {analysisMetrics.date}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {analysis.executive_summary && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {analysis.executive_summary}
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-2">
            <div className="text-center p-4 bg-primary/10 rounded-lg">
              <p className="text-2xl font-bold text-primary">{Math.round(analysisMetrics.overallScore)}</p>
              <p className="text-xs text-muted-foreground">Overall Score</p>
            </div>
            <div className="text-center p-4 bg-secondary rounded-lg">
              <p className="text-2xl font-bold text-foreground">{Math.round(analysisMetrics.opportunityIndex)}</p>
              <p className="text-xs text-muted-foreground">Opportunity Index</p>
            </div>
            <div className="text-center p-4 bg-secondary rounded-lg">
              <p className="text-2xl font-bold text-foreground">{analysisMetrics.marketSize}</p>
              <p className="text-xs text-muted-foreground">Market Size</p>
            </div>
            <div className="text-center p-4 bg-secondary rounded-lg">
              <p className="text-2xl font-bold text-foreground">{analysisMetrics.avgPrice}</p>
              <p className="text-xs text-muted-foreground">Avg Price</p>
            </div>
            <div className="text-center p-4 bg-secondary rounded-lg">
              <p className="text-2xl font-bold text-foreground">{analysisMetrics.uniqueBrands}</p>
              <p className="text-xs text-muted-foreground">Unique Brands</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Foundation - Snapshots */}
      {(productsSnapshot || reviewsSnapshot) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Data Foundation
            </CardTitle>
            <CardDescription>Source data and sampling methodology used for this analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Products Snapshot */}
              {productsSnapshot && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <FileBarChart className="w-4 h-4 text-primary" />
                    <h4 className="font-medium text-sm">Products Data</h4>
                    {productsSnapshot.snapshot_timestamp && (
                      <Badge variant="outline" className="ml-auto text-xs">
                        <Calendar className="w-3 h-3 mr-1" />
                        {new Date(productsSnapshot.snapshot_timestamp).toLocaleDateString()}
                      </Badge>
                    )}
                  </div>
                  
                  {productsSnapshot.data_completeness && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-secondary rounded-lg text-center">
                          <p className="text-lg font-bold text-foreground">
                            {productsSnapshot.data_completeness.total_products?.toLocaleString() ?? "N/A"}
                          </p>
                          <p className="text-xs text-muted-foreground">Products Analyzed</p>
                        </div>
                        <div className="p-3 bg-secondary rounded-lg text-center">
                          <p className="text-lg font-bold text-foreground">
                            {productsSnapshot.data_completeness.total_reviews?.toLocaleString() ?? "N/A"}
                          </p>
                          <p className="text-xs text-muted-foreground">Total Reviews</p>
                        </div>
                      </div>

                      {(productsSnapshot.data_completeness.ocr_success_rate !== undefined || 
                        productsSnapshot.data_completeness.products_with_keepa !== undefined) && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Data Completeness</p>
                          {productsSnapshot.data_completeness.ocr_success_rate !== undefined && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-24">OCR Success</span>
                              <Progress 
                                value={productsSnapshot.data_completeness.ocr_success_rate * 100} 
                                className="h-2 flex-1" 
                              />
                              <span className="text-xs font-medium w-12 text-right">
                                {(productsSnapshot.data_completeness.ocr_success_rate * 100).toFixed(0)}%
                              </span>
                            </div>
                          )}
                          {productsSnapshot.data_completeness.products_with_keepa !== undefined && 
                           productsSnapshot.data_completeness.total_products && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-24">Keepa Data</span>
                              <Progress 
                                value={(productsSnapshot.data_completeness.products_with_keepa / productsSnapshot.data_completeness.total_products) * 100} 
                                className="h-2 flex-1" 
                              />
                              <span className="text-xs font-medium w-12 text-right">
                                {productsSnapshot.data_completeness.products_with_keepa}
                              </span>
                            </div>
                          )}
                          {productsSnapshot.data_completeness.products_with_rainforest !== undefined && 
                           productsSnapshot.data_completeness.total_products && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-24">Rainforest</span>
                              <Progress 
                                value={(productsSnapshot.data_completeness.products_with_rainforest / productsSnapshot.data_completeness.total_products) * 100} 
                                className="h-2 flex-1" 
                              />
                              <span className="text-xs font-medium w-12 text-right">
                                {productsSnapshot.data_completeness.products_with_rainforest}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {productsSnapshot.data_completeness.reviews_per_product !== undefined && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Avg Reviews/Product</span>
                          <span className="font-medium">{productsSnapshot.data_completeness.reviews_per_product.toFixed(1)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Top Performers Mini Table */}
                  {productsSnapshot.top_performers && productsSnapshot.top_performers.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Top Performers</p>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left p-2 font-medium">Product</th>
                              <th className="text-right p-2 font-medium">Price</th>
                              <th className="text-right p-2 font-medium">BSR</th>
                            </tr>
                          </thead>
                          <tbody>
                            {productsSnapshot.top_performers.slice(0, 5).map((product, idx) => (
                              <tr key={idx} className="border-t">
                                <td className="p-2">
                                  <div className="font-medium truncate max-w-[150px]" title={product.title}>
                                    {product.brand || "Unknown"}
                                  </div>
                                </td>
                                <td className="p-2 text-right">
                                  {product.price ? `$${product.price.toFixed(2)}` : "-"}
                                </td>
                                <td className="p-2 text-right">
                                  {product.bsr_current?.toLocaleString() ?? "-"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Reviews Snapshot */}
              {reviewsSnapshot && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    <h4 className="font-medium text-sm">Reviews Data</h4>
                    {reviewsSnapshot.snapshot_timestamp && (
                      <Badge variant="outline" className="ml-auto text-xs">
                        <Calendar className="w-3 h-3 mr-1" />
                        {new Date(reviewsSnapshot.snapshot_timestamp).toLocaleDateString()}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-secondary rounded-lg text-center">
                      <p className="text-lg font-bold text-foreground">
                        {reviewsSnapshot.total_reviews?.toLocaleString() ?? "N/A"}
                      </p>
                      <p className="text-xs text-muted-foreground">Total in Category</p>
                    </div>
                    <div className="p-3 bg-secondary rounded-lg text-center">
                      <p className="text-lg font-bold text-foreground">
                        {reviewsSnapshot.sample_size?.toLocaleString() ?? "N/A"}
                      </p>
                      <p className="text-xs text-muted-foreground">Sample Analyzed</p>
                    </div>
                  </div>

                  {reviewsSnapshot.sampling_strategy && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Sampling Strategy</span>
                      <Badge variant="outline">{reviewsSnapshot.sampling_strategy}</Badge>
                    </div>
                  )}

                  {/* Review Distribution */}
                  {reviewsSnapshot.review_distribution && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Sentiment Distribution</p>
                      <div className="space-y-2">
                        {reviewsSnapshot.review_distribution.positive !== undefined && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-green-600 w-16">Positive</span>
                            <Progress 
                              value={reviewsSnapshot.review_distribution.positive} 
                              className="h-2 flex-1 [&>div]:bg-green-500" 
                            />
                            <span className="text-xs font-medium w-10 text-right">
                              {reviewsSnapshot.review_distribution.positive}%
                            </span>
                          </div>
                        )}
                        {reviewsSnapshot.review_distribution.neutral !== undefined && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-yellow-600 w-16">Neutral</span>
                            <Progress 
                              value={reviewsSnapshot.review_distribution.neutral} 
                              className="h-2 flex-1 [&>div]:bg-yellow-500" 
                            />
                            <span className="text-xs font-medium w-10 text-right">
                              {reviewsSnapshot.review_distribution.neutral}%
                            </span>
                          </div>
                        )}
                        {reviewsSnapshot.review_distribution.negative !== undefined && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-600 w-16">Negative</span>
                            <Progress 
                              value={reviewsSnapshot.review_distribution.negative} 
                              className="h-2 flex-1 [&>div]:bg-red-500" 
                            />
                            <span className="text-xs font-medium w-10 text-right">
                              {reviewsSnapshot.review_distribution.negative}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Criteria Scores Radar Chart */}
      {radarData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Category Scores Analysis
            </CardTitle>
            <CardDescription>Multi-dimensional scoring across key criteria</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis 
                    dataKey="subject" 
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  />
                  <PolarRadiusAxis 
                    angle={30} 
                    domain={[0, 10]} 
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  />
                  <Radar
                    name="Score"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.3}
                  />
                  <Tooltip 
                    content={({ payload }) => {
                      if (payload && payload.length > 0) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded-md p-2 shadow-md">
                            <p className="font-medium text-sm">{data.fullName}</p>
                            <p className="text-sm text-muted-foreground">Score: {data.score}/10</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Findings */}
      <Card>
        <CardHeader>
          <CardTitle>Key Findings</CardTitle>
          <CardDescription>Critical metrics and insights</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {keyFindings.map((finding, idx) => (
              <div key={idx} className="flex items-start gap-4 p-4 border rounded-lg">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <finding.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{finding.label}</p>
                  <p className="text-xl font-bold text-foreground">{finding.value}</p>
                  <p className="text-sm text-muted-foreground">{finding.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Key Insights */}
      {keyInsights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-yellow-500" />
              Key Insights
            </CardTitle>
            <CardDescription>Actionable intelligence from analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {keyInsights.map((insight, idx) => (
                <li key={idx} className="flex items-start gap-3 p-3 bg-secondary/50 rounded-lg">
                  <span className="text-yellow-500 font-bold">{idx + 1}.</span>
                  <span className="text-sm text-foreground">{insight}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Weighted Scoring */}
      {barData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Weighted Scoring Breakdown</CardTitle>
            <CardDescription>How each category contributes to the overall score</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical">
                  <XAxis type="number" domain={[0, 10]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <Tooltip 
                    content={({ payload }) => {
                      if (payload && payload.length > 0) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded-md p-2 shadow-md">
                            <p className="font-medium text-sm">{data.name}</p>
                            <p className="text-sm text-muted-foreground">Score: {data.score}</p>
                            <p className="text-sm text-muted-foreground">Weight: {data.weight}x</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                    {barData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={`hsl(var(--chart-${(index % 5) + 1}))`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category Contributions */}
      {categoryContributions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="w-5 h-5 text-primary" />
              Amazon Category Contributions
            </CardTitle>
            <CardDescription>Revenue and product distribution by Amazon category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {categoryContributions.map((contrib, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="font-medium text-sm">{contrib.category}</span>
                  <div className="flex items-center gap-4">
                    {contrib.products && (
                      <Badge variant="outline">{contrib.products} products</Badge>
                    )}
                    {contrib.revenue && (
                      <Badge variant="secondary">${contrib.revenue.toLocaleString()}</Badge>
                    )}
                    {contrib.percentage && (
                      <div className="flex items-center gap-2 w-32">
                        <Progress value={contrib.percentage} className="h-2" />
                        <span className="text-xs text-muted-foreground">{contrib.percentage}%</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Strengths & Weaknesses */}
      <div className="grid md:grid-cols-2 gap-6">
        {topStrengths.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                Top Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {topStrengths.map((strength, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <TrendingUp className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{strength}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {topWeaknesses.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                Top Weaknesses / Opportunities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {topWeaknesses.map((weakness, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{weakness}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Difficulty Breakdown */}
      {categoryScores && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Difficulty & Risk Assessment
            </CardTitle>
            <CardDescription>Complexity scores across different business dimensions (1-10 scale, higher = more difficult/risky)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { label: "Production Complexity", value: categoryScores.production_complexity, icon: Factory, color: "text-blue-500" },
                { label: "Formulation Difficulty", value: categoryScores.formulation_difficulty, icon: Beaker, color: "text-purple-500" },
                { label: "Flavor Complexity", value: categoryScores.flavor_complexity, icon: Package, color: "text-pink-500" },
                { label: "Quality Difficulty", value: categoryScores.quality_difficulty, icon: ShieldCheck, color: "text-green-500" },
                { label: "Regulatory Risk", value: categoryScores.regulatory_risk, icon: AlertCircle, color: "text-red-500" },
                { label: "Branding Difficulty", value: categoryScores.branding_difficulty, icon: Target, color: "text-indigo-500" },
                { label: "Marketing Difficulty", value: categoryScores.marketing_difficulty, icon: Users, color: "text-cyan-500" },
                { label: "Supply Chain Risk", value: categoryScores.supply_chain_risk, icon: Boxes, color: "text-orange-500" },
                { label: "Operational Complexity", value: categoryScores.operational_complexity, icon: Clock, color: "text-yellow-600" },
                { label: "Manufacturing Access", value: categoryScores.manufacturing_access, icon: Factory, color: "text-emerald-500", inverted: true },
              ].map((metric, idx) => {
                const score = Number(metric.value) || 0;
                const displayScore = metric.inverted ? (10 - score) : score;
                const riskLevel = displayScore >= 7 ? "High" : displayScore >= 4 ? "Medium" : "Low";
                const riskColor = displayScore >= 7 ? "text-red-500" : displayScore >= 4 ? "text-yellow-500" : "text-green-500";
                const bgColor = displayScore >= 7 ? "bg-red-500" : displayScore >= 4 ? "bg-yellow-500" : "bg-green-500";
                
                return (
                  <div key={idx} className="p-4 border rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <metric.icon className={`w-4 h-4 ${metric.color}`} />
                        <span className="text-sm font-medium">{metric.label}</span>
                      </div>
                      <Badge variant="outline" className={riskColor}>{riskLevel}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={displayScore * 10} className={`h-2 flex-1 [&>div]:${bgColor}`} />
                      <span className="text-lg font-bold text-foreground w-8 text-right">{score.toFixed(1)}</span>
                    </div>
                    {metric.inverted && (
                      <p className="text-xs text-muted-foreground">Higher = easier access</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Formula Brief */}
      {formulaBrief && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Beaker className="w-5 h-5 text-primary" />
              Formula Brief
            </CardTitle>
            <CardDescription>Product development specifications and recommendations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Product Positioning */}
            {(formulaBrief.positioning || formulaBrief.target_customer) && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-foreground flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Positioning & Target Customer
                </h4>
                {formulaBrief.positioning && (
                  <p className="text-sm text-muted-foreground">{formulaBrief.positioning}</p>
                )}
                {formulaBrief.target_customer && (
                  <p className="text-sm text-muted-foreground"><strong>Target:</strong> {formulaBrief.target_customer}</p>
                )}
              </div>
            )}

            {/* Pricing & Economics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-secondary rounded-lg text-center">
                <p className="text-lg font-bold text-foreground">
                  ${formulaBrief.target_price ? Number(formulaBrief.target_price).toFixed(2) : "N/A"}
                </p>
                <p className="text-xs text-muted-foreground">Target Price</p>
              </div>
              <div className="p-3 bg-secondary rounded-lg text-center">
                <p className="text-lg font-bold text-foreground">
                  ${formulaBrief.cogs_target ? Number(formulaBrief.cogs_target).toFixed(2) : "N/A"}
                </p>
                <p className="text-xs text-muted-foreground">COGS Target</p>
              </div>
              <div className="p-3 bg-secondary rounded-lg text-center">
                <p className="text-lg font-bold text-foreground">
                  {formulaBrief.margin_estimate ? `${Number(formulaBrief.margin_estimate).toFixed(0)}%` : "N/A"}
                </p>
                <p className="text-xs text-muted-foreground">Est. Margin</p>
              </div>
              <div className="p-3 bg-secondary rounded-lg text-center">
                <p className="text-lg font-bold text-foreground">
                  {formulaBrief.servings_per_container ?? "N/A"}
                </p>
                <p className="text-xs text-muted-foreground">Servings</p>
              </div>
            </div>

            {/* Form & Packaging */}
            {(formulaBrief.form_type || formulaBrief.packaging_type) && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-foreground flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Form & Packaging
                </h4>
                <div className="flex flex-wrap gap-2">
                  {formulaBrief.form_type && (
                    <Badge variant="secondary">{formulaBrief.form_type}</Badge>
                  )}
                  {formulaBrief.packaging_type && (
                    <Badge variant="outline">{formulaBrief.packaging_type}</Badge>
                  )}
                </div>
                {formulaBrief.form_rationale && (
                  <p className="text-sm text-muted-foreground">{formulaBrief.form_rationale}</p>
                )}
                {formulaBrief.packaging_recommendations && (
                  <p className="text-sm text-muted-foreground">{formulaBrief.packaging_recommendations}</p>
                )}
              </div>
            )}

            {/* Flavor */}
            {(formulaBrief.flavor_importance || formulaBrief.flavor_profile) && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-foreground">Flavor Development</h4>
                <div className="flex items-center gap-4">
                  {formulaBrief.flavor_importance && (
                    <Badge variant={formulaBrief.flavor_importance === "high" ? "default" : "secondary"}>
                      {formulaBrief.flavor_importance} importance
                    </Badge>
                  )}
                  {formulaBrief.flavor_development_needed && (
                    <Badge variant="outline">Development needed</Badge>
                  )}
                </div>
                {formulaBrief.flavor_profile && (
                  <p className="text-sm text-muted-foreground">{formulaBrief.flavor_profile}</p>
                )}
              </div>
            )}

            {/* Key Differentiators */}
            {formulaBrief.key_differentiators && formulaBrief.key_differentiators.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-foreground flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Key Differentiators
                </h4>
                <ul className="space-y-1">
                  {formulaBrief.key_differentiators.map((diff, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-green-500">•</span>
                      {diff}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Consumer Pain Points */}
            {formulaBrief.consumer_pain_points && formulaBrief.consumer_pain_points.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-foreground flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  Consumer Pain Points to Address
                </h4>
                <ul className="space-y-1">
                  {formulaBrief.consumer_pain_points.map((pain, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-yellow-500">•</span>
                      {pain}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Manufacturing */}
            {(formulaBrief.moq_estimate || formulaBrief.lead_time_weeks || formulaBrief.manufacturing_notes) && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-foreground flex items-center gap-2">
                  <Factory className="w-4 h-4" />
                  Manufacturing
                </h4>
                <div className="flex flex-wrap gap-4">
                  {formulaBrief.moq_estimate && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">MOQ:</span>{" "}
                      <span className="font-medium">{formulaBrief.moq_estimate.toLocaleString()} units</span>
                    </div>
                  )}
                  {formulaBrief.lead_time_weeks && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Lead Time:</span>{" "}
                      <span className="font-medium">{formulaBrief.lead_time_weeks} weeks</span>
                    </div>
                  )}
                </div>
                {formulaBrief.manufacturing_notes && (
                  <p className="text-sm text-muted-foreground">{formulaBrief.manufacturing_notes}</p>
                )}
              </div>
            )}

            {/* Certifications & Testing */}
            {((formulaBrief.certifications && formulaBrief.certifications.length > 0) || 
              (formulaBrief.testing_requirements && formulaBrief.testing_requirements.length > 0)) && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-foreground flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  Certifications & Testing
                </h4>
                <div className="flex flex-wrap gap-2">
                  {formulaBrief.certifications?.map((cert, idx) => (
                    <Badge key={idx} variant="secondary">{cert}</Badge>
                  ))}
                  {formulaBrief.testing_requirements?.map((test, idx) => (
                    <Badge key={idx} variant="outline">{test}</Badge>
                  ))}
                </div>
                {formulaBrief.regulatory_notes && (
                  <p className="text-sm text-muted-foreground">{formulaBrief.regulatory_notes}</p>
                )}
              </div>
            )}

            {/* Risk Factors */}
            {formulaBrief.risk_factors && formulaBrief.risk_factors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-foreground flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive" />
                  Risk Factors
                </h4>
                <ul className="space-y-1">
                  {formulaBrief.risk_factors.map((risk, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-destructive">•</span>
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Market Summary */}
            {formulaBrief.market_summary && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-foreground">Market Summary</h4>
                <p className="text-sm text-muted-foreground">{formulaBrief.market_summary}</p>
              </div>
            )}

            {/* Opportunity Insights */}
            {formulaBrief.opportunity_insights && (
              <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                <h4 className="font-medium text-sm text-foreground flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-primary" />
                  Opportunity Insights
                </h4>
                <p className="text-sm text-muted-foreground">{formulaBrief.opportunity_insights}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Customer Review Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Customer Review Analysis
          </CardTitle>
          <CardDescription>Aggregated insights from customer feedback</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-6">
            <span className="text-sm text-muted-foreground">Overall Category Rating</span>
            <div className="flex items-center gap-2">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    className={`text-lg ${
                      star <= Math.floor(categoryData?.avg_rating ?? 0)
                        ? "text-yellow-400"
                        : "text-muted"
                    }`}
                  >
                    ★
                  </span>
                ))}
              </div>
              <span className="font-bold text-foreground">
                {categoryData?.avg_rating?.toFixed(1) ?? "N/A"}/5
              </span>
            </div>
          </div>
          <Separator className="my-4" />
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                What Customers Love
              </h4>
              <ul className="space-y-2">
                {(topStrengths.length > 0 ? topStrengths.slice(0, 4) : ["No data available"]).map((theme, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    {theme}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                Common Complaints
              </h4>
              <ul className="space-y-2">
                {(topWeaknesses.length > 0 ? topWeaknesses.slice(0, 3) : ["No data available"]).map((theme, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    {theme}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
