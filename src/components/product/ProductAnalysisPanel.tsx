import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, CheckCircle2, Lightbulb, Zap, Image as ImageIcon, Users, MessageSquare, Target, TrendingUp, XCircle, Star, ThumbsUp, ThumbsDown, Sparkles, FileText, ChevronDown, ChevronUp, Quote, Crown, UserCircle, Gift, List, Palette, Sun, Layout, Heart } from "lucide-react";
interface ProductAnalysisPanelProps {
  marketingAnalysis: any;
  reviewAnalysis: any;
  imageUrls?: string[];
}

// Expandable Text Component for long content
function ExpandableText({
  text,
  maxLength = 200
}: {
  text: string;
  maxLength?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  if (!text || text.length <= maxLength) {
    return <span>{text}</span>;
  }
  return <div>
      <span>{isExpanded ? text : `${text.slice(0, maxLength)}...`}</span>
      <Button variant="link" size="sm" className="h-auto p-0 ml-1 text-xs" onClick={() => setIsExpanded(!isExpanded)}>
        {isExpanded ? "Read Less" : "Read More"}
      </Button>
    </div>;
}

// Score Badge Component
function ScoreBadge({
  score,
  max = 10
}: {
  score: number;
  max?: number;
}) {
  const percentage = score / max * 100;
  const colorClass = percentage >= 70 ? "bg-chart-4/10 text-chart-4 border-chart-4/30" : percentage >= 40 ? "bg-chart-2/10 text-chart-2 border-chart-2/30" : "bg-destructive/10 text-destructive border-destructive/30";
  return <Badge variant="outline" className={colorClass}>
      {score}/{max}
    </Badge>;
}

// Priority Badge Component
function PriorityBadge({
  priority
}: {
  priority: string;
}) {
  const priorityLower = priority?.toLowerCase() || 'medium';
  const colorClass = priorityLower === 'high' ? "bg-destructive/10 text-destructive border-destructive/30" : priorityLower === 'medium' ? "bg-chart-2/10 text-chart-2 border-chart-2/30" : "bg-chart-4/10 text-chart-4 border-chart-4/30";
  return <Badge variant="outline" className={`text-xs capitalize ${colorClass}`}>
      {priority}
    </Badge>;
}

// Enhanced Image Card with Hover Analysis - using expandable card pattern
function SmartImageCard({
  image,
  index
}: {
  image: any;
  index: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const purposeColors: Record<string, string> = {
    "Product Feature": "bg-chart-3/90 text-white",
    "Lifestyle": "bg-chart-5/90 text-white",
    "Trust": "bg-chart-4/90 text-white",
    "Trust Anchor": "bg-chart-4/90 text-white",
    "Trust / Lifestyle": "bg-chart-4/90 text-white",
    "Trust / Benefit": "bg-chart-4/90 text-white",
    "Benefit": "bg-chart-2/90 text-white",
    "Benefit / Lifestyle": "bg-chart-2/90 text-white",
    "Social Proof": "bg-primary/90 text-white",
    "Ingredient Highlight": "bg-chart-3/90 text-white"
  };
  return <div className="space-y-2">
      <div className="relative aspect-square bg-muted rounded-lg overflow-hidden cursor-pointer group" onClick={() => setIsExpanded(!isExpanded)}>
        <img src={image.url} alt={image.description || `Product image ${index + 1}`} className="w-full h-full object-cover transition-transform group-hover:scale-105" onError={e => {
        (e.target as HTMLImageElement).style.display = 'none';
      }} />
        {/* Purpose Badge on top */}
        {image.purpose && <div className="absolute top-2 left-2">
            <Badge className={`text-xs ${purposeColors[image.purpose] || "bg-primary/90 text-white"}`}>
              {image.purpose}
            </Badge>
          </div>}
        {/* Score Badge */}
        {image.score !== undefined && <div className="absolute top-2 right-2">
            <Badge className={`text-xs ${image.score >= 8 ? "bg-chart-4/90 text-white" : image.score >= 6 ? "bg-chart-2/90 text-white" : "bg-destructive/90 text-white"}`}>
              {image.score}/10
            </Badge>
          </div>}
        {/* Click indicator */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <span className="text-white opacity-0 group-hover:opacity-100 text-xs bg-black/50 px-2 py-1 rounded">
            {isExpanded ? "Click to collapse" : "Click for analysis"}
          </span>
        </div>
      </div>
      
      {/* Analysis shown below the image when expanded */}
      {isExpanded && (image.description || image.analysis) && <div className="p-3 bg-muted/50 rounded-md border border-border text-xs space-y-2 animate-in fade-in slide-in-from-top-2">
          {image.description && <p className="font-medium">{image.description}</p>}
          {image.analysis && <div className="p-2 bg-primary/5 rounded border-l-2 border-primary">
              <p className="text-muted-foreground mb-1 font-semibold">Strategy:</p>
              <p className="leading-relaxed">{image.analysis}</p>
            </div>}
        </div>}
    </div>;
}

// Action Item Component with Priority and Rationale
function EnhancedActionItem({
  item
}: {
  item: any;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const suggestion = item.suggestion || item.text || '';
  const priority = item.priority || 'medium';
  const rationale = item.rationale || '';
  return <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className="border-l-4 border-l-primary/50 bg-muted/30 p-3 rounded-r-md">
        <div className="flex items-start gap-2">
          <PriorityBadge priority={priority} />
          <div className="flex-1">
            <p className="text-sm">{suggestion}</p>
            {rationale && <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-auto p-0 mt-1 text-xs text-muted-foreground hover:text-foreground">
                  {isExpanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                  {isExpanded ? "Hide rationale" : "Why this matters"}
                </Button>
              </CollapsibleTrigger>}
          </div>
        </div>
        {rationale && <CollapsibleContent>
            <div className="mt-2 ml-16 p-2 bg-muted/50 rounded text-xs text-muted-foreground italic">
              {rationale}
            </div>
          </CollapsibleContent>}
      </div>
    </Collapsible>;
}

// NEW: Title Analysis Card Component
function TitleAnalysisCard({
  titleAnalysis
}: {
  titleAnalysis: any;
}) {
  if (!titleAnalysis) return null;
  const clarityScore = titleAnalysis.clarity_score;
  const issues = titleAnalysis.issues || [];
  if (clarityScore === undefined && issues.length === 0) return null;
  return <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-chart-3" /> Title Analysis
          </CardTitle>
          {clarityScore !== undefined && <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Clarity:</span>
              <ScoreBadge score={clarityScore} />
            </div>}
        </div>
      </CardHeader>
      <CardContent>
        {issues.length > 0 ? <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium mb-3">Issues Found:</p>
            <div className="space-y-2">
              {issues.map((issue: string, i: number) => <div key={i} className="flex items-start gap-2 p-3 bg-chart-2/5 rounded-md border border-chart-2/20">
                  <AlertTriangle className="w-4 h-4 text-chart-2 shrink-0 mt-0.5" />
                  <span className="text-sm">{issue}</span>
                </div>)}
            </div>
          </div> : <p className="text-sm text-muted-foreground text-center py-4">
            No title issues identified
          </p>}
      </CardContent>
    </Card>;
}

// NEW: Bullet Analysis Card Component
function BulletAnalysisCard({
  bulletAnalysis
}: {
  bulletAnalysis: any;
}) {
  if (!bulletAnalysis) return null;
  const benefitFocused = bulletAnalysis.benefit_focused;
  const strengths = bulletAnalysis.strengths || [];
  const weaknesses = bulletAnalysis.weaknesses || [];
  if (strengths.length === 0 && weaknesses.length === 0 && benefitFocused === undefined) return null;
  return <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <List className="w-4 h-4 text-chart-5" /> Bullet Analysis
          </CardTitle>
          {benefitFocused !== undefined && <Badge variant="outline" className={benefitFocused ? "bg-chart-4/10 text-chart-4 border-chart-4/30" : "bg-chart-2/10 text-chart-2 border-chart-2/30"}>
              {benefitFocused ? "✓ Benefit-Focused" : "✗ Not Benefit-Focused"}
            </Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Strengths */}
        {strengths.length > 0 && <div>
            <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-chart-4" /> Strengths ({strengths.length})
            </p>
            <div className="space-y-2">
              {strengths.map((strength: string, i: number) => <div key={i} className="flex items-start gap-2 p-3 bg-chart-4/5 rounded-md border border-chart-4/20">
                  <CheckCircle2 className="w-4 h-4 text-chart-4 shrink-0 mt-0.5" />
                  <span className="text-sm">{strength}</span>
                </div>)}
            </div>
          </div>}
        
        {/* Weaknesses */}
        {weaknesses.length > 0 && <div>
            <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1">
              <XCircle className="w-3 h-3 text-chart-2" /> Weaknesses ({weaknesses.length})
            </p>
            <div className="space-y-2">
              {weaknesses.map((weakness: string, i: number) => <div key={i} className="flex items-start gap-2 p-3 bg-chart-2/5 rounded-md border border-chart-2/20">
                  <XCircle className="w-4 h-4 text-chart-2 shrink-0 mt-0.5" />
                  <span className="text-sm">{weakness}</span>
                </div>)}
            </div>
          </div>}
      </CardContent>
    </Card>;
}

// NEW: Visual Style Guide Card Component
function VisualStyleGuideCard({
  visualStyleGuide
}: {
  visualStyleGuide: any;
}) {
  if (!visualStyleGuide) return null;
  const colorPalette = visualStyleGuide.color_palette || '';
  const moodKeywords = visualStyleGuide.mood_keywords || [];
  const lightingStyle = visualStyleGuide.lighting_style || '';
  const compositionStyle = visualStyleGuide.composition_style || '';
  if (!colorPalette && moodKeywords.length === 0 && !lightingStyle && !compositionStyle) return null;
  return <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Palette className="w-4 h-4 text-chart-5" /> Visual Style Guide
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Color Palette */}
        {colorPalette && <div className="p-3 bg-chart-5/5 rounded-lg border border-chart-5/20">
            <div className="flex items-center gap-2 mb-2">
              <Palette className="w-4 h-4 text-chart-5" />
              <span className="text-xs font-semibold text-muted-foreground">Color Palette</span>
            </div>
            <p className="text-sm">{colorPalette}</p>
          </div>}
        
        {/* Mood Keywords */}
        {moodKeywords.length > 0 && <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Heart className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground">Mood Keywords</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {moodKeywords.map((keyword: string, i: number) => <Badge key={i} variant="secondary" className="text-xs">
                  {keyword}
                </Badge>)}
            </div>
          </div>}
        
        {/* Lighting Style */}
        {lightingStyle && <div className="p-3 bg-chart-2/5 rounded-lg border border-chart-2/20">
            <div className="flex items-center gap-2 mb-2">
              <Sun className="w-4 h-4 text-chart-2" />
              <span className="text-xs font-semibold text-muted-foreground">Lighting Style</span>
            </div>
            <p className="text-sm">{lightingStyle}</p>
          </div>}
        
        {/* Composition Style */}
        {compositionStyle && <div className="p-3 bg-chart-3/5 rounded-lg border border-chart-3/20">
            <div className="flex items-center gap-2 mb-2">
              <Layout className="w-4 h-4 text-chart-3" />
              <span className="text-xs font-semibold text-muted-foreground">Composition Style</span>
            </div>
            <p className="text-sm">{compositionStyle}</p>
          </div>}
      </CardContent>
    </Card>;
}

// Creative Strategy Card Component - Enhanced
function CreativeStrategyCard({
  creativeBrief
}: {
  creativeBrief: any;
}) {
  if (!creativeBrief) return null;
  const brandIdentity = creativeBrief.brand_identity || {};
  const targetPersona = creativeBrief.target_persona || {};
  const winningOffers = creativeBrief.winning_offers || {};
  const uniqueSellingProps = creativeBrief.unique_selling_props || [];
  const hasData = brandIdentity.archetype || targetPersona.demographic || winningOffers.analysis || uniqueSellingProps.length > 0;
  if (!hasData) return null;
  return <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Creative Strategy
          </CardTitle>
          {/* Brand Consistency Score */}
          {brandIdentity.consistency !== undefined && <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Consistency:</span>
              <ScoreBadge score={brandIdentity.consistency} />
            </div>}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Brand Archetype */}
          {(brandIdentity.archetype || brandIdentity.tone) && <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground">Brand Archetype</span>
              </div>
              {brandIdentity.archetype && <Badge className="text-primary mb-2 rounded-none opacity-100 border-muted bg-white/0">
                  {brandIdentity.archetype}
                </Badge>}
              {brandIdentity.tone && <p className="text-sm text-muted-foreground">{brandIdentity.tone}</p>}
            </div>}
          
          {/* Target Persona - Enhanced with primary_motivation */}
          {(targetPersona.demographic || targetPersona.psychographic || targetPersona.primary_motivation) && <div className="p-3 bg-chart-3/5 rounded-lg border border-chart-3/20">
              <div className="flex items-center gap-2 mb-2">
                <UserCircle className="w-4 h-4 text-chart-3" />
                <span className="text-xs font-semibold text-muted-foreground">Target Persona</span>
              </div>
              {targetPersona.demographic && <p className="text-sm font-medium mb-1">{targetPersona.demographic}</p>}
              {targetPersona.psychographic && <p className="text-xs text-muted-foreground mb-2">{targetPersona.psychographic}</p>}
              {targetPersona.primary_motivation && <div className="mt-2 p-2 bg-chart-3/10 rounded-md border-l-2 border-chart-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Primary Motivation:</p>
                  <p className="text-sm">{targetPersona.primary_motivation}</p>
                </div>}
            </div>}
          
          {/* Winning Offer - Enhanced with effectiveness */}
          {(winningOffers.analysis || winningOffers.effectiveness) && <div className="p-3 bg-chart-2/5 rounded-lg border border-chart-2/20 md:col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <Gift className="w-4 h-4 text-chart-2" />
                <span className="text-xs font-semibold text-muted-foreground">Winning Offer Analysis</span>
              </div>
              {winningOffers.analysis && <div className="p-3 bg-chart-2/10 rounded-md mb-3">
                  <ExpandableText text={winningOffers.analysis} maxLength={300} />
                </div>}
              {winningOffers.effectiveness && <div className="p-3 bg-chart-4/5 rounded-md border border-chart-4/20">
                  <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-chart-4" /> Effectiveness Assessment
                  </p>
                  <p className="text-sm">{winningOffers.effectiveness}</p>
                </div>}
            </div>}
          
          {/* USP List */}
          {uniqueSellingProps.length > 0 && <div className="p-3 bg-chart-4/5 rounded-lg border border-chart-4/20 md:col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <List className="w-4 h-4 text-chart-4" />
                <span className="text-xs font-semibold text-muted-foreground">Unique Selling Props</span>
                <Badge variant="outline" className="ml-auto text-xs">{uniqueSellingProps.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                {uniqueSellingProps.map((usp: string, i: number) => <div key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="w-3 h-3 text-chart-4 shrink-0 mt-1" />
                    <span>{usp}</span>
                  </div>)}
              </div>
            </div>}
        </div>
      </CardContent>
    </Card>;
}

// Copy Assets / Swipe File Component
function CopyAssetsCard({
  copyAssets
}: {
  copyAssets: any;
}) {
  const bestHooks = copyAssets?.best_hooks || [];
  const clarityScore = copyAssets?.clarity_score;
  const benefitsFocus = copyAssets?.benefits_focus;
  return <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Copy Assets
            <Badge variant="outline" className="ml-2 text-xs">{bestHooks.length} hooks</Badge>
            {benefitsFocus !== undefined && <Badge variant="outline" className={`text-xs ${benefitsFocus ? "bg-chart-4/10 text-chart-4 border-chart-4/30" : "bg-chart-2/10 text-chart-2 border-chart-2/30"}`}>
                {benefitsFocus ? "✓ Benefits Focus" : "✗ Feature-Heavy"}
              </Badge>}
          </CardTitle>
          {clarityScore !== undefined && clarityScore !== null && <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Clarity Score:</span>
              <ScoreBadge score={clarityScore} />
            </div>}
        </div>
      </CardHeader>
      <CardContent>
        {bestHooks.length > 0 ? <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium mb-3">Killer Hooks (ALL-CAPS phrases from listing):</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {bestHooks.map((hook: string, i: number) => <div key={i} className="p-3 bg-primary/5 rounded-md border border-primary/20 hover:bg-primary/10 transition-colors">
                  <div className="flex items-start gap-2">
                    <Quote className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span className="text-sm font-semibold">{hook}</span>
                  </div>
                </div>)}
            </div>
          </div> : <div className="text-center py-6 text-muted-foreground">
            <Quote className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No killer hooks extracted yet.</p>
            <p className="text-xs mt-1">This section shows ALL-CAPS phrases from the listing.</p>
          </div>}
      </CardContent>
    </Card>;
}
export default function ProductAnalysisPanel({
  marketingAnalysis,
  reviewAnalysis,
  imageUrls
}: ProductAnalysisPanelProps) {
  if (!marketingAnalysis && !reviewAnalysis) {
    return <div className="p-6 text-center text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No analysis available for this product yet.</p>
      </div>;
  }
  const ma = marketingAnalysis || {};
  const ra = reviewAnalysis || {};

  // Extract MARKETING data
  const details = ma.details || {};
  const copyAnalysis = details.copy_analysis || {};
  const customerSentiment = details.customer_sentiment || {};
  const scoreCard = ma.score_card || {};
  const visualGallery = ma.visual_gallery || {};
  const actionPlanRaw = ma.action_plan || [];

  // NEW: Creative Brief data
  const creativeBrief = ma.creative_brief || {};

  // NEW: Copy Assets data - check multiple locations
  const copyAssets = ma.copy_assets || details.copy_assets || {};

  // NEW: Title Analysis from copy_analysis
  const titleAnalysis = copyAnalysis.title_analysis || {};

  // NEW: Bullet Analysis from copy_analysis
  const bulletAnalysis = copyAnalysis.bullet_analysis || {};

  // NEW: Visual Style Guide from creative_brief
  const visualStyleGuide = creativeBrief.visual_style_guide || {};

  // Copy Analysis fields
  const copyHooks = copyAnalysis.hooks || [];
  const copyClarity = copyAnalysis.clarity;

  // Customer Sentiment fields
  const gapAnalysis = customerSentiment.gap_analysis || "";
  const primaryPraises = customerSentiment.primary_praises || [];
  const primaryComplaints = customerSentiment.primary_complaints || [];

  // Score Card fields
  const overallGrade = scoreCard.overall_grade || "";
  const overallScore = scoreCard.overall_score;
  const scoreColor = scoreCard.score_color || "";
  const metrics = scoreCard.metrics || [];

  // Visual Gallery fields
  const vibe = visualGallery.vibe || "";
  const images = visualGallery.images || [];
  const demographics = visualGallery.demographics || {};

  // Action Plan - handle both old and new formats
  const actionPlan = actionPlanRaw.map((item: any) => {
    // New format with priority/suggestion/rationale
    if (item.suggestion || item.priority || item.rationale) {
      return {
        suggestion: item.suggestion || '',
        priority: item.priority || 'medium',
        rationale: item.rationale || '',
        text: item.suggestion || ''
      };
    }
    // Old character-indexed format
    if (typeof item === 'object' && !item.suggestion) {
      const keys = Object.keys(item).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
      if (keys.length > 0) {
        return {
          text: keys.map(k => item[k]).join(''),
          priority: item.badge_color === 'red' ? 'high' : item.badge_color === 'amber' ? 'medium' : 'low',
          suggestion: keys.map(k => item[k]).join(''),
          rationale: ''
        };
      }
    }
    // String format
    if (typeof item === 'string') {
      return {
        text: item,
        suggestion: item,
        priority: 'medium',
        rationale: ''
      };
    }
    return {
      text: '',
      suggestion: '',
      priority: 'medium',
      rationale: ''
    };
  }).filter((item: any) => item.text.length > 0 || item.suggestion.length > 0);

  // Extract REVIEW ANALYSIS data
  const painPoints = ra.pain_points || [];
  const positiveThemes = ra.positive_themes || [];
  const analysisMetadata = ra.analysis_metadata || {};
  const actionableRecommendations = ra.actionable_recommendations || [];
  const keyInsights = ra.key_insights || [];
  const productInfo = ra.product_info || {};

  // Check if we have data
  const hasMarketingData = copyHooks.length > 0 || primaryPraises.length > 0 || primaryComplaints.length > 0 || gapAnalysis.length > 0 || Object.keys(scoreCard).length > 0 || images.length > 0 || actionPlan.length > 0 || Object.keys(creativeBrief).length > 0 || Object.keys(copyAssets).length > 0 || Object.keys(titleAnalysis).length > 0 || Object.keys(bulletAnalysis).length > 0;
  const hasReviewData = Object.keys(ra).length > 0;
  if (!hasMarketingData && !hasReviewData) {
    return <div className="p-6 text-center text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Analysis data is still being processed.</p>
      </div>;
  }
  return <div className="p-4 bg-muted/30 border-t">
      <Tabs defaultValue={hasMarketingData ? "strategy" : "reviews"} className="w-full">
        <TabsList className="grid grid-cols-5 w-full mb-4">
          <TabsTrigger value="strategy" className="text-xs gap-1">
            <Sparkles className="w-3 h-3" /> Strategy
          </TabsTrigger>
          <TabsTrigger value="copy" className="text-xs gap-1">
            <FileText className="w-3 h-3" /> Copy
          </TabsTrigger>
          <TabsTrigger value="sentiment" className="text-xs gap-1">
            <MessageSquare className="w-3 h-3" /> Gaps
          </TabsTrigger>
          <TabsTrigger value="visuals" className="text-xs gap-1">
            <ImageIcon className="w-3 h-3" /> Visuals
          </TabsTrigger>
          <TabsTrigger value="actions" className="text-xs gap-1">
            <Zap className="w-3 h-3" /> Actions
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: CREATIVE STRATEGY */}
        <TabsContent value="strategy" className="mt-0 space-y-4">
          {/* Creative Strategy Card */}
          <CreativeStrategyCard creativeBrief={creativeBrief} />
          
          {/* Visual Style Guide */}
          <VisualStyleGuideCard visualStyleGuide={visualStyleGuide} />
          
          {/* Score Card Summary */}
          {(overallGrade || metrics.length > 0) && <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Performance Score Card
                  </CardTitle>
                  {overallGrade && <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-lg px-3 py-1 ${scoreColor === "green-500" ? "bg-chart-4/10 text-chart-4 border-chart-4/30" : scoreColor === "amber-500" ? "bg-chart-2/10 text-chart-2 border-chart-2/30" : "bg-destructive/10 text-destructive border-destructive/30"}`}>
                        Grade: {overallGrade}
                      </Badge>
                      {overallScore !== undefined && <Badge variant="outline">Score: {overallScore}/10</Badge>}
                    </div>}
                </div>
              </CardHeader>
              <CardContent>
                {metrics.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {metrics.map((metric: any, i: number) => {
                const colorMap: Record<string, string> = {
                  "green-500": "text-chart-4",
                  "amber-500": "text-chart-2",
                  "red-500": "text-destructive"
                };
                const valueColor = metric.color ? colorMap[metric.color] || "text-foreground" : metric.value >= 7 ? "text-chart-4" : metric.value >= 4 ? "text-chart-2" : "text-destructive";
                return <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <span className="text-sm font-medium">{metric.label}</span>
                          <span className={`text-lg font-bold ${valueColor}`}>{metric.value}/10</span>
                        </div>;
              })}
                  </div>}
              </CardContent>
            </Card>}
          
          {/* Key Insights from Reviews */}
          {keyInsights.length > 0 && <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-primary" /> Key Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {keyInsights.slice(0, 5).map((insight: string, i: number) => <div key={i} className="flex items-start gap-2 p-2 bg-primary/5 rounded-md">
                      <Lightbulb className="w-3 h-3 text-primary shrink-0 mt-1" />
                      <span className="text-sm">{insight}</span>
                    </div>)}
                </div>
              </CardContent>
            </Card>}
          
          {!Object.keys(creativeBrief).length && !overallGrade && !metrics.length && !keyInsights.length && <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No creative strategy data available yet.</p>
              </CardContent>
            </Card>}
        </TabsContent>

        {/* TAB 2: COPY ANALYSIS & SWIPE FILE */}
        <TabsContent value="copy" className="mt-0 space-y-4">
          {/* Title Analysis - NEW */}
          <TitleAnalysisCard titleAnalysis={titleAnalysis} />
          
          {/* Bullet Analysis - NEW */}
          <BulletAnalysisCard bulletAnalysis={bulletAnalysis} />
          
          {/* Copy Assets / Swipe File */}
          <CopyAssetsCard copyAssets={copyAssets} />
          
          {/* Clarity Score (legacy) */}
          {copyClarity !== undefined && !copyAssets.clarity_score && !titleAnalysis.clarity_score && <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="w-4 h-4" /> Copy Clarity Score
                  </CardTitle>
                  <ScoreBadge score={copyClarity} />
                </div>
              </CardHeader>
            </Card>}

          {/* Copy Hooks (legacy) */}
          {copyHooks.length > 0 && <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lightbulb className="w-4 h-4" /> What the Copy Does Well
                  <Badge variant="outline" className="ml-auto">{copyHooks.length} items</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {copyHooks.map((hook: string, i: number) => <div key={i} className="flex items-start gap-2 p-3 bg-chart-4/5 rounded-md border border-chart-4/20">
                      <CheckCircle2 className="w-4 h-4 text-chart-4 shrink-0 mt-0.5" />
                      <span className="text-sm">{hook}</span>
                    </div>)}
                </div>
              </CardContent>
            </Card>}
          
          {!copyAssets.best_hooks?.length && copyHooks.length === 0 && copyClarity === undefined && !titleAnalysis.issues?.length && !bulletAnalysis.strengths?.length && !bulletAnalysis.weaknesses?.length && <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No copy analysis data available yet.</p>
              </CardContent>
            </Card>}
        </TabsContent>

        {/* TAB 3: GAP ANALYSIS & SENTIMENT */}
        <TabsContent value="sentiment" className="mt-0 space-y-4">
          {/* Gap Analysis - Full Text Warning Box */}
          {gapAnalysis && <Card className="border-chart-2/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-chart-2" /> Gap Analysis
                  <span className="text-xs text-muted-foreground font-normal ml-2">Marketing vs. Customer Reality</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-chart-2/5 rounded-lg border border-chart-2/20">
                  <div className="flex items-start gap-3">
                    <Quote className="w-5 h-5 text-chart-2 shrink-0 mt-0.5" />
                    <div className="text-sm leading-relaxed">
                      <ExpandableText text={gapAnalysis} maxLength={500} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>}
          
          {/* Praises & Complaints */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Primary Praises */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ThumbsUp className="w-4 h-4 text-chart-4" /> What Customers Love
                  <Badge variant="outline" className="bg-chart-4/10 text-chart-4 border-chart-4/30 ml-auto">
                    {primaryPraises.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {primaryPraises.length > 0 ? <div className="space-y-2">
                    {primaryPraises.map((praise: string, i: number) => <div key={i} className="flex items-start gap-2 p-2 bg-chart-4/5 rounded-md">
                        <CheckCircle2 className="w-4 h-4 text-chart-4 shrink-0 mt-0.5" />
                        <span className="text-sm">{praise}</span>
                      </div>)}
                  </div> : <p className="text-sm text-muted-foreground text-center py-4">
                    No praises identified
                  </p>}
              </CardContent>
            </Card>

            {/* Primary Complaints */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ThumbsDown className="w-4 h-4 text-chart-2" /> Customer Complaints
                  <Badge variant="outline" className="bg-chart-2/10 text-chart-2 border-chart-2/30 ml-auto">
                    {primaryComplaints.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {primaryComplaints.length > 0 ? <div className="space-y-2">
                    {primaryComplaints.map((complaint: string, i: number) => <div key={i} className="flex items-start gap-2 p-2 bg-chart-2/5 rounded-md">
                        <XCircle className="w-4 h-4 text-chart-2 shrink-0 mt-0.5" />
                        <span className="text-sm">{complaint}</span>
                      </div>)}
                  </div> : <p className="text-sm text-muted-foreground text-center py-4">
                    No complaints identified
                  </p>}
              </CardContent>
            </Card>
          </div>
          
          {/* Pain Points & Positive Themes from Reviews */}
          {(painPoints.length > 0 || positiveThemes.length > 0) && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {painPoints.length > 0 && <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-destructive" /> Review Pain Points
                      <Badge variant="outline" className="ml-auto">{painPoints.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {painPoints.slice(0, 5).map((point: any, i: number) => <div key={i} className="p-2 bg-destructive/5 rounded-md border border-destructive/20">
                          <p className="text-sm font-medium">{point.issue || point}</p>
                          {point.affected_percentage && <p className="text-xs text-muted-foreground mt-1">
                              {point.affected_percentage}% affected
                            </p>}
                        </div>)}
                    </div>
                  </CardContent>
                </Card>}

              {positiveThemes.length > 0 && <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Star className="w-4 h-4 text-chart-4" /> Positive Themes
                      <Badge variant="outline" className="ml-auto">{positiveThemes.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {positiveThemes.slice(0, 5).map((theme: any, i: number) => <div key={i} className="p-2 bg-chart-4/5 rounded-md border border-chart-4/20">
                          <p className="text-sm font-medium">{theme.theme || theme}</p>
                          {theme.frequency && <p className="text-xs text-muted-foreground mt-1">
                              {theme.frequency}% mention rate
                            </p>}
                        </div>)}
                    </div>
                  </CardContent>
                </Card>}
            </div>}
        </TabsContent>

        {/* TAB 4: SMART VISUAL GALLERY */}
        <TabsContent value="visuals" className="mt-0 space-y-4">
          {/* Target Audience / Vibe */}
          {(vibe || demographics.primary_audience) && <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4" /> Visual Strategy & Demographics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {vibe && <div>
                    <p className="text-xs text-muted-foreground mb-1 font-medium">Visual Vibe:</p>
                    <p className="text-sm p-3 bg-muted/50 rounded-md">{vibe}</p>
                  </div>}
                {demographics.primary_audience && <div>
                    <p className="text-xs text-muted-foreground mb-1 font-medium">Primary Audience:</p>
                    <p className="text-sm p-3 bg-muted/50 rounded-md">{demographics.primary_audience}</p>
                  </div>}
                {demographics.relatability_score !== undefined && <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground font-medium">Relatability Score:</p>
                    <ScoreBadge score={demographics.relatability_score} />
                  </div>}
              </CardContent>
            </Card>}

          {/* Smart Image Gallery with Hover Analysis */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ImageIcon className="w-4 h-4" /> Smart Gallery
                <Badge variant="outline" className="ml-auto">
                  {images.length} images
                </Badge>
                <span className="text-xs text-muted-foreground font-normal">Click for strategy analysis</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {images.length > 0 ? <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {images.map((image: any, i: number) => <SmartImageCard key={i} image={image} index={i} />)}
                </div> : <p className="text-sm text-muted-foreground text-center py-4">
                  No image analysis available
                </p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 5: ACTION PLAN */}
        <TabsContent value="actions" className="mt-0 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-chart-2" /> Action Plan
                <Badge variant="outline" className="ml-auto">
                  {actionPlan.length} actions
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {actionPlan.length > 0 ? <div className="space-y-3">
                  {actionPlan.map((item: any, i: number) => <EnhancedActionItem key={i} item={item} />)}
                </div> : <p className="text-sm text-muted-foreground text-center py-4">
                  No action items available
                </p>}
            </CardContent>
          </Card>
          
          {/* Actionable Recommendations from Reviews */}
          {actionableRecommendations.length > 0 && <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" /> Review-Based Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {actionableRecommendations.slice(0, 4).map((rec: any, i: number) => <div key={i} className="p-3 bg-muted/50 rounded-md">
                      <div className="flex items-start gap-2">
                        {rec.priority && <PriorityBadge priority={rec.priority} />}
                        <div>
                          {rec.area && <p className="text-xs text-muted-foreground font-medium">{rec.area}</p>}
                          <p className="text-sm font-medium">{rec.recommendation}</p>
                          {rec.rationale && <p className="text-xs text-muted-foreground mt-1 italic">{rec.rationale}</p>}
                        </div>
                      </div>
                    </div>)}
                </div>
              </CardContent>
            </Card>}
        </TabsContent>
      </Tabs>
    </div>;
}