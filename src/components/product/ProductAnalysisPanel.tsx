import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  AlertTriangle, CheckCircle2, Lightbulb, Zap, Image as ImageIcon,
  Users, MessageSquare, Target, Star, TrendingUp, XCircle
} from "lucide-react";

interface ProductAnalysisPanelProps {
  marketingAnalysis: any;
  reviewAnalysis: any;
  imageUrls?: string[];
}

// Helper to convert character-indexed object to string
function convertCharIndexedToString(item: any): string {
  if (typeof item === 'string') return item;
  if (typeof item !== 'object' || item === null) return '';
  
  const keys = Object.keys(item)
    .filter(k => !isNaN(Number(k)))
    .sort((a, b) => Number(a) - Number(b));
  
  if (keys.length === 0) return '';
  return keys.map(k => item[k]).join('');
}

// Score Badge Component
function ScoreBadge({ score, max = 10 }: { score: number; max?: number }) {
  const percentage = (score / max) * 100;
  const colorClass = percentage >= 70 ? "bg-green-500/10 text-green-600 border-green-500/30" 
    : percentage >= 40 ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
    : "bg-red-500/10 text-red-600 border-red-500/30";
  
  return (
    <Badge variant="outline" className={colorClass}>
      {score}/{max}
    </Badge>
  );
}

// Grade Badge Component
function GradeBadge({ grade, color }: { grade: string; color?: string }) {
  const colorMap: Record<string, string> = {
    "green-500": "bg-green-500/10 text-green-600 border-green-500/30",
    "amber-500": "bg-amber-500/10 text-amber-600 border-amber-500/30",
    "red-500": "bg-red-500/10 text-red-600 border-red-500/30",
  };
  
  const gradeColors: Record<string, string> = {
    "A+": "bg-green-500/10 text-green-600 border-green-500/30",
    "A": "bg-green-500/10 text-green-600 border-green-500/30",
    "B+": "bg-green-500/10 text-green-600 border-green-500/30",
    "B": "bg-amber-500/10 text-amber-600 border-amber-500/30",
    "C+": "bg-amber-500/10 text-amber-600 border-amber-500/30",
    "C": "bg-amber-500/10 text-amber-600 border-amber-500/30",
    "D": "bg-red-500/10 text-red-600 border-red-500/30",
    "F": "bg-red-500/10 text-red-600 border-red-500/30",
  };
  
  const colorClass = color ? (colorMap[color] || colorMap["red-500"]) : (gradeColors[grade] || colorMap["red-500"]);
  
  return (
    <Badge variant="outline" className={`text-lg px-3 py-1 ${colorClass}`}>
      {grade}
    </Badge>
  );
}

// Metric Card Component
function MetricCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    "green-500": "text-green-600",
    "amber-500": "text-amber-600",
    "red-500": "text-red-600",
  };
  const valueColor = color ? (colorMap[color] || "text-foreground") : 
    (value >= 7 ? "text-green-600" : value >= 4 ? "text-amber-600" : "text-red-600");
  
  return (
    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
      <span className="text-sm font-medium">{label}</span>
      <span className={`text-lg font-bold ${valueColor}`}>{value}/10</span>
    </div>
  );
}

