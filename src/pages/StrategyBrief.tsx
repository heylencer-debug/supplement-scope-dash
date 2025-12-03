import { FileText, Download, Printer, CheckCircle, AlertTriangle, Info, Target, TrendingUp, DollarSign, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const analysisData = {
  category: "Vitamin D3 Supplements",
  date: "December 3, 2024",
  overallScore: 78,
  marketSize: "$1.2B",
  growthRate: "12.4%",
  avgPrice: "$24.99",
  topCompetitors: 8,
};

const recommendations = [
  {
    type: "opportunity",
    icon: CheckCircle,
    title: "High-Dose Formulations",
    description: "5000 IU+ products show 23% higher demand and lower competition.",
    priority: "high",
  },
  {
    type: "opportunity",
    icon: CheckCircle,
    title: "Bundle Opportunities",
    description: "D3+K2 combinations have 45% higher average order value.",
    priority: "high",
  },
  {
    type: "caution",
    icon: AlertTriangle,
    title: "Price Sensitivity",
    description: "Products over $35 see significant drop-off in conversion rates.",
    priority: "medium",
  },
  {
    type: "info",
    icon: Info,
    title: "Seasonal Trends",
    description: "Q4 shows 35% increase in demand. Plan inventory accordingly.",
    priority: "low",
  },
];

const keyFindings = [
  {
    icon: Target,
    label: "Target Price Point",
    value: "$22-$28",
    detail: "Optimal price range for maximum conversion",
  },
  {
    icon: TrendingUp,
    label: "Market Growth",
    value: "+12.4% YoY",
    detail: "Consistent upward trend in category",
  },
  {
    icon: DollarSign,
    label: "Profit Margin",
    value: "42-48%",
    detail: "Average margin for top performers",
  },
  {
    icon: Users,
    label: "Target Audience",
    value: "35-55 Adults",
    detail: "Primary demographic for this category",
  },
];

const reviewSummary = {
  positiveThemes: [
    "Easy to swallow capsules",
    "Noticeable energy improvement",
    "Good value for quantity",
    "Fast shipping",
  ],
  negativeThemes: [
    "Large pill size complaints",
    "Bottle seal issues",
    "Inconsistent potency",
  ],
  sentimentScore: 4.2,
};

export default function StrategyBrief() {
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
              <p className="text-2xl font-bold text-accent">{analysisData.overallScore}</p>
              <p className="text-sm text-muted-foreground">Opportunity Score</p>
            </div>
            <div className="text-center p-4 bg-secondary/50 rounded-lg">
              <p className="text-2xl font-bold text-foreground">{analysisData.marketSize}</p>
              <p className="text-sm text-muted-foreground">Market Size</p>
            </div>
            <div className="text-center p-4 bg-secondary/50 rounded-lg">
              <p className="text-2xl font-bold text-foreground">{analysisData.growthRate}</p>
              <p className="text-sm text-muted-foreground">Growth Rate</p>
            </div>
            <div className="text-center p-4 bg-secondary/50 rounded-lg">
              <p className="text-2xl font-bold text-foreground">{analysisData.avgPrice}</p>
              <p className="text-sm text-muted-foreground">Avg Price</p>
            </div>
            <div className="text-center p-4 bg-secondary/50 rounded-lg">
              <p className="text-2xl font-bold text-foreground">{analysisData.topCompetitors}</p>
              <p className="text-sm text-muted-foreground">Top Competitors</p>
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
                Positive Themes
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
            <span className="text-sm text-muted-foreground">Overall Sentiment Score</span>
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
              <span className="font-bold text-foreground">{reviewSummary.sentimentScore}/5</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
