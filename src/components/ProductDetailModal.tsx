import { useState } from "react";
import { DocumentModal } from "@/components/ui/document-modal";
import { MarkdownDoc } from "@/lib/markdownDoc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Panel } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Star, TrendingUp, TrendingDown, AlertCircle, CheckCircle, Target, Users, Beaker,
  Lightbulb, ShoppingCart, Package, Image, BarChart3, DollarSign, Calendar,
  ExternalLink, Play, Award, Info, ChevronDown, Truck, FileText, Box, Link2, Tag,
  Palette, Type, LayoutGrid, Sparkles, RefreshCw, Loader2, MessageSquare, Copy,
} from "lucide-react";
import { useSupplementFactsAnalysis } from "@/hooks/useSupplementFactsAnalysis";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis } from "recharts";
import HistoricalBSRSalesChart from "@/components/product/HistoricalBSRSalesChart";
import type { Product } from "@/hooks/useProducts";
import { useP5SourcesForProduct } from "@/hooks/useP5Sources";
import { useCategoryContext } from "@/contexts/CategoryContext";
import { Globe } from "lucide-react";
import { parseClaimsList } from "@/lib/parseClaims";
import { cn } from "@/lib/utils";

// Single clean active treatment (smoke pill, no border-b + focus-ring
// double outline) for the product-detail tab strip. Kept as one shared
// class string so every TabsTrigger below renders identically.
const productTabCls =
  "gap-1 text-xs py-1.5 px-3 rounded-md shrink-0 whitespace-nowrap " +
  "data-[state=active]:!bg-primary/10 data-[state=active]:!border-transparent data-[state=active]:!text-primary " +
  "focus-visible:!ring-0 focus-visible:!ring-offset-0";

// ─── Flat "document" section primitives ────────────────────────────────────
// Modern-minimal treatment (2026-08-30 clutter audit): replaces the old
// Panel-in-Panel-in-Panel nesting (bordered card wrapping a bordered card
// wrapping a stat row) with ONE surface level — the tab body itself sits
// directly on the modal's card background; sections are separated by
// whitespace + a hairline rule + a small uppercase label, not another box.

