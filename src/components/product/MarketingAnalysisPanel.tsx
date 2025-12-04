import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Target, Users, TrendingUp, FileText, Lightbulb, AlertTriangle,
  CheckCircle2, XCircle, Star, Quote, Megaphone, ShieldCheck
} from "lucide-react";

interface OverallMarketingScore {
  grade?: string;
  summary?: string;
  copy_score?: number;
  trust_score?: number;
  overall_score?: number;
  positioning_score?: number;
  audience_targeting_score?: number;
  message_consistency_score?: number;
}

interface MarketingAnalysis {
  key_insights?: string[];
  overall_marketing_score?: OverallMarketingScore | number;
  target_demographics?: {
    primary_audience?: string;
    age_range_appeal?: string;
    gender_skew?: string;
    lifestyle_indicators?: string[];
    health_focus_level?: string;
    price_sensitivity?: string;
    relatability_score?: number;
  };
  competitive_analysis?: {
    unique_selling_points?: string[];
    weaknesses_vs_competitors?: string[];
    parity_features?: string[];
    differentiation_level?: string;
    competitive_position?: string;
  };
  copy_effectiveness?: {
    title_analysis?: {
      score?: number;
      strengths?: string[];
      weaknesses?: string[];
      keyword_usage?: string;
    };
    bullet_analysis?: {
      score?: number;
      strengths?: string[];
      weaknesses?: string[];
      benefit_focus?: string;
    };
    description_analysis?: {
      score?: number;
      strengths?: string[];
      weaknesses?: string[];
      storytelling_quality?: string;
    };
    overall_copy_score?: number;
  };
  lifestyle_positioning?: {
    primary_lifestyle?: string;
    secondary_lifestyles?: string[];
    emotional_triggers?: string[];
    aspirational_elements?: string[];
    usage_occasions?: string[];
  };
  trust_signals?: {
    certifications_mentioned?: string[];
    social_proof_elements?: string[];
    authority_indicators?: string[];
    trust_score?: number;
  };
  optimization_opportunities?: Array<{
    area?: string;
    priority?: string;
    suggestion?: string;
    expected_impact?: string;
  }>;
  visual_marketing?: {
    image_quality_assessment?: string;
    lifestyle_imagery_score?: number;
    product_presentation?: string;
    infographic_usage?: string;
  };
  price_positioning?: {
    perceived_value?: string;
    price_justification?: string;
    value_communication?: string;
  };
}

interface MarketingAnalysisPanelProps {
  marketingAnalysis: MarketingAnalysis | null;
}

