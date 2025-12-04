import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadialGauge } from "@/components/ui/radial-gauge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  Target, Users, TrendingUp, FileText, Lightbulb, AlertTriangle,
  CheckCircle2, XCircle, Megaphone, ChevronDown, ChevronRight,
  Zap, Copy, Eye, Shield, MessageSquare, BarChart3, Activity,
  Crosshair, Layout, Rocket, ClipboardList
} from "lucide-react";

interface ProductAnalysisPanelProps {
  marketingAnalysis: any;
  reviewAnalysis: any;
  imageUrls?: string[];
}

// Score Gauge Component
function ScoreGauge({ score, label, max = 10 }: { score: number; label: string; max?: number }) {
  const percentage = (score / max) * 100;
  const colorClass = score >= 7 ? "bg-green-500" : score >= 4 ? "bg-amber-500" : "bg-red-500";
  const textColor = score >= 7 ? "text-green-600" : score >= 4 ? "text-amber-600" : "text-red-600";
  
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 space-y-1">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className={`font-semibold ${textColor}`}>{score}/{max}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className={`h-full ${colorClass} transition-all`} style={{ width: `${percentage}%` }} />
        </div>
      </div>
    </div>
  );
}

// Insight Card Component
function InsightCard({ insight, index }: { insight: string; index: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const isLong = insight.length > 100;
  const displayText = isLong && !isOpen ? insight.slice(0, 100) + "..." : insight;
  
  // Detect insight type for icon/color
  const isGap = insight.toLowerCase().includes("gap") || insight.toLowerCase().includes("missing");
  const isOpportunity = insight.toLowerCase().includes("opportunity") || insight.toLowerCase().includes("should");
  const isStrength = insight.toLowerCase().includes("exceptional") || insight.toLowerCase().includes("strong");
  
  const borderColor = isGap ? "border-l-amber-500" : isStrength ? "border-l-green-500" : "border-l-primary";
  const bgColor = isGap ? "bg-amber-500/5" : isStrength ? "bg-green-500/5" : "bg-primary/5";
  
  return (
    <Card className={`border-l-4 ${borderColor} ${bgColor}`}>
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <Lightbulb className={`w-4 h-4 mt-0.5 shrink-0 ${isGap ? "text-amber-600" : isStrength ? "text-green-600" : "text-primary"}`} />
          <div className="flex-1">
            <p className="text-sm leading-relaxed">{displayText}</p>
            {isLong && (
              <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="text-xs text-primary hover:underline mt-1"
              >
                {isOpen ? "Show less" : "Read more"}
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Issue Item Component
function IssueItem({ issue, variant = "warning" }: { issue: string; variant?: "warning" | "success" }) {
  const Icon = variant === "warning" ? XCircle : CheckCircle2;
  const colorClass = variant === "warning" ? "text-red-600" : "text-green-600";
  const bgClass = variant === "warning" ? "bg-red-500/5" : "bg-green-500/5";
  
  return (
    <div className={`flex items-start gap-2 p-2 rounded-md ${bgClass}`}>
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${colorClass}`} />
      <p className="text-sm">{issue}</p>
    </div>
  );
}

// Optimization Item Component
function OptimizationItem({ item, index }: { item: string; index: number }) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Parse category from string (e.g., "TITLE:", "BULLET 1:")
  const categoryMatch = item.match(/^([A-Z\s\d]+):/);
  const category = categoryMatch ? categoryMatch[1].trim() : "General";
  const content = categoryMatch ? item.slice(categoryMatch[0].length).trim() : item;
  
  // Color coding by category
  const categoryColors: Record<string, string> = {
    "TITLE": "bg-purple-500/10 text-purple-600 border-purple-500/30",
    "BULLET": "bg-blue-500/10 text-blue-600 border-blue-500/30",
    "Add": "bg-green-500/10 text-green-600 border-green-500/30",
    "Include": "bg-amber-500/10 text-amber-600 border-amber-500/30",
    "Create": "bg-cyan-500/10 text-cyan-600 border-cyan-500/30",
  };
  
  const getCategoryColor = () => {
    for (const [key, color] of Object.entries(categoryColors)) {
      if (category.includes(key)) return color;
    }
    return "bg-muted text-muted-foreground";
  };
  
  const isLong = content.length > 150;
  const displayContent = isLong && !isOpen ? content.slice(0, 150) + "..." : content;
  
  return (
    <Card className="border-l-4 border-l-primary/50">
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <Badge variant="outline" className={`text-xs shrink-0 ${getCategoryColor()}`}>
            {category}
          </Badge>
          <div className="flex-1">
            <p className="text-sm">{displayContent}</p>
            {isLong && (
              <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="text-xs text-primary hover:underline mt-1"
              >
                {isOpen ? "Show less" : "Read more"}
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProductAnalysisPanel({ 
  marketingAnalysis, 
  reviewAnalysis,
  imageUrls 
}: ProductAnalysisPanelProps) {
  if (!marketingAnalysis && !reviewAnalysis) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No analysis available for this product yet.</p>
      </div>
    );
  }

  const ma = marketingAnalysis || {};

  // Parse overall_marketing_score - handle both object and string formats
  let overallScoreData = ma.overall_marketing_score || {};
  if (typeof overallScoreData === 'string') {
    try {
      overallScoreData = JSON.parse(overallScoreData);
    } catch (e) {
      overallScoreData = {};
    }
  }
  
  // Also check details.score_card as alternate location
  const details = ma.details || {};
  const scoreCard = ma.score_card || details.score_card || {};
  
  // Merge scores from multiple possible sources
  const grade = overallScoreData.grade || scoreCard.overall_grade || "N/A";
  const score = Number(overallScoreData.overall_score) || Number(scoreCard.overall_score) || 0;
  const summary = overallScoreData.summary || scoreCard.summary_text || "";
  const copyScore = Number(overallScoreData.copy_score) || Number(details.copy_analysis?.clarity) || 0;
  const trustScore = Number(overallScoreData.trust_score) || 0;
  const positioningScore = Number(overallScoreData.positioning_score) || 0;
  const audienceTargetingScore = Number(overallScoreData.audience_targeting_score) || 0;
  const messageConsistencyScore = Number(overallScoreData.message_consistency_score) || 0;
  
  // Key Insights (array of strings)
  const keyInsights = Array.isArray(ma.key_insights) ? ma.key_insights : [];
  
  // Copy Effectiveness - check multiple locations
  const copyEffectiveness = ma.copy_effectiveness || {};
  const titleAnalysis = copyEffectiveness.title_analysis || {};
  const bulletAnalysis = copyEffectiveness.bullet_analysis || {};
  
  // Also get copy analysis from details
  const detailsCopyAnalysis = details.copy_analysis || {};
  const copyHooks = detailsCopyAnalysis.hooks || [];
  
  // Target Demographics
  const targetDemographics = ma.target_demographics || {};
  
  // Positioning Strategy
  const positioningStrategy = ma.positioning_strategy || {};
  
  // Lifestyle Positioning
  const lifestylePositioning = ma.lifestyle_positioning || {};
  
  // Messaging Analysis
  const messagingAnalysis = ma.messaging_analysis || {};
  const keyClaims = messagingAnalysis.key_claims_shown || [];
  
  // Optimization Opportunities (array of strings) - filter out corrupted data
  const rawOpportunities = ma.optimization_opportunities || [];
  const optimizationOpportunities = Array.isArray(rawOpportunities) 
    ? rawOpportunities.filter((item: any) => typeof item === 'string')
    : [];
  
  // Competitive Positioning
  const competitivePositioning = typeof ma.competitive_positioning === 'string' 
    ? ma.competitive_positioning 
    : "";
  
  // Customer Sentiment from details
  const customerSentiment = details.customer_sentiment || {};
  
  // Check if we have any meaningful data to show
  const hasScoreData = grade !== "N/A" || score > 0 || copyScore > 0;
  const hasInsights = keyInsights.length > 0;
  const hasCopyData = Object.keys(titleAnalysis).length > 0 || Object.keys(bulletAnalysis).length > 0 || copyHooks.length > 0;
  const hasStrategyData = Object.keys(targetDemographics).length > 0 || Object.keys(positioningStrategy).length > 0 || competitivePositioning;
  const hasActions = optimizationOpportunities.length > 0;
  const hasAnyData = hasScoreData || hasInsights || hasCopyData || hasStrategyData || hasActions;

  // Grade color mapping
  const getGradeColor = (g: string) => {
    if (g === "A" || g === "A+") return "bg-green-500 text-white";
    if (g === "B" || g === "B+") return "bg-blue-500 text-white";
    if (g === "C" || g === "C+") return "bg-amber-500 text-white";
    if (g === "D") return "bg-orange-500 text-white";
    return "bg-red-500 text-white";
  };
  
  // If no meaningful data, show a message
  if (!hasAnyData) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Marketing analysis data is still being processed for this product.</p>
        <p className="text-xs mt-1">Check back later for detailed insights.</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-muted/30 border-t">
      <Tabs defaultValue="scorecard" className="w-full">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl mb-4">
          <TabsTrigger value="scorecard" className="text-xs gap-1">
            <BarChart3 className="w-3 h-3" /> Scorecard
          </TabsTrigger>
          <TabsTrigger value="insights" className="text-xs gap-1">
            <Lightbulb className="w-3 h-3" /> Insights
          </TabsTrigger>
          <TabsTrigger value="copy" className="text-xs gap-1">
            <Copy className="w-3 h-3" /> Copy Audit
          </TabsTrigger>
          <TabsTrigger value="strategy" className="text-xs gap-1">
            <Target className="w-3 h-3" /> Strategy
          </TabsTrigger>
          <TabsTrigger value="actions" className="text-xs gap-1">
            <Rocket className="w-3 h-3" /> Actions
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: SCORECARD */}
        <TabsContent value="scorecard" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Main Grade & Score */}
            <Card className="lg:col-span-1">
              <CardContent className="pt-6 flex flex-col items-center">
                <div className="relative">
                  <RadialGauge 
                    value={score} 
                    max={10} 
                    size={140}
                    strokeWidth={12}
                    showValue={true}
                  />
                  <Badge className={`absolute -top-2 -right-2 text-lg px-3 py-1 ${getGradeColor(grade)}`}>
                    {grade}
                  </Badge>
                </div>
                <p className="mt-4 text-sm text-center text-muted-foreground max-w-xs leading-relaxed">
                  {summary}
                </p>
              </CardContent>
            </Card>

            {/* Score Breakdown - 6 metrics */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Performance Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <ScoreGauge score={copyScore} label="Copy Quality" />
                    <ScoreGauge score={trustScore} label="Trust Signals" />
                    <ScoreGauge score={positioningScore} label="Positioning" />
                  </div>
                  <div className="space-y-4">
                    <ScoreGauge score={audienceTargetingScore} label="Audience Targeting" />
                    <ScoreGauge score={messageConsistencyScore} label="Message Consistency" />
                    <ScoreGauge score={score} label="Overall Score" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Competitive Positioning Summary */}
          {competitivePositioning && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Crosshair className="w-4 h-4" />
                  Competitive Positioning
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">{competitivePositioning}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB 2: KEY INSIGHTS */}
        <TabsContent value="insights" className="mt-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                Strategic Insights ({keyInsights.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {keyInsights.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {keyInsights.map((insight: string, i: number) => (
                    <InsightCard key={i} insight={insight} index={i} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No insights available
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: COPY AUDIT */}
        <TabsContent value="copy" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Title Analysis */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layout className="w-4 h-4" />
                    Title Analysis
                  </div>
                  <Badge 
                    variant="outline" 
                    className={titleAnalysis.clarity_score >= 7 
                      ? "bg-green-500/10 text-green-600 border-green-500/30" 
                      : titleAnalysis.clarity_score >= 4 
                        ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                        : "bg-red-500/10 text-red-600 border-red-500/30"
                    }
                  >
                    Clarity: {titleAnalysis.clarity_score ?? 0}/10
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {titleAnalysis.issues && titleAnalysis.issues.length > 0 ? (
                  titleAnalysis.issues.map((issue: string, i: number) => (
                    <IssueItem key={i} issue={issue} variant="warning" />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No title issues identified
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Bullet Analysis */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4" />
                    Bullet Points Analysis
                  </div>
                  <Badge 
                    variant="outline" 
                    className={bulletAnalysis.benefit_focused 
                      ? "bg-green-500/10 text-green-600 border-green-500/30" 
                      : "bg-red-500/10 text-red-600 border-red-500/30"
                    }
                  >
                    {bulletAnalysis.benefit_focused ? "Benefit Focused ✓" : "Not Benefit Focused ✗"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {/* Strengths */}
                  {bulletAnalysis.strengths && bulletAnalysis.strengths.length > 0 && (
                    <AccordionItem value="strengths">
                      <AccordionTrigger className="text-sm py-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          Strengths ({bulletAnalysis.strengths.length})
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-2">
                        {bulletAnalysis.strengths.map((s: string, i: number) => (
                          <IssueItem key={i} issue={s} variant="success" />
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  )}
                  
                  {/* Weaknesses */}
                  {bulletAnalysis.weaknesses && bulletAnalysis.weaknesses.length > 0 && (
                    <AccordionItem value="weaknesses">
                      <AccordionTrigger className="text-sm py-2">
                        <div className="flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-red-600" />
                          Weaknesses ({bulletAnalysis.weaknesses.length})
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-2">
                        {bulletAnalysis.weaknesses.map((w: string, i: number) => (
                          <IssueItem key={i} issue={w} variant="warning" />
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
              </CardContent>
            </Card>
          </div>
          
          {/* Copy Hooks from details.copy_analysis */}
          {copyHooks.length > 0 && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-amber-500" />
                  Copy Hooks ({copyHooks.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {copyHooks.map((hook: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-amber-500/5 rounded-md">
                      <Zap className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-sm">{hook}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Key Claims Shown */}
          {keyClaims.length > 0 && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Megaphone className="w-4 h-4" />
                  Key Claims Shown ({keyClaims.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {keyClaims.map((claim: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      <CheckCircle2 className="w-3 h-3 mr-1 text-green-600" />
                      {claim}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Customer Sentiment */}
          {(customerSentiment.primary_praises?.length > 0 || customerSentiment.primary_complaints?.length > 0) && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Customer Sentiment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {customerSentiment.primary_praises?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">What Customers Love</p>
                    <div className="flex flex-wrap gap-2">
                      {customerSentiment.primary_praises.map((praise: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
                          {praise}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {customerSentiment.primary_complaints?.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Common Complaints</p>
                    <div className="flex flex-wrap gap-2">
                      {customerSentiment.primary_complaints.map((complaint: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs bg-red-500/10 text-red-600 border-red-500/30">
                          {complaint}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {customerSentiment.gap_analysis && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Gap Analysis</p>
                    <p className="text-sm">{customerSentiment.gap_analysis}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB 4: STRATEGY */}
        <TabsContent value="strategy" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Target Audience */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Target Demographics
                  </div>
                  {targetDemographics.relatability_score && (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                      Relatability: {targetDemographics.relatability_score}/10
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {targetDemographics.primary_audience ? (
                  <p className="text-sm leading-relaxed">{targetDemographics.primary_audience}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No target audience data</p>
                )}
              </CardContent>
            </Card>

            {/* Lifestyle Positioning */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Lifestyle Positioning
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {lifestylePositioning.primary_lifestyle && (
                  <p className="text-sm leading-relaxed">{lifestylePositioning.primary_lifestyle}</p>
                )}
                {lifestylePositioning.activities_shown && lifestylePositioning.activities_shown.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Activities Shown:</p>
                    <div className="flex flex-wrap gap-1">
                      {lifestylePositioning.activities_shown.map((activity: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">{activity}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Value Proposition */}
          {positioningStrategy.value_proposition && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  Value Proposition
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">{positioningStrategy.value_proposition}</p>
              </CardContent>
            </Card>
          )}

          {/* Target Audience (from positioning strategy) */}
          {positioningStrategy.target_audience && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Ideal Customer Profile
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">{positioningStrategy.target_audience}</p>
              </CardContent>
            </Card>
          )}

          {/* Bundle Strategy */}
          {positioningStrategy.suggested_bundle_strategy && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Suggested Bundle Strategy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">{positioningStrategy.suggested_bundle_strategy}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB 5: OPTIMIZATION ACTIONS */}
        <TabsContent value="actions" className="mt-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Rocket className="w-4 h-4 text-primary" />
                Optimization Opportunities ({optimizationOpportunities.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {optimizationOpportunities.length > 0 ? (
                <div className="space-y-3">
                  {optimizationOpportunities.map((item: string, i: number) => (
                    <OptimizationItem key={i} item={item} index={i} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No optimization opportunities identified
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
