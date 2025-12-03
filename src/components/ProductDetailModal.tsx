import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Star, TrendingUp, TrendingDown, AlertCircle, CheckCircle, Target, Users, Beaker, Lightbulb, ShoppingCart } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import type { Product } from "@/hooks/useProducts";

interface ProductDetailModalProps {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MarketingAnalysis {
  competitive_analysis?: {
    unique_selling_points?: string[];
    weaknesses_vs_competitors?: string[];
    parity_features?: string[];
  };
  copy_effectiveness?: {
    title_analysis?: { clarity_score?: number; keyword_presence?: boolean };
    bullet_analysis?: { benefit_count?: number; feature_count?: number };
  };
  target_demographics?: string;
  overall_score?: number;
  opportunities?: string[];
  positioning_suggestions?: string[];
}

interface ReviewAnalysis {
  pain_points?: Array<{ theme: string; frequency: number; severity?: string; quotes?: string[] }>;
  positive_themes?: Array<{ theme: string; frequency: number; impact?: string }>;
  feature_requests?: Array<{ request: string; frequency: number; priority?: string }>;
  key_insights?: string[];
  sentiment_distribution?: { positive: number; neutral: number; negative: number };
  demographics_insights?: { buyer_types?: string[]; use_cases?: string[] };
  summary?: string;
}

interface Nutrient {
  name: string;
  amount?: string;
  daily_value?: string;
  unit?: string;
}

interface ProprietaryBlend {
  name: string;
  total_amount?: string;
  ingredients?: string[];
}

const SENTIMENT_COLORS = {
  positive: "hsl(var(--chart-2))",
  neutral: "hsl(var(--chart-4))",
  negative: "hsl(var(--destructive))"
};

export default function ProductDetailModal({ product, open, onOpenChange }: ProductDetailModalProps) {
  if (!product) return null;

  const marketingAnalysis = product.marketing_analysis as MarketingAnalysis | null;
  const reviewAnalysis = product.review_analysis as ReviewAnalysis | null;
  const allNutrients = product.all_nutrients as unknown as Nutrient[] | null;
  const proprietaryBlends = product.proprietary_blends as unknown as ProprietaryBlend[] | null;

  const getOverallScore = () => {
    if (marketingAnalysis?.overall_score) return marketingAnalysis.overall_score;
    const rating = product.rating ?? 0;
    const reviews = product.reviews ?? 0;
    return Math.min(100, Math.round((rating / 5) * 50 + Math.min(reviews / 100, 50)));
  };

  const getSeverityColor = (severity?: string) => {
    switch (severity?.toLowerCase()) {
      case "high": return "text-destructive";
      case "medium": return "text-yellow-500";
      default: return "text-muted-foreground";
    }
  };

  const getPriorityBadge = (priority?: string) => {
    switch (priority?.toLowerCase()) {
      case "high": return <Badge variant="destructive">High</Badge>;
      case "medium": return <Badge variant="secondary">Medium</Badge>;
      default: return <Badge variant="outline">Low</Badge>;
    }
  };

  const sentimentData = reviewAnalysis?.sentiment_distribution
    ? [
        { name: "Positive", value: reviewAnalysis.sentiment_distribution.positive, color: SENTIMENT_COLORS.positive },
        { name: "Neutral", value: reviewAnalysis.sentiment_distribution.neutral, color: SENTIMENT_COLORS.neutral },
        { name: "Negative", value: reviewAnalysis.sentiment_distribution.negative, color: SENTIMENT_COLORS.negative }
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold pr-8">
            {product.title ?? "Product Details"}
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>{product.brand}</span>
            <span>•</span>
            <span>${(product.price ?? 0).toFixed(2)}</span>
            <span>•</span>
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span>{(product.rating ?? 0).toFixed(1)}</span>
            </div>
            <span>•</span>
            <span>{(product.reviews ?? 0).toLocaleString()} reviews</span>
            {product.bsr_current && (
              <>
                <span>•</span>
                <span>BSR #{product.bsr_current.toLocaleString()}</span>
              </>
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="marketing" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="marketing" className="gap-2">
              <Target className="w-4 h-4" />
              Marketing
            </TabsTrigger>
            <TabsTrigger value="reviews" className="gap-2">
              <Users className="w-4 h-4" />
              Reviews
            </TabsTrigger>
            <TabsTrigger value="formula" className="gap-2">
              <Beaker className="w-4 h-4" />
              Formula
            </TabsTrigger>
          </TabsList>

          {/* Marketing Tab */}
          <TabsContent value="marketing" className="space-y-4 mt-4">
            {/* Overall Score Gauge */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Overall Marketing Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="relative w-24 h-24">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--secondary))" strokeWidth="10" />
                      <circle
                        cx="50" cy="50" r="40" fill="none"
                        stroke="hsl(var(--primary))" strokeWidth="10" strokeLinecap="round"
                        strokeDasharray={`${getOverallScore() * 2.51} 251`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl font-bold">{getOverallScore()}</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {marketingAnalysis?.target_demographics ?? "Target demographic data not available"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Unique Selling Points */}
            {marketingAnalysis?.competitive_analysis?.unique_selling_points && 
             marketingAnalysis.competitive_analysis.unique_selling_points.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Unique Selling Points
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {marketingAnalysis.competitive_analysis.unique_selling_points.map((point, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <TrendingUp className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Weaknesses */}
            {marketingAnalysis?.competitive_analysis?.weaknesses_vs_competitors && 
             marketingAnalysis.competitive_analysis.weaknesses_vs_competitors.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    Weaknesses vs Competitors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {marketingAnalysis.competitive_analysis.weaknesses_vs_competitors.map((weakness, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <TrendingDown className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                        {weakness}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Opportunities */}
            {marketingAnalysis?.opportunities && marketingAnalysis.opportunities.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-yellow-500" />
                    Market Opportunities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {marketingAnalysis.opportunities.map((opp, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <span className="text-yellow-500 shrink-0">•</span>
                        {opp}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Copy Effectiveness */}
            {marketingAnalysis?.copy_effectiveness && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Copy Effectiveness</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {marketingAnalysis.copy_effectiveness.title_analysis?.clarity_score !== undefined && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Title Clarity</span>
                        <span>{marketingAnalysis.copy_effectiveness.title_analysis.clarity_score}/5</span>
                      </div>
                      <Progress value={(marketingAnalysis.copy_effectiveness.title_analysis.clarity_score / 5) * 100} />
                    </div>
                  )}
                  {marketingAnalysis.copy_effectiveness.bullet_analysis && (
                    <div className="flex gap-4 text-sm">
                      <span className="text-muted-foreground">
                        Benefits: <span className="text-foreground font-medium">{marketingAnalysis.copy_effectiveness.bullet_analysis.benefit_count ?? 0}</span>
                      </span>
                      <span className="text-muted-foreground">
                        Features: <span className="text-foreground font-medium">{marketingAnalysis.copy_effectiveness.bullet_analysis.feature_count ?? 0}</span>
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {!marketingAnalysis && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No marketing analysis data available for this product.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Reviews Tab */}
          <TabsContent value="reviews" className="space-y-4 mt-4">
            {/* Review Summary */}
            {reviewAnalysis?.summary && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Review Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{reviewAnalysis.summary}</p>
                </CardContent>
              </Card>
            )}

            {/* Sentiment Distribution Pie Chart */}
            {sentimentData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Sentiment Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sentimentData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}%`}
                          labelLine={false}
                        >
                          {sentimentData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${value}%`} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Demographics Insights */}
            {reviewAnalysis?.demographics_insights && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-primary" />
                    Customer Demographics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {reviewAnalysis.demographics_insights.buyer_types && 
                   reviewAnalysis.demographics_insights.buyer_types.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Buyer Types</p>
                      <div className="flex flex-wrap gap-2">
                        {reviewAnalysis.demographics_insights.buyer_types.map((type, idx) => (
                          <Badge key={idx} variant="secondary">{type}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {reviewAnalysis.demographics_insights.use_cases && 
                   reviewAnalysis.demographics_insights.use_cases.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2">Common Use Cases</p>
                      <div className="flex flex-wrap gap-2">
                        {reviewAnalysis.demographics_insights.use_cases.map((useCase, idx) => (
                          <Badge key={idx} variant="outline">{useCase}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Pain Points */}
            {reviewAnalysis?.pain_points && reviewAnalysis.pain_points.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    Pain Points
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {reviewAnalysis.pain_points.map((point, idx) => (
                      <div key={idx} className="border-b border-border pb-2 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-sm font-medium ${getSeverityColor(point.severity)}`}>{point.theme}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{point.frequency} mentions</Badge>
                            {point.severity && (
                              <Badge variant={point.severity === "high" ? "destructive" : "secondary"} className="text-xs">
                                {point.severity}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {point.quotes && point.quotes.length > 0 && (
                          <p className="text-xs text-muted-foreground italic">"{point.quotes[0]}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Positive Themes */}
            {reviewAnalysis?.positive_themes && reviewAnalysis.positive_themes.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Positive Themes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {reviewAnalysis.positive_themes.map((theme, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <span className="text-sm text-foreground">{theme.theme}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{theme.frequency} mentions</Badge>
                          {theme.impact && (
                            <Badge variant="secondary" className="text-xs">{theme.impact}</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Feature Requests */}
            {reviewAnalysis?.feature_requests && reviewAnalysis.feature_requests.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Feature Requests</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {reviewAnalysis.feature_requests.map((request, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <span className="text-sm">{request.request}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{request.frequency}x</span>
                          {getPriorityBadge(request.priority)}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Key Insights */}
            {reviewAnalysis?.key_insights && reviewAnalysis.key_insights.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-yellow-500" />
                    Key Insights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {reviewAnalysis.key_insights.map((insight, idx) => (
                      <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-yellow-500 shrink-0">•</span>
                        {insight}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {!reviewAnalysis && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No review analysis data available for this product.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Formula Tab */}
          <TabsContent value="formula" className="space-y-4 mt-4">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{product.servings_per_container ?? "-"}</p>
                  <p className="text-xs text-muted-foreground">Servings</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{product.calories_per_serving ?? "-"}</p>
                  <p className="text-xs text-muted-foreground">Calories/Serving</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{product.nutrients_count ?? "-"}</p>
                  <p className="text-xs text-muted-foreground">Nutrients</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {product.has_proprietary_blends ? "Yes" : "No"}
                  </p>
                  <p className="text-xs text-muted-foreground">Proprietary Blends</p>
                </CardContent>
              </Card>
            </div>

            {/* Serving Size */}
            {product.serving_size && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Serving Size</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{product.serving_size}</p>
                </CardContent>
              </Card>
            )}

            {/* Nutrients Table */}
            {allNutrients && allNutrients.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Supplement Facts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Nutrient</th>
                          <th className="text-right px-3 py-2 font-medium">Amount</th>
                          <th className="text-right px-3 py-2 font-medium">% DV</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allNutrients.slice(0, 15).map((nutrient, idx) => (
                          <tr key={idx} className="border-t border-border">
                            <td className="px-3 py-2">{nutrient.name}</td>
                            <td className="text-right px-3 py-2 text-muted-foreground">
                              {nutrient.amount ?? "-"}{nutrient.unit ?? ""}
                            </td>
                            <td className="text-right px-3 py-2 text-muted-foreground">
                              {nutrient.daily_value ?? "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {allNutrients.length > 15 && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        +{allNutrients.length - 15} more nutrients
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Proprietary Blends */}
            {proprietaryBlends && proprietaryBlends.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                    Proprietary Blends
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {proprietaryBlends.map((blend, idx) => (
                    <div key={idx} className="border-b border-border pb-3 last:border-0 last:pb-0">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-sm">{blend.name}</span>
                        {blend.total_amount && (
                          <Badge variant="outline">{blend.total_amount}</Badge>
                        )}
                      </div>
                      {blend.ingredients && blend.ingredients.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {blend.ingredients.join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Ingredients */}
            {product.ingredients && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Ingredients</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{product.ingredients}</p>
                </CardContent>
              </Card>
            )}

            {/* Other Ingredients */}
            {product.other_ingredients && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Other Ingredients</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{product.other_ingredients}</p>
                </CardContent>
              </Card>
            )}

            {/* Allergen Info */}
            {product.allergen_info && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                    Allergen Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{product.allergen_info}</p>
                </CardContent>
              </Card>
            )}

            {/* Warnings */}
            {product.warnings && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    Warnings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{product.warnings}</p>
                </CardContent>
              </Card>
            )}

            {/* Directions */}
            {product.directions && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Directions</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{product.directions}</p>
                </CardContent>
              </Card>
            )}

            {!product.ingredients && !product.serving_size && !allNutrients && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No formula data available for this product.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