function ScoreGauge({ score, label, max = 10 }: { score: number; label: string; max?: number }) {
  const percentage = (score / max) * 100;
  const color = score >= 7 ? "bg-green-500" : score >= 5 ? "bg-yellow-500" : "bg-red-500";
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{score}/{max}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function InsightBadge({ text, variant = "default" }: { text: string; variant?: "default" | "success" | "warning" | "destructive" }) {
  const variantClasses = {
    default: "bg-muted text-muted-foreground",
    success: "bg-green-500/10 text-green-600 border-green-500/30",
    warning: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
    destructive: "bg-red-500/10 text-red-600 border-red-500/30",
  };
  
  return (
    <Badge variant="outline" className={variantClasses[variant]}>
      {text}
    </Badge>
  );
}

export default function MarketingAnalysisPanel({ marketingAnalysis }: MarketingAnalysisPanelProps) {
  if (!marketingAnalysis) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No marketing analysis available for this product yet.</p>
      </div>
    );
  }

  const ma = marketingAnalysis;

  return (
    <div className="p-4 bg-muted/30 border-t">
      <Tabs defaultValue="scores" className="w-full">
        <TabsList className="grid grid-cols-6 w-full max-w-3xl">
          <TabsTrigger value="scores" className="text-xs">Scores</TabsTrigger>
          <TabsTrigger value="audience" className="text-xs">Audience</TabsTrigger>
          <TabsTrigger value="competitive" className="text-xs">Competitive</TabsTrigger>
          <TabsTrigger value="copy" className="text-xs">Copy</TabsTrigger>
          <TabsTrigger value="insights" className="text-xs">Insights</TabsTrigger>
          <TabsTrigger value="actions" className="text-xs">Actions</TabsTrigger>
        </TabsList>

        {/* Scores Tab */}
        <TabsContent value="scores" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Overall Marketing Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const score = typeof ma.overall_marketing_score === 'object' 
                    ? ma.overall_marketing_score?.overall_score 
                    : ma.overall_marketing_score;
                  return (
                    <>
                      <div className="text-3xl font-bold text-center mb-2">
                        {score ?? "-"}
                        <span className="text-lg text-muted-foreground">/100</span>
                      </div>
                      <Progress value={score ?? 0} className="h-2" />
                      {typeof ma.overall_marketing_score === 'object' && ma.overall_marketing_score?.grade && (
                        <div className="text-center mt-2">
                          <Badge variant="outline">{ma.overall_marketing_score.grade}</Badge>
                        </div>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Copy Scores
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ScoreGauge score={ma.copy_effectiveness?.title_analysis?.score ?? 0} label="Title" />
                <ScoreGauge score={ma.copy_effectiveness?.bullet_analysis?.score ?? 0} label="Bullets" />
                <ScoreGauge score={ma.copy_effectiveness?.description_analysis?.score ?? 0} label="Description" />
                <ScoreGauge score={ma.copy_effectiveness?.overall_copy_score ?? 0} label="Overall Copy" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  Trust & Visual
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ScoreGauge score={ma.trust_signals?.trust_score ?? 0} label="Trust Score" />
                <ScoreGauge score={ma.target_demographics?.relatability_score ?? 0} label="Relatability" />
                <ScoreGauge score={ma.visual_marketing?.lifestyle_imagery_score ?? 0} label="Visual Marketing" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Audience Tab */}
        <TabsContent value="audience" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Target Demographics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <span className="text-xs text-muted-foreground">Primary Audience</span>
                  <p className="text-sm font-medium">{ma.target_demographics?.primary_audience ?? "-"}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Age Range</span>
                    <p className="text-sm">{ma.target_demographics?.age_range_appeal ?? "-"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Gender Skew</span>
                    <p className="text-sm">{ma.target_demographics?.gender_skew ?? "-"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Health Focus</span>
                    <p className="text-sm">{ma.target_demographics?.health_focus_level ?? "-"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Price Sensitivity</span>
                    <p className="text-sm">{ma.target_demographics?.price_sensitivity ?? "-"}</p>
                  </div>
                </div>
                {ma.target_demographics?.lifestyle_indicators && ma.target_demographics.lifestyle_indicators.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Lifestyle Indicators</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ma.target_demographics.lifestyle_indicators.map((ind, i) => (
                        <InsightBadge key={i} text={ind} />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Megaphone className="w-4 h-4" />
                  Lifestyle Positioning
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <span className="text-xs text-muted-foreground">Primary Lifestyle</span>
                  <p className="text-sm font-medium">{ma.lifestyle_positioning?.primary_lifestyle ?? "-"}</p>
                </div>
                {ma.lifestyle_positioning?.secondary_lifestyles && ma.lifestyle_positioning.secondary_lifestyles.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Secondary Lifestyles</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ma.lifestyle_positioning.secondary_lifestyles.map((ls, i) => (
                        <InsightBadge key={i} text={ls} />
                      ))}
                    </div>
                  </div>
                )}
                {ma.lifestyle_positioning?.emotional_triggers && ma.lifestyle_positioning.emotional_triggers.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Emotional Triggers</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ma.lifestyle_positioning.emotional_triggers.map((et, i) => (
                        <InsightBadge key={i} text={et} variant="warning" />
                      ))}
                    </div>
                  </div>
                )}
                {ma.lifestyle_positioning?.usage_occasions && ma.lifestyle_positioning.usage_occasions.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Usage Occasions</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ma.lifestyle_positioning.usage_occasions.map((uo, i) => (
                        <InsightBadge key={i} text={uo} />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Competitive Tab */}
        <TabsContent value="competitive" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Unique Selling Points
                </CardTitle>
              </CardHeader>
              <CardContent>
                {ma.competitive_analysis?.unique_selling_points && ma.competitive_analysis.unique_selling_points.length > 0 ? (
                  <ul className="space-y-2">
                    {ma.competitive_analysis.unique_selling_points.map((usp, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                        <span>{usp}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No USPs identified</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-500" />
                  Weaknesses vs Competitors
                </CardTitle>
              </CardHeader>
              <CardContent>
                {ma.competitive_analysis?.weaknesses_vs_competitors && ma.competitive_analysis.weaknesses_vs_competitors.length > 0 ? (
                  <ul className="space-y-2">
                    {ma.competitive_analysis.weaknesses_vs_competitors.map((weak, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                        <span>{weak}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No weaknesses identified</p>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Competitive Position</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground">Differentiation Level</span>
                  <p className="text-sm font-medium">{ma.competitive_analysis?.differentiation_level ?? "-"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Position</span>
                  <p className="text-sm font-medium">{ma.competitive_analysis?.competitive_position ?? "-"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Parity Features</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ma.competitive_analysis?.parity_features?.slice(0, 5).map((pf, i) => (
                      <InsightBadge key={i} text={pf} />
                    )) ?? <span className="text-sm text-muted-foreground">-</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Copy Tab */}
        <TabsContent value="copy" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Title Analysis */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Title Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ScoreGauge score={ma.copy_effectiveness?.title_analysis?.score ?? 0} label="Score" />
                <div>
                  <span className="text-xs text-muted-foreground">Keyword Usage</span>
                  <p className="text-sm">{ma.copy_effectiveness?.title_analysis?.keyword_usage ?? "-"}</p>
                </div>
                {ma.copy_effectiveness?.title_analysis?.strengths && ma.copy_effectiveness.title_analysis.strengths.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Strengths</span>
                    <ul className="mt-1 space-y-1">
                      {ma.copy_effectiveness.title_analysis.strengths.map((s, i) => (
                        <li key={i} className="text-xs text-green-600 flex items-start gap-1">
                          <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {ma.copy_effectiveness?.title_analysis?.weaknesses && ma.copy_effectiveness.title_analysis.weaknesses.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Weaknesses</span>
                    <ul className="mt-1 space-y-1">
                      {ma.copy_effectiveness.title_analysis.weaknesses.map((w, i) => (
                        <li key={i} className="text-xs text-red-600 flex items-start gap-1">
                          <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bullet Analysis */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Bullet Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ScoreGauge score={ma.copy_effectiveness?.bullet_analysis?.score ?? 0} label="Score" />
                <div>
                  <span className="text-xs text-muted-foreground">Benefit Focus</span>
                  <p className="text-sm">{ma.copy_effectiveness?.bullet_analysis?.benefit_focus ?? "-"}</p>
                </div>
                {ma.copy_effectiveness?.bullet_analysis?.strengths && ma.copy_effectiveness.bullet_analysis.strengths.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Strengths</span>
                    <ul className="mt-1 space-y-1">
                      {ma.copy_effectiveness.bullet_analysis.strengths.map((s, i) => (
                        <li key={i} className="text-xs text-green-600 flex items-start gap-1">
                          <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {ma.copy_effectiveness?.bullet_analysis?.weaknesses && ma.copy_effectiveness.bullet_analysis.weaknesses.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Weaknesses</span>
                    <ul className="mt-1 space-y-1">
                      {ma.copy_effectiveness.bullet_analysis.weaknesses.map((w, i) => (
                        <li key={i} className="text-xs text-red-600 flex items-start gap-1">
                          <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Description Analysis */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Description Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ScoreGauge score={ma.copy_effectiveness?.description_analysis?.score ?? 0} label="Score" />
                <div>
                  <span className="text-xs text-muted-foreground">Storytelling Quality</span>
                  <p className="text-sm">{ma.copy_effectiveness?.description_analysis?.storytelling_quality ?? "-"}</p>
                </div>
                {ma.copy_effectiveness?.description_analysis?.strengths && ma.copy_effectiveness.description_analysis.strengths.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Strengths</span>
                    <ul className="mt-1 space-y-1">
                      {ma.copy_effectiveness.description_analysis.strengths.map((s, i) => (
                        <li key={i} className="text-xs text-green-600 flex items-start gap-1">
                          <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {ma.copy_effectiveness?.description_analysis?.weaknesses && ma.copy_effectiveness.description_analysis.weaknesses.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Weaknesses</span>
                    <ul className="mt-1 space-y-1">
                      {ma.copy_effectiveness.description_analysis.weaknesses.map((w, i) => (
                        <li key={i} className="text-xs text-red-600 flex items-start gap-1">
                          <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Insights Tab */}
        <TabsContent value="insights" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-yellow-500" />
                  Key Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                {ma.key_insights && ma.key_insights.length > 0 ? (
                  <ul className="space-y-2">
                    {ma.key_insights.map((insight, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Lightbulb className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No key insights available</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  Trust Signals
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {ma.trust_signals?.certifications_mentioned && ma.trust_signals.certifications_mentioned.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Certifications</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ma.trust_signals.certifications_mentioned.map((cert, i) => (
                        <InsightBadge key={i} text={cert} variant="success" />
                      ))}
                    </div>
                  </div>
                )}
                {ma.trust_signals?.social_proof_elements && ma.trust_signals.social_proof_elements.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Social Proof</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ma.trust_signals.social_proof_elements.map((sp, i) => (
                        <InsightBadge key={i} text={sp} />
                      ))}
                    </div>
                  </div>
                )}
                {ma.trust_signals?.authority_indicators && ma.trust_signals.authority_indicators.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Authority Indicators</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {ma.trust_signals.authority_indicators.map((ai, i) => (
                        <InsightBadge key={i} text={ai} />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Visual & Price Positioning</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Image Quality</span>
                    <p className="text-sm">{ma.visual_marketing?.image_quality_assessment ?? "-"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Product Presentation</span>
                    <p className="text-sm">{ma.visual_marketing?.product_presentation ?? "-"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Infographic Usage</span>
                    <p className="text-sm">{ma.visual_marketing?.infographic_usage ?? "-"}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-muted-foreground">Perceived Value</span>
                    <p className="text-sm">{ma.price_positioning?.perceived_value ?? "-"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Price Justification</span>
                    <p className="text-sm">{ma.price_positioning?.price_justification ?? "-"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Value Communication</span>
                    <p className="text-sm">{ma.price_positioning?.value_communication ?? "-"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Actions Tab */}
        <TabsContent value="actions" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Optimization Opportunities
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ma.optimization_opportunities && ma.optimization_opportunities.length > 0 ? (
                <div className="space-y-3">
                  {ma.optimization_opportunities.map((opp, i) => (
                    <div key={i} className="p-3 bg-muted/50 rounded-lg border">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge 
                          variant="outline" 
                          className={
                            opp.priority === "High" 
                              ? "bg-red-500/10 text-red-600 border-red-500/30" 
                              : opp.priority === "Medium"
                                ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                                : "bg-green-500/10 text-green-600 border-green-500/30"
                          }
                        >
                          {opp.priority ?? "Medium"} Priority
                        </Badge>
                        <span className="text-sm font-medium">{opp.area ?? "General"}</span>
                      </div>
                      <p className="text-sm mb-2">{opp.suggestion ?? "-"}</p>
                      <div className="text-xs text-muted-foreground">
                        Expected Impact: <span className="text-foreground">{opp.expected_impact ?? "-"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No optimization opportunities identified</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