function DocSection({
  icon: Icon, title, action, children, first,
}: { icon?: React.ComponentType<{ className?: string }>; title?: string; action?: React.ReactNode; children: React.ReactNode; first?: boolean }) {
  return (
    <section className={cn("py-5", !first && "border-t border-border/60 first:border-t-0")}>
      {title && (
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {title}
          </h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Two-column key/value grid — uppercase muted labels, tabular-nums values. */
function KVGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 1 | 2 }) {
  return <div className={cn("grid gap-x-10", cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>{children}</div>;
}

function KV({ label, value, mono, action }: { label: string; value: React.ReactNode; mono?: boolean; action?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-border/40 last:border-b-0 sm:border-b-0 sm:py-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">{label}</span>
      <span className={cn("text-sm font-medium text-foreground text-right tabular-nums flex items-center gap-1.5", mono && "font-mono text-xs")}>
        {value}
        {action}
      </span>
    </div>
  );
}

/** Small tabular stat chip — replaces the old colored-card KPI boxes. */
function StatChip({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "up" | "down" | "warn" }) {
  return (
    <div className="flex flex-col gap-0.5 px-3.5 py-2 rounded-lg bg-muted/50 min-w-[96px]">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn(
        "text-sm font-semibold tabular-nums text-foreground",
        tone === "up" && "text-chart-4", tone === "down" && "text-destructive", tone === "warn" && "text-chart-2",
      )}>{value}</span>
    </div>
  );
}
function StatChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

/** Single honest line for an empty section — never empty chrome. */
function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground/80 py-1">{children}</p>;
}

/** Thin sentiment bar — replaces the pie chart for the common 3-bucket case. */
function SentimentBar({ positive, neutral, negative }: { positive: number; neutral: number; negative: number }) {
  const total = positive + neutral + negative || 1;
  return (
    <div className="space-y-2">
      <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
        {positive > 0 && <div style={{ width: `${(positive / total) * 100}%` }} className="bg-chart-4" />}
        {neutral > 0 && <div style={{ width: `${(neutral / total) * 100}%` }} className="bg-chart-2" />}
        {negative > 0 && <div style={{ width: `${(negative / total) * 100}%` }} className="bg-destructive" />}
      </div>
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-chart-4 inline-block" />Positive {positive}%</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-chart-2 inline-block" />Neutral {neutral}%</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-destructive inline-block" />Negative {negative}%</span>
      </div>
    </div>
  );
}

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
  amount?: number | string;
  daily_value_percent?: number | null;
  unit?: string;
  per_serving?: boolean;
}

interface ProprietaryBlend {
  name: string;
  total_amount?: string;
  ingredients?: string[];
}

// Correct interfaces for database JSONB fields
interface SpecificationItem {
  name: string;
  value: string;
}

interface ImportantInfoSection {
  title: string;
  body: string;
}

interface ImportantInformation {
  sections?: ImportantInfoSection[];
}

interface SupplementFactsComplete {
  active_ingredients?: Array<{ name: string; amount?: number | string; unit?: string }>;
  all_nutrients?: Array<{ name: string; amount?: number | string; unit?: string; per_serving?: boolean }>;
  claims_on_label?: string[];
  confidence?: string;
  directions?: string;
  extraction_completeness?: {
    image_quality?: string;
    notes?: string;
    panel_fully_visible?: boolean;
    total_nutrients_found?: number;
  };
  found?: boolean;
  found_in_image?: number;
  inactive_ingredients?: string[] | null;
  manufacturer?: string;
  other_ingredients?: string | null;
  panel_type?: string;
  proprietary_blends?: Array<{ name: string; ingredients?: string[]; total_amount?: number | string; unit?: string }>;
  serving_size?: string;
  warnings?: string | null;
}

const SENTIMENT_COLORS = {
  positive: "hsl(var(--chart-2))",
  neutral: "hsl(var(--chart-4))",
  negative: "hsl(var(--destructive))"
};

export default function ProductDetailModal({ product, open, onOpenChange }: ProductDetailModalProps) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [showFullFindings, setShowFullFindings] = useState(false);
  const { analyzeProduct, isAnalyzing } = useSupplementFactsAnalysis();
  const { categoryName } = useCategoryContext();
  const { data: p5Sources } = useP5SourcesForProduct(product?.asin, categoryName || undefined);

  if (!product) return null;

  // Check if amounts are missing (shows "-mg" pattern)
  const hasMissingAmounts = (allNutrients: Nutrient[] | null) => {
    if (!allNutrients || allNutrients.length === 0) return false;
    return allNutrients.some(n => n.amount == null || n.amount === '');
  };

  const needsReanalysis = product.ocr_confidence === 'low' || 
    product.extraction_notes?.toLowerCase().includes('truncated') ||
    hasMissingAmounts(product.all_nutrients as unknown as Nutrient[] | null);

  const handleReanalyze = async () => {
    const result = await analyzeProduct(product.id);
    if (result) {
      // Close and reopen to refresh data (parent should refetch)
      onOpenChange(false);
    }
  };

  const marketingAnalysis = product.marketing_analysis as MarketingAnalysis | null;
  const reviewAnalysis = product.review_analysis as ReviewAnalysis | null;
  const allNutrients = product.all_nutrients as unknown as Nutrient[] | null;
  const proprietaryBlends = product.proprietary_blends as unknown as ProprietaryBlend[] | null;

  // Normalize specifications: DB may be either an array [{name,value}] OR an object map.
  const rawSpecifications = product.specifications as unknown;
  const specificationsArray: SpecificationItem[] | null = Array.isArray(rawSpecifications)
    ? (rawSpecifications as SpecificationItem[])
    : rawSpecifications && typeof rawSpecifications === "object"
      ? Object.entries(rawSpecifications as Record<string, unknown>).map(([name, value]) => ({
          name,
          value: value == null ? "" : String(value),
        }))
      : null;

  // Normalize important_information: DB may be {sections:[{title,body}]} OR a legacy key/value map.
  const rawImportantInfo = product.important_information as unknown;
  const importantInfo: ImportantInformation | null =
    rawImportantInfo && typeof rawImportantInfo === "object" && Array.isArray((rawImportantInfo as any).sections)
      ? (rawImportantInfo as ImportantInformation)
      : rawImportantInfo && typeof rawImportantInfo === "object"
        ? {
            sections: Object.entries(rawImportantInfo as Record<string, unknown>).map(([title, body]) => ({
              title,
              body: Array.isArray(body) ? body.map(String).join("\n") : body == null ? "" : String(body),
            })),
          }
        : null;

  // Parse supplement_facts_complete for richer data
  const supplementFacts = product.supplement_facts_complete as unknown as SupplementFactsComplete | null;
  const categoryTree = product.category_tree as unknown as Array<{ name: string; url?: string }> | null;

  const allImages = [
    product.main_image_url,
    ...(product.image_urls ?? [])
  ].filter(Boolean) as string[];

  const getOverallScore = () => {
    if (marketingAnalysis?.overall_score) return marketingAnalysis.overall_score;
    // `rating`/`reviews` are legacy columns the pipeline mostly no longer
    // writes to (near-always null) — `rating_value`/`rating_count` are live.
    const rating = product.rating_value ?? 0;
    const reviews = product.rating_count ?? 0;
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

  const thumbUrl = product.main_image_url ?? allImages[0];

  return (
    <DocumentModal
      open={open}
      onOpenChange={onOpenChange}
      title={product.title ?? "Product Details"}
      subtitle={product.brand ?? undefined}
      thumbnail={
        thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-12 h-12 rounded-lg object-contain bg-muted border border-border" />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-muted border border-border flex items-center justify-center">
            <Package className="w-5 h-5 text-muted-foreground" />
          </div>
        )
      }
      chips={[
        ...(product.asin ? [{ label: "ASIN", value: product.asin }] : []),
        { label: "Price", value: `$${(product.price ?? 0).toFixed(2)}` },
        { label: "Rating", value: `${(product.rating_value ?? 0).toFixed(1)}★ (${(product.rating_count ?? 0).toLocaleString()})` },
        ...(product.bsr_current ? [{ label: "BSR", value: `#${product.bsr_current.toLocaleString()}` }] : []),
        ...(product.monthly_sales ? [{ label: "Monthly Sales", value: product.monthly_sales.toLocaleString() }] : []),
      ]}
      actions={
        product.asin ? (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
            <a href={`https://amazon.com/dp/${product.asin}`} target="_blank" rel="noopener noreferrer">
              View on Amazon <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
        ) : undefined
      }
      bodyClassName="max-w-none px-6 py-5 sm:px-8 sm:py-6"
    >
        <Tabs defaultValue="scout-overview" className="flex flex-col">
          <TabsList className="flex w-full items-center gap-1 shrink-0 h-auto overflow-x-auto scrollbar-hide justify-start">
            <TabsTrigger value="scout-overview" className={productTabCls}>
              <LayoutGrid className="w-3 h-3" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="scout-formula" className={productTabCls}>
              <Beaker className="w-3 h-3" />
              OCR Formula
            </TabsTrigger>
            <TabsTrigger value="keepa" className={productTabCls}>
              <BarChart3 className="w-3 h-3" />
              Keepa
            </TabsTrigger>
            <TabsTrigger value="scout-reviews" className={productTabCls}>
              <MessageSquare className="w-3 h-3" />
              P5 Research
            </TabsTrigger>
            <TabsTrigger value="overview" className={productTabCls}>
              <Image className="w-3 h-3" />
              Detail
            </TabsTrigger>
            <TabsTrigger value="sales" className={productTabCls}>
              <BarChart3 className="w-3 h-3" />
              Sales
            </TabsTrigger>
            <TabsTrigger value="marketing" className={productTabCls}>
              <Target className="w-3 h-3" />
              Marketing
            </TabsTrigger>
            <TabsTrigger value="reviews" className={productTabCls}>
              <Users className="w-3 h-3" />
              Reviews
            </TabsTrigger>
            <TabsTrigger value="packaging" className={productTabCls}>
              <Package className="w-3 h-3" />
              Packaging
            </TabsTrigger>
            <TabsTrigger value="formula" className={productTabCls}>
              <Beaker className="w-3 h-3" />
              Formula
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className={`mt-4 ${scrollableContentClass} ${maxContentHeight}`}>
            <div>
              {(product.bestseller || product.amazon_choice || product.is_young_competitor || product.is_fba || product.is_available === false || product.has_a_plus_content) && (
                <DocSection first title="Status">
                  <div className="flex flex-wrap gap-2">
                    {product.bestseller && <Badge variant="outline">Bestseller</Badge>}
                    {product.amazon_choice && <Badge variant="outline">Amazon's Choice</Badge>}
                    {product.is_young_competitor && <Badge variant="outline">New Competitor</Badge>}
                    {product.is_fba && <Badge variant="outline">FBA</Badge>}
                    {product.is_available === false && <Badge variant="destructive">Unavailable</Badge>}
                    {product.has_a_plus_content && <Badge variant="outline">A+ Content</Badge>}
                  </div>
                </DocSection>
              )}

              <DocSection icon={Truck} title="Seller & Manufacturer">
                <KVGrid>
                  <KV label="Manufacturer" value={product.manufacturer ?? product.manufacturer_from_label ?? "-"} />
                  <KV label="Seller" value={product.seller_name ?? "-"} />
                  <KV label="Seller Type" value={product.seller_type ?? "-"} />
                </KVGrid>
              </DocSection>

              <DocSection icon={Box} title="Physical Details">
                <KVGrid>
                  <KV label="Packaging" value={product.packaging_type ?? "-"} />
                  <KV label="Weight" value={product.weight ?? "-"} />
                  <KV label="Dimensions" value={product.dimensions ?? "-"} />
                </KVGrid>
                {product.flavor_options && product.flavor_options.length > 0 && (
                  <div className="pt-3 mt-1 border-t border-border/40">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Flavor Options ({product.variations_count ?? product.flavor_options.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {product.flavor_options.slice(0, 8).map((flavor, idx) => <Badge key={idx} variant="outline" className="text-xs">{flavor}</Badge>)}
                      {product.flavor_options.length > 8 && <Badge variant="outline" className="text-xs">+{product.flavor_options.length - 8}</Badge>}
                    </div>
                  </div>
                )}
              </DocSection>

              <DocSection icon={Calendar} title="Timeline">
                <KVGrid>
                  <KV label="First Available" value={formatDate(product.date_first_available)} />
                  <KV label="Listing Since" value={formatDate(product.listing_since)} />
                  <KV label="Launch Date" value={formatDate(product.launch_date)} />
                  <KV label="Age" value={product.age_months ? `${product.age_months} months` : "-"} />
                </KVGrid>
              </DocSection>

              {product.video_urls && product.video_urls.length > 0 && (
                <DocSection icon={Play} title={`Videos (${product.video_count ?? product.video_urls.length})`}>
                  <div className="flex flex-wrap gap-3">
                    {product.video_urls.slice(0, 3).map((url, idx) => (
                      <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-primary hover:underline">
                        <Play className="w-3.5 h-3.5" /> Video {idx + 1}
                      </a>
                    ))}
                  </div>
                </DocSection>
              )}

              {product.feature_bullets && product.feature_bullets.length > 0 && (
                <DocSection icon={CheckCircle} title={`Feature Bullets (${product.bullets_count ?? product.feature_bullets.length})`}>
                  <ul className="space-y-2">
                    {product.feature_bullets.map((bullet, idx) => <li key={idx} className="flex items-start gap-2 text-sm"><span className="text-primary mt-1">•</span><span>{bullet}</span></li>)}
                  </ul>
                </DocSection>
              )}

              {product.description_text && (
                <Collapsible>
                  <DocSection icon={FileText} title={`Description (${product.description_length ?? product.description_text.length} chars)`}
                    action={<CollapsibleTrigger><ChevronDown className="w-4 h-4 text-muted-foreground" /></CollapsibleTrigger>}
                  >
                    <CollapsibleContent><p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{product.description_text}</p></CollapsibleContent>
                  </DocSection>
                </Collapsible>
              )}

              {(product.claims || (product.claims_on_label && product.claims_on_label.length > 0)) && (
                <DocSection title="Product Claims">
                  {product.claims && <p className="text-sm text-muted-foreground mb-3">{product.claims}</p>}
                  {product.claims_on_label && product.claims_on_label.length > 0 && <div className="flex flex-wrap gap-2">{product.claims_on_label.map((claim, idx) => <Badge key={idx} variant="outline">{claim}</Badge>)}</div>}
                </DocSection>
              )}

              {categoryTree && categoryTree.length > 0 && (
                <DocSection icon={Link2} title="Category Path">
                  <div className="flex flex-wrap items-center gap-1 text-sm">{categoryTree.map((cat, idx) => <span key={idx} className="flex items-center gap-1">{idx > 0 && <span className="text-muted-foreground">›</span>}<span className="text-muted-foreground">{cat.name}</span></span>)}</div>
                  {product.categories_flat && <p className="text-xs text-muted-foreground mt-2">{product.categories_flat}</p>}
                </DocSection>
              )}
            </div>
          </TabsContent>

          {/* Sales Tab */}
          <TabsContent value="sales" className={`mt-4 ${scrollableContentClass} ${maxContentHeight}`}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Panel><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Monthly Sales</p><p className="text-2xl font-bold">{product.monthly_sales?.toLocaleString() ?? "-"}</p>{product.estimated_monthly_sales && product.estimated_monthly_sales !== product.monthly_sales && <p className="text-xs text-muted-foreground">Est: {product.estimated_monthly_sales.toLocaleString()}</p>}</CardContent></Panel>
                <Panel><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Monthly Revenue</p><p className="text-2xl font-bold text-chart-4">{formatCurrency(product.monthly_revenue)}</p>{product.estimated_revenue && product.estimated_revenue !== product.monthly_revenue && <p className="text-xs text-muted-foreground">Est: {formatCurrency(product.estimated_revenue)}</p>}</CardContent></Panel>
                <Panel><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Recent Sales</p><p className="text-2xl font-bold">{product.recent_sales ?? "-"}</p></CardContent></Panel>
                <Panel><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Rating Count</p><p className="text-2xl font-bold">{product.rating_count?.toLocaleString() ?? product.reviews?.toLocaleString() ?? "-"}</p></CardContent></Panel>
              </div>
              <Panel>
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
              </Panel>
              <HistoricalBSRSalesChart historicalData={product.historical_data as any} />
              <Panel>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><DollarSign className="w-4 h-4" />Price Metrics</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><p className="text-xs text-muted-foreground">Current Price</p><p className="text-xl font-bold text-chart-4">${(product.price_current ?? product.current_price ?? product.price ?? 0).toFixed(2)}</p></div>
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
              </Panel>
              <Panel>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Profitability Estimates</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div><p className="text-xs text-muted-foreground">FBA Fees Est.</p><p className="text-xl font-bold text-destructive">{formatCurrency(product.fees_estimate)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Net Est.</p><p className="text-xl font-bold text-chart-4">{formatCurrency(product.net_estimate)}</p></div>
                    <div><p className="text-xs text-muted-foreground">PPC Bid Est.</p><p className="text-xl font-bold">{product.ppc_bid_estimate ? `$${product.ppc_bid_estimate.toFixed(2)}` : "-"}</p></div>
                  </div>
                </CardContent>
              </Panel>
              <Panel>
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
              </Panel>
              {product.keyword_rank && Object.keys(product.keyword_rank).length > 0 && (
                <Panel>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Keyword Rankings</CardTitle></CardHeader>
                  <CardContent><div className="space-y-2">{Object.entries(product.keyword_rank as Record<string, number>).slice(0, 10).map(([keyword, rank]) => <div key={keyword} className="flex justify-between items-center text-sm"><span className="text-muted-foreground">{keyword}</span><Badge variant="outline">#{rank}</Badge></div>)}</div></CardContent>
                </Panel>
              )}
            </div>
          </TabsContent>

          {/* Marketing Tab */}
          <TabsContent value="marketing" className={`mt-4 ${scrollableContentClass} ${maxContentHeight}`}>
            <div>
              <DocSection first title="Marketing Score">
                <StatChipRow>
                  <StatChip label="Overall Score" value={`${getOverallScore()}/100`} tone={getOverallScore() >= 70 ? "up" : getOverallScore() >= 40 ? "warn" : "down"} />
                  {marketingAnalysis?.image_analysis?.overall_quality_score !== undefined && (
                    <StatChip label="Image Quality" value={`${marketingAnalysis.image_analysis.overall_quality_score}/10`} />
                  )}
                  {marketingAnalysis?.target_demographics && typeof marketingAnalysis.target_demographics !== "string" && marketingAnalysis.target_demographics.relatability_score !== undefined && (
                    <StatChip label="Relatability" value={`${marketingAnalysis.target_demographics.relatability_score}/10`} />
                  )}
                  {marketingAnalysis?.copy_effectiveness?.title_analysis?.clarity_score !== undefined && (
                    <StatChip label="Title Clarity" value={`${marketingAnalysis.copy_effectiveness.title_analysis.clarity_score}/5`} />
                  )}
                </StatChipRow>

                <div className="mt-4">
                  {marketingAnalysis?.target_demographics ? (
                    typeof marketingAnalysis.target_demographics === 'string' ? (
                      <p className="text-sm text-muted-foreground">{marketingAnalysis.target_demographics}</p>
                    ) : (
                      <KVGrid>
                        {marketingAnalysis.target_demographics.primary_audience && <KV label="Audience" value={marketingAnalysis.target_demographics.primary_audience} />}
                        {marketingAnalysis.target_demographics.age_range && <KV label="Age" value={marketingAnalysis.target_demographics.age_range} />}
                        {marketingAnalysis.target_demographics.gender_representation && <KV label="Gender" value={marketingAnalysis.target_demographics.gender_representation} />}
                        {marketingAnalysis.target_demographics.fitness_level_shown && <KV label="Fitness Level" value={marketingAnalysis.target_demographics.fitness_level_shown} />}
                        {marketingAnalysis.target_demographics.body_types_shown && <KV label="Body Types" value={marketingAnalysis.target_demographics.body_types_shown} />}
                        {marketingAnalysis.target_demographics.ethnicity_representation && <KV label="Diversity" value={marketingAnalysis.target_demographics.ethnicity_representation} />}
                      </KVGrid>
                    )
                  ) : (
                    <EmptyLine>Target demographic data not available.</EmptyLine>
                  )}
                </div>
              </DocSection>

              {marketingAnalysis?.competitive_analysis?.unique_selling_points && marketingAnalysis.competitive_analysis.unique_selling_points.length > 0 && (
                <DocSection icon={CheckCircle} title="Unique Selling Points">
                  <ul className="space-y-2">{marketingAnalysis.competitive_analysis.unique_selling_points.map((point, idx) => <li key={idx} className="flex items-start gap-2 text-sm"><TrendingUp className="w-4 h-4 text-chart-4 mt-0.5 shrink-0" />{point}</li>)}</ul>
                </DocSection>
              )}
              {marketingAnalysis?.competitive_analysis?.weaknesses_vs_competitors && marketingAnalysis.competitive_analysis.weaknesses_vs_competitors.length > 0 && (
                <DocSection icon={AlertCircle} title="Weaknesses vs Competitors">
                  <ul className="space-y-2">{marketingAnalysis.competitive_analysis.weaknesses_vs_competitors.map((weakness, idx) => <li key={idx} className="flex items-start gap-2 text-sm"><TrendingDown className="w-4 h-4 text-destructive mt-0.5 shrink-0" />{weakness}</li>)}</ul>
                </DocSection>
              )}
              {marketingAnalysis?.competitive_analysis?.parity_features && marketingAnalysis.competitive_analysis.parity_features.length > 0 && (
                <DocSection title="Parity Features">
                  <div className="flex flex-wrap gap-2">{marketingAnalysis.competitive_analysis.parity_features.map((feature, idx) => <Badge key={idx} variant="outline">{feature}</Badge>)}</div>
                </DocSection>
              )}
              {marketingAnalysis?.opportunities && marketingAnalysis.opportunities.length > 0 && (
                <DocSection icon={Lightbulb} title="Market Opportunities">
                  <ul className="space-y-2">{marketingAnalysis.opportunities.map((opp, idx) => <li key={idx} className="flex items-start gap-2 text-sm"><span className="text-chart-2 shrink-0">•</span>{opp}</li>)}</ul>
                </DocSection>
              )}
              {marketingAnalysis?.positioning_suggestions && marketingAnalysis.positioning_suggestions.length > 0 && (
                <DocSection icon={Target} title="Positioning Suggestions">
                  <ul className="space-y-2">{marketingAnalysis.positioning_suggestions.map((suggestion, idx) => <li key={idx} className="flex items-start gap-2 text-sm"><span className="text-primary shrink-0">→</span>{suggestion}</li>)}</ul>
                </DocSection>
              )}
              {marketingAnalysis?.copy_effectiveness && (
                <DocSection title="Copy Effectiveness">
                  <div className="space-y-3">
                    {marketingAnalysis.copy_effectiveness.title_analysis?.clarity_score !== undefined && (
                      <div><div className="flex justify-between text-sm mb-1"><span className="text-muted-foreground">Title Clarity</span><span>{marketingAnalysis.copy_effectiveness.title_analysis.clarity_score}/5</span></div><Progress value={(marketingAnalysis.copy_effectiveness.title_analysis.clarity_score / 5) * 100} className="h-1.5" /></div>
                    )}
                    {marketingAnalysis.copy_effectiveness.bullet_analysis && (
                      <StatChipRow>
                        <StatChip label="Benefits" value={marketingAnalysis.copy_effectiveness.bullet_analysis.benefit_count ?? 0} />
                        <StatChip label="Features" value={marketingAnalysis.copy_effectiveness.bullet_analysis.feature_count ?? 0} />
                      </StatChipRow>
                    )}
                  </div>
                </DocSection>
              )}

              {/* Image Analysis Section */}
              {marketingAnalysis?.image_analysis && (
                <DocSection icon={Image} title="Image Analysis">
                  <div className="space-y-4">
                    {marketingAnalysis.image_analysis.main_image_assessment && (
                      <div className="space-y-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Main Image Assessment</p>
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

                    {marketingAnalysis.image_analysis.lifestyle_imagery && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Lifestyle Imagery</p>
                          <Badge variant="outline" className="text-xs">
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

                    {marketingAnalysis.image_analysis.label_visibility && (
                      <div className="space-y-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Label Visibility</p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="text-xs">
                            {marketingAnalysis.image_analysis.label_visibility.supplement_facts_visible ? "✓" : "✗"} Supplement Facts
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {marketingAnalysis.image_analysis.label_visibility.ingredients_readable ? "✓" : "✗"} Ingredients Readable
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {marketingAnalysis.image_analysis.label_visibility.claims_prominent ? "✓" : "✗"} Claims Prominent
                          </Badge>
                        </div>
                      </div>
                    )}

                    {marketingAnalysis.image_analysis.image_count_assessment && (
                      <StatChipRow>
                        <StatChip label="Images" value={marketingAnalysis.image_analysis.image_count_assessment.total_images ?? product.images_count ?? allImages.length} />
                        {marketingAnalysis.image_analysis.image_count_assessment.recommended && (
                          <StatChip label="Recommended" value={marketingAnalysis.image_analysis.image_count_assessment.recommended} />
                        )}
                        {marketingAnalysis.image_analysis.image_count_assessment.variety_score !== undefined && (
                          <StatChip label="Variety" value={`${marketingAnalysis.image_analysis.image_count_assessment.variety_score}/10`} />
                        )}
                      </StatChipRow>
                    )}

                    {marketingAnalysis.image_analysis.strengths && marketingAnalysis.image_analysis.strengths.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-chart-4" /> Image Strengths</p>
                        <ul className="space-y-1">
                          {marketingAnalysis.image_analysis.strengths.map((s, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2"><span className="text-chart-4">•</span>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {marketingAnalysis.image_analysis.improvement_suggestions && marketingAnalysis.image_analysis.improvement_suggestions.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5 text-chart-2" /> Improvement Suggestions</p>
                        <ul className="space-y-1">
                          {marketingAnalysis.image_analysis.improvement_suggestions.map((s, idx) => (
                            <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2"><span className="text-chart-2">→</span>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </DocSection>
              )}

              {!marketingAnalysis && <DocSection><EmptyLine>No marketing analysis data available for this product.</EmptyLine></DocSection>}
            </div>
          </TabsContent>

          {/* Reviews Tab */}
          <TabsContent value="reviews" className={`mt-4 ${scrollableContentClass} ${maxContentHeight}`}>
            <div>
              {!reviewAnalysis || !(
                reviewAnalysis.summary || reviewAnalysis.analysis_metadata || sentimentData.length > 0 ||
                reviewAnalysis.product_experience_breakdown || reviewAnalysis.competitor_comparisons ||
                reviewAnalysis.demographics_insights || reviewAnalysis.pain_points?.length ||
                reviewAnalysis.positive_themes?.length || reviewAnalysis.feature_requests?.length ||
                reviewAnalysis.actionable_recommendations?.length || reviewAnalysis.key_insights?.length
              ) ? (
                <DocSection first><EmptyLine>No review analysis data available for this product.</EmptyLine></DocSection>
              ) : (
                <>
                  {reviewAnalysis.summary && (
                    <DocSection first title="Review Summary">
                      <MarkdownDoc content={reviewAnalysis.summary} className="text-sm" />
                    </DocSection>
                  )}

                  {reviewAnalysis.analysis_metadata && (
                    <DocSection title="Analysis Coverage" first={!reviewAnalysis.summary}>
                      <StatChipRow>
                        <StatChip label="Reviews Analyzed" value={reviewAnalysis.analysis_metadata.total_reviews_analyzed ?? "-"} />
                        <StatChip label="Verified Rate" value={reviewAnalysis.analysis_metadata.verified_purchase_rate ? `${reviewAnalysis.analysis_metadata.verified_purchase_rate}%` : "-"} />
                        <StatChip label="Avg Helpful Votes" value={reviewAnalysis.analysis_metadata.average_helpful_votes?.toFixed(1) ?? "-"} />
                        <StatChip label="Analysis Quality" value={reviewAnalysis.analysis_metadata.analysis_quality ?? "-"} />
                      </StatChipRow>
                    </DocSection>
                  )}

                  {sentimentData.length > 0 && (() => {
                    const byName = Object.fromEntries(sentimentData.map(d => [d.name, d.value]));
                    const positive = Math.round((byName["5★"] ?? 0) + (byName["4★"] ?? 0) + (byName["Positive"] ?? 0));
                    const neutral = Math.round((byName["3★"] ?? 0) + (byName["Neutral"] ?? 0));
                    const negative = Math.round((byName["2★"] ?? 0) + (byName["1★"] ?? 0) + (byName["Negative"] ?? 0));
                    return (
                      <DocSection title="Sentiment Distribution">
                        <SentimentBar positive={positive} neutral={neutral} negative={negative} />
                      </DocSection>
                    );
                  })()}

                  {reviewAnalysis.product_experience_breakdown && (
                    <DocSection icon={BarChart3} title="Product Experience Breakdown">
                      <div className="grid md:grid-cols-2 gap-x-8 gap-y-5">
                        {reviewAnalysis.product_experience_breakdown.taste_feedback && (
                          <div>
                            <p className="text-sm font-medium text-foreground mb-1.5">Taste Feedback</p>
                            <div className="flex gap-3 mb-1.5 text-xs text-muted-foreground">
                              <span>👍 {reviewAnalysis.product_experience_breakdown.taste_feedback.positive_count ?? 0}</span>
                              <span>😐 {reviewAnalysis.product_experience_breakdown.taste_feedback.neutral_count ?? 0}</span>
                              <span>👎 {reviewAnalysis.product_experience_breakdown.taste_feedback.negative_count ?? 0}</span>
                            </div>
                            {reviewAnalysis.product_experience_breakdown.taste_feedback.common_descriptors && reviewAnalysis.product_experience_breakdown.taste_feedback.common_descriptors.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1.5">{reviewAnalysis.product_experience_breakdown.taste_feedback.common_descriptors.map((d, i) => <Badge key={i} variant="outline" className="text-xs">{d}</Badge>)}</div>
                            )}
                            {reviewAnalysis.product_experience_breakdown.taste_feedback.key_insights && <p className="text-xs text-muted-foreground">{reviewAnalysis.product_experience_breakdown.taste_feedback.key_insights}</p>}
                          </div>
                        )}
                        {reviewAnalysis.product_experience_breakdown.efficacy_feedback && (
                          <div>
                            <p className="text-sm font-medium text-foreground mb-1.5">Efficacy Feedback</p>
                            <div className="flex gap-3 mb-1.5 text-xs text-muted-foreground">
                              <span>Works: {reviewAnalysis.product_experience_breakdown.efficacy_feedback.works_count ?? 0}</span>
                              <span>Mixed: {reviewAnalysis.product_experience_breakdown.efficacy_feedback.mixed_count ?? 0}</span>
                              <span>No Effect: {reviewAnalysis.product_experience_breakdown.efficacy_feedback.no_effect_count ?? 0}</span>
                            </div>
                            {reviewAnalysis.product_experience_breakdown.efficacy_feedback.time_to_see_results && <p className="text-xs text-muted-foreground mb-1">Time to results: {reviewAnalysis.product_experience_breakdown.efficacy_feedback.time_to_see_results}</p>}
                            {reviewAnalysis.product_experience_breakdown.efficacy_feedback.key_insights && <p className="text-xs text-muted-foreground">{reviewAnalysis.product_experience_breakdown.efficacy_feedback.key_insights}</p>}
                          </div>
                        )}
                        {reviewAnalysis.product_experience_breakdown.value_perception && (
                          <div>
                            <p className="text-sm font-medium text-foreground mb-1.5">Value Perception</p>
                            <div className="flex gap-3 mb-1.5 text-xs text-muted-foreground">
                              <span>Good Value: {reviewAnalysis.product_experience_breakdown.value_perception.good_value_count ?? 0}</span>
                              <span>Fair: {reviewAnalysis.product_experience_breakdown.value_perception.fair_price_count ?? 0}</span>
                              <span>Overpriced: {reviewAnalysis.product_experience_breakdown.value_perception.overpriced_count ?? 0}</span>
                            </div>
                            {reviewAnalysis.product_experience_breakdown.value_perception.key_insights && <p className="text-xs text-muted-foreground">{reviewAnalysis.product_experience_breakdown.value_perception.key_insights}</p>}
                          </div>
                        )}
                        {reviewAnalysis.product_experience_breakdown.packaging_quality && (
                          <div>
                            <p className="text-sm font-medium text-foreground mb-1.5">Packaging Quality</p>
                            <div className="flex gap-3 mb-1.5 text-xs text-muted-foreground">
                              <span>👍 {reviewAnalysis.product_experience_breakdown.packaging_quality.positive_count ?? 0}</span>
                              <span>👎 {reviewAnalysis.product_experience_breakdown.packaging_quality.negative_count ?? 0}</span>
                            </div>
                            {reviewAnalysis.product_experience_breakdown.packaging_quality.specific_issues && reviewAnalysis.product_experience_breakdown.packaging_quality.specific_issues.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1.5">{reviewAnalysis.product_experience_breakdown.packaging_quality.specific_issues.map((issue, i) => <Badge key={i} variant="outline" className="text-xs text-destructive border-destructive/30">{issue}</Badge>)}</div>
                            )}
                            {reviewAnalysis.product_experience_breakdown.packaging_quality.key_insights && <p className="text-xs text-muted-foreground">{reviewAnalysis.product_experience_breakdown.packaging_quality.key_insights}</p>}
                          </div>
                        )}
                      </div>
                    </DocSection>
                  )}

                  {reviewAnalysis.competitor_comparisons && (reviewAnalysis.competitor_comparisons.brands_mentioned?.length || reviewAnalysis.competitor_comparisons.wins_against_competitors?.length || reviewAnalysis.competitor_comparisons.loses_against_competitors?.length) && (
                    <DocSection icon={Target} title="Competitor Comparisons">
                      <div className="space-y-4">
                        {reviewAnalysis.competitor_comparisons.brands_mentioned && reviewAnalysis.competitor_comparisons.brands_mentioned.length > 0 && (
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Brands Mentioned by Customers</p>
                            <div className="flex flex-wrap gap-2">{reviewAnalysis.competitor_comparisons.brands_mentioned.map((brand, idx) => <Badge key={idx} variant="outline">{brand}</Badge>)}</div>
                          </div>
                        )}
                        {reviewAnalysis.competitor_comparisons.wins_against_competitors && reviewAnalysis.competitor_comparisons.wins_against_competitors.length > 0 && (
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Why Customers Choose This Product</p>
                            <ul className="space-y-1">{reviewAnalysis.competitor_comparisons.wins_against_competitors.map((win, idx) => <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2"><CheckCircle className="w-3.5 h-3.5 text-chart-4 mt-0.5 shrink-0" />{win}</li>)}</ul>
                          </div>
                        )}
                        {reviewAnalysis.competitor_comparisons.loses_against_competitors && reviewAnalysis.competitor_comparisons.loses_against_competitors.length > 0 && (
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Where Competitors Win</p>
                            <ul className="space-y-1">{reviewAnalysis.competitor_comparisons.loses_against_competitors.map((lose, idx) => <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />{lose}</li>)}</ul>
                          </div>
                        )}
                      </div>
                    </DocSection>
                  )}

                  {reviewAnalysis.demographics_insights && (
                    <DocSection icon={ShoppingCart} title="Customer Demographics">
                      <div className="space-y-4">
                        {reviewAnalysis.demographics_insights.age_groups_mentioned && reviewAnalysis.demographics_insights.age_groups_mentioned.length > 0 && <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Age Groups</p><div className="flex flex-wrap gap-2">{reviewAnalysis.demographics_insights.age_groups_mentioned.map((age, idx) => <Badge key={idx} variant="outline">{age}</Badge>)}</div></div>}
                        {reviewAnalysis.demographics_insights.buyer_types && reviewAnalysis.demographics_insights.buyer_types.length > 0 && <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Buyer Types</p><div className="flex flex-wrap gap-2">{reviewAnalysis.demographics_insights.buyer_types.map((type, idx) => <Badge key={idx} variant="outline">{type}</Badge>)}</div></div>}
                        {reviewAnalysis.demographics_insights.use_cases && reviewAnalysis.demographics_insights.use_cases.length > 0 && <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Common Use Cases</p><div className="flex flex-wrap gap-2">{reviewAnalysis.demographics_insights.use_cases.map((useCase, idx) => <Badge key={idx} variant="outline">{useCase}</Badge>)}</div></div>}
                      </div>
                    </DocSection>
                  )}

                  {reviewAnalysis.pain_points && reviewAnalysis.pain_points.length > 0 && (
                    <DocSection icon={AlertCircle} title="Pain Points">
                      <div className="space-y-3">
                        {reviewAnalysis.pain_points.map((point, idx) => (
                          <div key={idx} className="border-b border-border/40 pb-3 last:border-0 last:pb-0">
                            <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                              <div className="flex items-center gap-2">
                                {point.category && <Badge variant="outline" className="text-xs">{point.category}</Badge>}
                                <span className={`text-sm font-medium ${getSeverityColor(point.severity)}`}>{point.theme ?? point.issue}</span>
                              </div>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {point.frequency} mentions{point.affected_percentage ? ` · ${point.affected_percentage}% affected` : ""}{point.severity ? ` · ${point.severity}` : ""}
                              </span>
                            </div>
                            {(point.quotes?.length || point.representative_quotes?.length) && <p className="text-xs text-muted-foreground italic">"{(point.quotes ?? point.representative_quotes)?.[0]}"</p>}
                          </div>
                        ))}
                      </div>
                    </DocSection>
                  )}
                  {reviewAnalysis.positive_themes && reviewAnalysis.positive_themes.length > 0 && (
                    <DocSection icon={CheckCircle} title="Positive Themes">
                      <div className="space-y-3">
                        {reviewAnalysis.positive_themes.map((theme, idx) => (
                          <div key={idx} className="border-b border-border/40 pb-3 last:border-0 last:pb-0">
                            <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                              <span className="text-sm font-medium text-foreground">{theme.theme}</span>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {theme.frequency} mentions{theme.mentioned_by_percentage ? ` · ${theme.mentioned_by_percentage}%` : ""}{theme.impact ? ` · ${theme.impact}` : ""}
                              </span>
                            </div>
                            {theme.representative_quotes && theme.representative_quotes.length > 0 && <p className="text-xs text-muted-foreground italic">"{theme.representative_quotes[0]}"</p>}
                          </div>
                        ))}
                      </div>
                    </DocSection>
                  )}
                  {reviewAnalysis.feature_requests && reviewAnalysis.feature_requests.length > 0 && (
                    <DocSection title="Feature Requests">
                      <div className="space-y-2.5">
                        {reviewAnalysis.feature_requests.map((request, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-3">
                            <span className="text-sm text-foreground">{request.request}</span>
                            <div className="flex items-center gap-2 shrink-0"><span className="text-xs text-muted-foreground">{request.frequency}x</span>{getPriorityBadge(request.priority)}</div>
                          </div>
                        ))}
                      </div>
                    </DocSection>
                  )}

                  {reviewAnalysis.actionable_recommendations && reviewAnalysis.actionable_recommendations.length > 0 && (
                    <DocSection icon={Target} title="Actionable Recommendations">
                      <div className="space-y-4">
                        {reviewAnalysis.actionable_recommendations.map((rec, idx) => (
                          <div key={idx}>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs capitalize">{rec.area}</Badge>
                              {getPriorityBadge(rec.priority)}
                            </div>
                            <p className="text-sm font-medium text-foreground mb-0.5">{rec.recommendation}</p>
                            {rec.rationale && <p className="text-xs text-muted-foreground">{rec.rationale}</p>}
                          </div>
                        ))}
                      </div>
                    </DocSection>
                  )}

                  {reviewAnalysis.key_insights && reviewAnalysis.key_insights.length > 0 && (
                    <DocSection icon={Lightbulb} title="Key Insights">
                      <ul className="space-y-2">{reviewAnalysis.key_insights.map((insight, idx) => <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2"><span className="text-chart-2 shrink-0">•</span>{insight}</li>)}</ul>
                    </DocSection>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          {/* Packaging Audit Tab */}
          <TabsContent value="packaging" className={`mt-4 ${scrollableContentClass} ${maxContentHeight}`}>
            <div className="space-y-4">
              {(() => {
                // Primary source: packaging_intelligence from marketing_analysis
                const packagingIntel = (marketingAnalysis as Record<string, unknown> | null)?.packaging_intelligence as Record<string, unknown> | null;
                // Fallback: design_blueprint (actual data source from n8n)
                const designBlueprint = (marketingAnalysis as Record<string, unknown> | null)?.design_blueprint as Record<string, unknown> | null;
                
                const visualStyle = (packagingIntel?.design_style as string) || (designBlueprint?.visual_style as string);
                const visualHierarchy = (packagingIntel?.visual_hierarchy as string) || (designBlueprint?.visual_hierarchy as string);
                const colorStrategy = designBlueprint?.color_strategy as string;
                const typographyStyle = designBlueprint?.typography_style as string;
                const layoutStructure = designBlueprint?.layout_structure as string;
                const differentiationFactor = designBlueprint?.differentiation_factor as string;
                
                // Parse trust_signals - handle both array and comma-separated string formats
                let trustSignals: string[] = [];
                const rawTrustSignals = packagingIntel?.trust_signals || designBlueprint?.trust_signals;
                if (Array.isArray(rawTrustSignals)) {
                  trustSignals = rawTrustSignals;
                } else if (typeof rawTrustSignals === 'string' && rawTrustSignals.trim()) {
                  trustSignals = rawTrustSignals.split(',').map(s => s.trim()).filter(Boolean);
                }
                
                // Parse conversion_triggers - handle both string and comma-separated formats
                let conversionTriggersList: string[] = [];
                const rawConversionTriggers = packagingIntel?.conversion_triggers || designBlueprint?.conversion_triggers;
                if (typeof rawConversionTriggers === 'string' && rawConversionTriggers.trim()) {
                  conversionTriggersList = rawConversionTriggers.split(',').map(s => s.trim()).filter(Boolean);
                }
                
                const frontOfPackClaims = (packagingIntel?.front_of_pack_claims as string[]) || [];
                
                const hasData = visualStyle || visualHierarchy || trustSignals.length > 0 || conversionTriggersList.length > 0 || 
                               colorStrategy || typographyStyle || layoutStructure || differentiationFactor ||
                               frontOfPackClaims.length > 0 || product.claims || (product.claims_on_label && product.claims_on_label.length > 0);
                
                if (!hasData) {
                  return (
                    <Panel>
                      <CardContent className="py-8 text-center text-muted-foreground">
                        No packaging audit data available for this product.
                      </CardContent>
                    </Panel>
                  );
                }
                
                return (
                  <>
                    {/* Visual Style */}
                    {visualStyle && visualStyle !== "N/A" && (
                      <Panel>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Image className="w-4 h-4 text-primary" />
                            Visual Style
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-foreground">{visualStyle}</p>
                        </CardContent>
                      </Panel>
                    )}
                    
                    {/* Visual Hierarchy */}
                    {visualHierarchy && visualHierarchy !== "N/A" && (
                      <Panel>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-chart-2" />
                            Visual Hierarchy
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-foreground">{visualHierarchy}</p>
                        </CardContent>
                      </Panel>
                    )}
                    
                    {/* Trust Signals */}
                    {trustSignals.length > 0 && (
                      <Panel>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Award className="w-4 h-4 text-chart-4" />
                            Trust Signals
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {trustSignals.map((signal, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {signal}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Panel>
                    )}
                    
                    {/* Front of Pack Claims */}
                    {(frontOfPackClaims.length > 0 || product.claims || (product.claims_on_label && product.claims_on_label.length > 0)) && (
                      <Panel>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Tag className="w-4 h-4 text-chart-3" />
                            Front of Pack Claims
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-1.5">
                            {frontOfPackClaims.length > 0 ? (
                              frontOfPackClaims.map((claim, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm">
                                  <CheckCircle className="w-4 h-4 text-chart-4 mt-0.5 shrink-0" />
                                  <span className="text-foreground">{claim}</span>
                                </li>
                              ))
                            ) : product.claims_on_label && product.claims_on_label.length > 0 ? (
                              product.claims_on_label.map((claim, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm">
                                  <CheckCircle className="w-4 h-4 text-chart-4 mt-0.5 shrink-0" />
                                  <span className="text-foreground">{claim}</span>
                                </li>
                              ))
                            ) : product.claims ? (
                              parseClaimsList(product.claims).map((claim, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm">
                                  <CheckCircle className="w-4 h-4 text-chart-4 mt-0.5 shrink-0" />
                                  <span className="text-foreground">{claim}</span>
                                </li>
                              ))
                            ) : null}
                          </ul>
                        </CardContent>
                      </Panel>
                    )}
                    
                    {/* Color Strategy */}
                    {colorStrategy && colorStrategy !== "N/A" && (
                      <Panel>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Palette className="w-4 h-4 text-chart-1" />
                            Color Strategy
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-foreground">{colorStrategy}</p>
                        </CardContent>
                      </Panel>
                    )}
                    
                    {/* Typography Style */}
                    {typographyStyle && typographyStyle !== "N/A" && (
                      <Panel>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Type className="w-4 h-4 text-chart-2" />
                            Typography Style
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-foreground">{typographyStyle}</p>
                        </CardContent>
                      </Panel>
                    )}
                    
                    {/* Layout Structure */}
                    {layoutStructure && layoutStructure !== "N/A" && (
                      <Panel>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <LayoutGrid className="w-4 h-4 text-chart-3" />
                            Layout Structure
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-foreground">{layoutStructure}</p>
                        </CardContent>
                      </Panel>
                    )}
                    
                    {/* Conversion Triggers */}
                    {conversionTriggersList.length > 0 && (
                      <Panel className="border-primary/30 bg-primary/5">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Lightbulb className="w-4 h-4 text-primary" />
                            Conversion Triggers
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">Why this packaging converts</p>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {conversionTriggersList.map((trigger, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {trigger}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Panel>
                    )}
                    
                    {/* Differentiation Factor */}
                    {differentiationFactor && differentiationFactor !== "N/A" && (
                      <Panel className="border-chart-4/30 bg-chart-4/5">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-chart-4" />
                            Differentiation Factor
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">Unique shelf positioning</p>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-foreground">{differentiationFactor}</p>
                        </CardContent>
                      </Panel>
                    )}
                  </>
                );
              })()}
            </div>
          </TabsContent>

          {/* Formula Tab */}
          <TabsContent value="formula" className={`mt-4 ${scrollableContentClass} ${maxContentHeight}`}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Panel><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-bold text-foreground">{product.servings_per_container ?? "-"}</p><p className="text-xs text-muted-foreground">Servings</p></CardContent></Panel>
                <Panel><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-bold text-foreground">{product.calories_per_serving ?? "-"}</p><p className="text-xs text-muted-foreground">Calories/Serving</p></CardContent></Panel>
                <Panel><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-bold text-foreground">{product.nutrients_count ?? "-"}</p><p className="text-xs text-muted-foreground">Nutrients</p></CardContent></Panel>
                <Panel><CardContent className="pt-4 pb-4 text-center"><p className="text-2xl font-bold text-foreground">{product.has_proprietary_blends ? "Yes" : "No"}</p><p className="text-xs text-muted-foreground">Proprietary Blends</p></CardContent></Panel>
              </div>
              
              {/* OCR Metadata */}
              {product.ocr_extracted && (
                <Panel className="border-primary/30 bg-primary/5">
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
                </Panel>
              )}

              {product.serving_size && <Panel><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Serving Size</CardTitle></CardHeader><CardContent><p className="text-sm">{product.serving_size}</p></CardContent></Panel>}
              {/* OCR Analysis Card - always show re-analyze button */}
              <Panel className={needsReanalysis ? "border-yellow-500/30 bg-yellow-500/10" : ""}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {needsReanalysis ? (
                        <>
                          <AlertCircle className="w-4 h-4 text-yellow-600" />
                          <span className="text-sm text-yellow-700">
                            Some ingredient amounts may be missing due to incomplete label extraction.
                          </span>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          OCR Confidence: <span className="font-medium text-foreground capitalize">{product.ocr_confidence || 'Unknown'}</span>
                        </span>
                      )}
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={handleReanalyze}
                      disabled={isAnalyzing}
                      className={needsReanalysis ? "border-yellow-500/50 hover:bg-yellow-500/20" : ""}
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Re-analyze
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Panel>

              {allNutrients && allNutrients.length > 0 && (() => {
                const isGuaranteedAnalysis = supplementFacts?.panel_type === 'guaranteed_analysis';
                return (
                  <Panel>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">
                        {isGuaranteedAnalysis ? 'Guaranteed Analysis' : 'Supplement Facts'}
                      </CardTitle>
                      {isGuaranteedAnalysis && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Pet supplements use Guaranteed Analysis instead of % Daily Value.
                        </p>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="border rounded-md overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium">Nutrient</th>
                              <th className="text-right px-3 py-2 font-medium">Amount</th>
                              {!isGuaranteedAnalysis && (
                                <th className="text-right px-3 py-2 font-medium">% DV</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>{allNutrients.map((nutrient, idx) => (
                            <tr key={idx} className="border-t border-border">
                              <td className="px-3 py-2">{nutrient.name}</td>
                              <td className="text-right px-3 py-2 text-muted-foreground">
                                {nutrient.amount != null && nutrient.amount !== '' 
                                  ? `${nutrient.amount}${nutrient.unit ?? ''}` 
                                  : (nutrient.unit ? `(${nutrient.unit})` : '—')
                                }
                              </td>
                              {!isGuaranteedAnalysis && (
                                <td className="text-right px-3 py-2 text-muted-foreground">
                                  {nutrient.daily_value_percent != null ? `${nutrient.daily_value_percent}%` : "—"}
                                </td>
                              )}
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Panel>
                );
              })()}
              {proprietaryBlends && proprietaryBlends.length > 0 && (
                <Panel>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4 text-yellow-500" />Proprietary Blends</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {proprietaryBlends.map((blend, idx) => (
                      <div key={idx} className="border-b border-border pb-3 last:border-0 last:pb-0">
                        <div className="flex justify-between items-center mb-2"><span className="font-medium text-sm">{blend.name}</span>{blend.total_amount && <Badge variant="outline">{blend.total_amount}</Badge>}</div>
                        {blend.ingredients && blend.ingredients.length > 0 && <p className="text-xs text-muted-foreground">{blend.ingredients.join(", ")}</p>}
                      </div>
                    ))}
                  </CardContent>
                </Panel>
              )}
              {product.ingredients && <Panel><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ingredients</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{product.ingredients}</p></CardContent></Panel>}
              {product.other_ingredients && <Panel><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Other Ingredients</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{product.other_ingredients}</p></CardContent></Panel>}
              {product.allergen_info && <Panel><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4 text-yellow-500" />Allergen Information</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{product.allergen_info}</p></CardContent></Panel>}
              {product.warnings && <Panel><CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4 text-destructive" />Warnings</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{product.warnings}</p></CardContent></Panel>}
              {product.directions && <Panel><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Directions</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{product.directions}</p></CardContent></Panel>}
              {/* Supplement Facts Complete - Enhanced Display */}
              {supplementFacts && (
                <Panel className="border-chart-4/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <FileText className="w-4 h-4 text-chart-4" />
                      Extraction Details
                      {supplementFacts.panel_type && (
                        <Badge variant="outline" className="ml-2">{supplementFacts.panel_type}</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {supplementFacts.extraction_completeness && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Image Quality</p>
                          <p className="font-medium capitalize">{supplementFacts.extraction_completeness.image_quality ?? "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Panel Visible</p>
                          <p className="font-medium">{supplementFacts.extraction_completeness.panel_fully_visible ? "Yes" : "No"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Nutrients Found</p>
                          <p className="font-medium">{supplementFacts.extraction_completeness.total_nutrients_found ?? "-"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Confidence</p>
                          <Badge variant={supplementFacts.confidence === "high" ? "default" : supplementFacts.confidence === "medium" ? "secondary" : "outline"}>
                            {supplementFacts.confidence ?? "-"}
                          </Badge>
                        </div>
                      </div>
                    )}
                    {supplementFacts.extraction_completeness?.notes && (
                      <p className="text-xs text-muted-foreground italic">{supplementFacts.extraction_completeness.notes}</p>
                    )}
                    {supplementFacts.manufacturer && (
                      <div>
                        <p className="text-xs text-muted-foreground">Manufacturer (from label)</p>
                        <p className="text-sm font-medium">{supplementFacts.manufacturer}</p>
                      </div>
                    )}
                    {supplementFacts.claims_on_label && supplementFacts.claims_on_label.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Claims on Label</p>
                        <div className="flex flex-wrap gap-1">
                          {supplementFacts.claims_on_label.map((claim, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">{claim}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Panel>
              )}
              {specificationsArray && specificationsArray.length > 0 && (
                <Panel>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      Specifications ({specificationsArray.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {specificationsArray.map((spec, idx) => (
                        <div key={idx} className="flex justify-between text-sm border-b border-border pb-2 last:border-0">
                          <span className="text-muted-foreground">{spec.name}</span>
                          <span className="font-medium text-right max-w-[60%]">{spec.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Panel>
              )}
              {importantInfo?.sections && importantInfo.sections.length > 0 && (
                <Panel>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-yellow-500" />
                      Important Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {importantInfo.sections.map((section, idx) => (
                      <div key={idx}>
                        <p className="text-sm font-medium text-foreground mb-1">{section.title}</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{section.body}</p>
                      </div>
                    ))}
                  </CardContent>
                </Panel>
              )}
              {!product.ingredients && !product.serving_size && !allNutrients && <Panel><CardContent className="py-8 text-center text-muted-foreground">No formula data available for this product.</CardContent></Panel>}
            </div>
          </TabsContent>

          {/* Scout Overview Tab */}
          <TabsContent value="scout-overview" className={`mt-4 ${scrollableContentClass} ${maxContentHeight}`}>
            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
              {/* Imagery — given real room, no card chrome */}
              {allImages.length > 0 && (
                <div>
                  <div className="aspect-square rounded-xl overflow-hidden bg-muted">
                    <img src={allImages[selectedImage]} alt={product.title ?? "Product"} className="w-full h-full object-contain" />
                  </div>
                  {allImages.length > 1 && (
                    <div className="flex gap-1.5 overflow-x-auto pt-2.5 pb-1">
                      {allImages.slice(0, 8).map((url, idx) => (
                        <button key={idx} onClick={() => setSelectedImage(idx)} className={`w-11 h-11 rounded-md overflow-hidden shrink-0 ring-1 transition-all ${selectedImage === idx ? "ring-2 ring-primary" : "ring-border hover:ring-muted-foreground/40"}`}>
                          <img src={url} alt="" className="w-full h-full object-contain bg-muted" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <DocSection first title="Identity">
                  <KVGrid>
                    <KV
                      label="ASIN"
                      mono
                      value={product.asin ?? "-"}
                      action={product.asin && (
                        <button onClick={() => navigator.clipboard.writeText(product.asin!)} className="text-muted-foreground hover:text-primary transition-colors" title="Copy ASIN">
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    />
                    <KV label="Brand" value={product.brand ?? "-"} />
                    <KV label="Price" value={`$${(product.price ?? 0).toFixed(2)}`} />
                    <KV label="Rating" value={`${(product.rating_value ?? 0).toFixed(1)}★ · ${(product.rating_count ?? 0).toLocaleString()} reviews`} />
                    <KV label="BSR" value={product.bsr_current ? `#${product.bsr_current.toLocaleString()}` : "-"} />
                  </KVGrid>
                </DocSection>

                {(product.bestseller || product.amazon_choice) && (
                  <DocSection title="Badges">
                    <div className="flex gap-2 flex-wrap">
                      {product.bestseller && <Badge variant="outline" className="gap-1"><Award className="w-3 h-3" />Bestseller</Badge>}
                      {product.amazon_choice && <Badge variant="outline" className="gap-1"><CheckCircle className="w-3 h-3" />Amazon's Choice</Badge>}
                    </div>
                  </DocSection>
                )}

                <DocSection title="Title">
                  <p className="text-sm font-medium leading-relaxed text-foreground">{product.title ?? "-"}</p>
                </DocSection>
              </div>
            </div>
          </TabsContent>

          {/* Scout Formula Tab */}
          <TabsContent value="scout-formula" className={`mt-4 ${scrollableContentClass} ${maxContentHeight}`}>
            <div>
              <DocSection first title="Supplement Facts"
                action={
                  <div className="flex items-center gap-1.5">
                    {product.ocr_extracted && <Badge variant="outline" className="gap-1 text-[10px]"><CheckCircle className="w-3 h-3 text-chart-4" />Extracted</Badge>}
                    {product.ocr_confidence && <Badge variant="outline" className="text-[10px] capitalize">{product.ocr_confidence} confidence</Badge>}
                  </div>
                }
              >
                {(product.serving_size || product.servings_per_container) && (
                  <KVGrid>
                    {product.serving_size && <KV label="Serving Size" value={product.serving_size} />}
                    {product.servings_per_container && <KV label="Servings / Container" value={product.servings_per_container} />}
                  </KVGrid>
                )}

                {allNutrients && allNutrients.length > 0 ? (
                  <div className="document-prose mt-4">
                    <div className="document-table-wrap">
                      <table>
                        <thead>
                          <tr><th>Nutrient</th><th className="text-right">Amount</th><th className="text-right">% DV</th></tr>
                        </thead>
                        <tbody>
                          {allNutrients.map((n, idx) => (
                            <tr key={idx}>
                              <td>{n.name}</td>
                              <td className="text-right">{n.amount != null ? `${n.amount}${n.unit ? ` ${n.unit}` : ""}` : "–"}</td>
                              <td className="text-right">{n.daily_value_percent != null ? `${n.daily_value_percent}%` : "–"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[11px] text-muted-foreground/70 mt-2 not-italic">Extracted from label imagery via OCR{product.ocr_confidence ? ` · ${product.ocr_confidence} confidence` : ""}.</p>
                  </div>
                ) : product.supplement_facts_raw ? (
                  <pre className="text-xs bg-muted/50 p-3.5 rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed mt-4 text-foreground/90">{product.supplement_facts_raw}</pre>
                ) : (
                  <EmptyLine>No formula data extracted for this product.</EmptyLine>
                )}
              </DocSection>

              {product.feature_bullets_text && (
                <DocSection title="Feature Bullets">
                  <ul className="space-y-1.5">
                    {product.feature_bullets_text.split('\n').filter(Boolean).map((bullet, idx) => (
                      <li key={idx} className="flex gap-2 text-sm">
                        <span className="text-primary mt-0.5 shrink-0">•</span>
                        <span className="text-muted-foreground">{bullet.replace(/^[•\-\*]\s*/, '')}</span>
                      </li>
                    ))}
                  </ul>
                </DocSection>
              )}
            </div>
          </TabsContent>

          {/* Keepa Tab */}
          <TabsContent value="keepa" className={`mt-4 ${scrollableContentClass} ${maxContentHeight}`}>
            <div className="space-y-4">
              {/* BSR Stats */}
              <div className="grid grid-cols-3 gap-3">
                <Panel><CardContent className="pt-4 pb-4 text-center">
                  <p className="text-xl font-bold">{product.bsr_current ? `#${product.bsr_current.toLocaleString()}` : "-"}</p>
                  <p className="text-xs text-muted-foreground">Current BSR</p>
                </CardContent></Panel>
                <Panel><CardContent className="pt-4 pb-4 text-center">
                  <p className="text-xl font-bold">{product.bsr_30_days_avg ? `#${Math.round(product.bsr_30_days_avg).toLocaleString()}` : "-"}</p>
                  <p className="text-xs text-muted-foreground">30-Day Avg BSR</p>
                </CardContent></Panel>
                <Panel><CardContent className="pt-4 pb-4 text-center">
                  <p className="text-xl font-bold">{product.bsr_90_days_avg ? `#${Math.round(product.bsr_90_days_avg).toLocaleString()}` : "-"}</p>
                  <p className="text-xs text-muted-foreground">90-Day Avg BSR</p>
                </CardContent></Panel>
              </div>

              {/* Sales Stats */}
              <div className="grid grid-cols-2 gap-3">
                <Panel><CardContent className="pt-4 pb-4 text-center">
                  <p className="text-xl font-bold">{product.monthly_sales ? product.monthly_sales.toLocaleString() : "-"}</p>
                  <p className="text-xs text-muted-foreground">Monthly Sales</p>
                </CardContent></Panel>
                <Panel><CardContent className="pt-4 pb-4 text-center">
                  <p className="text-xl font-bold">{product.monthly_revenue ? `$${Math.round(product.monthly_revenue).toLocaleString()}` : "-"}</p>
                  <p className="text-xs text-muted-foreground">Monthly Revenue</p>
                </CardContent></Panel>
              </div>

              {/* Listing info */}
              <Panel>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Listing Since</span>
                    <span className="font-medium">{formatDate(product.listing_since)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Parent ASIN</span>
                    <span className="font-mono text-xs">{product.parent_asin ?? "-"}</span>
                  </div>
                </CardContent>
              </Panel>

              {/* Historical BSR Chart */}
              {(() => {
                const histData = product.historical_data as { bsr_history?: unknown[] } | null;
                if (histData?.bsr_history && histData.bsr_history.length > 0) {
                  return (
                    <Panel>
                      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">BSR / Sales History</CardTitle></CardHeader>
                      <CardContent>
                        <HistoricalBSRSalesChart historicalData={product.historical_data as { monthly_bsr_history?: Record<string, number | null>; monthly_sales_history?: Record<string, number | null> } | null} />
                      </CardContent>
                    </Panel>
                  );
                }
                return (
                  <Panel><CardContent className="py-6 text-center text-sm text-muted-foreground">No historical BSR data available.</CardContent></Panel>
                );
              })()}
            </div>
          </TabsContent>

          {/* Scout Reviews Tab */}
          <TabsContent value="scout-reviews" className={`mt-4 ${scrollableContentClass} ${maxContentHeight}`}>
            <div>
              {(() => {
                const ra = product.review_analysis as (ReviewAnalysis & {
                  key_strengths?: string[];
                  key_weaknesses?: string[];
                  benefits?: string[];
                  reddit_sentiment?: string;
                  reddit_notes?: string;
                  external_reviews?: string;
                }) | null;
                const hasAny = ra && (ra.key_strengths || ra.key_weaknesses || ra.benefits || ra.reddit_sentiment || ra.external_reviews);
                if (!hasAny) {
                  return <DocSection first title="Off-Amazon Research"><EmptyLine>No Phase 5 research data yet.</EmptyLine></DocSection>;
                }
                return (
                  <>
                    {ra.key_strengths && ra.key_strengths.length > 0 && (
                      <DocSection first title="Key Strengths">
                        <div className="flex flex-wrap gap-2">
                          {ra.key_strengths.map((s, idx) => <Badge key={idx} variant="outline" className="text-chart-4 border-chart-4/30">{s}</Badge>)}
                        </div>
                      </DocSection>
                    )}
                    {ra.key_weaknesses && ra.key_weaknesses.length > 0 && (
                      <DocSection title="Key Weaknesses" first={!ra.key_strengths}>
                        <div className="flex flex-wrap gap-2">
                          {ra.key_weaknesses.map((w, idx) => <Badge key={idx} variant="outline" className="text-destructive border-destructive/30">{w}</Badge>)}
                        </div>
                      </DocSection>
                    )}
                    {ra.benefits && ra.benefits.length > 0 && (
                      <DocSection title="Benefits">
                        <ul className="space-y-1.5">
                          {ra.benefits.map((b, idx) => (
                            <li key={idx} className="flex gap-2 text-sm"><span className="text-primary shrink-0">•</span><span>{b}</span></li>
                          ))}
                        </ul>
                      </DocSection>
                    )}
                    {(ra.reddit_sentiment || ra.reddit_notes) && (
                      <DocSection title="Reddit Sentiment">
                        {ra.reddit_sentiment && <Badge variant="outline" className="mb-2">{ra.reddit_sentiment}</Badge>}
                        {ra.reddit_notes && <MarkdownDoc content={ra.reddit_notes} className="text-sm" />}
                      </DocSection>
                    )}
                    {ra.external_reviews && (
                      <DocSection title="External Reviews">
                        <MarkdownDoc content={ra.external_reviews} className="text-sm" />
                      </DocSection>
                    )}
                  </>
                );
              })()}

              {/* Off-Amazon Intelligence — P5 dovive_p5_sources: Perplexity findings,
                  brand-page excerpts, and citation URLs collected off-Amazon. */}
              <DocSection icon={Globe} title="Off-Amazon Intelligence">
                {!p5Sources || p5Sources.length === 0 ? (
                  <EmptyLine>No off-Amazon sources found for this product yet.</EmptyLine>
                ) : (
                  <div className="space-y-4">
                    {/* Source links — quiet reference list, favicon per citation */}
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Sources</p>
                      <div className="flex flex-col gap-1.5">
                        {p5Sources.map((src) => (
                          <div key={src.id} className="flex items-center gap-2 flex-wrap">
                            {src.source_type && (
                              <Badge variant="outline" className="text-[10px] shrink-0">{src.source_type}</Badge>
                            )}
                            {src.source_url && (
                              <a
                                href={src.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary hover:underline truncate max-w-full"
                              >
                                <img
                                  src={`https://www.google.com/s2/favicons?domain=${(() => { try { return new URL(src.source_url!).hostname; } catch { return src.source_url; } })()}`}
                                  alt=""
                                  className="w-3.5 h-3.5 shrink-0"
                                />
                                <span className="truncate">{src.source_url}</span>
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                            )}
                          </div>
                        ))}
                        {/* Additional citation URLs found within the research (dedup vs source_url) */}
                        {Array.from(new Set(p5Sources.flatMap(s => s.extracted?.citations || [])))
                          .filter(url => !p5Sources.some(s => s.source_url === url))
                          .slice(0, 10)
                          .map((url) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary hover:underline truncate max-w-full"
                            >
                              <img
                                src={`https://www.google.com/s2/favicons?domain=${(() => { try { return new URL(url).hostname; } catch { return url; } })()}`}
                                alt=""
                                className="w-3.5 h-3.5 shrink-0"
                              />
                              <span className="truncate">{url}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ))}
                      </div>
                    </div>

                    {/* Perplexity findings — real document prose, collapsed behind show more */}
                    {(() => {
                      const findings = p5Sources.find(s => s.extracted?.perplexity_findings)?.extracted?.perplexity_findings;
                      if (!findings) return null;
                      const isLong = findings.length > 500;
                      const displayText = showFullFindings || !isLong ? findings : `${findings.slice(0, 500)}...`;
                      return (
                        <div className="pt-3 border-t border-border/40">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Research Findings</p>
                          <MarkdownDoc content={displayText} className="text-sm" />
                          {isLong && (
                            <button
                              onClick={() => setShowFullFindings(!showFullFindings)}
                              className="mt-1.5 text-xs text-primary hover:underline"
                            >
                              {showFullFindings ? "Show less" : "Show more"}
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </DocSection>
            </div>
          </TabsContent>
        </Tabs>
    </DocumentModal>
  );
}
