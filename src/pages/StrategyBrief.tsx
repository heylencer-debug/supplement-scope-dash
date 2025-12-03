import { FileText, Download, Printer, CheckCircle, AlertTriangle, Info, Target, TrendingUp, DollarSign, Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCategoryAnalyses } from "@/hooks/useCategoryAnalyses";
import { useCategoryDashboard } from "@/hooks/useCategoryDashboard";

export default function StrategyBrief() {
  const { data: analyses, isLoading: analysesLoading } = useCategoryAnalyses();
  const { data: dashboardData, isLoading: dashboardLoading } = useCategoryDashboard();

  const isLoading = analysesLoading || dashboardLoading;
  const latestAnalysis = analyses?.[0];
  const categoryData = dashboardData?.find((d) => d.id === latestAnalysis?.category_id);

  const analysisData = {
    category: latestAnalysis?.category_name ?? "No Analysis Available",
    date: latestAnalysis?.created_at
      ? new Date(latestAnalysis.created_at).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "N/A",
    overallScore: latestAnalysis?.opportunity_index ?? 0,
    marketSize: categoryData?.total_products ? `${categoryData.total_products} Products` : "N/A",
    growthRate: "N/A",
    avgPrice: categoryData?.avg_price ? `$${categoryData.avg_price.toFixed(2)}` : "N/A",
    topCompetitors: categoryData?.unique_brands ?? 0,
  };

  // Helper to safely convert JSONB to array
  const toArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value;
    if (typeof value === "object" && value !== null) {
      return Object.values(value).filter((v): v is string => typeof v === "string");
    }
    return [];
  };

  // Parse key insights from the analysis
  const keyInsights = toArray(latestAnalysis?.key_insights);
  const topStrengths = toArray(latestAnalysis?.top_strengths);
  const topWeaknesses = toArray(latestAnalysis?.top_weaknesses);

  const recommendations = [
    ...topStrengths.slice(0, 2).map((s) => ({
      type: "opportunity",
      icon: CheckCircle,
      title: "Strength",
      description: s,
      priority: "high" as const,
    })),
    ...topWeaknesses.slice(0, 1).map((w) => ({
      type: "caution",
      icon: AlertTriangle,
      title: "Area for Improvement",
      description: w,
      priority: "medium" as const,
    })),
    ...keyInsights.slice(0, 1).map((i) => ({
      type: "info",
      icon: Info,
      title: "Key Insight",
      description: i,
      priority: "low" as const,
    })),
  ];

  const keyFindings = [
    {
      icon: Target,
      label: "Opportunity Tier",
      value: latestAnalysis?.opportunity_tier_label ?? "N/A",
      detail: latestAnalysis?.recommendation ?? "No recommendation available",
    },
    {
      icon: TrendingUp,
      label: "Products Analyzed",
      value: latestAnalysis?.products_analyzed?.toString() ?? "0",
      detail: "Total products in analysis",
    },
    {
      icon: DollarSign,
      label: "Recommended Price",
      value: latestAnalysis?.recommended_price ? `$${latestAnalysis.recommended_price.toFixed(2)}` : "N/A",
      detail: "Optimal price point",
    },
    {
      icon: Users,
      label: "Reviews Analyzed",
      value: latestAnalysis?.reviews_analyzed?.toString() ?? "0",
      detail: "Customer feedback processed",
    },
  ];

  const reviewSummary = {
    positiveThemes: topStrengths.length > 0 ? topStrengths.slice(0, 4) : ["No data available"],
    negativeThemes: topWeaknesses.length > 0 ? topWeaknesses.slice(0, 3) : ["No data available"],
    sentimentScore: categoryData?.avg_rating ?? 0,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!latestAnalysis) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">No analysis data available. Run an analysis to see the strategy brief.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <FileText className="w-8 h-8 text-accent" />
            <h1 className="text-2xl font-bold text-foreground">Strategy Brief</h1>
          </div>
          <p className="text-muted-foreground">
            Factory specification and strategic recommendations for {analysisData.category}
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
      <Card className="border-l-4 border-l-accent">
        <CardHeader>
          <CardTitle>Executive Summary</CardTitle>
          <CardDescription>Analysis completed on {analysisData.date}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-4 bg-secondary/50 rounded-lg">
              <p className="text-2xl font-bold text-accent">{Math.round(analysisData.overallScore)}</p>
              <p className="text-sm text-muted-foreground">Opportunity Score</p>
            </div>
            <div className="text-center p-4 bg-secondary/50 rounded-lg">
              <p className="text-2xl font-bold text-foreground">{analysisData.marketSize}</p>
              <p className="text-sm text-muted-foreground">Market Size</p>
            </div>
            <div className="text-center p-4 bg-secondary/50 rounded-lg">
              <p className="text-2xl font-bold text-foreground">{categoryData?.avg_rating?.toFixed(1) ?? "N/A"}</p>
              <p className="text-sm text-muted-foreground">Avg Rating</p>
            </div>
            <div className="text-center p-4 bg-secondary/50 rounded-lg">
              <p className="text-2xl font-bold text-foreground">{analysisData.avgPrice}</p>
              <p className="text-sm text-muted-foreground">Avg Price</p>
            </div>
            <div className="text-center p-4 bg-secondary/50 rounded-lg">
              <p className="text-2xl font-bold text-foreground">{analysisData.topCompetitors}</p>
              <p className="text-sm text-muted-foreground">Unique Brands</p>
            </div>
          </div>
        </CardContent>
      </Card>

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
                <div className="h-10 w-10 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <finding.icon className="h-5 w-5 text-accent" />
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

      {/* Strategic Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Strategic Recommendations</CardTitle>
            <CardDescription>Actionable insights for product development</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recommendations.map((rec, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-4 p-4 rounded-lg border ${
                  rec.type === "opportunity"
                    ? "border-green-500/30 bg-green-500/5"
                    : rec.type === "caution"
                    ? "border-yellow-500/30 bg-yellow-500/5"
                    : "border-blue-500/30 bg-blue-500/5"
                }`}
              >
                <rec.icon
                  className={`h-5 w-5 mt-0.5 ${
                    rec.type === "opportunity"
                      ? "text-green-500"
                      : rec.type === "caution"
                      ? "text-yellow-500"
                      : "text-blue-500"
                  }`}
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-foreground">{rec.title}</p>
                    <Badge
                      variant={rec.priority === "high" ? "default" : "secondary"}
                      className={rec.priority === "high" ? "bg-accent" : ""}
                    >
                      {rec.priority} priority
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{rec.description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Review Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Review Analysis</CardTitle>
          <CardDescription>Aggregated insights from customer feedback</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Strengths
              </h4>
              <ul className="space-y-2">
                {reviewSummary.positiveThemes.map((theme, idx) => (
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
                Areas for Improvement
              </h4>
              <ul className="space-y-2">
                {reviewSummary.negativeThemes.map((theme, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    {theme}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <Separator className="my-6" />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Overall Rating</span>
            <div className="flex items-center gap-2">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    className={`text-lg ${
                      star <= Math.floor(reviewSummary.sentimentScore)
                        ? "text-yellow-400"
                        : "text-muted"
                    }`}
                  >
                    ★
                  </span>
                ))}
              </div>
              <span className="font-bold text-foreground">{reviewSummary.sentimentScore.toFixed(1)}/5</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
