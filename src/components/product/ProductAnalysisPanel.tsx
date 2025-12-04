import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  Target, Users, TrendingUp, Lightbulb, AlertTriangle,
  CheckCircle2, XCircle, ChevronDown, Copy, Shield, 
  MessageSquare, Crosshair, Sparkles, Megaphone, Award,
  Zap, Eye, FileText, Package, Clock, MapPin, Star
} from "lucide-react";

interface ProductAnalysisPanelProps {
  marketingAnalysis: any;
  reviewAnalysis: any;
  imageUrls?: string[];
}

// Insight Card Component with type detection
function InsightCard({ insight, index }: { insight: string; index: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const isLong = insight.length > 150;
  const displayText = isLong && !isOpen ? insight.slice(0, 150) + "..." : insight;
  
  const isGap = insight.toLowerCase().includes("gap") || insight.toLowerCase().includes("missing") || insight.toLowerCase().includes("lacks");
  const isOpportunity = insight.toLowerCase().includes("opportunity") || insight.toLowerCase().includes("should") || insight.toLowerCase().includes("could");
  const isStrength = insight.toLowerCase().includes("exceptional") || insight.toLowerCase().includes("strong") || insight.toLowerCase().includes("effective");
  
  const borderColor = isGap ? "border-l-amber-500" : isStrength ? "border-l-green-500" : "border-l-primary";
  const bgColor = isGap ? "bg-amber-500/5" : isStrength ? "bg-green-500/5" : "bg-primary/5";
  const Icon = isGap ? AlertTriangle : isStrength ? CheckCircle2 : Lightbulb;
  const iconColor = isGap ? "text-amber-600" : isStrength ? "text-green-600" : "text-primary";
  
  return (
    <Card className={`border-l-4 ${borderColor} ${bgColor}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${iconColor}`} />
          <div className="flex-1">
            <p className="text-sm leading-relaxed">{displayText}</p>
            {isLong && (
              <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="text-xs text-primary hover:underline mt-2"
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

// Badge List Component
function BadgeList({ items, variant = "default" }: { items: string[]; variant?: "success" | "warning" | "info" | "default" }) {
  if (!items?.length) return null;
  
  const colorMap = {
    success: "bg-green-500/10 text-green-700 border-green-500/30",
    warning: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    info: "bg-blue-500/10 text-blue-700 border-blue-500/30",
    default: "bg-muted text-muted-foreground"
  };
  
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <Badge key={i} variant="outline" className={colorMap[variant]}>
          {item}
        </Badge>
      ))}
    </div>
  );
}

// Section Header Component
function SectionHeader({ icon: Icon, title, badge }: { icon: any; title: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <h4 className="font-medium text-sm">{title}</h4>
      </div>
      {badge && (
        <Badge variant="secondary" className="text-xs">{badge}</Badge>
      )}
    </div>
  );
}

// Optimization Item Component
function OptimizationItem({ item }: { item: string }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const categoryMatch = item.match(/^([A-Z\s\d]+):/);
  const category = categoryMatch ? categoryMatch[1].trim() : "General";
  const content = categoryMatch ? item.slice(categoryMatch[0].length).trim() : item;
  
  const categoryColors: Record<string, string> = {
    "TITLE": "bg-purple-500/10 text-purple-600 border-purple-500/30",
    "BULLET": "bg-blue-500/10 text-blue-600 border-blue-500/30",
    "ADD": "bg-green-500/10 text-green-600 border-green-500/30",
    "INCLUDE": "bg-amber-500/10 text-amber-600 border-amber-500/30",
    "CREATE": "bg-cyan-500/10 text-cyan-600 border-cyan-500/30",
  };
  
  const getCategoryColor = () => {
    for (const [key, color] of Object.entries(categoryColors)) {
      if (category.toUpperCase().includes(key)) return color;
    }
    return "bg-muted text-muted-foreground";
  };
  
  const isLong = content.length > 200;
  const displayContent = isLong && !isOpen ? content.slice(0, 200) + "..." : content;
  
  return (
    <div className="border-l-4 border-l-primary/50 bg-muted/30 p-3 rounded-r-md">
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
    </div>
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

  // Extract all data fields
  const keyInsights = Array.isArray(ma.key_insights) ? ma.key_insights : [];
  const copyEffectiveness = ma.copy_effectiveness || {};
  const messagingAnalysis = ma.messaging_analysis || {};
  const targetDemographics = ma.target_demographics || {};
  const positioningStrategy = ma.positioning_strategy || {};
  const lifestylePositioning = ma.lifestyle_positioning || {};
  const competitiveAnalysis = ma.competitive_analysis || {};
  const competitivePositioning = ma.competitive_positioning || "";
  const competitivePositioningVisual = ma.competitive_positioning_visual || {};
  const trustBuilding = ma.trust_building || {};
  const usageScenarios = ma.usage_scenarios || {};
  const rawOpportunities = ma.optimization_opportunities || [];
  const optimizationOpportunities = Array.isArray(rawOpportunities) 
    ? rawOpportunities.filter((item: any) => typeof item === 'string' && item.length > 5)
    : [];

  // Check if we have any data
  const hasAnyData = keyInsights.length > 0 || 
    Object.keys(copyEffectiveness).length > 0 ||
    Object.keys(messagingAnalysis).length > 0 ||
    Object.keys(targetDemographics).length > 0 ||
    Object.keys(competitiveAnalysis).length > 0 ||
    Object.keys(trustBuilding).length > 0;

  if (!hasAnyData) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Marketing analysis data is still being processed.</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-muted/30 border-t">
      <Tabs defaultValue="insights" className="w-full">
        <TabsList className="grid grid-cols-6 w-full max-w-3xl mb-4">
          <TabsTrigger value="insights" className="text-xs gap-1">
            <Lightbulb className="w-3 h-3" /> Insights
          </TabsTrigger>
          <TabsTrigger value="copy" className="text-xs gap-1">
            <Copy className="w-3 h-3" /> Copy
          </TabsTrigger>
          <TabsTrigger value="messaging" className="text-xs gap-1">
            <MessageSquare className="w-3 h-3" /> Claims
          </TabsTrigger>
          <TabsTrigger value="positioning" className="text-xs gap-1">
            <Target className="w-3 h-3" /> Audience
          </TabsTrigger>
          <TabsTrigger value="competitive" className="text-xs gap-1">
            <Crosshair className="w-3 h-3" /> Compete
          </TabsTrigger>
          <TabsTrigger value="trust" className="text-xs gap-1">
            <Shield className="w-3 h-3" /> Trust
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: STRATEGIC INSIGHTS */}
        <TabsContent value="insights" className="mt-0 space-y-4">
          {keyInsights.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {keyInsights.map((insight: string, i: number) => (
                <InsightCard key={i} insight={insight} index={i} />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No strategic insights available
              </CardContent>
            </Card>
          )}
          
          {/* Actions Footer */}
          {optimizationOpportunities.length > 0 && (
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="actions" className="border rounded-lg">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span className="font-medium text-sm">Recommended Actions ({optimizationOpportunities.length})</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-2">
                    {optimizationOpportunities.map((item: string, i: number) => (
                      <OptimizationItem key={i} item={item} />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </TabsContent>

        {/* TAB 2: COPY ANALYSIS */}
        <TabsContent value="copy" className="mt-0 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Title Analysis */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Title Analysis
                  </CardTitle>
                  {copyEffectiveness.title_analysis?.clarity_score !== undefined && (
                    <Badge variant="outline" className={
                      copyEffectiveness.title_analysis.clarity_score >= 7 
                        ? "bg-green-500/10 text-green-600" 
                        : "bg-amber-500/10 text-amber-600"
                    }>
                      Clarity: {copyEffectiveness.title_analysis.clarity_score}/10
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {copyEffectiveness.title_analysis?.persuasiveness && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Persuasiveness:</span>
                    <Badge variant="secondary">{copyEffectiveness.title_analysis.persuasiveness}</Badge>
                  </div>
                )}
                {copyEffectiveness.title_analysis?.keywords_present?.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">Keywords Found:</span>
                    <BadgeList items={copyEffectiveness.title_analysis.keywords_present} variant="info" />
                  </div>
                )}
                {copyEffectiveness.title_analysis?.issues?.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground block">Issues:</span>
                    {copyEffectiveness.title_analysis.issues.map((issue: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-red-500/5 rounded-md">
                        <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <span className="text-sm">{issue}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!copyEffectiveness.title_analysis && (
                  <p className="text-sm text-muted-foreground text-center py-4">No title analysis available</p>
                )}
              </CardContent>
            </Card>

            {/* Bullet Analysis */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Bullet Points
                  </CardTitle>
                  {copyEffectiveness.bullet_analysis?.benefit_focused !== undefined && (
                    <Badge variant="outline" className={
                      copyEffectiveness.bullet_analysis.benefit_focused 
                        ? "bg-green-500/10 text-green-600" 
                        : "bg-red-500/10 text-red-600"
                    }>
                      {copyEffectiveness.bullet_analysis.benefit_focused ? "Benefit Focused ✓" : "Feature Heavy ✗"}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {copyEffectiveness.bullet_analysis?.strengths?.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground block">Strengths:</span>
                    {copyEffectiveness.bullet_analysis.strengths.map((item: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-green-500/5 rounded-md">
                        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                        <span className="text-sm">{item}</span>
                      </div>
                    ))}
                  </div>
                )}
                {copyEffectiveness.bullet_analysis?.weaknesses?.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground block">Weaknesses:</span>
                    {copyEffectiveness.bullet_analysis.weaknesses.map((item: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-amber-500/5 rounded-md">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span className="text-sm">{item}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!copyEffectiveness.bullet_analysis && (
                  <p className="text-sm text-muted-foreground text-center py-4">No bullet analysis available</p>
                )}
              </CardContent>
            </Card>

            {/* Description Analysis */}
            {copyEffectiveness.description_analysis && (
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Description Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    {copyEffectiveness.description_analysis.length && (
                      <Badge variant="outline">Length: {copyEffectiveness.description_analysis.length}</Badge>
                    )}
                    {copyEffectiveness.description_analysis.structure && (
                      <Badge variant="outline">Structure: {copyEffectiveness.description_analysis.structure}</Badge>
                    )}
                    {copyEffectiveness.description_analysis.call_to_action && (
                      <Badge variant="outline" className="bg-green-500/10 text-green-600">Has CTA ✓</Badge>
                    )}
                    {copyEffectiveness.description_analysis.persuasiveness && (
                      <Badge variant="outline">Persuasiveness: {copyEffectiveness.description_analysis.persuasiveness}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* TAB 3: MESSAGING & CLAIMS */}
        <TabsContent value="messaging" className="mt-0 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Key Claims */}
            {messagingAnalysis.key_claims_shown?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Megaphone className="w-4 h-4" /> Key Claims Shown
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {messagingAnalysis.key_claims_shown.map((claim: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-primary/5 rounded-md">
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm">{claim}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Ingredients Highlighted */}
            {messagingAnalysis.ingredients_highlighted?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Package className="w-4 h-4" /> Ingredients Highlighted
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {messagingAnalysis.ingredients_highlighted.map((ing: any, i: number) => (
                    <div key={i} className="p-2 bg-muted/50 rounded-md">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{ing.ingredient || ing}</span>
                        {ing.visual_emphasis && (
                          <Badge variant="secondary" className="text-xs">{ing.visual_emphasis}</Badge>
                        )}
                      </div>
                      {ing.benefit_claimed && (
                        <p className="text-xs text-muted-foreground mt-1">{ing.benefit_claimed}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Messaging Signals */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> Messaging Signals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {messagingAnalysis.urgency_scarcity_messaging !== undefined && (
                    <Badge variant="outline" className={
                      messagingAnalysis.urgency_scarcity_messaging 
                        ? "bg-amber-500/10 text-amber-600" 
                        : "bg-muted"
                    }>
                      {messagingAnalysis.urgency_scarcity_messaging ? "Uses Urgency ✓" : "No Urgency"}
                    </Badge>
                  )}
                  {messagingAnalysis.scientific_clinical_messaging !== undefined && (
                    <Badge variant="outline" className={
                      messagingAnalysis.scientific_clinical_messaging 
                        ? "bg-blue-500/10 text-blue-600" 
                        : "bg-muted"
                    }>
                      {messagingAnalysis.scientific_clinical_messaging ? "Scientific Claims ✓" : "No Scientific Claims"}
                    </Badge>
                  )}
                </div>
                {messagingAnalysis.comparison_messaging && (
                  <div className="mt-3 p-3 bg-muted/50 rounded-md">
                    <span className="text-xs text-muted-foreground block mb-1">Comparison Messaging:</span>
                    <p className="text-sm">{messagingAnalysis.comparison_messaging}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 4: POSITIONING & AUDIENCE */}
        <TabsContent value="positioning" className="mt-0 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Target Demographics */}
            {Object.keys(targetDemographics).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="w-4 h-4" /> Target Demographics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {targetDemographics.primary_audience && (
                    <div className="p-3 bg-primary/5 rounded-md">
                      <span className="text-xs text-muted-foreground block mb-1">Primary Audience:</span>
                      <p className="text-sm">{targetDemographics.primary_audience}</p>
                    </div>
                  )}
                  {targetDemographics.relatability_score !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Relatability:</span>
                      <Badge variant="outline" className={
                        targetDemographics.relatability_score >= 7 
                          ? "bg-green-500/10 text-green-600" 
                          : "bg-amber-500/10 text-amber-600"
                      }>
                        {targetDemographics.relatability_score}/10
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Positioning Strategy */}
            {Object.keys(positioningStrategy).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="w-4 h-4" /> Positioning Strategy
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {positioningStrategy.value_proposition && (
                    <div className="p-3 bg-green-500/5 rounded-md border-l-4 border-l-green-500">
                      <span className="text-xs text-muted-foreground block mb-1">Value Proposition:</span>
                      <p className="text-sm font-medium">{positioningStrategy.value_proposition}</p>
                    </div>
                  )}
                  {positioningStrategy.target_audience && (
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">Target Audience:</span>
                      <p className="text-sm">{positioningStrategy.target_audience}</p>
                    </div>
                  )}
                  {positioningStrategy.suggested_bundle_strategy && (
                    <div className="p-2 bg-muted/50 rounded-md">
                      <span className="text-xs text-muted-foreground block mb-1">Bundle Strategy:</span>
                      <p className="text-sm">{positioningStrategy.suggested_bundle_strategy}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Lifestyle Positioning */}
            {Object.keys(lifestylePositioning).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Lifestyle Positioning
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {lifestylePositioning.primary_lifestyle && (
                    <div className="p-3 bg-primary/5 rounded-md">
                      <p className="text-sm">{lifestylePositioning.primary_lifestyle}</p>
                    </div>
                  )}
                  {lifestylePositioning.activities_shown?.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">Activities Shown:</span>
                      <BadgeList items={lifestylePositioning.activities_shown} variant="info" />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Competitive Positioning Text */}
            {competitivePositioning && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Crosshair className="w-4 h-4" /> Competitive Positioning
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">{competitivePositioning}</p>
                </CardContent>
              </Card>
            )}

            {/* Competitive Positioning Visual */}
            {Object.keys(competitivePositioningVisual).length > 0 && (
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Eye className="w-4 h-4" /> Visual Positioning Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {competitivePositioningVisual.positioning_vs_competitors && (
                    <div className="p-3 bg-muted/50 rounded-md">
                      <p className="text-sm">{competitivePositioningVisual.positioning_vs_competitors}</p>
                    </div>
                  )}
                  {competitivePositioningVisual.unique_visual_angles?.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">Unique Visual Angles:</span>
                      <BadgeList items={competitivePositioningVisual.unique_visual_angles} variant="success" />
                    </div>
                  )}
                  {competitivePositioningVisual.gaps_in_messaging?.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">Messaging Gaps:</span>
                      <BadgeList items={competitivePositioningVisual.gaps_in_messaging} variant="warning" />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* TAB 5: COMPETITIVE INTELLIGENCE */}
        <TabsContent value="competitive" className="mt-0 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Unique Selling Points */}
            {competitiveAnalysis.unique_selling_points?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Star className="w-4 h-4 text-green-600" /> Unique Selling Points
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {competitiveAnalysis.unique_selling_points.map((usp: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-green-500/5 rounded-md">
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                      <span className="text-sm">{usp}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Parity Features */}
            {competitiveAnalysis.parity_features?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Parity Features
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-2">Same as competitors</p>
                  <BadgeList items={competitiveAnalysis.parity_features} variant="default" />
                </CardContent>
              </Card>
            )}

            {/* Weaknesses vs Competitors */}
            {(competitiveAnalysis.weaknesses_vs_competitors || competitiveAnalysis.missing_copy_elements || competitiveAnalysis.price_concerns) && (
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" /> Competitive Weaknesses
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {competitiveAnalysis.weaknesses_vs_competitors?.length > 0 && (
                    <div className="space-y-2">
                      {competitiveAnalysis.weaknesses_vs_competitors.map((item: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-red-500/5 rounded-md">
                          <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                          <span className="text-sm">{item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {competitiveAnalysis.missing_copy_elements?.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">Missing Copy Elements:</span>
                      <BadgeList items={competitiveAnalysis.missing_copy_elements} variant="warning" />
                    </div>
                  )}
                  {competitiveAnalysis.price_concerns?.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">Price Concerns:</span>
                      <BadgeList items={competitiveAnalysis.price_concerns} variant="warning" />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* TAB 6: TRUST & USAGE */}
        <TabsContent value="trust" className="mt-0 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Trust Building */}
            {Object.keys(trustBuilding).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4" /> Trust Building
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {trustBuilding.transparency_level && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Transparency:</span>
                      <Badge variant="outline" className={
                        trustBuilding.transparency_level === "high" 
                          ? "bg-green-500/10 text-green-600" 
                          : "bg-amber-500/10 text-amber-600"
                      }>
                        {trustBuilding.transparency_level}
                      </Badge>
                    </div>
                  )}
                  {trustBuilding.quality_claims?.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">Quality Claims:</span>
                      <div className="space-y-1">
                        {trustBuilding.quality_claims.map((claim: string, i: number) => (
                          <div key={i} className="flex items-start gap-2">
                            <Award className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <span className="text-sm">{claim}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {trustBuilding.certifications_mentioned?.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">Certifications:</span>
                      <BadgeList items={trustBuilding.certifications_mentioned} variant="success" />
                    </div>
                  )}
                  {trustBuilding.scientific_backing?.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">Scientific Backing:</span>
                      <BadgeList items={trustBuilding.scientific_backing} variant="info" />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Usage Scenarios */}
            {Object.keys(usageScenarios).length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Usage Scenarios
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {usageScenarios.when_to_use?.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">When to Use:</span>
                      <BadgeList items={usageScenarios.when_to_use} variant="info" />
                    </div>
                  )}
                  {usageScenarios.where_to_use?.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">Where to Use:</span>
                      <div className="flex flex-wrap gap-2">
                        {usageScenarios.where_to_use.map((item: string, i: number) => (
                          <Badge key={i} variant="outline" className="gap-1">
                            <MapPin className="w-3 h-3" /> {item}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {usageScenarios.usage_complexity && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Complexity:</span>
                      <Badge variant="secondary">{usageScenarios.usage_complexity}</Badge>
                    </div>
                  )}
                  {usageScenarios.frequency_implied && (
                    <div className="p-2 bg-muted/50 rounded-md">
                      <span className="text-xs text-muted-foreground block mb-1">Frequency:</span>
                      <p className="text-sm">{usageScenarios.frequency_implied}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