// Action Item Component
function ActionItem({ action, badgeColor }: { action: string; badgeColor?: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Extract category from action text (e.g., "REWRITE TITLE:" -> "REWRITE TITLE")
  const categoryMatch = action.match(/^([A-Z\s]+):/);
  const category = categoryMatch ? categoryMatch[1].trim() : "ACTION";
  const content = categoryMatch ? action.slice(categoryMatch[0].length).trim() : action;
  
  const isLong = content.length > 150;
  const displayContent = isLong && !isExpanded ? content.slice(0, 150) + "..." : content;
  
  const categoryColors: Record<string, string> = {
    "REWRITE": "bg-purple-500/10 text-purple-600 border-purple-500/30",
    "REORDER": "bg-blue-500/10 text-blue-600 border-blue-500/30",
    "ADD": "bg-green-500/10 text-green-600 border-green-500/30",
    "ADDRESS": "bg-amber-500/10 text-amber-600 border-amber-500/30",
    "QUANTIFY": "bg-cyan-500/10 text-cyan-600 border-cyan-500/30",
    "CREATE": "bg-indigo-500/10 text-indigo-600 border-indigo-500/30",
    "REPLACE": "bg-rose-500/10 text-rose-600 border-rose-500/30",
    "LEVERAGE": "bg-teal-500/10 text-teal-600 border-teal-500/30",
  };
  
  const getCategoryColor = () => {
    for (const [key, color] of Object.entries(categoryColors)) {
      if (category.toUpperCase().includes(key)) return color;
    }
    return "bg-primary/10 text-primary border-primary/30";
  };
  
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
              onClick={() => setIsExpanded(!isExpanded)} 
              className="text-xs text-primary hover:underline mt-1"
            >
              {isExpanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Image Analysis Card Component
function ImageAnalysisCard({ image }: { image: any }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const purposeColors: Record<string, string> = {
    "Product Feature": "bg-blue-500/10 text-blue-600 border-blue-500/30",
    "Lifestyle": "bg-purple-500/10 text-purple-600 border-purple-500/30",
    "Trust": "bg-green-500/10 text-green-600 border-green-500/30",
    "Trust / Lifestyle": "bg-teal-500/10 text-teal-600 border-teal-500/30",
    "Trust / Benefit": "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    "Benefit": "bg-amber-500/10 text-amber-600 border-amber-500/30",
    "Benefit / Lifestyle": "bg-orange-500/10 text-orange-600 border-orange-500/30",
  };
  
  return (
    <Card className="overflow-hidden">
      <div className="aspect-square bg-muted relative">
        <img 
          src={image.url} 
          alt={image.description || "Product image"} 
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className="absolute top-2 right-2 flex gap-1">
          <Badge variant="outline" className={`text-xs ${
            image.score >= 8 ? "bg-green-500/90 text-white border-green-500" 
            : image.score >= 6 ? "bg-amber-500/90 text-white border-amber-500"
            : "bg-red-500/90 text-white border-red-500"
          }`}>
            {image.score}/10
          </Badge>
        </div>
        {image.purpose && (
          <div className="absolute bottom-2 left-2">
            <Badge variant="outline" className={`text-xs ${purposeColors[image.purpose] || "bg-muted text-foreground"}`}>
              {image.purpose}
            </Badge>
          </div>
        )}
      </div>
      <CardContent className="p-3 space-y-2">
        {image.description && (
          <p className="text-xs text-muted-foreground">{image.description}</p>
        )}
        {image.analysis && (
          <div>
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              {isExpanded ? "Hide analysis" : "View analysis"}
            </button>
            {isExpanded && (
              <p className="text-sm mt-2 p-2 bg-muted/50 rounded">{image.analysis}</p>
            )}
          </div>
        )}
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

  // Extract data from the ACTUAL format
  const details = ma.details || {};
  const copyAnalysis = details.copy_analysis || {};
  const customerSentiment = details.customer_sentiment || {};
  const scoreCard = ma.score_card || {};
  const visualGallery = ma.visual_gallery || {};
  const actionPlanRaw = ma.action_plan || [];

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

  // Action Plan - convert character-indexed objects to strings
  const actionPlan = actionPlanRaw.map((item: any) => ({
    text: convertCharIndexedToString(item),
    badgeColor: item.badge_color
  })).filter((item: any) => item.text.length > 0);

  // Check if we have any data
  const hasAnyData = 
    copyHooks.length > 0 ||
    primaryPraises.length > 0 ||
    primaryComplaints.length > 0 ||
    gapAnalysis.length > 0 ||
    Object.keys(scoreCard).length > 0 ||
    images.length > 0 ||
    actionPlan.length > 0;

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
      <Tabs defaultValue="score" className="w-full">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl mb-4">
          <TabsTrigger value="score" className="text-xs gap-1">
            <Star className="w-3 h-3" /> Score
          </TabsTrigger>
          <TabsTrigger value="copy" className="text-xs gap-1">
            <Lightbulb className="w-3 h-3" /> Copy
          </TabsTrigger>
          <TabsTrigger value="sentiment" className="text-xs gap-1">
            <MessageSquare className="w-3 h-3" /> Sentiment
          </TabsTrigger>
          <TabsTrigger value="actions" className="text-xs gap-1">
            <Zap className="w-3 h-3" /> Actions
          </TabsTrigger>
          <TabsTrigger value="visuals" className="text-xs gap-1">
            <ImageIcon className="w-3 h-3" /> Visuals
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: SCORE OVERVIEW */}
        <TabsContent value="score" className="mt-0 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Overall Grade Card */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Star className="w-4 h-4" /> Overall Grade
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-6">
                {overallGrade ? (
                  <>
                    <div className="text-5xl font-bold mb-2">
                      <GradeBadge grade={overallGrade} color={scoreColor} />
                    </div>
                    {overallScore !== undefined && (
                      <p className="text-sm text-muted-foreground">
                        Score: {overallScore}/10
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No grade available</p>
                )}
              </CardContent>
            </Card>

            {/* Metrics Breakdown */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Score Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {metrics.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {metrics.map((metric: any, i: number) => (
                      <MetricCard 
                        key={i} 
                        label={metric.label} 
                        value={metric.value} 
                        color={metric.color} 
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No metrics breakdown available
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 2: COPY ANALYSIS */}
        <TabsContent value="copy" className="mt-0 space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {/* Clarity Score */}
            {copyClarity !== undefined && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Target className="w-4 h-4" /> Copy Clarity
                    </CardTitle>
                    <ScoreBadge score={copyClarity} />
                  </div>
                </CardHeader>
              </Card>
            )}

            {/* Copy Hooks */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Lightbulb className="w-4 h-4" /> What the Copy Does Well
                </CardTitle>
              </CardHeader>
              <CardContent>
                {copyHooks.length > 0 ? (
                  <div className="space-y-2">
                    {copyHooks.map((hook: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-3 bg-green-500/5 rounded-md border border-green-500/20">
                        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                        <span className="text-sm">{hook}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No copy hooks identified
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 3: CUSTOMER SENTIMENT */}
        <TabsContent value="sentiment" className="mt-0 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Primary Praises */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" /> What Customers Love
                  {primaryPraises.length > 0 && (
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 ml-auto">
                      {primaryPraises.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {primaryPraises.length > 0 ? (
                  <div className="space-y-2">
                    {primaryPraises.map((praise: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-green-500/5 rounded-md">
                        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                        <span className="text-sm">{praise}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No praises identified
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Primary Complaints */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-amber-600" /> Customer Complaints
                  {primaryComplaints.length > 0 && (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 ml-auto">
                      {primaryComplaints.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {primaryComplaints.length > 0 ? (
                  <div className="space-y-2">
                    {primaryComplaints.map((complaint: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-amber-500/5 rounded-md">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span className="text-sm">{complaint}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No complaints identified
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Gap Analysis */}
            {gapAnalysis && (
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" /> Gap Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-4 bg-amber-500/5 rounded-md border border-amber-500/20">
                    <p className="text-sm leading-relaxed">{gapAnalysis}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* TAB 4: ACTION PLAN */}
        <TabsContent value="actions" className="mt-0 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" /> Recommended Actions
                {actionPlan.length > 0 && (
                  <Badge variant="outline" className="ml-auto">
                    {actionPlan.length} actions
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {actionPlan.length > 0 ? (
                <div className="space-y-3">
                  {actionPlan.map((item: any, i: number) => (
                    <ActionItem key={i} action={item.text} badgeColor={item.badgeColor} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No action items available
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 5: VISUAL GALLERY */}
        <TabsContent value="visuals" className="mt-0 space-y-4">
          {/* Target Audience / Vibe */}
          {(vibe || demographics.primary_audience) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4" /> Target Audience
                  {demographics.relatability_score !== undefined && (
                    <Badge variant="outline" className="ml-auto bg-primary/10 text-primary border-primary/30">
                      Relatability: {demographics.relatability_score}/10
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {vibe && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Visual Vibe:</p>
                    <p className="text-sm">{vibe}</p>
                  </div>
                )}
                {demographics.primary_audience && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Primary Audience:</p>
                    <p className="text-sm">{demographics.primary_audience}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Image Gallery */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ImageIcon className="w-4 h-4" /> Image Analysis
                {images.length > 0 && (
                  <Badge variant="outline" className="ml-auto">
                    {images.length} images
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {images.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {images.map((image: any, i: number) => (
                    <ImageAnalysisCard key={i} image={image} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No image analysis available
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
