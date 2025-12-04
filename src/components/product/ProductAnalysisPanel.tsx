import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  AlertTriangle, CheckCircle2, Lightbulb, Zap, Image as ImageIcon,
  Users, MessageSquare, Target, TrendingUp, XCircle
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
  // Extract category from action text (e.g., "REWRITE TITLE:" -> "REWRITE TITLE")
  const categoryMatch = action.match(/^([A-Z\s]+):/);
  const category = categoryMatch ? categoryMatch[1].trim() : "ACTION";
  const content = categoryMatch ? action.slice(categoryMatch[0].length).trim() : action;
  
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
  
  const badgeColorMap: Record<string, string> = {
    "blue": "bg-blue-500/10 text-blue-600 border-blue-500/30",
    "green": "bg-green-500/10 text-green-600 border-green-500/30",
    "red": "bg-red-500/10 text-red-600 border-red-500/30",
    "amber": "bg-amber-500/10 text-amber-600 border-amber-500/30",
    "purple": "bg-purple-500/10 text-purple-600 border-purple-500/30",
  };
  
  const getCategoryColor = () => {
    // First check if badgeColor is provided
    if (badgeColor && badgeColorMap[badgeColor]) {
      return badgeColorMap[badgeColor];
    }
    // Then check category keywords
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
        <p className="text-sm flex-1">{content}</p>
      </div>
    </div>
  );
}

// Image Analysis Card Component - shows ALL data
function ImageAnalysisCard({ image }: { image: any }) {
  const purposeColors: Record<string, string> = {
    "Product Feature": "bg-blue-500/10 text-blue-600 border-blue-500/30",
    "Lifestyle": "bg-purple-500/10 text-purple-600 border-purple-500/30",
    "Trust": "bg-green-500/10 text-green-600 border-green-500/30",
    "Trust / Lifestyle": "bg-teal-500/10 text-teal-600 border-teal-500/30",
    "Trust / Benefit": "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    "Benefit": "bg-amber-500/10 text-amber-600 border-amber-500/30",
    "Benefit / Lifestyle": "bg-orange-500/10 text-orange-600 border-orange-500/30",
  };

  const typeColors: Record<string, string> = {
    "main": "bg-primary/10 text-primary border-primary/30",
    "gallery": "bg-muted text-muted-foreground",
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
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
          {image.type && (
            <Badge variant="outline" className={`text-xs ${typeColors[image.type] || "bg-muted text-foreground"}`}>
              {image.type}
            </Badge>
          )}
          {image.purpose && (
            <Badge variant="outline" className={`text-xs ${purposeColors[image.purpose] || "bg-muted text-foreground"}`}>
              {image.purpose}
            </Badge>
          )}
        </div>
      </div>
      <CardContent className="p-3 space-y-3">
        {image.description && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Description:</p>
            <p className="text-sm">{image.description}</p>
          </div>
        )}
        {image.analysis && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Analysis:</p>
            <p className="text-sm">{image.analysis}</p>
          </div>
        )}
        {image.url && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">URL:</p>
            <a href={image.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline break-all">
              {image.url}
            </a>
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
      <Tabs defaultValue="copy" className="w-full">
        <TabsList className="grid grid-cols-4 w-full max-w-xl mb-4">
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

        {/* TAB 1: COPY ANALYSIS */}
        <TabsContent value="copy" className="mt-0 space-y-4">
          {/* Score Card Summary - moved here */}
          {(overallGrade || metrics.length > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Score Card
                  </CardTitle>
                  {overallGrade && (
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className={`text-lg px-3 py-1 ${
                          scoreColor === "green-500" ? "bg-green-500/10 text-green-600 border-green-500/30" :
                          scoreColor === "amber-500" ? "bg-amber-500/10 text-amber-600 border-amber-500/30" :
                          "bg-red-500/10 text-red-600 border-red-500/30"
                        }`}
                      >
                        Grade: {overallGrade}
                      </Badge>
                      {overallScore !== undefined && (
                        <Badge variant="outline">Score: {overallScore}/10</Badge>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {metrics.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {metrics.map((metric: any, i: number) => (
                      <MetricCard 
                        key={i} 
                        label={metric.label} 
                        value={metric.value} 
                        color={metric.color} 
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Clarity Score */}
          {copyClarity !== undefined && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="w-4 h-4" /> Copy Clarity Score
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
                <Lightbulb className="w-4 h-4" /> What the Copy Does Well (Hooks)
                <Badge variant="outline" className="ml-auto">{copyHooks.length} items</Badge>
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
        </TabsContent>

        {/* TAB 2: CUSTOMER SENTIMENT */}
        <TabsContent value="sentiment" className="mt-0 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Primary Praises */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" /> Primary Praises
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 ml-auto">
                    {primaryPraises.length} items
                  </Badge>
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
                  <XCircle className="w-4 h-4 text-amber-600" /> Primary Complaints
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 ml-auto">
                    {primaryComplaints.length} items
                  </Badge>
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
          </div>

          {/* Gap Analysis - Full text, no truncation */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" /> Gap Analysis (Copy vs Customer Needs)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {gapAnalysis ? (
                <div className="p-4 bg-amber-500/5 rounded-md border border-amber-500/20">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{gapAnalysis}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No gap analysis available
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: ACTION PLAN */}
        <TabsContent value="actions" className="mt-0 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" /> Action Plan
                <Badge variant="outline" className="ml-auto">
                  {actionPlan.length} actions
                </Badge>
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

        {/* TAB 4: VISUAL GALLERY */}
        <TabsContent value="visuals" className="mt-0 space-y-4">
          {/* Target Audience / Vibe - Full text */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="w-4 h-4" /> Visual Gallery Demographics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {vibe && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Vibe:</p>
                  <p className="text-sm p-3 bg-muted/50 rounded-md">{vibe}</p>
                </div>
              )}
              {demographics.primary_audience && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Primary Audience:</p>
                  <p className="text-sm p-3 bg-muted/50 rounded-md">{demographics.primary_audience}</p>
                </div>
              )}
              {demographics.relatability_score !== undefined && (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground font-medium">Relatability Score:</p>
                  <ScoreBadge score={demographics.relatability_score} />
                </div>
              )}
              {!vibe && !demographics.primary_audience && demographics.relatability_score === undefined && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No demographic data available
                </p>
              )}
            </CardContent>
          </Card>

          {/* Image Gallery - Full analysis, no truncation */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ImageIcon className="w-4 h-4" /> Image Analysis
                <Badge variant="outline" className="ml-auto">
                  {images.length} images
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {images.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
