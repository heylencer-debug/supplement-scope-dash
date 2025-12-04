import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Star, TrendingUp, TrendingDown, AlertCircle, CheckCircle, Target, Users, Beaker, 
  Lightbulb, ShoppingCart, Package, Image, BarChart3, DollarSign, Calendar, 
  ExternalLink, Play, Award, Info, ChevronDown, Truck, FileText, Box, Link2
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis } from "recharts";
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
  target_demographics?: {
    age_range?: string;
    primary_audience?: string;
    gender_representation?: string;
    ethnicity_representation?: string;
    body_types_shown?: string;
    fitness_level_shown?: string;
    relatability_score?: number;
  } | string;
  overall_score?: number;
  opportunities?: string[];
  positioning_suggestions?: string[];
  image_analysis?: {
    overall_quality_score?: number;
    main_image_assessment?: { clarity?: number; professionalism?: number; product_visibility?: number; background_quality?: string; lighting_quality?: string };
    lifestyle_imagery?: { present?: boolean; effectiveness?: number; use_case_clarity?: string; emotional_appeal?: string };
    infographic_usage?: { present?: boolean; information_clarity?: number; data_visualization?: string };
    label_visibility?: { supplement_facts_visible?: boolean; ingredients_readable?: boolean; claims_prominent?: boolean };
    image_count_assessment?: { total_images?: number; recommended?: number; variety_score?: number };
    improvement_suggestions?: string[];
    strengths?: string[];
  };
}

interface ReviewAnalysis {
  pain_points?: Array<{ category?: string; theme?: string; issue?: string; frequency: number; severity?: string; quotes?: string[]; representative_quotes?: string[]; affected_percentage?: number }>;
  positive_themes?: Array<{ theme: string; frequency: number; impact?: string; representative_quotes?: string[]; mentioned_by_percentage?: number }>;
  feature_requests?: Array<{ request: string; frequency: number; priority?: string }>;
  key_insights?: string[];
  sentiment_distribution?: { 
    positive?: number; 
    neutral?: number; 
    negative?: number;
    very_positive_5star?: { percentage: number; count: number; key_themes?: string[] };
    positive_4star?: { percentage: number; count: number; key_themes?: string[] };
    neutral_3star?: { percentage: number; count: number; key_themes?: string[] };
    negative_2star?: { percentage: number; count: number; key_themes?: string[] };
    very_negative_1star?: { percentage: number; count: number; key_themes?: string[] };
  };
  demographics_insights?: { buyer_types?: string[]; use_cases?: string[]; age_groups_mentioned?: string[] };
  product_experience_breakdown?: {
    taste_feedback?: { positive_count?: number; negative_count?: number; neutral_count?: number; common_descriptors?: string[]; key_insights?: string };
    efficacy_feedback?: { works_count?: number; no_effect_count?: number; mixed_count?: number; time_to_see_results?: string; key_insights?: string };
    value_perception?: { good_value_count?: number; overpriced_count?: number; fair_price_count?: number; key_insights?: string };
    packaging_quality?: { positive_count?: number; negative_count?: number; specific_issues?: string[]; key_insights?: string };
  };
  competitor_comparisons?: {
    brands_mentioned?: string[];
    wins_against_competitors?: string[];
    loses_against_competitors?: string[];
  };
  actionable_recommendations?: Array<{ area: string; recommendation: string; priority: string; rationale?: string }>;
  analysis_metadata?: { total_reviews_analyzed?: number; verified_purchase_rate?: number; average_helpful_votes?: number; analysis_quality?: string };
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
  const [selectedImage, setSelectedImage] = useState(0);

  if (!product) return null;

  const marketingAnalysis = product.marketing_analysis as MarketingAnalysis | null;
  const reviewAnalysis = product.review_analysis as ReviewAnalysis | null;
  const allNutrients = product.all_nutrients as unknown as Nutrient[] | null;
  const proprietaryBlends = product.proprietary_blends as unknown as ProprietaryBlend[] | null;
  const specifications = product.specifications as Record<string, string> | null;
  const importantInfo = product.important_information as Record<string, string | string[]> | null;
  const categoryTree = product.category_tree as Array<{ name: string; url?: string }> | null;

  const allImages = [
    product.main_image_url,
    ...(product.image_urls ?? [])
  ].filter(Boolean) as string[];

  const getOverallScore = () => {
    if (marketingAnalysis?.overall_score) return marketingAnalysis.overall_score;
    const rating = product.rating ?? 0;
    const reviews = product.reviews ?? 0;
    return Math.min(100, Math.round((rating / 5) * 50 + Math.min(reviews / 100, 50)));
  };

