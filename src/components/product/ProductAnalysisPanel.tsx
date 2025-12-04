import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadialGauge } from "@/components/ui/radial-gauge";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Target, Users, TrendingUp, FileText, Lightbulb, AlertTriangle,
  CheckCircle2, XCircle, Star, Quote, Megaphone, ShieldCheck,
  Image as ImageIcon, ThumbsUp, ThumbsDown, Package, Sparkles, ChevronDown,
  Clock, Zap, Heart, DollarSign
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

interface ProductAnalysisPanelProps {
  marketingAnalysis: any;
  reviewAnalysis: any;
  imageUrls?: string[];
}

// Helper Components
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

// Pain Point Card with expandable quotes
function PainPointCard({ painPoint }: { painPoint: any }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-l-4 border-l-yellow-500 bg-yellow-500/5">
        <CardContent className="p-3">
          <CollapsibleTrigger className="w-full text-left">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-sm">{painPoint.issue || painPoint.category}</p>
                  {painPoint.frequency && (
                    <p className="text-xs text-muted-foreground">{painPoint.frequency}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(painPoint.affected_percentage || painPoint.percentage) && (
                  <Badge variant="secondary" className="text-xs">
                    {painPoint.affected_percentage || painPoint.percentage}% affected
                  </Badge>
                )}
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {(painPoint.representative_quotes || painPoint.quotes) && (
              <div className="mt-3 pt-3 border-t space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Customer Quotes:</p>
                {(painPoint.representative_quotes || painPoint.quotes)?.slice(0, 3).map((quote: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground bg-background/50 p-2 rounded">
                    <Quote className="w-3 h-3 mt-0.5 shrink-0" />
                    <span className="italic">"{quote}"</span>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
}

// Experience Card Component - handles various DB field structures
function ExperienceCard({ 
  title, 
  icon: Icon, 
  data 
}: { 
  title: string; 
  icon: React.ElementType; 
  data: any;
}) {
  if (!data) return null;
  
  // Handle different count field names in DB
  const positiveCount = data.positive_count || data.works_count || data.good_value_count || 0;
  const negativeCount = data.negative_count || data.no_effect_count || data.overpriced_count || 0;
  const neutralCount = data.neutral_count || data.mixed_count || data.fair_price_count || 0;
  
  const total = positiveCount + negativeCount + neutralCount;
  const sentiment = total > 0 ? (positiveCount / total) : 0.5;
  
  const borderColor = sentiment >= 0.6 ? "border-l-green-500" : sentiment >= 0.4 ? "border-l-yellow-500" : "border-l-red-500";
  const bgColor = sentiment >= 0.6 ? "bg-green-500/5" : sentiment >= 0.4 ? "bg-yellow-500/5" : "bg-red-500/5";
  
  return (
    <Card className={`border-l-4 ${borderColor} ${bgColor}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4" />
            {title}
          </div>
          {total > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-green-600 flex items-center gap-1">
                <ThumbsUp className="w-3 h-3" /> {positiveCount}
              </span>
              {neutralCount > 0 && (
                <span className="text-muted-foreground">{neutralCount}</span>
              )}
              <span className="text-red-600 flex items-center gap-1">
                <ThumbsDown className="w-3 h-3" /> {negativeCount}
              </span>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        <p>{data.key_insights || data.summary || "No insights available"}</p>
        {data.time_to_see_results && data.time_to_see_results !== "Not mentioned" && (
          <p className="mt-1"><span className="font-medium">Time to results:</span> {data.time_to_see_results}</p>
        )}
        {data.common_descriptors && data.common_descriptors.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {data.common_descriptors.map((d: string, i: number) => (
              <Badge key={i} variant="outline" className="text-xs">{d}</Badge>
            ))}
          </div>
        )}
        {data.specific_issues && data.specific_issues.length > 0 && (
          <div className="mt-2 space-y-1">
            {data.specific_issues.slice(0, 3).map((issue: string, i: number) => (
              <p key={i} className="text-red-600">• {issue}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Sentiment Chart Colors
const SENTIMENT_COLORS = ["#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"];

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
  const ra = reviewAnalysis || {};

  // Extract scores from score_card (correct path)
  const scoreCard = ma.score_card || {};
  const grade = scoreCard.overall_grade;
  const score = scoreCard.overall_score ?? 0;
  const scoreColor = scoreCard.score_color;
  const summary = scoreCard.summary_text;
  
  // Get metrics array from score_card
  const scoreMetrics = scoreCard.metrics || [];
  
  // Get visual gallery data
  const visualGallery = ma.visual_gallery || {};
  const galleryImages = visualGallery.images || [];
  const galleryDemographics = visualGallery.demographics || {};
  
  // Get details for customer sentiment and copy analysis
  const details = ma.details || {};
  const customerSentiment = details.customer_sentiment || {};
  const copyAnalysis = details.copy_analysis || {};

  // Prepare sentiment data - handle nested object structure from DB
  const sentimentData = ra.sentiment_distribution 
    ? Object.entries(ra.sentiment_distribution)
        .map(([key, val]: [string, any]) => ({
          name: key.replace(/_/g, ' ').replace(/(\d)star/, '$1★'),
          value: typeof val === 'object' ? (val.percentage || val.count || 0) : val,
          count: typeof val === 'object' ? val.count : undefined,
          themes: typeof val === 'object' ? val.key_themes : undefined,
        }))
        .filter(d => d.value > 0)
        .sort((a, b) => {
          const getStarNum = (name: string) => {
            const match = name.match(/(\d)/);
            return match ? parseInt(match[1]) : 0;
          };
          return getStarNum(b.name) - getStarNum(a.name);
        })
    : [];

  // Get pain points
  const painPoints = ra.pain_points || [];
  
  // Get positive themes
  const positiveThemes = ra.positive_themes || [];
  
  // Get product experience
  const productExperience = ra.product_experience_breakdown || {};
  
  // Get optimization opportunities from details.action_plan or fallback
  const actionPlan = details.action_plan || [];
  const optimizationOpps = ma.optimization_opportunities || actionPlan;
  const actionableRecs = ra.actionable_recommendations || [];
  
  // Combine and sort by priority
  const allActions = [
    ...optimizationOpps.map((o: any) => ({ ...o, source: 'marketing' })),
    ...actionableRecs.map((r: any) => ({ 
      area: r.area || r.category, 
      suggestion: r.recommendation || r.suggestion,
      priority: r.priority || 'Medium',
      expected_impact: r.expected_impact,
      source: 'review' 
    }))
  ].sort((a, b) => {
    const priorityOrder: Record<string, number> = { 'High': 0, 'Medium': 1, 'Low': 2 };
    return (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1);
  });

  return (
    <div className="p-4 bg-muted/30 border-t">
      <Tabs defaultValue="scorecard" className="w-full">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="scorecard" className="text-xs">Scorecard</TabsTrigger>
          <TabsTrigger value="gallery" className="text-xs">Gallery</TabsTrigger>
          <TabsTrigger value="reviews" className="text-xs">Reviews</TabsTrigger>
          <TabsTrigger value="experience" className="text-xs">Experience</TabsTrigger>
          <TabsTrigger value="actions" className="text-xs">Actions</TabsTrigger>
        </TabsList>

        {/* SECTION 1: HERO SCORECARD */}
        <TabsContent value="scorecard" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Main Score Card */}
            <Card className="lg:col-span-1">
              <CardContent className="pt-6 flex flex-col items-center">
                <RadialGauge 
                  value={score} 
                  max={100} 
                  size={140}
                  strokeWidth={12}
                  grade={grade}
                  showValue={true}
                />
                <p className="mt-4 text-sm text-center text-muted-foreground max-w-xs">
                  {summary || "Marketing effectiveness score based on copy, visuals, and trust signals."}
                </p>
              </CardContent>
            </Card>

            {/* Score Metrics from score_card.metrics */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Score Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {scoreMetrics.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      {scoreMetrics.slice(0, Math.ceil(scoreMetrics.length / 2)).map((metric: any, i: number) => (
                        <ScoreGauge 
                          key={i}
                          score={metric.score ?? 0} 
                          label={metric.name || metric.metric} 
                        />
                      ))}
                    </div>
                    <div className="space-y-3">
                      {scoreMetrics.slice(Math.ceil(scoreMetrics.length / 2)).map((metric: any, i: number) => (
                        <ScoreGauge 
                          key={i}
                          score={metric.score ?? 0} 
                          label={metric.name || metric.metric} 
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <ScoreGauge score={copyAnalysis.clarity ?? 0} label="Copy Clarity" />
                      <ScoreGauge score={0} label="Visual Appeal" />
                      <ScoreGauge score={0} label="Trust Score" />
                    </div>
                    <div className="space-y-3">
                      <ScoreGauge score={0} label="Positioning" />
                      <ScoreGauge score={galleryDemographics.relatability_score ?? 0} label="Audience Targeting" />
                      <ScoreGauge score={0} label="Message Consistency" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* SECTION 2: VISUAL GALLERY - uses visual_gallery.images */}
        <TabsContent value="gallery" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Product Images Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                {galleryImages.length > 0 ? (
                  <Carousel className="w-full">
                    <CarouselContent>
                      {galleryImages.map((img: any, index: number) => (
                        <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/3">
                          <Card className="overflow-hidden">
                            <img 
                              src={img.url || imageUrls?.[index]} 
                              alt={img.purpose || `Product image ${index + 1}`}
                              className="w-full h-40 object-contain bg-white"
                            />
                            <CardContent className="p-2 space-y-1">
                              <div className="flex items-center justify-between">
                                <Badge variant="outline" className="text-xs">
                                  {img.purpose || `Image ${index + 1}`}
                                </Badge>
                                {img.score && (
                                  <Badge 
                                    variant="secondary" 
                                    className={`text-xs ${img.score >= 7 ? 'bg-green-500/10 text-green-600' : img.score >= 5 ? 'bg-yellow-500/10 text-yellow-600' : 'bg-red-500/10 text-red-600'}`}
                                  >
                                    {img.score}/10
                                  </Badge>
                                )}
                              </div>
                              {img.analysis && (
                                <p className="text-xs text-muted-foreground line-clamp-2">{img.analysis}</p>
                              )}
                            </CardContent>
                          </Card>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    <CarouselPrevious />
                    <CarouselNext />
                  </Carousel>
                ) : imageUrls && imageUrls.length > 0 ? (
                  <Carousel className="w-full">
                    <CarouselContent>
                      {imageUrls.map((url, index) => (
                        <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/3">
                          <Card className="overflow-hidden">
                            <img src={url} alt={`Product image ${index + 1}`} className="w-full h-40 object-contain bg-white" />
                            <CardContent className="p-2">
                              <Badge variant="outline" className="text-xs">Image {index + 1}</Badge>
                            </CardContent>
                          </Card>
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    <CarouselPrevious />
                    <CarouselNext />
                  </Carousel>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No product images available</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Visual & Audience Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {galleryDemographics.primary_audience && (
                  <div>
                    <span className="text-xs text-muted-foreground">Target Audience</span>
                    <p className="text-sm font-medium">{galleryDemographics.primary_audience}</p>
                  </div>
                )}
                {galleryDemographics.relatability_score && (
                  <div>
                    <span className="text-xs text-muted-foreground">Relatability Score</span>
                    <div className="flex items-center gap-2">
                      <Progress value={galleryDemographics.relatability_score * 10} className="h-2 flex-1" />
                      <span className="text-sm font-medium">{galleryDemographics.relatability_score}/10</span>
                    </div>
                  </div>
                )}
                {/* Customer Sentiment from details */}
                {customerSentiment.primary_praises && customerSentiment.primary_praises.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">What Customers Love</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {customerSentiment.primary_praises.slice(0, 4).map((praise: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">{praise}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {customerSentiment.primary_complaints && customerSentiment.primary_complaints.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Common Complaints</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {customerSentiment.primary_complaints.slice(0, 4).map((complaint: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs bg-red-500/10 text-red-600 border-red-500/30">{complaint}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {customerSentiment.gap_analysis && (
                  <div>
                    <span className="text-xs text-muted-foreground">Gap Analysis</span>
                    <p className="text-sm text-muted-foreground">{customerSentiment.gap_analysis}</p>
                  </div>
                )}
                {/* Copy Analysis Hooks */}
                {copyAnalysis.hooks && copyAnalysis.hooks.length > 0 && (
                  <div>
                    <span className="text-xs text-muted-foreground">Copy Hooks</span>
                    <div className="space-y-1 mt-1">
                      {copyAnalysis.hooks.slice(0, 3).map((hook: string, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground">• {hook}</p>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* SECTION 3: VOICE OF CUSTOMER */}
        <TabsContent value="reviews" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Sentiment Distribution */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Star className="w-4 h-4" />
                  Sentiment Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sentimentData.length > 0 ? (
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
                        >
                          {sentimentData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={SENTIMENT_COLORS[index % SENTIMENT_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => `${value}%`} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap justify-center gap-2 mt-2">
                      {sentimentData.map((entry, index) => (
                        <div key={entry.name} className="flex items-center gap-1 text-xs">
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: SENTIMENT_COLORS[index % SENTIMENT_COLORS.length] }} 
                          />
                          <span>{entry.name}: {entry.value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No sentiment data available
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Pain Points */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                  Pain Points ({painPoints.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-72 overflow-y-auto">
                {painPoints.length > 0 ? (
                  painPoints.slice(0, 5).map((pp: any, i: number) => (
                    <PainPointCard key={i} painPoint={pp} />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No pain points identified
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Positive Themes */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  Positive Themes ({positiveThemes.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {positiveThemes.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {positiveThemes.map((theme: any, i: number) => {
                      const themeName = typeof theme === 'string' ? theme : theme.theme || theme.category;
                      const themeCount = typeof theme === 'object' 
                        ? (theme.frequency || theme.mentioned_by_percentage || theme.mention_count || theme.count) 
                        : null;
                      return (
                        <Badge
                          key={i} 
                          variant="outline" 
                          className="bg-green-500/10 text-green-600 border-green-500/30"
                        >
                          {themeName}
                          {themeCount && <span className="ml-1 opacity-70">({themeCount})</span>}
                        </Badge>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No positive themes identified
                  </p>
                )}
                
                {/* Feature Requests */}
                {ra.feature_requests && ra.feature_requests.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Lightbulb className="w-3 h-3" /> Feature Requests
                    </p>
                    <div className="space-y-1">
                      {ra.feature_requests.slice(0, 4).map((req: any, i: number) => (
                        <div key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                          <span className="text-yellow-600">•</span>
                          <span>{typeof req === 'string' ? req : req.request || req.feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* SECTION 4: PRODUCT EXPERIENCE BREAKDOWN */}
        <TabsContent value="experience" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <ExperienceCard 
              title="Taste" 
              icon={Heart} 
              data={productExperience.taste_feedback || productExperience.taste} 
            />
            <ExperienceCard 
              title="Efficacy" 
              icon={Zap} 
              data={productExperience.efficacy_feedback || productExperience.efficacy} 
            />
            <ExperienceCard 
              title="Value" 
              icon={DollarSign} 
              data={productExperience.value_perception || productExperience.value} 
            />
            <ExperienceCard 
              title="Packaging" 
              icon={Package} 
              data={productExperience.packaging_quality || productExperience.packaging_feedback || productExperience.packaging} 
            />
          </div>
          
          {/* Demographics Section - handles both field name variants */}
          {(ra.demographics_insights || ra.buyer_demographics) && (() => {
            const demo = ra.demographics_insights || ra.buyer_demographics;
            return (
              <Card className="mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Buyer Demographics
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {demo.buyer_types && demo.buyer_types.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">Buyer Types</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {demo.buyer_types.map((type: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{type}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {demo.use_cases && demo.use_cases.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">Use Cases</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {demo.use_cases.map((uc: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{uc}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {demo.age_groups_mentioned && demo.age_groups_mentioned.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">Age Groups</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {demo.age_groups_mentioned.map((age: string, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">{age}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>

        {/* SECTION 5: MARKETING ACTION PLAN */}
        <TabsContent value="actions" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Action Plan ({allActions.length} items)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {allActions.length > 0 ? (
                <div className="space-y-3">
                  {allActions.map((action: any, i: number) => {
                    const priorityColors: Record<string, string> = {
                      'High': 'bg-red-500/10 text-red-600 border-red-500/30',
                      'Medium': 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
                      'Low': 'bg-blue-500/10 text-blue-600 border-blue-500/30',
                    };
                    const borderColors: Record<string, string> = {
                      'High': 'border-l-red-500',
                      'Medium': 'border-l-yellow-500',
                      'Low': 'border-l-blue-500',
                    };
                    
                    return (
                      <Card key={i} className={`border-l-4 ${borderColors[action.priority] || 'border-l-muted'}`}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className={`text-xs ${priorityColors[action.priority] || ''}`}>
                                  {action.priority || 'Medium'}
                                </Badge>
                                {action.area && (
                                  <Badge variant="secondary" className="text-xs">
                                    {action.area}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm">{action.suggestion}</p>
                              {action.expected_impact && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  <span className="font-medium">Expected Impact:</span> {action.expected_impact}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No action items identified
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
