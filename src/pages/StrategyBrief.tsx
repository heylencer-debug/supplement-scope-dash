import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { 
  FileText, Download, Printer, CheckCircle, AlertTriangle, Target, 
  TrendingUp, DollarSign, Users, Loader2, Lightbulb, Package, Beaker,
  Factory, ShieldCheck, Clock, Boxes, AlertCircle, FlaskConical, 
  Pill, Leaf, Heart, ShoppingBag, XCircle
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

interface ProductDevelopment {
  formulation?: {
    recommended_ingredients?: Array<{ name: string; dosage?: string; form?: string; rationale?: string }> | string[];
    key_features?: string[];
    serving_size?: string;
    form_factor?: string;
  };
  avoid?: string[];
  packaging?: {
    type?: string;
    design_elements?: string[];
    quantity?: string | number;
  };
  pricing?: {
    recommended_price?: number;
    positioning?: string;
    justification?: string;
  };
}

interface CustomerInsights {
  buyer_profile?: string;
  what_they_love_most?: string;
  primary_pain_points?: Array<{ issue: string; evidence?: string; frequency?: string }> | string[];
  unmet_needs?: string[];
}

interface FormulaBriefContent {
  formula_brief_content?: string;
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

  // Parse analysis_1_category_scores for formulation data
  const { productDevelopment, customerInsights } = useMemo(() => {
    const analysis1 = analysis?.analysis_1_category_scores as Record<string, unknown> | null;
    return {
      productDevelopment: (analysis1?.product_development as ProductDevelopment) || null,
      customerInsights: (analysis1?.customer_insights as CustomerInsights) || null,
    };
  }, [analysis]);

  // Parse analysis_3_formula_brief for full manufacturing spec
  const formulaBriefContent = useMemo(() => {
    const analysis3 = analysis?.analysis_3_formula_brief as FormulaBriefContent | null;
    return analysis3?.formula_brief_content || null;
  }, [analysis]);

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

  const topStrengths = toArray(analysis?.top_strengths);
  const topWeaknesses = toArray(analysis?.top_weaknesses);

  const analysisMetrics = {
    category: analysis?.category_name ?? categoryName ?? "No Analysis Available",
    date: analysis?.created_at
      ? new Date(analysis.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : "N/A",
    opportunityIndex: analysis?.opportunity_index ?? 0,
    opportunityTier: analysis?.opportunity_tier_label ?? analysis?.opportunity_tier ?? "N/A",
    recommendation: analysis?.recommendation ?? "No recommendation available",
    confidence: analysis?.confidence ?? "N/A",
  };

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
            <Beaker className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">Formulation Strategy Brief</h1>
            {analysis.confidence && (
              <Badge variant="outline">{analysis.confidence} confidence</Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            Product development specifications and formulation recommendations for {analysisMetrics.category}
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

      {/* Executive Summary - Simplified for Formulation Focus */}
      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle>Formulation Recommendation</CardTitle>
          <CardDescription>Analysis completed on {analysisMetrics.date}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-primary/10 rounded-lg">
              <p className="text-2xl font-bold text-primary">{Math.round(analysisMetrics.opportunityIndex)}</p>
              <p className="text-xs text-muted-foreground">Opportunity Index</p>
            </div>
            <div className="text-center p-4 bg-secondary rounded-lg">
              <p className="text-lg font-bold text-foreground">{analysisMetrics.opportunityTier}</p>
              <p className="text-xs text-muted-foreground">Opportunity Tier</p>
            </div>
            <div className="text-center p-4 bg-secondary rounded-lg">
              <p className="text-lg font-bold text-foreground">
                ${analysis.recommended_price ? Number(analysis.recommended_price).toFixed(2) : "N/A"}
              </p>
              <p className="text-xs text-muted-foreground">Target Price</p>
            </div>
            <div className="text-center p-4 bg-secondary rounded-lg">
              <p className="text-lg font-bold text-foreground">
                {analysis.estimated_profit_margin ? `${Number(analysis.estimated_profit_margin).toFixed(0)}%` : "N/A"}
              </p>
              <p className="text-xs text-muted-foreground">Est. Margin</p>
            </div>
          </div>
          <div className="p-4 bg-secondary/50 rounded-lg">
            <p className="text-sm font-medium text-foreground mb-1">Recommendation</p>
            <p className="text-sm text-muted-foreground">{analysisMetrics.recommendation}</p>
          </div>
        </CardContent>
      </Card>

      {/* Target Buyer Profile - NEW */}
      {customerInsights && (
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-500" />
              Target Buyer Profile
            </CardTitle>
            <CardDescription>Customer insights to guide product development</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {customerInsights.buyer_profile && (
              <div className="p-4 bg-background rounded-lg border">
                <p className="text-sm font-medium text-foreground mb-1">Ideal Customer</p>
                <p className="text-sm text-muted-foreground">{customerInsights.buyer_profile}</p>
              </div>
            )}

            {customerInsights.what_they_love_most && (
              <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                <p className="text-sm font-medium text-foreground mb-1 flex items-center gap-2">
                  <Heart className="w-4 h-4 text-green-500" />
                  What They Love Most
                </p>
                <p className="text-sm text-muted-foreground">{customerInsights.what_they_love_most}</p>
              </div>
            )}

            {/* Primary Pain Points */}
            {customerInsights.primary_pain_points && customerInsights.primary_pain_points.length > 0 && (
              <div>
                <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  Primary Pain Points to Solve
                </p>
                <div className="space-y-2">
                  {customerInsights.primary_pain_points.map((pain, idx) => (
                    <div key={idx} className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                      {typeof pain === "string" ? (
                        <p className="text-sm text-muted-foreground">{pain}</p>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-foreground">{pain.issue}</p>
                          {pain.evidence && <p className="text-xs text-muted-foreground mt-1">{pain.evidence}</p>}
                          {pain.frequency && (
                            <Badge variant="outline" className="mt-2 text-xs">{pain.frequency}</Badge>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unmet Needs */}
            {customerInsights.unmet_needs && customerInsights.unmet_needs.length > 0 && (
              <div>
                <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-primary" />
                  Unmet Needs (Opportunities)
                </p>
                <div className="grid md:grid-cols-2 gap-2">
                  {customerInsights.unmet_needs.map((need, idx) => (
                    <div key={idx} className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                      <p className="text-sm text-muted-foreground">{need}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Product Development Specification - NEW */}
      {productDevelopment && (
        <Card className="border-blue-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-blue-500" />
              Product Development Specification
            </CardTitle>
            <CardDescription>Formulation and product design recommendations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Form Factor & Serving */}
            {productDevelopment.formulation && (
              <div className="grid md:grid-cols-2 gap-4">
                {productDevelopment.formulation.form_factor && (
                  <div className="p-4 bg-secondary rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Recommended Form Factor</p>
                    <p className="text-lg font-bold text-foreground">{productDevelopment.formulation.form_factor}</p>
                  </div>
                )}
                {productDevelopment.formulation.serving_size && (
                  <div className="p-4 bg-secondary rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Serving Size</p>
                    <p className="text-lg font-bold text-foreground">{productDevelopment.formulation.serving_size}</p>
                  </div>
                )}
              </div>
            )}

            {/* Key Features */}
            {productDevelopment.formulation?.key_features && productDevelopment.formulation.key_features.length > 0 && (
              <div>
                <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Key Features to Include
                </p>
                <div className="flex flex-wrap gap-2">
                  {productDevelopment.formulation.key_features.map((feature, idx) => (
                    <Badge key={idx} variant="secondary" className="text-sm py-1 px-3">{feature}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Things to Avoid */}
            {productDevelopment.avoid && productDevelopment.avoid.length > 0 && (
              <div>
                <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-destructive" />
                  Things to AVOID
                </p>
                <div className="flex flex-wrap gap-2">
                  {productDevelopment.avoid.map((item, idx) => (
                    <Badge key={idx} variant="outline" className="text-sm py-1 px-3 border-destructive/50 text-destructive">{item}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recommended Ingredients - NEW */}
      {productDevelopment?.formulation?.recommended_ingredients && productDevelopment.formulation.recommended_ingredients.length > 0 && (
        <Card className="border-green-500/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pill className="w-5 h-5 text-green-500" />
              Recommended Ingredients
            </CardTitle>
            <CardDescription>Formulation ingredients based on market analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {productDevelopment.formulation.recommended_ingredients.map((ingredient, idx) => (
                <div key={idx} className="p-4 border rounded-lg">
                  {typeof ingredient === "string" ? (
                    <p className="text-sm font-medium text-foreground">{ingredient}</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-foreground">{ingredient.name}</p>
                        {ingredient.dosage && (
                          <Badge variant="secondary">{ingredient.dosage}</Badge>
                        )}
                      </div>
                      {ingredient.form && (
                        <p className="text-xs text-muted-foreground">Form: {ingredient.form}</p>
                      )}
                      {ingredient.rationale && (
                        <p className="text-sm text-muted-foreground">{ingredient.rationale}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Packaging Specification - NEW */}
      {productDevelopment?.packaging && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Packaging Specification
            </CardTitle>
            <CardDescription>Recommended packaging design and elements</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {productDevelopment.packaging.type && (
                <div className="p-4 bg-secondary rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Package Type</p>
                  <p className="text-lg font-bold text-foreground">{productDevelopment.packaging.type}</p>
                </div>
              )}
              {productDevelopment.packaging.quantity && (
                <div className="p-4 bg-secondary rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Quantity</p>
                  <p className="text-lg font-bold text-foreground">{productDevelopment.packaging.quantity}</p>
                </div>
              )}
            </div>
            {productDevelopment.packaging.design_elements && productDevelopment.packaging.design_elements.length > 0 && (
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Design Elements</p>
                <div className="flex flex-wrap gap-2">
                  {productDevelopment.packaging.design_elements.map((element, idx) => (
                    <Badge key={idx} variant="outline">{element}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pricing Strategy - NEW */}
      {productDevelopment?.pricing && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              Pricing Strategy
            </CardTitle>
            <CardDescription>Recommended pricing and market positioning</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {productDevelopment.pricing.recommended_price && (
                <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                  <p className="text-xs text-muted-foreground mb-1">Recommended Price</p>
                  <p className="text-2xl font-bold text-green-600">${productDevelopment.pricing.recommended_price.toFixed(2)}</p>
                </div>
              )}
              {productDevelopment.pricing.positioning && (
                <div className="p-4 bg-secondary rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Market Positioning</p>
                  <p className="text-lg font-bold text-foreground capitalize">{productDevelopment.pricing.positioning}</p>
                </div>
              )}
            </div>
            {productDevelopment.pricing.justification && (
              <p className="text-sm text-muted-foreground">{productDevelopment.pricing.justification}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Strengths & Weaknesses - Keep for formulation context */}
      <div className="grid md:grid-cols-2 gap-6">
        {topStrengths.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                Market Strengths to Leverage
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
                Gaps to Exploit
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

      {/* Formula Brief from formula_briefs table */}
      {formulaBrief && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Beaker className="w-5 h-5 text-primary" />
              Manufacturing Specification
            </CardTitle>
            <CardDescription>Detailed product development specifications</CardDescription>
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
          </CardContent>
        </Card>
      )}

      {/* Full Manufacturing Document - NEW */}
      {formulaBriefContent && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Full Manufacturing Document
            </CardTitle>
            <CardDescription>Complete formula brief specification document</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <pre className="whitespace-pre-wrap text-sm text-muted-foreground bg-secondary/50 p-4 rounded-lg overflow-auto">
                {formulaBriefContent}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