  const getSeverityColor = (severity?: string) => {
    switch (severity?.toLowerCase()) {
      case "high": return "text-destructive";
      case "medium": return "text-chart-2";
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

  const getLqsColor = (lqs: number) => {
    if (lqs >= 80) return "text-chart-4";
    if (lqs >= 50) return "text-chart-2";
    return "text-destructive";
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value == null) return "-";
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString();
  };

  // Build sentiment data - support both simple and detailed 5-star formats
  const sentimentData = reviewAnalysis?.sentiment_distribution
    ? reviewAnalysis.sentiment_distribution.very_positive_5star
      ? [
          { name: "5★", value: reviewAnalysis.sentiment_distribution.very_positive_5star?.percentage ?? 0, color: "hsl(var(--chart-2))" },
          { name: "4★", value: reviewAnalysis.sentiment_distribution.positive_4star?.percentage ?? 0, color: "hsl(var(--chart-3))" },
          { name: "3★", value: reviewAnalysis.sentiment_distribution.neutral_3star?.percentage ?? 0, color: "hsl(var(--chart-4))" },
          { name: "2★", value: reviewAnalysis.sentiment_distribution.negative_2star?.percentage ?? 0, color: "hsl(var(--chart-5))" },
          { name: "1★", value: reviewAnalysis.sentiment_distribution.very_negative_1star?.percentage ?? 0, color: "hsl(var(--destructive))" }
        ].filter(d => d.value > 0)
      : [
          { name: "Positive", value: reviewAnalysis.sentiment_distribution.positive ?? 0, color: SENTIMENT_COLORS.positive },
          { name: "Neutral", value: reviewAnalysis.sentiment_distribution.neutral ?? 0, color: SENTIMENT_COLORS.neutral },
          { name: "Negative", value: reviewAnalysis.sentiment_distribution.negative ?? 0, color: SENTIMENT_COLORS.negative }
        ].filter(d => d.value > 0)
    : [];

  const scrollableContentClass = "overflow-y-auto pr-2";
  const maxContentHeight = "max-h-[calc(70vh-140px)]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader className="pb-2 shrink-0">
          <DialogTitle className="text-xl font-bold pr-8 line-clamp-2">
            {product.title ?? "Product Details"}
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{product.brand}</span>
            <span>•</span>
            <span className="font-semibold text-foreground">${(product.price ?? 0).toFixed(2)}</span>
            <span>•</span>
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span>{(product.rating ?? 0).toFixed(1)}</span>
            </div>
            <span>•</span>
            <span>{(product.reviews ?? 0).toLocaleString()} reviews</span>
            {product.asin && (
              <>
                <span>•</span>
                <a 
                  href={`https://amazon.com/dp/${product.asin}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  {product.asin}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </>
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="grid w-full grid-cols-5 shrink-0">
            <TabsTrigger value="overview" className="gap-1 text-xs">
              <Image className="w-3 h-3" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="sales" className="gap-1 text-xs">
              <BarChart3 className="w-3 h-3" />
              Sales
            </TabsTrigger>
            <TabsTrigger value="marketing" className="gap-1 text-xs">
              <Target className="w-3 h-3" />
              Marketing
            </TabsTrigger>
            <TabsTrigger value="reviews" className="gap-1 text-xs">
              <Users className="w-3 h-3" />
              Reviews
            </TabsTrigger>
            <TabsTrigger value="formula" className="gap-1 text-xs">
              <Beaker className="w-3 h-3" />
              Formula
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className={`mt-4 ${scrollableContentClass} ${maxContentHeight}`}>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allImages.length > 0 && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="aspect-square rounded-lg overflow-hidden border bg-muted mb-3">
                        <img src={allImages[selectedImage]} alt={product.title ?? "Product"} className="w-full h-full object-contain" />
                      </div>
                      {allImages.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {allImages.slice(0, 8).map((url, idx) => (
                            <button key={idx} onClick={() => setSelectedImage(idx)} className={`w-14 h-14 rounded border overflow-hidden shrink-0 ${selectedImage === idx ? "ring-2 ring-primary" : ""}`}>
                              <img src={url} alt="" className="w-full h-full object-contain bg-muted" />
                            </button>
                          ))}
                          {allImages.length > 8 && <div className="w-14 h-14 rounded border flex items-center justify-center text-xs text-muted-foreground bg-muted">+{allImages.length - 8}</div>}
                        </div>
                      )}
                      {product.video_urls && product.video_urls.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Videos ({product.video_count ?? product.video_urls.length})</p>
                          <div className="flex gap-2">
                            {product.video_urls.slice(0, 3).map((url, idx) => (
                              <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                                <Play className="w-3 h-3" /> Video {idx + 1}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Award className="w-4 h-4" />Status & Badges</CardTitle></CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {product.bestseller && <Badge className="bg-chart-2/10 text-chart-2 border-chart-2/30">Bestseller</Badge>}
                        {product.amazon_choice && <Badge className="bg-chart-3/10 text-chart-3 border-chart-3/30">Amazon's Choice</Badge>}
                        {product.is_young_competitor && <Badge className="bg-chart-4/10 text-chart-4 border-chart-4/30">New Competitor</Badge>}
                        {product.is_fba && <Badge variant="outline">FBA</Badge>}
                        {product.is_available === false && <Badge variant="destructive">Unavailable</Badge>}
                        {product.has_a_plus_content && <Badge variant="secondary">A+ Content</Badge>}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Truck className="w-4 h-4" />Seller & Manufacturer</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <div><p className="text-xs text-muted-foreground">Brand</p><p className="font-medium">{product.brand ?? "-"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Manufacturer</p><p className="font-medium">{product.manufacturer ?? product.manufacturer_from_label ?? "-"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Seller</p><p className="font-medium">{product.seller_name ?? "-"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Seller Type</p><p className="font-medium">{product.seller_type ?? "-"}</p></div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Box className="w-4 h-4" />Physical Details</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <div><p className="text-xs text-muted-foreground">Packaging</p><p className="font-medium">{product.packaging_type ?? "-"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Weight</p><p className="font-medium">{product.weight ?? "-"}</p></div>
                        <div className="col-span-2"><p className="text-xs text-muted-foreground">Dimensions</p><p className="font-medium">{product.dimensions ?? "-"}</p></div>
                      </div>
                      {product.flavor_options && product.flavor_options.length > 0 && (
                        <div className="pt-2">
                          <p className="text-xs text-muted-foreground mb-2">Flavor Options ({product.variations_count ?? product.flavor_options.length})</p>
                          <div className="flex flex-wrap gap-1">
                            {product.flavor_options.slice(0, 8).map((flavor, idx) => <Badge key={idx} variant="outline" className="text-xs">{flavor}</Badge>)}
                            {product.flavor_options.length > 8 && <Badge variant="outline" className="text-xs">+{product.flavor_options.length - 8}</Badge>}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Calendar className="w-4 h-4" />Timeline</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <div><p className="text-xs text-muted-foreground">First Available</p><p className="font-medium">{formatDate(product.date_first_available)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Listing Since</p><p className="font-medium">{formatDate(product.listing_since)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Launch Date</p><p className="font-medium">{formatDate(product.launch_date)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Age</p><p className="font-medium">{product.age_months ? `${product.age_months} months` : "-"}</p></div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
              {product.feature_bullets && product.feature_bullets.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><CheckCircle className="w-4 h-4 text-chart-4" />Feature Bullets ({product.bullets_count ?? product.feature_bullets.length})</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {product.feature_bullets.map((bullet, idx) => <li key={idx} className="flex items-start gap-2 text-sm"><span className="text-primary mt-1">•</span><span>{bullet}</span></li>)}
                    </ul>
                  </CardContent>
                </Card>
              )}
              {product.description_text && (
                <Collapsible>
                  <Card>
                    <CardHeader className="pb-2">
                      <CollapsibleTrigger className="flex items-center justify-between w-full">
                        <CardTitle className="text-sm font-medium flex items-center gap-2"><FileText className="w-4 h-4" />Description ({product.description_length ?? product.description_text.length} chars)</CardTitle>
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      </CollapsibleTrigger>
                    </CardHeader>
                    <CollapsibleContent><CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{product.description_text}</p></CardContent></CollapsibleContent>
                  </Card>
                </Collapsible>
              )}
              {(product.claims || (product.claims_on_label && product.claims_on_label.length > 0)) && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Product Claims</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {product.claims && <p className="text-sm text-muted-foreground">{product.claims}</p>}
                    {product.claims_on_label && product.claims_on_label.length > 0 && <div className="flex flex-wrap gap-2">{product.claims_on_label.map((claim, idx) => <Badge key={idx} variant="secondary">{claim}</Badge>)}</div>}
                  </CardContent>
                </Card>
              )}
              {categoryTree && categoryTree.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Link2 className="w-4 h-4" />Category Path</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center gap-1 text-sm">{categoryTree.map((cat, idx) => <span key={idx} className="flex items-center gap-1">{idx > 0 && <span className="text-muted-foreground">›</span>}<span className="text-muted-foreground">{cat.name}</span></span>)}</div>
                    {product.categories_flat && <p className="text-xs text-muted-foreground mt-2">{product.categories_flat}</p>}
                  </CardContent>
                </Card>
              )}
              {product.product_url && (
                <Card><CardContent className="py-3"><a href={product.product_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline"><ExternalLink className="w-4 h-4" />View on Amazon</a></CardContent></Card>
              )}
            </div>
          </TabsContent>

          {/* Sales Tab */}
          <TabsContent value="sales" className={`mt-4 ${scrollableContentClass} ${maxContentHeight}`}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Monthly Sales</p><p className="text-2xl font-bold">{product.monthly_sales?.toLocaleString() ?? "-"}</p>{product.estimated_monthly_sales && product.estimated_monthly_sales !== product.monthly_sales && <p className="text-xs text-muted-foreground">Est: {product.estimated_monthly_sales.toLocaleString()}</p>}</CardContent></Card>
                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Monthly Revenue</p><p className="text-2xl font-bold text-chart-4">{formatCurrency(product.monthly_revenue)}</p>{product.estimated_revenue && product.estimated_revenue !== product.monthly_revenue && <p className="text-xs text-muted-foreground">Est: {formatCurrency(product.estimated_revenue)}</p>}</CardContent></Card>
                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Recent Sales</p><p className="text-2xl font-bold">{product.recent_sales ?? "-"}</p></CardContent></Card>
                <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Rating Count</p><p className="text-2xl font-bold">{product.rating_count?.toLocaleString() ?? product.reviews?.toLocaleString() ?? "-"}</p></CardContent></Card>
              </div>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><TrendingUp className="w-4 h-4" />Best Seller Rank (BSR)</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><p className="text-xs text-muted-foreground">Current BSR</p><p className="text-xl font-bold">#{product.bsr_current?.toLocaleString() ?? "-"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Primary BSR</p><p className="text-xl font-bold">#{product.bsr_primary?.toLocaleString() ?? "-"}</p></div>
                    <div><p className="text-xs text-muted-foreground">30-Day Avg</p><p className="text-xl font-bold flex items-center gap-1">#{product.bsr_30_days_avg?.toLocaleString() ?? "-"}{product.bsr_current && product.bsr_30_days_avg && (product.bsr_current < product.bsr_30_days_avg ? <TrendingUp className="w-4 h-4 text-chart-4" /> : product.bsr_current > product.bsr_30_days_avg ? <TrendingDown className="w-4 h-4 text-destructive" /> : null)}</p></div>
                    <div><p className="text-xs text-muted-foreground">90-Day Avg</p><p className="text-xl font-bold">#{product.bsr_90_days_avg?.toLocaleString() ?? "-"}</p></div>
                  </div>
                  {(product.bsr_current || product.bsr_30_days_avg || product.bsr_90_days_avg) && (
                    <div className="pt-2">
                      <p className="text-xs text-muted-foreground mb-2">BSR Trend (lower is better)</p>
                      <ResponsiveContainer width="100%" height={120}>
                        <BarChart data={[
                          { name: "90-Day Avg", value: product.bsr_90_days_avg ?? 0, fill: "hsl(var(--chart-4))" },
                          { name: "30-Day Avg", value: product.bsr_30_days_avg ?? 0, fill: "hsl(var(--chart-3))" },
                          { name: "Current", value: product.bsr_current ?? 0, fill: "hsl(var(--primary))" },
                        ].filter(d => d.value > 0)} layout="vertical">
                          <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => v.toLocaleString()} />
                          <YAxis dataKey="name" type="category" width={70} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                          <Tooltip formatter={(value: number) => [`#${value.toLocaleString()}`, "BSR"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                            {[
                              { fill: "hsl(var(--chart-4))" },
                              { fill: "hsl(var(--chart-3))" },
                              { fill: "hsl(var(--primary))" },
                            ].map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  {product.bsr_category && <p className="text-xs text-muted-foreground">Category: {product.bsr_category}</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><DollarSign className="w-4 h-4" />Price Metrics</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><p className="text-xs text-muted-foreground">Current Price</p><p className="text-xl font-bold text-green-600">${(product.price_current ?? product.current_price ?? product.price ?? 0).toFixed(2)}</p></div>
                    <div><p className="text-xs text-muted-foreground">30-Day Avg</p><p className="text-xl font-bold">${product.price_30_days_avg?.toFixed(2) ?? "-"}</p></div>
                    <div><p className="text-xs text-muted-foreground">90-Day Avg</p><p className="text-xl font-bold">${product.price_90_days_avg?.toFixed(2) ?? "-"}</p></div>
                    <div><p className="text-xs text-muted-foreground">Unit Price</p><p className="text-xl font-bold">{product.unit_price_value ? `$${product.unit_price_value.toFixed(2)}` : product.unit_price_text ?? "-"}</p></div>
                  </div>
                  {(product.price || product.price_30_days_avg || product.price_90_days_avg) && (
                    <div className="pt-2">
                      <p className="text-xs text-muted-foreground mb-2">Price Trend</p>
                      <ResponsiveContainer width="100%" height={120}>
                        <BarChart data={[
                          { name: "90-Day Avg", value: product.price_90_days_avg ?? 0, fill: "hsl(var(--chart-4))" },
                          { name: "30-Day Avg", value: product.price_30_days_avg ?? 0, fill: "hsl(var(--chart-3))" },
                          { name: "Current", value: product.price_current ?? product.current_price ?? product.price ?? 0, fill: "hsl(var(--chart-2))" },
                        ].filter(d => d.value > 0)} layout="vertical">
                          <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(0)}`} domain={['dataMin - 5', 'dataMax + 5']} />
                          <YAxis dataKey="name" type="category" width={70} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                          <Tooltip formatter={(value: number) => [`$${value.toFixed(2)}`, "Price"]} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                            {[
                              { fill: "hsl(var(--chart-4))" },
                              { fill: "hsl(var(--chart-3))" },
                              { fill: "hsl(var(--chart-2))" },
                            ].map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Profitability Estimates</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div><p className="text-xs text-muted-foreground">FBA Fees Est.</p><p className="text-xl font-bold text-red-600">{formatCurrency(product.fees_estimate)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Net Est.</p><p className="text-xl font-bold text-green-600">{formatCurrency(product.net_estimate)}</p></div>
                    <div><p className="text-xs text-muted-foreground">PPC Bid Est.</p><p className="text-xl font-bold">{product.ppc_bid_estimate ? `$${product.ppc_bid_estimate.toFixed(2)}` : "-"}</p></div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Star className="w-4 h-4" />Listing Quality Score (LQS)</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="relative w-20 h-20">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--secondary))" strokeWidth="10" />
                        <circle cx="50" cy="50" r="40" fill="none" stroke={product.lqs && product.lqs >= 80 ? "hsl(var(--chart-2))" : product.lqs && product.lqs >= 50 ? "hsl(var(--chart-4))" : "hsl(var(--destructive))"} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(product.lqs ?? 0) * 2.51} 251`} />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center"><span className={`text-xl font-bold ${getLqsColor(product.lqs ?? 0)}`}>{product.lqs ?? "-"}</span></div>
                    </div>
                    <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="text-center"><p className="text-2xl font-bold">{product.images_count ?? allImages.length}</p><p className="text-xs text-muted-foreground">Images</p></div>
                      <div className="text-center"><p className="text-2xl font-bold">{product.video_count ?? product.video_urls?.length ?? 0}</p><p className="text-xs text-muted-foreground">Videos</p></div>
                      <div className="text-center"><p className="text-2xl font-bold">{product.bullets_count ?? product.feature_bullets?.length ?? 0}</p><p className="text-xs text-muted-foreground">Bullets</p></div>
                      <div className="text-center"><p className="text-2xl font-bold">{product.description_length ? Math.round(product.description_length / 100) * 100 : "-"}</p><p className="text-xs text-muted-foreground">Desc Length</p></div>
                      <div className="text-center"><p className="text-2xl font-bold">{product.has_a_plus_content ? "Yes" : "No"}</p><p className="text-xs text-muted-foreground">A+ Content</p></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {product.keyword_rank && Object.keys(product.keyword_rank).length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Keyword Rankings</CardTitle></CardHeader>
                  <CardContent><div className="space-y-2">{Object.entries(product.keyword_rank as Record<string, number>).slice(0, 10).map(([keyword, rank]) => <div key={keyword} className="flex justify-between items-center text-sm"><span className="text-muted-foreground">{keyword}</span><Badge variant="outline">#{rank}</Badge></div>)}</div></CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Marketing Tab */}
          <TabsContent value="marketing" className={`mt-4 ${scrollableContentClass} ${maxContentHeight}`}>
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Overall Marketing Score</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="relative w-24 h-24">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--secondary))" strokeWidth="10" />
                        <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--primary))" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${getOverallScore() * 2.51} 251`} />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center"><span className="text-2xl font-bold">{getOverallScore()}</span></div>
                    </div>
                    <div className="flex-1 space-y-2">
                      {marketingAnalysis?.target_demographics ? (
                        typeof marketingAnalysis.target_demographics === 'string' ? (
                          <p className="text-sm text-muted-foreground">{marketingAnalysis.target_demographics}</p>
                        ) : (
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                              {marketingAnalysis.target_demographics.primary_audience && <div><span className="text-muted-foreground">Audience:</span> {marketingAnalysis.target_demographics.primary_audience}</div>}
                              {marketingAnalysis.target_demographics.age_range && <div><span className="text-muted-foreground">Age:</span> {marketingAnalysis.target_demographics.age_range}</div>}
                              {marketingAnalysis.target_demographics.gender_representation && <div><span className="text-muted-foreground">Gender:</span> {marketingAnalysis.target_demographics.gender_representation}</div>}
                              {marketingAnalysis.target_demographics.fitness_level_shown && <div><span className="text-muted-foreground">Fitness Level:</span> {marketingAnalysis.target_demographics.fitness_level_shown}</div>}
                              {marketingAnalysis.target_demographics.body_types_shown && <div><span className="text-muted-foreground">Body Types:</span> {marketingAnalysis.target_demographics.body_types_shown}</div>}
                              {marketingAnalysis.target_demographics.ethnicity_representation && <div><span className="text-muted-foreground">Diversity:</span> {marketingAnalysis.target_demographics.ethnicity_representation}</div>}
                            </div>
                            {marketingAnalysis.target_demographics.relatability_score !== undefined && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Relatability:</span>
                                <Progress value={marketingAnalysis.target_demographics.relatability_score * 10} className="w-24 h-2" />
                                <span className="text-xs font-medium">{marketingAnalysis.target_demographics.relatability_score}/10</span>
                              </div>
                            )}
                          </div>
                        )
                      ) : (
                        <p className="text-sm text-muted-foreground">Target demographic data not available</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
              {marketingAnalysis?.competitive_analysis?.unique_selling_points && marketingAnalysis.competitive_analysis.unique_selling_points.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" />Unique Selling Points</CardTitle></CardHeader>
                  <CardContent><ul className="space-y-2">{marketingAnalysis.competitive_analysis.unique_selling_points.map((point, idx) => <li key={idx} className="flex items-start gap-2 text-sm"><TrendingUp className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />{point}</li>)}</ul></CardContent>
                </Card>
              )}
              {marketingAnalysis?.competitive_analysis?.weaknesses_vs_competitors && marketingAnalysis.competitive_analysis.weaknesses_vs_competitors.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4 text-destructive" />Weaknesses vs Competitors</CardTitle></CardHeader>
                  <CardContent><ul className="space-y-2">{marketingAnalysis.competitive_analysis.weaknesses_vs_competitors.map((weakness, idx) => <li key={idx} className="flex items-start gap-2 text-sm"><TrendingDown className="w-4 h-4 text-destructive mt-0.5 shrink-0" />{weakness}</li>)}</ul></CardContent>
                </Card>
              )}
              {marketingAnalysis?.competitive_analysis?.parity_features && marketingAnalysis.competitive_analysis.parity_features.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Parity Features</CardTitle></CardHeader>
                  <CardContent><div className="flex flex-wrap gap-2">{marketingAnalysis.competitive_analysis.parity_features.map((feature, idx) => <Badge key={idx} variant="secondary">{feature}</Badge>)}</div></CardContent>
                </Card>
              )}
              {marketingAnalysis?.opportunities && marketingAnalysis.opportunities.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Lightbulb className="w-4 h-4 text-yellow-500" />Market Opportunities</CardTitle></CardHeader>
                  <CardContent><ul className="space-y-2">{marketingAnalysis.opportunities.map((opp, idx) => <li key={idx} className="flex items-start gap-2 text-sm"><span className="text-yellow-500 shrink-0">•</span>{opp}</li>)}</ul></CardContent>
                </Card>
              )}
              {marketingAnalysis?.positioning_suggestions && marketingAnalysis.positioning_suggestions.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Target className="w-4 h-4 text-primary" />Positioning Suggestions</CardTitle></CardHeader>
                  <CardContent><ul className="space-y-2">{marketingAnalysis.positioning_suggestions.map((suggestion, idx) => <li key={idx} className="flex items-start gap-2 text-sm"><span className="text-primary shrink-0">→</span>{suggestion}</li>)}</ul></CardContent>
                </Card>
              )}
              {marketingAnalysis?.copy_effectiveness && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Copy Effectiveness</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {marketingAnalysis.copy_effectiveness.title_analysis?.clarity_score !== undefined && (
                      <div><div className="flex justify-between text-sm mb-1"><span>Title Clarity</span><span>{marketingAnalysis.copy_effectiveness.title_analysis.clarity_score}/5</span></div><Progress value={(marketingAnalysis.copy_effectiveness.title_analysis.clarity_score / 5) * 100} /></div>
                    )}
                    {marketingAnalysis.copy_effectiveness.bullet_analysis && (
                      <div className="flex gap-4 text-sm">
                        <span className="text-muted-foreground">Benefits: <span className="text-foreground font-medium">{marketingAnalysis.copy_effectiveness.bullet_analysis.benefit_count ?? 0}</span></span>
                        <span className="text-muted-foreground">Features: <span className="text-foreground font-medium">{marketingAnalysis.copy_effectiveness.bullet_analysis.feature_count ?? 0}</span></span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              
              {/* Image Analysis Section */}
              {marketingAnalysis?.image_analysis && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Image className="w-4 h-4 text-primary" />
                      Image Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Overall Quality Score */}
                    {marketingAnalysis.image_analysis.overall_quality_score !== undefined && (
                      <div className="flex items-center gap-4">
                        <div className="relative w-16 h-16">
                          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--secondary))" strokeWidth="10" />
                            <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--primary))" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${marketingAnalysis.image_analysis.overall_quality_score * 25.1} 251`} />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-lg font-bold">{marketingAnalysis.image_analysis.overall_quality_score}</span>
                          </div>
                        </div>
                        <div>
                          <p className="font-medium">Overall Image Quality</p>
                          <p className="text-sm text-muted-foreground">Score out of 10</p>
                        </div>
                      </div>
                    )}

                    {/* Main Image Assessment */}
                    {marketingAnalysis.image_analysis.main_image_assessment && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Main Image Assessment</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {marketingAnalysis.image_analysis.main_image_assessment.clarity !== undefined && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Clarity</span><span>{marketingAnalysis.image_analysis.main_image_assessment.clarity}/10</span></div>
                              <Progress value={marketingAnalysis.image_analysis.main_image_assessment.clarity * 10} className="h-1.5" />
                            </div>
                          )}
                          {marketingAnalysis.image_analysis.main_image_assessment.professionalism !== undefined && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Professionalism</span><span>{marketingAnalysis.image_analysis.main_image_assessment.professionalism}/10</span></div>
                              <Progress value={marketingAnalysis.image_analysis.main_image_assessment.professionalism * 10} className="h-1.5" />
                            </div>
                          )}
                          {marketingAnalysis.image_analysis.main_image_assessment.product_visibility !== undefined && (
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Product Visibility</span><span>{marketingAnalysis.image_analysis.main_image_assessment.product_visibility}/10</span></div>
                              <Progress value={marketingAnalysis.image_analysis.main_image_assessment.product_visibility * 10} className="h-1.5" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {marketingAnalysis.image_analysis.main_image_assessment.background_quality && (
                            <Badge variant="outline" className="text-xs">Background: {marketingAnalysis.image_analysis.main_image_assessment.background_quality}</Badge>
                          )}
                          {marketingAnalysis.image_analysis.main_image_assessment.lighting_quality && (
                            <Badge variant="outline" className="text-xs">Lighting: {marketingAnalysis.image_analysis.main_image_assessment.lighting_quality}</Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Lifestyle Imagery */}
                    {marketingAnalysis.image_analysis.lifestyle_imagery && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">Lifestyle Imagery</p>
                          <Badge variant={marketingAnalysis.image_analysis.lifestyle_imagery.present ? "default" : "secondary"} className="text-xs">
                            {marketingAnalysis.image_analysis.lifestyle_imagery.present ? "Present" : "Missing"}
                          </Badge>
                        </div>
                        {marketingAnalysis.image_analysis.lifestyle_imagery.present && (
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            {marketingAnalysis.image_analysis.lifestyle_imagery.effectiveness !== undefined && (
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Effectiveness</span><span>{marketingAnalysis.image_analysis.lifestyle_imagery.effectiveness}/10</span></div>
                                <Progress value={marketingAnalysis.image_analysis.lifestyle_imagery.effectiveness * 10} className="h-1.5" />
                              </div>
                            )}
                            {marketingAnalysis.image_analysis.lifestyle_imagery.use_case_clarity && (
                              <div><span className="text-xs text-muted-foreground">Use Case:</span> <span className="text-xs">{marketingAnalysis.image_analysis.lifestyle_imagery.use_case_clarity}</span></div>
                            )}
                            {marketingAnalysis.image_analysis.lifestyle_imagery.emotional_appeal && (
                              <div><span className="text-xs text-muted-foreground">Emotional Appeal:</span> <span className="text-xs">{marketingAnalysis.image_analysis.lifestyle_imagery.emotional_appeal}</span></div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Label Visibility */}
                    {marketingAnalysis.image_analysis.label_visibility && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Label Visibility</p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={marketingAnalysis.image_analysis.label_visibility.supplement_facts_visible ? "default" : "outline"} className="text-xs">
                            {marketingAnalysis.image_analysis.label_visibility.supplement_facts_visible ? "✓" : "✗"} Supplement Facts
                          </Badge>
                          <Badge variant={marketingAnalysis.image_analysis.label_visibility.ingredients_readable ? "default" : "outline"} className="text-xs">
                            {marketingAnalysis.image_analysis.label_visibility.ingredients_readable ? "✓" : "✗"} Ingredients Readable
                          </Badge>
                          <Badge variant={marketingAnalysis.image_analysis.label_visibility.claims_prominent ? "default" : "outline"} className="text-xs">
                            {marketingAnalysis.image_analysis.label_visibility.claims_prominent ? "✓" : "✗"} Claims Prominent
                          </Badge>
                        </div>
                      </div>
                    )}

                    {/* Image Count */}
                    {marketingAnalysis.image_analysis.image_count_assessment && (
                      <div className="flex items-center gap-4 p-3 bg-secondary/50 rounded-lg">
                        <div className="text-center">
                          <p className="text-lg font-bold">{marketingAnalysis.image_analysis.image_count_assessment.total_images ?? product.images_count ?? allImages.length}</p>
                          <p className="text-xs text-muted-foreground">Images</p>
                        </div>
                        {marketingAnalysis.image_analysis.image_count_assessment.recommended && (
                          <div className="text-center">
                            <p className="text-lg font-bold">{marketingAnalysis.image_analysis.image_count_assessment.recommended}</p>
                            <p className="text-xs text-muted-foreground">Recommended</p>
                          </div>
                        )}
                        {marketingAnalysis.image_analysis.image_count_assessment.variety_score !== undefined && (
                          <div className="flex-1">
                            <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">Variety Score</span><span>{marketingAnalysis.image_analysis.image_count_assessment.variety_score}/10</span></div>
                            <Progress value={marketingAnalysis.image_analysis.image_count_assessment.variety_score * 10} className="h-1.5" />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Strengths */}
                    {marketingAnalysis.image_analysis.strengths && marketingAnalysis.image_analysis.strengths.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium flex items-center gap-1"><CheckCircle className="w-4 h-4 text-green-500" /> Image Strengths</p>
                        <ul className="space-y-1">
                          {marketingAnalysis.image_analysis.strengths.map((s, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2"><span className="text-green-500">•</span>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Improvement Suggestions */}
                    {marketingAnalysis.image_analysis.improvement_suggestions && marketingAnalysis.image_analysis.improvement_suggestions.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium flex items-center gap-1"><Lightbulb className="w-4 h-4 text-yellow-500" /> Improvement Suggestions</p>
                        <ul className="space-y-1">
                          {marketingAnalysis.image_analysis.improvement_suggestions.map((s, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2"><span className="text-yellow-500">→</span>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {!marketingAnalysis && <Card><CardContent className="py-8 text-center text-muted-foreground">No marketing analysis data available for this product.</CardContent></Card>}
            </div>
          </TabsContent>

          {/* Reviews Tab */}
          <TabsContent value="reviews" className={`mt-4 ${scrollableContentClass} ${maxContentHeight}`}>
            <div className="space-y-4">
              {reviewAnalysis?.summary && <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Review Summary</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{reviewAnalysis.summary}</p></CardContent></Card>}
              
              {/* Analysis Metadata */}
              {reviewAnalysis?.analysis_metadata && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card><CardContent className="pt-3 pb-3 text-center"><p className="text-lg font-bold">{reviewAnalysis.analysis_metadata.total_reviews_analyzed ?? "-"}</p><p className="text-xs text-muted-foreground">Reviews Analyzed</p></CardContent></Card>
                  <Card><CardContent className="pt-3 pb-3 text-center"><p className="text-lg font-bold">{reviewAnalysis.analysis_metadata.verified_purchase_rate ? `${reviewAnalysis.analysis_metadata.verified_purchase_rate}%` : "-"}</p><p className="text-xs text-muted-foreground">Verified Rate</p></CardContent></Card>
                  <Card><CardContent className="pt-3 pb-3 text-center"><p className="text-lg font-bold">{reviewAnalysis.analysis_metadata.average_helpful_votes?.toFixed(1) ?? "-"}</p><p className="text-xs text-muted-foreground">Avg Helpful Votes</p></CardContent></Card>
                  <Card><CardContent className="pt-3 pb-3 text-center"><Badge variant={reviewAnalysis.analysis_metadata.analysis_quality === "high" ? "default" : "secondary"}>{reviewAnalysis.analysis_metadata.analysis_quality ?? "-"}</Badge><p className="text-xs text-muted-foreground mt-1">Analysis Quality</p></CardContent></Card>
                </div>
              )}

              {sentimentData.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Sentiment Distribution</CardTitle></CardHeader>
                  <CardContent>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value" label={({ name, value }) => `${name}: ${value}%`} labelLine={false}>
                            {sentimentData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                          </Pie>
                          <Tooltip formatter={(value) => `${value}%`} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Product Experience Breakdown */}
              {reviewAnalysis?.product_experience_breakdown && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" />Product Experience Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                      {reviewAnalysis.product_experience_breakdown.taste_feedback && (
                        <div className="border rounded-lg p-3">
                          <p className="text-xs font-medium mb-2">Taste Feedback</p>
                          <div className="flex gap-3 mb-2 text-xs">
                            <span className="text-green-600">👍 {reviewAnalysis.product_experience_breakdown.taste_feedback.positive_count ?? 0}</span>
                            <span className="text-yellow-600">😐 {reviewAnalysis.product_experience_breakdown.taste_feedback.neutral_count ?? 0}</span>
                            <span className="text-red-600">👎 {reviewAnalysis.product_experience_breakdown.taste_feedback.negative_count ?? 0}</span>
                          </div>
                          {reviewAnalysis.product_experience_breakdown.taste_feedback.common_descriptors && reviewAnalysis.product_experience_breakdown.taste_feedback.common_descriptors.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">{reviewAnalysis.product_experience_breakdown.taste_feedback.common_descriptors.map((d, i) => <Badge key={i} variant="outline" className="text-xs">{d}</Badge>)}</div>
                          )}
                          {reviewAnalysis.product_experience_breakdown.taste_feedback.key_insights && <p className="text-xs text-muted-foreground">{reviewAnalysis.product_experience_breakdown.taste_feedback.key_insights}</p>}
                        </div>
                      )}
                      {reviewAnalysis.product_experience_breakdown.efficacy_feedback && (
                        <div className="border rounded-lg p-3">
                          <p className="text-xs font-medium mb-2">Efficacy Feedback</p>
                          <div className="flex gap-3 mb-2 text-xs">
                            <span className="text-green-600">Works: {reviewAnalysis.product_experience_breakdown.efficacy_feedback.works_count ?? 0}</span>
                            <span className="text-yellow-600">Mixed: {reviewAnalysis.product_experience_breakdown.efficacy_feedback.mixed_count ?? 0}</span>
                            <span className="text-red-600">No Effect: {reviewAnalysis.product_experience_breakdown.efficacy_feedback.no_effect_count ?? 0}</span>
                          </div>
                          {reviewAnalysis.product_experience_breakdown.efficacy_feedback.time_to_see_results && <p className="text-xs text-muted-foreground mb-1">Time to results: {reviewAnalysis.product_experience_breakdown.efficacy_feedback.time_to_see_results}</p>}
                          {reviewAnalysis.product_experience_breakdown.efficacy_feedback.key_insights && <p className="text-xs text-muted-foreground">{reviewAnalysis.product_experience_breakdown.efficacy_feedback.key_insights}</p>}
                        </div>
                      )}
                      {reviewAnalysis.product_experience_breakdown.value_perception && (
                        <div className="border rounded-lg p-3">
                          <p className="text-xs font-medium mb-2">Value Perception</p>
                          <div className="flex gap-3 mb-2 text-xs">
                            <span className="text-green-600">Good Value: {reviewAnalysis.product_experience_breakdown.value_perception.good_value_count ?? 0}</span>
                            <span className="text-yellow-600">Fair: {reviewAnalysis.product_experience_breakdown.value_perception.fair_price_count ?? 0}</span>
                            <span className="text-red-600">Overpriced: {reviewAnalysis.product_experience_breakdown.value_perception.overpriced_count ?? 0}</span>
                          </div>
                          {reviewAnalysis.product_experience_breakdown.value_perception.key_insights && <p className="text-xs text-muted-foreground">{reviewAnalysis.product_experience_breakdown.value_perception.key_insights}</p>}
                        </div>
                      )}
                      {reviewAnalysis.product_experience_breakdown.packaging_quality && (
                        <div className="border rounded-lg p-3">
                          <p className="text-xs font-medium mb-2">Packaging Quality</p>
                          <div className="flex gap-3 mb-2 text-xs">
                            <span className="text-green-600">👍 {reviewAnalysis.product_experience_breakdown.packaging_quality.positive_count ?? 0}</span>
                            <span className="text-red-600">👎 {reviewAnalysis.product_experience_breakdown.packaging_quality.negative_count ?? 0}</span>
                          </div>
                          {reviewAnalysis.product_experience_breakdown.packaging_quality.specific_issues && reviewAnalysis.product_experience_breakdown.packaging_quality.specific_issues.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">{reviewAnalysis.product_experience_breakdown.packaging_quality.specific_issues.map((issue, i) => <Badge key={i} variant="destructive" className="text-xs">{issue}</Badge>)}</div>
                          )}
                          {reviewAnalysis.product_experience_breakdown.packaging_quality.key_insights && <p className="text-xs text-muted-foreground">{reviewAnalysis.product_experience_breakdown.packaging_quality.key_insights}</p>}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Competitor Comparisons */}
              {reviewAnalysis?.competitor_comparisons && (reviewAnalysis.competitor_comparisons.brands_mentioned?.length || reviewAnalysis.competitor_comparisons.wins_against_competitors?.length || reviewAnalysis.competitor_comparisons.loses_against_competitors?.length) && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Target className="w-4 h-4 text-primary" />Competitor Comparisons</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {reviewAnalysis.competitor_comparisons.brands_mentioned && reviewAnalysis.competitor_comparisons.brands_mentioned.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Brands Mentioned by Customers</p>
                        <div className="flex flex-wrap gap-2">{reviewAnalysis.competitor_comparisons.brands_mentioned.map((brand, idx) => <Badge key={idx} variant="outline">{brand}</Badge>)}</div>
                      </div>
                    )}
                    {reviewAnalysis.competitor_comparisons.wins_against_competitors && reviewAnalysis.competitor_comparisons.wins_against_competitors.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-green-600 mb-2">Why Customers Choose This Product</p>
                        <ul className="space-y-1">{reviewAnalysis.competitor_comparisons.wins_against_competitors.map((win, idx) => <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2"><CheckCircle className="w-3 h-3 text-green-500 mt-1 shrink-0" />{win}</li>)}</ul>
                      </div>
                    )}
                    {reviewAnalysis.competitor_comparisons.loses_against_competitors && reviewAnalysis.competitor_comparisons.loses_against_competitors.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-red-600 mb-2">Where Competitors Win</p>
                        <ul className="space-y-1">{reviewAnalysis.competitor_comparisons.loses_against_competitors.map((lose, idx) => <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2"><AlertCircle className="w-3 h-3 text-red-500 mt-1 shrink-0" />{lose}</li>)}</ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {reviewAnalysis?.demographics_insights && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-primary" />Customer Demographics</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {reviewAnalysis.demographics_insights.age_groups_mentioned && reviewAnalysis.demographics_insights.age_groups_mentioned.length > 0 && <div><p className="text-xs font-medium text-muted-foreground mb-2">Age Groups</p><div className="flex flex-wrap gap-2">{reviewAnalysis.demographics_insights.age_groups_mentioned.map((age, idx) => <Badge key={idx} variant="outline">{age}</Badge>)}</div></div>}
                    {reviewAnalysis.demographics_insights.buyer_types && reviewAnalysis.demographics_insights.buyer_types.length > 0 && <div><p className="text-xs font-medium text-muted-foreground mb-2">Buyer Types</p><div className="flex flex-wrap gap-2">{reviewAnalysis.demographics_insights.buyer_types.map((type, idx) => <Badge key={idx} variant="secondary">{type}</Badge>)}</div></div>}
                    {reviewAnalysis.demographics_insights.use_cases && reviewAnalysis.demographics_insights.use_cases.length > 0 && <div><p className="text-xs font-medium text-muted-foreground mb-2">Common Use Cases</p><div className="flex flex-wrap gap-2">{reviewAnalysis.demographics_insights.use_cases.map((useCase, idx) => <Badge key={idx} variant="outline">{useCase}</Badge>)}</div></div>}
                  </CardContent>
                </Card>
              )}
              {reviewAnalysis?.pain_points && reviewAnalysis.pain_points.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4 text-destructive" />Pain Points</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {reviewAnalysis.pain_points.map((point, idx) => (
                        <div key={idx} className="border-b border-border pb-2 last:border-0 last:pb-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              {point.category && <Badge variant="outline" className="text-xs">{point.category}</Badge>}
                              <span className={`text-sm font-medium ${getSeverityColor(point.severity)}`}>{point.theme ?? point.issue}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{point.frequency} mentions</Badge>
                              {point.affected_percentage && <Badge variant="secondary" className="text-xs">{point.affected_percentage}% affected</Badge>}
                              {point.severity && <Badge variant={point.severity === "high" ? "destructive" : "secondary"} className="text-xs">{point.severity}</Badge>}
                            </div>
                          </div>
                          {(point.quotes?.length || point.representative_quotes?.length) && <p className="text-xs text-muted-foreground italic">"{(point.quotes ?? point.representative_quotes)?.[0]}"</p>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {reviewAnalysis?.positive_themes && reviewAnalysis.positive_themes.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" />Positive Themes</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {reviewAnalysis.positive_themes.map((theme, idx) => (
                        <div key={idx} className="border-b border-border pb-2 last:border-0 last:pb-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-foreground">{theme.theme}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">{theme.frequency} mentions</Badge>
                              {theme.mentioned_by_percentage && <Badge variant="secondary" className="text-xs">{theme.mentioned_by_percentage}%</Badge>}
                              {theme.impact && <Badge variant="secondary" className="text-xs">{theme.impact}</Badge>}
                            </div>
                          </div>
                          {theme.representative_quotes && theme.representative_quotes.length > 0 && <p className="text-xs text-muted-foreground italic">"{theme.representative_quotes[0]}"</p>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {reviewAnalysis?.feature_requests && reviewAnalysis.feature_requests.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Feature Requests</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {reviewAnalysis.feature_requests.map((request, idx) => (
                        <div key={idx} className="flex items-center justify-between">
                          <span className="text-sm">{request.request}</span>
                          <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{request.frequency}x</span>{getPriorityBadge(request.priority)}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Actionable Recommendations */}
              {reviewAnalysis?.actionable_recommendations && reviewAnalysis.actionable_recommendations.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Target className="w-4 h-4 text-primary" />Actionable Recommendations</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {reviewAnalysis.actionable_recommendations.map((rec, idx) => (
                        <div key={idx} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs capitalize">{rec.area}</Badge>
                              {getPriorityBadge(rec.priority)}
                            </div>
                          </div>
                          <p className="text-sm font-medium mb-1">{rec.recommendation}</p>
                          {rec.rationale && <p className="text-xs text-muted-foreground">{rec.rationale}</p>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {reviewAnalysis?.key_insights && reviewAnalysis.key_insights.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Lightbulb className="w-4 h-4 text-yellow-500" />Key Insights</CardTitle></CardHeader>
                  <CardContent><ul className="space-y-2">{reviewAnalysis.key_insights.map((insight, idx) => <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2"><span className="text-yellow-500 shrink-0">•</span>{insight}</li>)}</ul></CardContent>
                </Card>
              )}
              {!reviewAnalysis && <Card><CardContent className="py-8 text-center text-muted-foreground">No review analysis data available for this product.</CardContent></Card>}
            </div>
          </TabsContent>

          {/* Formula Tab */}
          <TabsContent value="formula" className={`mt-4 ${scrollableContentClass} ${maxContentHeight}`}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-bold text-foreground">{product.servings_per_container ?? "-"}</p><p className="text-xs text-muted-foreground">Servings</p></CardContent></Card>
                <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-bold text-foreground">{product.calories_per_serving ?? "-"}</p><p className="text-xs text-muted-foreground">Calories/Serving</p></CardContent></Card>
                <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-bold text-foreground">{product.nutrients_count ?? "-"}</p><p className="text-xs text-muted-foreground">Nutrients</p></CardContent></Card>
                <Card><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-bold text-foreground">{product.has_proprietary_blends ? "Yes" : "No"}</p><p className="text-xs text-muted-foreground">Proprietary Blends</p></CardContent></Card>
              </div>
              
              {/* OCR Metadata */}
              {product.ocr_extracted && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span className="text-sm font-medium">Label Data Extracted via OCR</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {product.ocr_confidence && (
                          <Badge variant={product.ocr_confidence === "high" ? "default" : product.ocr_confidence === "medium" ? "secondary" : "outline"}>
                            {product.ocr_confidence} confidence
                          </Badge>
                        )}
                      </div>
                    </div>
                    {product.extraction_notes && (
                      <p className="text-xs text-muted-foreground mt-2">{product.extraction_notes}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {product.serving_size && <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Serving Size</CardTitle></CardHeader><CardContent><p className="text-sm">{product.serving_size}</p></CardContent></Card>}
              {allNutrients && allNutrients.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Supplement Facts</CardTitle></CardHeader>
                  <CardContent>
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted"><tr><th className="text-left px-3 py-2 font-medium">Nutrient</th><th className="text-right px-3 py-2 font-medium">Amount</th><th className="text-right px-3 py-2 font-medium">% DV</th></tr></thead>
                        <tbody>{allNutrients.map((nutrient, idx) => <tr key={idx} className="border-t border-border"><td className="px-3 py-2">{nutrient.name}</td><td className="text-right px-3 py-2 text-muted-foreground">{nutrient.amount ?? "-"}{nutrient.unit ?? ""}</td><td className="text-right px-3 py-2 text-muted-foreground">{nutrient.daily_value ?? "-"}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
              {proprietaryBlends && proprietaryBlends.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4 text-yellow-500" />Proprietary Blends</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {proprietaryBlends.map((blend, idx) => (
                      <div key={idx} className="border-b border-border pb-3 last:border-0 last:pb-0">
                        <div className="flex justify-between items-center mb-2"><span className="font-medium text-sm">{blend.name}</span>{blend.total_amount && <Badge variant="outline">{blend.total_amount}</Badge>}</div>
                        {blend.ingredients && blend.ingredients.length > 0 && <p className="text-xs text-muted-foreground">{blend.ingredients.join(", ")}</p>}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
              {product.ingredients && <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ingredients</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{product.ingredients}</p></CardContent></Card>}
              {product.other_ingredients && <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Other Ingredients</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{product.other_ingredients}</p></CardContent></Card>}
              {product.allergen_info && <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4 text-yellow-500" />Allergen Information</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{product.allergen_info}</p></CardContent></Card>}
              {product.warnings && <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4 text-destructive" />Warnings</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{product.warnings}</p></CardContent></Card>}
              {product.directions && <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Directions</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{product.directions}</p></CardContent></Card>}
              {specifications && Object.keys(specifications).length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Info className="w-4 h-4" />Specifications</CardTitle></CardHeader>
                  <CardContent><div className="space-y-2">{Object.entries(specifications).map(([key, value]) => <div key={key} className="flex justify-between text-sm border-b border-border pb-2 last:border-0"><span className="text-muted-foreground">{key}</span><span className="font-medium text-right max-w-[60%]">{value}</span></div>)}</div></CardContent>
                </Card>
              )}
              {importantInfo && Object.keys(importantInfo).length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4 text-yellow-500" />Important Information</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {Object.entries(importantInfo).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-xs font-medium text-muted-foreground mb-1">{key}</p>
                        {Array.isArray(value) ? <ul className="space-y-1">{value.map((item, idx) => <li key={idx} className="text-sm text-muted-foreground">• {item}</li>)}</ul> : <p className="text-sm text-muted-foreground">{value}</p>}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
              {!product.ingredients && !product.serving_size && !allNutrients && <Card><CardContent className="py-8 text-center text-muted-foreground">No formula data available for this product.</CardContent></Card>}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
