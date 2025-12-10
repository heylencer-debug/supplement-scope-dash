import React, { useState, useMemo, useCallback, useEffect, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Star, TrendingUp, Pill, Target, MessageSquare, Package, Users, Megaphone, AlertTriangle, CheckCircle, XCircle, Palette, Search, Filter, X, Trophy, ThumbsUp, ThumbsDown, Check, FlaskConical, Scale, Award, Beaker, ChevronDown, ChevronUp, BarChart3, DollarSign, Eye, Layers, Shield, Tag, Sparkles, FileText, Loader2, Zap, Brain, ArrowUp, ArrowDown, Minus, Plus, RefreshCw } from "lucide-react";
import { useProducts, Product } from "@/hooks/useProducts";
import ProductDetailModal from "@/components/ProductDetailModal";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, RadialBarChart, RadialBar } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useIngredientAnalysis, IngredientAnalysis } from "@/hooks/useIngredientAnalysis";
interface EnhancedBenchmarkComparisonProps {
  categoryId?: string;
  analysisData?: {
    key_insights?: {
      go_to_market?: {
        positioning?: string;
        messaging?: string[];
        key_differentiators?: string[];
        launch_tactics?: string[];
      };
      financials?: {
        startup_investment?: string | number;
        target_margin?: string | number;
        breakeven_timeline?: string;
        revenue_projection?: string;
      };
      risks?: Array<{ risk?: string; mitigation?: string }>;
    };
    analysis_1_category_scores?: {
      opportunity_score?: {
        overall?: number;
        market_size?: number;
        profit_potential?: number;
        competition_intensity?: number;
        barriers_to_entry?: number;
      };
      competitive_landscape?: {
        exploitable_weaknesses?: string[];
        market_gaps?: string[];
        things_to_avoid?: string[];
      };
      product_development?: {
        formulation?: {
          recommended_ingredients?: Array<string | { ingredient?: string; name?: string; dosage?: string; amount?: string; rationale?: string }>;
          key_ingredients?: Array<string | { ingredient?: string; name?: string; dosage?: string; amount?: string }>;
          active_ingredients?: Array<string | { ingredient?: string; name?: string; dosage?: string; amount?: string }>;
          other_ingredients?: Array<string | { ingredient?: string; name?: string }>;
          form_factor?: string;
          key_features?: string[];
          serving_size?: string;
          things_to_avoid?: string[];
        };
        pricing?: {
          recommended_price?: number;
          pricing_tier?: string;
          justification?: string;
        };
      };
      customer_insights?: {
        buyer_profile?: string;
        love_most?: string[];
        pain_points?: Array<{ pain_point?: string; frequency?: number; evidence?: string }>;
        unmet_needs?: string[];
        decision_drivers?: string[];
      };
    };
    top_strengths?: Array<{ strength?: string; description?: string }>;
    top_weaknesses?: Array<{ weakness?: string; description?: string }>;
    formula_brief?: {
      key_differentiators?: string[];
      risk_factors?: string[];
      target_price?: number;
      servings_per_container?: number;
      ingredients?: Array<string | { ingredient?: string; name?: string; dosage?: string; amount?: string; rationale?: string }>;
    };
    formula_brief_content?: string | null;
    opportunity_index?: number;
    recommended_price?: number;
  } | null;
  isLoading?: boolean;
}

const MAX_COMPETITORS = 3;

// Parse ingredient tables from formula_brief_content Markdown
interface ParsedIngredient {
  ingredient: string;
  dosage?: string;
  form?: string;
  function?: string;
  rationale?: string;
  category: 'primary' | 'secondary' | 'tertiary' | 'excipient';
}

// Parse Finished Product Specifications for label claims
interface LabelClaim {
  ingredient: string;
  labelClaim: string;
  releaseRange?: string;
  shelfLifeRange?: string;
}

const parseFinishedProductSpecifications = (markdown: string): LabelClaim[] => {
  const labelClaims: LabelClaim[] = [];
  if (!markdown) return labelClaims;
  
  // Find the "FINISHED PRODUCT SPECIFICATIONS" section
  const specsSectionMatch = markdown.match(/##\s*\d*\.?\s*FINISHED PRODUCT SPECIFICATIONS[\s\S]*?(?=##\s*\d*\.|$)/i);
  if (!specsSectionMatch) return labelClaims;
  
  const specsSection = specsSectionMatch[0];
  
  // Find the Potency Targets table
  const tableRowRegex = /^\|([^|]+)\|([^|]+)\|([^|]*)\|([^|]*)?\|?\s*$/gm;
  let match;
  
  while ((match = tableRowRegex.exec(specsSection)) !== null) {
    const [_, col1, col2, col3, col4] = match;
    
    const ingredientName = col1?.trim() || '';
    const labelClaim = col2?.trim() || '';
    
    // Skip header rows and separator rows
    if (!ingredientName || 
        ingredientName.toLowerCase() === 'ingredient' ||
        ingredientName.startsWith('---') ||
        ingredientName.match(/^-+$/) ||
        labelClaim.toLowerCase().includes('label claim') ||
        labelClaim.toLowerCase().includes('acceptable range')) {
      continue;
    }
    
    // Clean up sub-ingredient markers (↳)
    const cleanName = ingredientName.replace(/^↳\s*/, '').trim();
    
    labelClaims.push({
      ingredient: cleanName,
      labelClaim: labelClaim,
      releaseRange: col3?.trim() || undefined,
      shelfLifeRange: col4?.trim() || undefined,
    });
  }
  
  return labelClaims;
};

const parseIngredientTablesFromMarkdown = (markdown: string): ParsedIngredient[] => {
  const ingredients: ParsedIngredient[] = [];
  if (!markdown) return ingredients;
  
  // Split markdown into sections by #### headers (4 hashes, not 3)
  const sections = markdown.split(/^####\s+/m);
  
  sections.forEach(section => {
    // Determine category based on section header
    let category: ParsedIngredient['category'] | null = null;
    const sectionLower = section.toLowerCase();
    
    // Match section headers - they start with the category name after the split
    if (sectionLower.startsWith('primary active')) {
      category = 'primary';
    } else if (sectionLower.startsWith('secondary active')) {
      category = 'secondary';
    } else if (sectionLower.startsWith('tertiary') || sectionLower.includes('differentiation blend')) {
      category = 'tertiary';
    } else if (sectionLower.startsWith('functional excipient')) {
      category = 'excipient';
    }
    
    // Skip non-ingredient sections
    if (!category) {
      return;
    }
    
    // Find table rows - look for lines that start with | and have multiple columns
    // Handle tables with 4-6 columns (some have rationale columns)
    const tableRowRegex = /^\|([^|]+)\|([^|]+)\|([^|]*)\|([^|]*)(?:\|([^|]*))?(?:\|([^|]*))?\|?\s*$/gm;
    let match;
    
    while ((match = tableRowRegex.exec(section)) !== null) {
      const [_, col1, col2, col3, col4, col5, col6] = match;
      
      // Skip header rows and separator rows
      const ingredientName = col1?.trim() || '';
      if (!ingredientName || 
          ingredientName.toLowerCase() === 'ingredient' ||
          ingredientName.startsWith('---') ||
          ingredientName.match(/^-+$/) ||
          ingredientName.match(/^:?-+:?$/)) {
        continue;
      }
      
      const dosage = col2?.trim() || '';
      const form = col3?.trim() || '';
      const functionOrRationale = col4?.trim() || '';
      const additionalRationale = col5?.trim() || col6?.trim() || '';
      
      // Skip if dosage looks like a header (e.g., "Amount per Serving")
      if (dosage.toLowerCase().includes('amount') || dosage.toLowerCase().includes('serving')) {
        continue;
      }
      
      ingredients.push({
        ingredient: ingredientName,
        dosage: dosage || undefined,
        form: form || undefined,
        function: functionOrRationale || undefined,
        rationale: additionalRationale || functionOrRationale || undefined,
        category,
      });
    }
  });
  
  return ingredients;
};

interface IngredientComparisonProps {
  ourDosages: Array<{ ingredient: string; dosage?: string; rationale?: string; form?: string; category?: string; labelClaim?: string }>;
  competitors: Product[];
  getCompetitorNutrients: (product: Product) => Array<{ name: string; amount: number | null; unit: string; dailyValue?: string | number }>;
  getCompetitorIngredientsList: (product: Product) => string[];
  ourPrice?: number;
  ourServings?: number;
  labelClaims?: LabelClaim[];
  categoryId?: string;
}

// AI Analysis Results Display Component
function AIAnalysisResults({ analysis, onRefresh, isLoading }: { 
  analysis: IngredientAnalysis; 
  onRefresh: () => void;
  isLoading: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'summary' | 'ingredients' | 'insights'>('summary');
  
  const getAssessmentColor = (assessment: string) => {
    switch (assessment) {
      case 'Strong': return 'bg-chart-4/20 text-chart-4 border-chart-4/30';
      case 'Moderate': return 'bg-chart-2/20 text-chart-2 border-chart-2/30';
      case 'Weak': return 'bg-destructive/20 text-destructive border-destructive/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getGapStatusIcon = (status: string) => {
    switch (status) {
      case 'leading': return <ArrowUp className="w-3 h-3 text-chart-4" />;
      case 'trailing': return <ArrowDown className="w-3 h-3 text-destructive" />;
      case 'matching': return <Minus className="w-3 h-3 text-chart-2" />;
      case 'unique': return <Sparkles className="w-3 h-3 text-primary" />;
      case 'missing': return <XCircle className="w-3 h-3 text-muted-foreground" />;
      default: return null;
    }
  };

  const getGapStatusColor = (status: string) => {
    switch (status) {
      case 'leading': return 'bg-chart-4/10 text-chart-4 border-chart-4/30';
      case 'trailing': return 'bg-destructive/10 text-destructive border-destructive/30';
      case 'matching': return 'bg-chart-2/10 text-chart-2 border-chart-2/30';
      case 'unique': return 'bg-primary/10 text-primary border-primary/30';
      case 'missing': return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-muted';
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'add': return <Plus className="w-3 h-3" />;
      case 'increase': return <ArrowUp className="w-3 h-3" />;
      case 'decrease': return <ArrowDown className="w-3 h-3" />;
      case 'remove': return <XCircle className="w-3 h-3" />;
      case 'keep': return <Check className="w-3 h-3" />;
      default: return null;
    }
  };

  const getInsightColor = (type: string) => {
    switch (type) {
      case 'add': return 'bg-chart-4/10 text-chart-4';
      case 'increase': return 'bg-primary/10 text-primary';
      case 'decrease': return 'bg-chart-2/10 text-chart-2';
      case 'remove': return 'bg-destructive/10 text-destructive';
      case 'keep': return 'bg-chart-3/10 text-chart-3';
      default: return 'bg-muted';
    }
  };

  const getImpactBadge = (impact: string) => {
    switch (impact) {
      case 'high': return <Badge variant="outline" className="text-[8px] border-destructive/50 text-destructive">High Impact</Badge>;
      case 'medium': return <Badge variant="outline" className="text-[8px] border-chart-2/50 text-chart-2">Medium</Badge>;
      case 'low': return <Badge variant="outline" className="text-[8px] border-muted-foreground/50 text-muted-foreground">Low</Badge>;
      default: return null;
    }
  };

  return (
    <div className="bg-gradient-to-br from-primary/5 via-chart-5/5 to-chart-4/5 rounded-xl border border-primary/20 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              AI Formulation Analysis
              <Badge className={`${getAssessmentColor(analysis.summary.overall_assessment)} text-[10px]`}>
                {analysis.summary.overall_assessment}
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">{analysis.ingredients.length} ingredients analyzed</p>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onRefresh} 
          disabled={isLoading}
          className="h-8"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Score Gauges */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Coverage', value: analysis.charts.coverage_score, color: 'chart-4' },
          { label: 'Uniqueness', value: analysis.charts.uniqueness_score, color: 'primary' },
          { label: 'Efficacy', value: analysis.charts.efficacy_score, color: 'chart-3' },
        ].map((gauge) => (
          <div key={gauge.label} className="bg-card rounded-xl p-3 border border-border/50 text-center">
            <div className={`text-2xl font-bold text-${gauge.color}`}>{gauge.value}</div>
            <div className="text-[10px] text-muted-foreground">{gauge.label} Score</div>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center bg-muted rounded-lg p-0.5">
        {[
          { id: 'summary', label: 'Summary' },
          { id: 'ingredients', label: 'Ingredients' },
          { id: 'insights', label: 'Actions' },
        ].map((tab) => (
          <Button 
            key={tab.id}
            variant={activeTab === tab.id ? 'secondary' : 'ghost'} 
            size="sm" 
            className="flex-1 h-7 text-xs"
            onClick={() => setActiveTab(tab.id as any)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <div className="space-y-3">
          {/* Recommendation */}
          <div className="bg-card rounded-lg p-3 border border-border/50">
            <p className="text-xs font-medium text-foreground mb-1">Strategic Recommendation</p>
            <p className="text-sm text-muted-foreground">{analysis.summary.recommendation}</p>
          </div>

          {/* Strengths & Gaps */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-chart-4/5 rounded-lg p-3 border border-chart-4/20">
              <p className="text-xs font-medium text-chart-4 mb-2 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Key Strengths
              </p>
              <ul className="space-y-1">
                {analysis.summary.key_strengths.map((s, i) => (
                  <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                    <span className="text-chart-4 mt-0.5">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-chart-2/5 rounded-lg p-3 border border-chart-2/20">
              <p className="text-xs font-medium text-chart-2 mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Key Gaps
              </p>
              <ul className="space-y-1">
                {analysis.summary.key_gaps.map((g, i) => (
                  <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                    <span className="text-chart-2 mt-0.5">•</span>
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Dosage Comparison Chart */}
          {analysis.charts.dosage_comparison.length > 0 && (
            <div className="bg-card rounded-lg p-3 border border-border/50">
              <p className="text-xs font-medium text-foreground mb-3">Dosage Comparison (Our Concept vs Competitor Avg)</p>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={analysis.charts.dosage_comparison.slice(0, 8)} 
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <YAxis 
                      dataKey="ingredient" 
                      type="category" 
                      width={75} 
                      tick={{ fontSize: 9 }} 
                      className="text-muted-foreground"
                      tickFormatter={(v) => v.length > 12 ? v.substring(0, 10) + '...' : v}
                    />
                    <Tooltip 
                      formatter={(value: number, name: string) => [`${value}`, name]}
                      labelFormatter={(label) => `${label}`}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Bar dataKey="our_amount" name="Our Concept" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="competitor_avg" name="Competitor Avg" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ingredients Tab */}
      {activeTab === 'ingredients' && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {analysis.ingredients.map((ing, idx) => (
            <div 
              key={idx} 
              className={`rounded-lg p-3 border ${getGapStatusColor(ing.gap_status)}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {getGapStatusIcon(ing.gap_status)}
                  <div>
                    <p className="text-xs font-medium text-foreground">{ing.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {ing.our_dosage && (
                        <span className="text-[10px] text-primary font-medium">Ours: {ing.our_dosage}</span>
                      )}
                      {ing.avg_competitor_dosage && (
                        <span className="text-[10px] text-muted-foreground">Avg: {ing.avg_competitor_dosage}</span>
                      )}
                      {ing.gap_percentage !== null && (
                        <Badge variant="outline" className={`text-[8px] ${ing.gap_percentage > 0 ? 'text-chart-4' : ing.gap_percentage < 0 ? 'text-destructive' : ''}`}>
                          {ing.gap_percentage > 0 ? '+' : ''}{ing.gap_percentage}%
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className={`text-[8px] ${ing.priority === 'high' ? 'border-destructive/50' : ing.priority === 'medium' ? 'border-chart-2/50' : 'border-muted'}`}>
                  {ing.priority}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">{ing.clinical_note}</p>
            </div>
          ))}
        </div>
      )}

      {/* Actions Tab */}
      {activeTab === 'insights' && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {analysis.actionable_insights.map((insight, idx) => (
            <div 
              key={idx} 
              className={`rounded-lg p-3 border border-border/50 ${getInsightColor(insight.type)}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-background/50">
                    {getInsightIcon(insight.type)}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground flex items-center gap-2">
                      <span className="uppercase text-[10px] opacity-70">{insight.type}</span>
                      {insight.ingredient}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{insight.reason}</p>
                  </div>
                </div>
                {getImpactBadge(insight.impact)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Packaging Comparison Component
interface PackagingComparisonProps {
  ourPackaging: {
    type?: string;
    quantity?: string | number;
    design_elements?: string[];
  } | null;
  competitors: Product[];
  getCompetitorPackaging: (product: Product) => {
    visualStyle: string | null;
    trustSignals: string[];
    conversionTriggers: string | null;
    claims: string[];
  };
}

function PackagingComparisonSection({ ourPackaging, competitors, getCompetitorPackaging }: PackagingComparisonProps) {
  const [isOpen, setIsOpen] = useState(true);

  // Calculate packaging score for each competitor
  const calculatePackagingScore = (packaging: {
    visualStyle: string | null;
    trustSignals: string[];
    conversionTriggers: string | null;
    claims: string[];
  }): number => {
    let score = 0;
    
    // Trust signals: up to 30 points (5 points each, max 6)
    score += Math.min(packaging.trustSignals.length * 5, 30);
    
    // Claims: up to 30 points (3 points each, max 10)
    score += Math.min(packaging.claims.length * 3, 30);
    
    // Visual style defined: 20 points
    if (packaging.visualStyle && packaging.visualStyle !== 'N/A') {
      score += 20;
    }
    
    // Conversion triggers defined: 20 points
    if (packaging.conversionTriggers && packaging.conversionTriggers !== 'N/A') {
      score += 20;
    }
    
    return Math.min(score, 100);
  };

  const getScoreColor = (score: number): string => {
    if (score >= 70) return 'text-chart-4';
    if (score >= 40) return 'text-chart-2';
    return 'text-muted-foreground';
  };

  const getScoreBgColor = (score: number): string => {
    if (score >= 70) return 'bg-chart-4/10 border-chart-4/30';
    if (score >= 40) return 'bg-chart-2/10 border-chart-2/30';
    return 'bg-muted/50 border-muted';
  };

  // Aggregate all claims and trust signals across competitors
  const aggregatedData = useMemo(() => {
    const claimCounts = new Map<string, number>();
    const trustSignalCounts = new Map<string, number>();
    const scores: number[] = [];
    
    competitors.forEach(product => {
      const packaging = getCompetitorPackaging(product);
      scores.push(calculatePackagingScore(packaging));
      
      // Count claims
      packaging.claims.forEach(claim => {
        const normalized = claim.toLowerCase().trim();
        if (normalized.length > 2) {
          const key = claim.trim();
          claimCounts.set(key, (claimCounts.get(key) || 0) + 1);
        }
      });
      
      // Count trust signals
      packaging.trustSignals.forEach(signal => {
        const normalized = signal.toLowerCase().trim();
        if (normalized.length > 2) {
          const key = signal.trim();
          trustSignalCounts.set(key, (trustSignalCounts.get(key) || 0) + 1);
        }
      });
    });

    const topClaims = Array.from(claimCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    
    const topTrustSignals = Array.from(trustSignalCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    return { topClaims, topTrustSignals, avgScore };
  }, [competitors, getCompetitorPackaging]);

  if (competitors.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="mt-4">
        <CardHeader className="pb-2 p-3 sm:p-4 md:p-6">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <div className="cursor-pointer hover:opacity-80 transition-opacity">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                  <Package className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
                  Packaging Strategy Comparison
                </CardTitle>
                <CardDescription className="text-[10px] sm:text-xs">
                  Visual styles, trust signals, and claims across competitors
                </CardDescription>
              </div>
            </CollapsibleTrigger>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                {isOpen ? <ChevronUp className="h-3 w-3 sm:h-4 sm:w-4" /> : <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />}
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0 p-3 sm:p-4 md:p-6">
            {/* Comparison Grid */}
            <div className="space-y-4">
              {/* Our Concept Packaging */}
              {ourPackaging && (ourPackaging.type || ourPackaging.design_elements?.length) && (
                <div className="p-2 sm:p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary flex items-center justify-center">
                      <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary-foreground" />
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-foreground">Our Concept</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                    {ourPackaging.type && (
                      <div className="bg-background/60 rounded p-1.5 sm:p-2">
                        <p className="text-[9px] sm:text-[10px] text-muted-foreground mb-0.5">Recommended Format</p>
                        <p className="text-xs sm:text-sm font-medium text-primary">{ourPackaging.type}</p>
                        {ourPackaging.quantity && (
                          <p className="text-[9px] sm:text-[10px] text-muted-foreground">({ourPackaging.quantity} count)</p>
                        )}
                      </div>
                    )}
                    {ourPackaging.design_elements && ourPackaging.design_elements.length > 0 && (
                      <div className="bg-background/60 rounded p-1.5 sm:p-2 sm:col-span-2">
                        <p className="text-[9px] sm:text-[10px] text-muted-foreground mb-1">Design Elements</p>
                        <div className="flex flex-wrap gap-1">
                          {ourPackaging.design_elements.map((el, i) => (
                            <Badge key={i} variant="secondary" className="text-[8px] sm:text-[9px]">{el}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Competitor Packaging Comparison Table */}
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-[10px] font-semibold w-[100px]">Brand</TableHead>
                      <TableHead className="text-[10px] font-semibold w-[60px] text-center">Score</TableHead>
                      <TableHead className="text-[10px] font-semibold hidden sm:table-cell">Visual Style</TableHead>
                      <TableHead className="text-[10px] font-semibold">Trust Signals</TableHead>
                      <TableHead className="text-[10px] font-semibold hidden lg:table-cell">Conversion Focus</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {competitors.map((product, idx) => {
                      const packaging = getCompetitorPackaging(product);
                      const score = calculatePackagingScore(packaging);
                      return (
                        <TableRow key={product.id} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                          <TableCell className="py-2">
                            <div className="flex items-center gap-2">
                              {product.main_image_url ? (
                                <img src={product.main_image_url} alt="" className="w-8 h-8 rounded object-contain bg-white border" />
                              ) : (
                                <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                                  <Package className="w-4 h-4 text-muted-foreground/30" />
                                </div>
                              )}
                              <span className="text-[10px] font-medium truncate max-w-[60px]">{product.brand || 'Unknown'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2 text-center">
                            <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full border ${getScoreBgColor(score)}`}>
                              <span className={`text-sm font-bold ${getScoreColor(score)}`}>{score}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-2 hidden sm:table-cell">
                            <p className="text-[10px] text-muted-foreground line-clamp-2">
                              {packaging.visualStyle || <span className="text-muted-foreground/50">—</span>}
                            </p>
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex flex-wrap gap-0.5">
                              {packaging.trustSignals.length > 0 ? (
                                packaging.trustSignals.slice(0, 3).map((signal, i) => (
                                  <Badge key={i} variant="outline" className="text-[8px] h-4 px-1">
                                    {signal.length > 15 ? signal.substring(0, 15) + '...' : signal}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-[10px] text-muted-foreground/50">—</span>
                              )}
                              {packaging.trustSignals.length > 3 && (
                                <Badge variant="secondary" className="text-[8px] h-4 px-1">
                                  +{packaging.trustSignals.length - 3}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-2 hidden lg:table-cell">
                            <p className="text-[10px] text-muted-foreground line-clamp-2">
                              {packaging.conversionTriggers || <span className="text-muted-foreground/50">—</span>}
                            </p>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Average Score Banner */}
              <div className="flex items-center justify-between p-2 sm:p-3 bg-muted/30 rounded-lg border">
                <div className="flex items-center gap-2">
                  <Award className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
                  <span className="text-[10px] sm:text-xs font-medium text-foreground">Category Average Packaging Score</span>
                </div>
                <div className={`flex items-center gap-1 sm:gap-2 ${getScoreColor(aggregatedData.avgScore)}`}>
                  <span className="text-base sm:text-lg font-bold">{aggregatedData.avgScore}</span>
                  <span className="text-[9px] sm:text-[10px] text-muted-foreground">/100</span>
                </div>
              </div>

              {/* Aggregated Insights */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Top Claims */}
                {aggregatedData.topClaims.length > 0 && (
                  <div className="bg-chart-4/5 rounded-lg p-2 sm:p-3 border border-chart-4/20">
                    <p className="text-[9px] sm:text-[10px] font-semibold mb-2 flex items-center gap-1 text-chart-4">
                      <Tag className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      Most Common Claims
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {aggregatedData.topClaims.map(([claim, count], i) => (
                        <Badge key={i} variant="secondary" className="text-[8px] sm:text-[9px]">
                          {claim}
                          <span className="ml-1 text-muted-foreground">({count})</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Trust Signals */}
                {aggregatedData.topTrustSignals.length > 0 && (
                  <div className="bg-primary/5 rounded-lg p-2 sm:p-3 border border-primary/20">
                    <p className="text-[9px] sm:text-[10px] font-semibold mb-2 flex items-center gap-1 text-primary">
                      <Shield className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      Common Trust Signals
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {aggregatedData.topTrustSignals.map(([signal, count], i) => (
                        <Badge key={i} variant="outline" className="text-[8px] sm:text-[9px] border-primary/30">
                          {signal}
                          <span className="ml-1 text-muted-foreground">({count})</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function IngredientComparisonSection({ ourDosages, competitors, getCompetitorNutrients, getCompetitorIngredientsList, ourPrice, ourServings, labelClaims = [], categoryId }: IngredientComparisonProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'chart' | 'table' | 'gaps'>('chart');
  
  // AI Analysis hook
  const { analysis: aiAnalysis, isLoading: aiLoading, runAnalysis, hasAnalysis } = useIngredientAnalysis(categoryId);

  // Create a map of label claims for quick lookup
  const labelClaimsMap = useMemo(() => {
    const map = new Map<string, LabelClaim>();
    labelClaims.forEach(claim => {
      const normalizedName = claim.ingredient.toLowerCase().trim();
      map.set(normalizedName, claim);
    });
    return map;
  }, [labelClaims]);

  // Build unified data combining nutrients (with amounts) AND other ingredients
  const comparisonData = useMemo(() => {
    // Use a simple Map where EVERY unique ingredient gets its own entry
    const ingredientMap = new Map<string, {
      displayName: string;
      ourDosage: string | null;
      ourForm: string | null;
      ourCategory: string | null;
      ourLabelClaim: string | null;
      isNutrient: boolean;
      competitors: Array<{ brand: string; amount: string | null; dailyValue?: string | number }>;
    }>();

    // Helper to add an ingredient to the map
    const addToMap = (
      normalizedKey: string, 
      displayName: string, 
      isNutrient: boolean, 
      dosage: string | null,
      form: string | null,
      category: string | null,
      competitor?: { brand: string; amount: string | null; dailyValue?: string | number }
    ) => {
      // Look up label claim for this ingredient
      const labelClaimData = labelClaimsMap.get(normalizedKey);
      const labelClaimValue = labelClaimData?.labelClaim || null;
      
      if (!ingredientMap.has(normalizedKey)) {
        ingredientMap.set(normalizedKey, {
          displayName,
          ourDosage: dosage,
          ourForm: form,
          ourCategory: category,
          ourLabelClaim: labelClaimValue,
          isNutrient,
          competitors: competitor ? [competitor] : []
        });
      } else {
        const existing = ingredientMap.get(normalizedKey)!;
        if (dosage && !existing.ourDosage) {
          existing.ourDosage = dosage;
        }
        if (form && !existing.ourForm) {
          existing.ourForm = form;
        }
        if (category && !existing.ourCategory) {
          existing.ourCategory = category;
        }
        if (labelClaimValue && !existing.ourLabelClaim) {
          existing.ourLabelClaim = labelClaimValue;
        }
        if (competitor) {
          const alreadyHas = existing.competitors.some(c => c.brand === competitor.brand);
          if (!alreadyHas) {
            existing.competitors.push(competitor);
          }
        }
      }
    };

    // 1. Add our recommended dosages (these are nutrients) - with form and category
    ourDosages.forEach(item => {
      const normalizedName = item.ingredient.toLowerCase().trim();
      addToMap(normalizedName, item.ingredient, true, item.dosage || null, item.form || null, item.category || null);
    });

    // 2. Add ALL competitor data
    competitors.forEach(product => {
      const brand = product.brand || 'Unknown';
      
      // 2a. Add nutrients (with amounts)
      const nutrients = getCompetitorNutrients(product);
      nutrients.forEach(nutrient => {
        const normalizedName = nutrient.name.toLowerCase().trim();
        addToMap(
          normalizedName,
          nutrient.name,
          true,
          null,
          null,
          null,
          {
            brand,
            amount: nutrient.amount !== null ? `${nutrient.amount}${nutrient.unit}` : null,
            dailyValue: nutrient.dailyValue
          }
        );
      });

      // 2b. Add ALL other ingredients (from ingredients + other_ingredients fields)
      const ingredientsList = getCompetitorIngredientsList(product);
      ingredientsList.forEach(ing => {
        // Clean up - remove dosage numbers but keep everything else
        const cleanedIng = ing.replace(/\d+(\.\d+)?\s*(mg|mcg|iu|g|ml|μg)\b/gi, '').trim();
        if (!cleanedIng || cleanedIng.length < 2) return;
        
        const normalizedIng = cleanedIng.toLowerCase().trim();
        
        // Add EVERY ingredient as its own entry - NO fuzzy matching
        addToMap(
          normalizedIng,
          cleanedIng.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
          false,
          null,
          null,
          null,
          { brand, amount: null }
        );
      });
    });

    // Convert to array and sort: by category (Primary > Secondary > Tertiary > Excipient), then ours first, then nutrients
    const categoryOrder = ['Primary Active', 'Secondary Active', 'Tertiary Active', 'Functional Excipient'];
    return Array.from(ingredientMap.entries())
      .map(([key, data]) => ({
        name: data.displayName,
        ourDosage: data.ourDosage,
        ourForm: data.ourForm,
        ourCategory: data.ourCategory,
        ourLabelClaim: data.ourLabelClaim,
        isNutrient: data.isNutrient,
        competitors: data.competitors
      }))
      .sort((a, b) => {
        // First sort by category order
        const aCatIdx = a.ourCategory ? categoryOrder.indexOf(a.ourCategory) : 999;
        const bCatIdx = b.ourCategory ? categoryOrder.indexOf(b.ourCategory) : 999;
        if (aCatIdx !== bCatIdx) return aCatIdx - bCatIdx;
        // Then ours first
        if (a.ourDosage && !b.ourDosage) return -1;
        if (!a.ourDosage && b.ourDosage) return 1;
        if (a.isNutrient && !b.isNutrient) return -1;
        if (!a.isNutrient && b.isNutrient) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [ourDosages, competitors, getCompetitorNutrients, getCompetitorIngredientsList]);

  // Separate nutrients and other ingredients for display - now including those with categories
  const nutrientsOnly = useMemo(() => 
    comparisonData.filter(item => item.isNutrient && (item.ourDosage || item.ourCategory || item.competitors.some(c => c.amount))),
    [comparisonData]
  );

  const otherIngredientsOnly = useMemo(() => 
    comparisonData.filter(item => !item.isNutrient),
    [comparisonData]
  );

  // Group nutrients by category for better display
  const groupedNutrients = useMemo(() => {
    const groups: Record<string, typeof nutrientsOnly> = {
      'Primary Active': [],
      'Secondary Active': [],
      'Tertiary Active': [],
      'Functional Excipient': [],
      'Other': []
    };
    nutrientsOnly.forEach(item => {
      const cat = item.ourCategory || 'Other';
      if (groups[cat]) {
        groups[cat].push(item);
      } else {
        groups['Other'].push(item);
      }
    });
    return groups;
  }, [nutrientsOnly]);

  // Build chart data
  const chartData = useMemo(() => {
    const parseNumeric = (value: string | null): number => {
      if (!value) return 0;
      const match = value.match(/[\d.]+/);
      return match ? parseFloat(match[0]) : 0;
    };

    return nutrientsOnly
      .slice(0, 10)
      .map(row => {
        const entry: Record<string, string | number> = {
          name: row.name.length > 20 ? row.name.substring(0, 18) + '...' : row.name,
          fullName: row.name,
          'Our Concept': parseNumeric(row.ourDosage),
        };
        
        competitors.forEach((p, i) => {
          const compData = row.competitors.find(c => c.brand === (p.brand || 'Unknown'));
          entry[`#${i + 1} ${p.brand?.substring(0, 10) || 'Unknown'}`] = parseNumeric(compData?.amount || null);
        });
        
        return entry;
      });
  }, [nutrientsOnly, competitors]);

  const chartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {
      'Our Concept': { label: 'Our Concept', color: 'hsl(var(--chart-2))' },
    };
    competitors.forEach((p, i) => {
      const key = `#${i + 1} ${p.brand?.substring(0, 10) || 'Unknown'}`;
      const colors = ['hsl(var(--chart-1))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];
      config[key] = { label: p.brand || 'Unknown', color: colors[i % colors.length] };
    });
    return config;
  }, [competitors]);

  // Gap analysis
  const gapAnalysis = useMemo(() => {
    const parseNumeric = (value: string | null): number => {
      if (!value) return 0;
      const match = value.match(/[\d.]+/);
      return match ? parseFloat(match[0]) : 0;
    };

    const gaps: Array<{
      nutrient: string;
      ourValue: number;
      ourDosage: string | null;
      competitorAvg: number;
      competitorMax: number;
      competitorMin: number;
      percentDiff: number;
      status: 'leading' | 'trailing' | 'matching' | 'unique' | 'missing';
      unit: string;
    }> = [];

    nutrientsOnly.forEach(row => {
      const ourValue = parseNumeric(row.ourDosage);
      const competitorValues = row.competitors
        .map(c => parseNumeric(c.amount))
        .filter(v => v > 0);
      
      if (competitorValues.length === 0 && ourValue > 0) {
        gaps.push({
          nutrient: row.name, ourValue, ourDosage: row.ourDosage,
          competitorAvg: 0, competitorMax: 0, competitorMin: 0,
          percentDiff: 100, status: 'unique',
          unit: row.ourDosage?.replace(/[\d.]+/g, '').trim() || 'mg'
        });
      } else if (competitorValues.length > 0 && ourValue === 0) {
        const avg = competitorValues.reduce((a, b) => a + b, 0) / competitorValues.length;
        gaps.push({
          nutrient: row.name, ourValue: 0, ourDosage: null,
          competitorAvg: avg, competitorMax: Math.max(...competitorValues),
          competitorMin: Math.min(...competitorValues),
          percentDiff: -100, status: 'missing', unit: 'mg'
        });
      } else if (competitorValues.length > 0 && ourValue > 0) {
        const avg = competitorValues.reduce((a, b) => a + b, 0) / competitorValues.length;
        const percentDiff = avg > 0 ? ((ourValue - avg) / avg) * 100 : 0;
        let status: 'leading' | 'trailing' | 'matching';
        if (percentDiff > 15) status = 'leading';
        else if (percentDiff < -15) status = 'trailing';
        else status = 'matching';
        
        gaps.push({
          nutrient: row.name, ourValue, ourDosage: row.ourDosage,
          competitorAvg: avg, competitorMax: Math.max(...competitorValues),
          competitorMin: Math.min(...competitorValues),
          percentDiff, status, unit: row.ourDosage?.replace(/[\d.]+/g, '').trim() || 'mg'
        });
      }
    });

    const statusOrder = { leading: 0, unique: 1, matching: 2, trailing: 3, missing: 4 };
    return gaps.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
  }, [nutrientsOnly]);

  // Stats
  const stats = useMemo(() => {
    // Count ingredients that competitors have
    const competitorIngredients = comparisonData.filter(i => i.competitors.length > 0);
    const coveredByUs = competitorIngredients.filter(i => i.ourDosage);
    const coverageScore = competitorIngredients.length > 0 
      ? Math.round((coveredByUs.length / competitorIngredients.length) * 100)
      : 0;

    return {
      total: comparisonData.length,
      nutrients: comparisonData.filter(i => i.isNutrient).length,
      otherIngredients: comparisonData.filter(i => !i.isNutrient).length,
      inOurFormula: comparisonData.filter(i => i.ourDosage).length,
      leading: gapAnalysis.filter(g => g.status === 'leading').length,
      trailing: gapAnalysis.filter(g => g.status === 'trailing').length,
      unique: gapAnalysis.filter(g => g.status === 'unique').length,
      missing: gapAnalysis.filter(g => g.status === 'missing').length,
      coverageScore,
      competitorIngredientCount: competitorIngredients.length,
    };
  }, [comparisonData, gapAnalysis]);

  // Price per serving calculations
  const pricePerServing = useMemo(() => {
    const data: Array<{ name: string; price: number | null; servings: number | null; pps: number | null; isOurs?: boolean }> = [];
    
    // Our concept
    if (ourPrice && ourServings && ourServings > 0) {
      data.push({
        name: 'Our Concept',
        price: ourPrice,
        servings: ourServings,
        pps: ourPrice / ourServings,
        isOurs: true
      });
    }
    
    // Competitors
    competitors.forEach(p => {
      const servings = p.servings_per_container;
      const price = p.price;
      if (price && servings && servings > 0) {
        data.push({
          name: p.brand || 'Unknown',
          price,
          servings,
          pps: price / servings
        });
      }
    });

    // Calculate average pps of competitors for comparison
    const competitorPps = data.filter(d => !d.isOurs).map(d => d.pps).filter(Boolean) as number[];
    const avgCompetitorPps = competitorPps.length > 0 
      ? competitorPps.reduce((a, b) => a + b, 0) / competitorPps.length 
      : null;

    return { data, avgCompetitorPps };
  }, [ourPrice, ourServings, competitors]);

  if (comparisonData.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="mt-4">
        <CardHeader className="pb-2 p-3 sm:p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CollapsibleTrigger asChild>
              <div className="cursor-pointer hover:opacity-80 transition-opacity">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                  <FlaskConical className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
                  Ingredient & Dosage Comparison
                  <Badge variant="secondary" className="ml-2 text-[9px] sm:text-[10px]">
                    {stats.total} total
                  </Badge>
                </CardTitle>
                <CardDescription className="text-[10px] sm:text-xs">
                  {stats.nutrients} active nutrients • {stats.otherIngredients} other ingredients
                </CardDescription>
              </div>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2">
              {/* AI Analysis Button */}
              <Button 
                variant={hasAnalysis ? "secondary" : "default"}
                size="sm" 
                className="h-7 sm:h-8 px-2 sm:px-3 text-[10px] sm:text-xs"
                onClick={(e) => { e.stopPropagation(); runAnalysis(); }}
                disabled={aiLoading || !categoryId}
              >
                {aiLoading ? (
                  <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 animate-spin" />
                ) : (
                  <Brain className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
                )}
                {hasAnalysis ? 'Re-analyze' : 'Analyze with AI'}
              </Button>
              {/* View Toggle */}
              <div className="flex items-center bg-muted rounded-lg p-0.5">
                <Button variant={viewMode === 'chart' ? 'secondary' : 'ghost'} size="sm" className="h-6 sm:h-7 px-1.5 sm:px-2 text-[10px] sm:text-xs"
                  onClick={(e) => { e.stopPropagation(); setViewMode('chart'); }}>
                  <BarChart3 className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />Chart
                </Button>
                <Button variant={viewMode === 'gaps' ? 'secondary' : 'ghost'} size="sm" className="h-6 sm:h-7 px-1.5 sm:px-2 text-[10px] sm:text-xs"
                  onClick={(e) => { e.stopPropagation(); setViewMode('gaps'); }}>
                  <Scale className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />Gaps
                </Button>
                <Button variant={viewMode === 'table' ? 'secondary' : 'ghost'} size="sm" className="h-6 sm:h-7 px-1.5 sm:px-2 text-[10px] sm:text-xs"
                  onClick={(e) => { e.stopPropagation(); setViewMode('table'); }}>
                  <Pill className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />All
                </Button>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                  {isOpen ? <ChevronUp className="h-3 w-3 sm:h-4 sm:w-4" /> : <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0 p-3 sm:p-4 md:p-6">
            {/* AI Analysis Results */}
            {aiAnalysis && (
              <div className="mb-4">
                <AIAnalysisResults analysis={aiAnalysis} onRefresh={runAnalysis} isLoading={aiLoading} />
              </div>
            )}
            
            {viewMode === 'chart' && (
              /* BAR CHART VIEW */
              <div className="space-y-4">
                <ChartContainer config={chartConfig} className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                      <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} className="text-muted-foreground" />
                      <ChartTooltip content={<ChartTooltipContent />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Bar dataKey="Our Concept" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} barSize={12} />
                      {competitors.map((p, i) => {
                        const key = `#${i + 1} ${p.brand?.substring(0, 10) || 'Unknown'}`;
                        const colors = ['hsl(var(--chart-1))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];
                        return <Bar key={p.id} dataKey={key} fill={colors[i % colors.length]} radius={[0, 4, 4, 0]} barSize={12} />;
                      })}
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
                <div className="text-[10px] text-muted-foreground text-center">
                  Showing top {Math.min(10, nutrientsOnly.length)} nutrients with dosage data
                </div>
              </div>
            )}

            {viewMode === 'gaps' && (
              /* GAP ANALYSIS VIEW */
              <div className="space-y-4">
                {/* Summary badges */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="bg-chart-4/20 text-chart-4">
                    <TrendingUp className="w-3 h-3 mr-1" />{stats.leading} Leading
                  </Badge>
                  <Badge variant="secondary" className="bg-primary/20 text-primary">
                    <Award className="w-3 h-3 mr-1" />{stats.unique} Unique
                  </Badge>
                  <Badge variant="secondary" className="bg-chart-1/20 text-chart-1">
                    <AlertTriangle className="w-3 h-3 mr-1" />{stats.trailing} Trailing
                  </Badge>
                  <Badge variant="secondary" className="bg-destructive/20 text-destructive">
                    <XCircle className="w-3 h-3 mr-1" />{stats.missing} Missing
                  </Badge>
                </div>

                {/* Gap cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
                  {gapAnalysis.slice(0, 12).map((gap, idx) => (
                    <div key={idx} className={`p-2 rounded-lg border text-xs ${
                      gap.status === 'leading' ? 'bg-chart-4/10 border-chart-4/30' :
                      gap.status === 'unique' ? 'bg-primary/10 border-primary/30' :
                      gap.status === 'trailing' ? 'bg-chart-1/10 border-chart-1/30' :
                      gap.status === 'missing' ? 'bg-destructive/10 border-destructive/30' :
                      'bg-muted/30 border-border'
                    }`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="font-medium truncate flex-1" title={gap.nutrient}>{gap.nutrient}</span>
                        <Badge variant="secondary" className={`text-[9px] shrink-0 ${
                          gap.status === 'leading' ? 'bg-chart-4/20 text-chart-4' :
                          gap.status === 'unique' ? 'bg-primary/20 text-primary' :
                          gap.status === 'trailing' ? 'bg-chart-1/20 text-chart-1' :
                          gap.status === 'missing' ? 'bg-destructive/20 text-destructive' : ''
                        }`}>
                          {gap.status === 'leading' && `+${Math.round(gap.percentDiff)}%`}
                          {gap.status === 'trailing' && `${Math.round(gap.percentDiff)}%`}
                          {gap.status === 'unique' && 'Unique'}
                          {gap.status === 'missing' && 'Missing'}
                          {gap.status === 'matching' && '~Match'}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Ours</span>
                          <span className={gap.status === 'leading' || gap.status === 'unique' ? 'text-chart-4 font-semibold' : ''}>
                            {gap.ourDosage || '—'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Avg</span>
                          <span>{gap.competitorAvg > 0 ? `${Math.round(gap.competitorAvg)}${gap.unit}` : '—'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {viewMode === 'table' && (
              /* FULL TABLE VIEW */
              <div className="space-y-4">
                {/* Formula Summary Card */}
                {groupedNutrients && Object.keys(groupedNutrients).length > 0 && (
                  <div className="bg-gradient-to-br from-primary/5 to-chart-2/5 rounded-xl border border-primary/20 p-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-xl bg-primary/10">
                        <Beaker className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">Formula Summary</h3>
                        <p className="text-xs text-muted-foreground">Complete ingredient breakdown</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {/* Total Ingredients */}
                      <div className="bg-card rounded-xl p-3 border border-border/50 text-center">
                        <div className="text-2xl font-bold text-foreground">
                          {Object.values(groupedNutrients).reduce((sum, arr) => sum + arr.length, 0)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Total Ingredients</div>
                      </div>
                      {/* Primary Actives */}
                      <div className="bg-card rounded-xl p-3 border border-chart-4/30 text-center">
                        <div className="text-2xl font-bold text-chart-4">
                          {groupedNutrients['Primary Active']?.length || 0}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Primary Actives</div>
                      </div>
                      {/* Secondary Actives */}
                      <div className="bg-card rounded-xl p-3 border border-chart-3/30 text-center">
                        <div className="text-2xl font-bold text-chart-3">
                          {groupedNutrients['Secondary Active']?.length || 0}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Secondary Actives</div>
                      </div>
                      {/* Tertiary Actives */}
                      <div className="bg-card rounded-xl p-3 border border-chart-2/30 text-center">
                        <div className="text-2xl font-bold text-chart-2">
                          {groupedNutrients['Tertiary Active']?.length || 0}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Tertiary Actives</div>
                      </div>
                      {/* Excipients */}
                      <div className="bg-card rounded-xl p-3 border border-muted-foreground/30 text-center">
                        <div className="text-2xl font-bold text-muted-foreground">
                          {groupedNutrients['Functional Excipient']?.length || 0}
                        </div>
                        <div className="text-[10px] text-muted-foreground">Excipients</div>
                      </div>
                    </div>
                    {/* Total Formula Weight */}
                    {(() => {
                      const totalWeight = Object.values(groupedNutrients)
                        .flat()
                        .reduce((sum, item) => {
                          const match = item.ourDosage?.match(/(\d+(?:\.\d+)?)\s*(mg|g|mcg|iu)/i);
                          if (match) {
                            let value = parseFloat(match[1]);
                            const unit = match[2].toLowerCase();
                            if (unit === 'g') value *= 1000;
                            else if (unit === 'mcg') value /= 1000;
                            else if (unit === 'iu') value = 0;
                            return sum + value;
                          }
                          return sum;
                        }, 0);
                      
                      if (totalWeight > 0) {
                        return (
                          <div className="mt-4 pt-4 border-t border-border/50 flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Estimated Active Formula Weight</span>
                            <span className="text-lg font-semibold text-foreground">
                              {totalWeight >= 1000 
                                ? `${(totalWeight / 1000).toFixed(2)} g` 
                                : `${totalWeight.toFixed(1)} mg`}
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                {/* Ingredient Synergy Visualization */}
                {groupedNutrients && Object.keys(groupedNutrients).length > 0 && (() => {
                  // Define known synergy pairs with scientific rationale
                  const synergyPairs = [
                    { a: 'Magnesium', b: 'GABA', rationale: 'Magnesium enhances GABA receptor activity, amplifying calming effects', category: 'Relaxation' },
                    { a: 'Magnesium', b: 'Vitamin B6', rationale: 'B6 is required for magnesium absorption and utilization in cells', category: 'Absorption' },
                    { a: '5-HTP', b: 'Vitamin B6', rationale: 'B6 is a cofactor in converting 5-HTP to serotonin', category: 'Mood Support' },
                    { a: 'L-Theanine', b: 'GABA', rationale: 'L-Theanine increases GABA production for enhanced relaxation', category: 'Relaxation' },
                    { a: 'L-Theanine', b: 'Magnesium', rationale: 'Both promote alpha brain waves for calm focus', category: 'Focus' },
                    { a: 'Ashwagandha', b: 'Magnesium', rationale: 'Combined stress adaptation through HPA axis and nervous system support', category: 'Stress Relief' },
                    { a: 'Melatonin', b: 'Magnesium', rationale: 'Magnesium supports melatonin production and circadian rhythm', category: 'Sleep' },
                    { a: 'Valerian', b: 'GABA', rationale: 'Valerian inhibits GABA breakdown, prolonging calming effects', category: 'Sleep' },
                    { a: 'Zinc', b: 'Vitamin B6', rationale: 'Zinc and B6 work together to support neurotransmitter synthesis', category: 'Cognitive' },
                    { a: 'Vitamin D', b: 'Magnesium', rationale: 'Magnesium is required to convert Vitamin D to its active form', category: 'Absorption' },
                    { a: 'Calcium', b: 'Vitamin D', rationale: 'Vitamin D enhances calcium absorption in the intestines', category: 'Absorption' },
                    { a: 'Iron', b: 'Vitamin C', rationale: 'Vitamin C significantly increases non-heme iron absorption', category: 'Absorption' },
                  ];

                  // Get all our ingredient names (lowercase for matching)
                  const ourIngredients = Object.values(groupedNutrients)
                    .flat()
                    .map(i => i.name.toLowerCase());

                  // Find synergies present in our formula
                  const activeSynergies = synergyPairs.filter(pair => {
                    const hasA = ourIngredients.some(ing => ing.includes(pair.a.toLowerCase()));
                    const hasB = ourIngredients.some(ing => ing.includes(pair.b.toLowerCase()));
                    return hasA && hasB;
                  });

                  if (activeSynergies.length === 0) return null;

                  // Group by category
                  const groupedSynergies = activeSynergies.reduce((acc, syn) => {
                    if (!acc[syn.category]) acc[syn.category] = [];
                    acc[syn.category].push(syn);
                    return acc;
                  }, {} as Record<string, typeof activeSynergies>);

                  const categoryColors: Record<string, string> = {
                    'Relaxation': 'chart-3',
                    'Absorption': 'chart-4',
                    'Mood Support': 'chart-5',
                    'Focus': 'primary',
                    'Stress Relief': 'chart-2',
                    'Sleep': 'chart-1',
                    'Cognitive': 'primary',
                  };

                  return (
                    <div className="bg-gradient-to-br from-chart-5/5 to-primary/5 rounded-xl border border-chart-5/20 p-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-xl bg-chart-5/10">
                          <Sparkles className="h-5 w-5 text-chart-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground">Ingredient Synergies</h3>
                          <p className="text-xs text-muted-foreground">{activeSynergies.length} synergistic combinations detected</p>
                        </div>
                      </div>
                      <div className="grid gap-3">
                        {Object.entries(groupedSynergies).map(([category, synergies]) => (
                          <div key={category} className="space-y-2">
                            <Badge variant="secondary" className={`bg-${categoryColors[category] || 'primary'}/10 text-${categoryColors[category] || 'primary'}`}>
                              {category}
                            </Badge>
                            <div className="grid gap-2">
                              {synergies.map((syn, idx) => (
                                <div 
                                  key={idx} 
                                  className="flex items-center gap-3 bg-card rounded-lg p-3 border border-border/50"
                                >
                                  {/* Ingredient A */}
                                  <div className="bg-primary/10 rounded-lg px-3 py-1.5 text-sm font-medium text-primary whitespace-nowrap">
                                    {syn.a}
                                  </div>
                                  {/* Connection line with + */}
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <div className="h-px w-4 bg-border" />
                                    <div className="w-5 h-5 rounded-full bg-chart-5/20 flex items-center justify-center text-xs font-bold text-chart-5">+</div>
                                    <div className="h-px w-4 bg-border" />
                                  </div>
                                  {/* Ingredient B */}
                                  <div className="bg-chart-5/10 rounded-lg px-3 py-1.5 text-sm font-medium text-chart-5 whitespace-nowrap">
                                    {syn.b}
                                  </div>
                                  {/* Arrow and rationale */}
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <div className="text-muted-foreground">→</div>
                                    <p className="text-xs text-muted-foreground">{syn.rationale}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Stats Row 1: Ingredient counts */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-primary/10 rounded-lg p-1.5 sm:p-2 text-center">
                    <p className="text-base sm:text-lg font-bold text-primary">{stats.inOurFormula}</p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground">In Our Formula</p>
                  </div>
                  <div className="bg-chart-4/10 rounded-lg p-1.5 sm:p-2 text-center">
                    <p className="text-base sm:text-lg font-bold text-chart-4">{stats.nutrients}</p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground">Active Nutrients</p>
                  </div>
                  <div className="bg-muted rounded-lg p-1.5 sm:p-2 text-center">
                    <p className="text-base sm:text-lg font-bold">{stats.otherIngredients}</p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground">Other Ingredients</p>
                  </div>
                  <div className={`rounded-lg p-1.5 sm:p-2 text-center ${stats.coverageScore >= 80 ? 'bg-chart-4/10' : stats.coverageScore >= 50 ? 'bg-chart-2/10' : 'bg-destructive/10'}`}>
                    <p className={`text-base sm:text-lg font-bold ${stats.coverageScore >= 80 ? 'text-chart-4' : stats.coverageScore >= 50 ? 'text-chart-2' : 'text-destructive'}`}>
                      {stats.coverageScore}%
                    </p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground">Coverage Score</p>
                  </div>
                </div>

                {/* Stats Row 2: Price-per-Serving Comparison */}
                {pricePerServing.data.length > 0 && (
                  <div className="bg-muted/30 rounded-lg p-2 sm:p-3">
                    <p className="text-[10px] sm:text-xs font-semibold mb-2 flex items-center gap-1">
                      <DollarSign className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
                      Price-per-Serving Comparison
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {pricePerServing.data.map((item, idx) => {
                        const isOurs = item.isOurs;
                        const isLowest = pricePerServing.data.every(d => !d.pps || (item.pps && item.pps <= d.pps));
                        const isAboveAvg = pricePerServing.avgCompetitorPps && item.pps && item.pps > pricePerServing.avgCompetitorPps;
                        const isBelowAvg = pricePerServing.avgCompetitorPps && item.pps && item.pps < pricePerServing.avgCompetitorPps;
                        
                        return (
                          <div 
                            key={idx} 
                            className={`rounded-lg p-2 text-center border ${
                              isOurs 
                                ? 'bg-chart-2/10 border-chart-2/30' 
                                : isLowest 
                                  ? 'bg-chart-4/10 border-chart-4/30' 
                                  : 'bg-background border-border'
                            }`}
                          >
                            <p className="text-[9px] sm:text-[10px] text-muted-foreground truncate" title={item.name}>
                              {isOurs ? '🎯 ' : ''}{item.name}
                            </p>
                            <p className={`text-xs sm:text-sm font-bold ${isOurs ? 'text-chart-2' : isLowest ? 'text-chart-4' : ''}`}>
                              {item.pps ? `$${item.pps.toFixed(2)}` : '—'}
                            </p>
                            <p className="text-[8px] sm:text-[9px] text-muted-foreground">
                              ${item.price?.toFixed(0)} / {item.servings} srv
                            </p>
                            {!isOurs && item.pps && pricePerServing.avgCompetitorPps && (
                              <Badge 
                                variant="secondary" 
                                className={`text-[8px] mt-1 ${isBelowAvg ? 'bg-chart-4/20 text-chart-4' : isAboveAvg ? 'bg-chart-1/20 text-chart-1' : ''}`}
                              >
                                {isLowest ? 'Best Value' : isBelowAvg ? 'Below Avg' : isAboveAvg ? 'Above Avg' : 'Avg'}
                              </Badge>
                            )}
                          </div>
                        );
                    })}
                    </div>
                    {pricePerServing.avgCompetitorPps && (
                      <p className="text-[9px] sm:text-[10px] text-muted-foreground text-center mt-2">
                        Competitor Average: ${pricePerServing.avgCompetitorPps.toFixed(2)}/serving
                      </p>
                    )}
                  </div>
                )}

                <div className="max-h-[500px] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead className="w-[180px] sticky left-0 bg-background z-10">Ingredient</TableHead>
                        <TableHead className="min-w-[100px]">
                          <div className="flex items-center gap-1">
                            <Award className="w-3 h-3 text-primary" />Our Concept
                          </div>
                        </TableHead>
                        <TableHead className="min-w-[80px]">
                          <div className="flex items-center gap-1 text-chart-4">
                            <FileText className="w-3 h-3" />Label Claim
                          </div>
                        </TableHead>
                        {competitors.slice(0, 3).map((p, i) => (
                          <TableHead key={p.id} className="min-w-[100px]">
                            <span className="truncate block max-w-[80px]" title={p.brand || 'Unknown'}>
                              #{i + 1} {p.brand || 'Unknown'}
                            </span>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Render ingredients by category */}
                      {(['Primary Active', 'Secondary Active', 'Tertiary Active', 'Functional Excipient'] as const).map((categoryName) => {
                        const categoryIngredients = groupedNutrients[categoryName];
                        if (!categoryIngredients || categoryIngredients.length === 0) return null;
                        
                        // Category styling
                        const categoryStyles: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
                          'Primary Active': { 
                            bg: 'bg-chart-4/10', 
                            text: 'text-chart-4', 
                            icon: <Beaker className="w-3.5 h-3.5" />,
                            label: 'Primary Active Ingredients'
                          },
                          'Secondary Active': { 
                            bg: 'bg-chart-2/10', 
                            text: 'text-chart-2', 
                            icon: <FlaskConical className="w-3.5 h-3.5" />,
                            label: 'Secondary Active Ingredients'
                          },
                          'Tertiary Active': { 
                            bg: 'bg-primary/10', 
                            text: 'text-primary', 
                            icon: <Sparkles className="w-3.5 h-3.5" />,
                            label: 'Tertiary Actives (Differentiation)'
                          },
                          'Functional Excipient': { 
                            bg: 'bg-muted/50', 
                            text: 'text-muted-foreground', 
                            icon: <Package className="w-3.5 h-3.5" />,
                            label: 'Functional Excipients'
                          },
                        };
                        
                        const style = categoryStyles[categoryName];
                        
                        return (
                          <Fragment key={categoryName}>
                            {/* Category Header */}
                            <TableRow className={style.bg}>
                              <TableCell colSpan={competitors.length + 3} className="py-2">
                                <div className={`flex items-center gap-2 text-xs font-semibold ${style.text}`}>
                                  {style.icon}
                                  {style.label} ({categoryIngredients.length})
                                </div>
                              </TableCell>
                            </TableRow>
                            {/* Category Ingredients */}
                            {categoryIngredients.map((ing, idx) => (
                              <TableRow key={`${categoryName}-${idx}`} className={idx % 2 === 0 ? 'bg-muted/20' : ''}>
                                <TableCell className="font-medium text-xs sticky left-0 bg-inherit z-10">
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-1">
                                      {ing.ourDosage ? (
                                        <Check className="w-3 h-3 text-chart-4 shrink-0" />
                                      ) : (
                                        <span className="w-3 h-3 flex items-center justify-center shrink-0">
                                          <span className="w-1 h-1 rounded-full bg-primary" />
                                        </span>
                                      )}
                                      <span title={ing.name}>{ing.name}</span>
                                    </div>
                                    {ing.ourForm && (
                                      <span className="text-[9px] text-muted-foreground pl-4 italic">{ing.ourForm}</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {ing.ourDosage ? (
                                    <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">{ing.ourDosage}</Badge>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {ing.ourLabelClaim ? (
                                    <Badge variant="outline" className="text-[10px] border-chart-4/50 text-chart-4 bg-chart-4/5">{ing.ourLabelClaim}</Badge>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                {competitors.slice(0, 3).map((p) => {
                                  const compData = ing.competitors.find(c => c.brand === (p.brand || 'Unknown'));
                                  return (
                                    <TableCell key={p.id}>
                                      {compData?.amount ? (
                                        <Badge variant="outline" className="text-[10px]">{compData.amount}</Badge>
                                      ) : compData ? (
                                        <Check className="w-3 h-3 text-muted-foreground" />
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground">—</span>
                                      )}
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            ))}
                          </Fragment>
                        );
                      })}

                      {/* Other/Uncategorized Ingredients */}
                      {groupedNutrients['Other'] && groupedNutrients['Other'].length > 0 && (
                        <Fragment>
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={competitors.length + 3} className="py-2">
                              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                                <Pill className="w-3.5 h-3.5" />
                                Other Ingredients ({groupedNutrients['Other'].length})
                              </div>
                            </TableCell>
                          </TableRow>
                          {groupedNutrients['Other'].map((ing, idx) => (
                            <TableRow key={`other-${idx}`} className={idx % 2 === 0 ? 'bg-muted/20' : ''}>
                              <TableCell className="font-medium text-xs sticky left-0 bg-inherit z-10">
                                <div className="flex items-center gap-1">
                                  {ing.ourDosage ? (
                                    <Check className="w-3 h-3 text-chart-4 shrink-0" />
                                  ) : (
                                    <span className="w-3 h-3 flex items-center justify-center shrink-0">
                                      <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                                    </span>
                                  )}
                                  <span title={ing.name}>{ing.name}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {ing.ourDosage ? (
                                  <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">{ing.ourDosage}</Badge>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {ing.ourLabelClaim ? (
                                  <Badge variant="outline" className="text-[10px] border-chart-4/50 text-chart-4 bg-chart-4/5">{ing.ourLabelClaim}</Badge>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              {competitors.slice(0, 3).map((p) => {
                                const compData = ing.competitors.find(c => c.brand === (p.brand || 'Unknown'));
                                return (
                                  <TableCell key={p.id}>
                                    {compData?.amount ? (
                                      <Badge variant="outline" className="text-[10px]">{compData.amount}</Badge>
                                    ) : compData ? (
                                      <Check className="w-3 h-3 text-muted-foreground" />
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </Fragment>
                      )}

                      {/* Competitor-Only Ingredients (not in our concept) */}
                      {otherIngredientsOnly.length > 0 && (
                        <Fragment>
                          <TableRow className="bg-destructive/5">
                            <TableCell colSpan={competitors.length + 3} className="py-2">
                              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Competitor-Only Ingredients ({otherIngredientsOnly.length})
                              </div>
                            </TableCell>
                          </TableRow>
                          {otherIngredientsOnly.map((ing, idx) => (
                            <TableRow key={`comp-only-${idx}`} className={idx % 2 === 0 ? 'bg-muted/10' : ''}>
                              <TableCell className="font-medium text-xs sticky left-0 bg-inherit z-10">
                                <div className="flex items-center gap-1">
                                  <span className="w-3 h-3 flex items-center justify-center shrink-0">
                                    <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                                  </span>
                                  <span title={ing.name}>{ing.name}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="text-[10px] text-muted-foreground">—</span>
                              </TableCell>
                              <TableCell>
                                <span className="text-[10px] text-muted-foreground">—</span>
                              </TableCell>
                              {competitors.slice(0, 3).map((p) => {
                                const compData = ing.competitors.find(c => c.brand === (p.brand || 'Unknown'));
                                return (
                                  <TableCell key={p.id}>
                                    {compData ? (
                                      <Check className="w-3 h-3 text-chart-4" />
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </Fragment>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center gap-4 pt-3 border-t text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1"><Check className="w-3 h-3 text-chart-4" /><span>In Our Formula</span></div>
                  <div className="flex items-center gap-1"><Beaker className="w-2.5 h-2.5 text-primary" /><span>Active Nutrient</span></div>
                  <div className="flex items-center gap-1"><Check className="w-3 h-3 text-muted-foreground" /><span>Present</span></div>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function EnhancedBenchmarkComparison({
  categoryId,
  analysisData,
  isLoading = false,
}: EnhancedBenchmarkComparisonProps) {
  const { data: products, isLoading: productsLoading } = useProducts(categoryId);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const { toast } = useToast();
  
  // All products sorted by monthly sales for selection pool
  const allProductsSorted = useMemo(() => 
    [...(products || [])].sort((a, b) => (b.monthly_sales || 0) - (a.monthly_sales || 0)),
    [products]
  );

  // Filtered products based on search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return allProductsSorted;
    const query = searchQuery.toLowerCase();
    return allProductsSorted.filter(p => 
      p.brand?.toLowerCase().includes(query) ||
      p.title?.toLowerCase().includes(query) ||
      p.asin?.toLowerCase().includes(query)
    );
  }, [allProductsSorted, searchQuery]);

  // Get selected products or default to top 3
  const displayedProducts = selectedIds.length > 0 
    ? allProductsSorted.filter(p => selectedIds.includes(p.id))
    : allProductsSorted.slice(0, MAX_COMPETITORS);

  const loading = isLoading || productsLoading;

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setModalOpen(true);
  };

  const handleProductSelect = (productId: string) => {
    if (selectedIds.includes(productId)) {
      setSelectedIds(selectedIds.filter(id => id !== productId));
    } else {
      if (selectedIds.length >= MAX_COMPETITORS) {
        toast({
          title: "Selection limit reached",
          description: "You can only compare 3 products at a time.",
          variant: "destructive",
        });
        return;
      }
      setSelectedIds([...selectedIds, productId]);
    }
  };

  // NOTE: Loading check moved AFTER all hooks are defined (see end of component)

  // Helper functions for Our Concept data
  const getOurPositioning = (): string => {
    return analysisData?.key_insights?.go_to_market?.positioning || 'Pending analysis';
  };

  const getOurIngredients = (): string[] => {
    const ingredients = analysisData?.analysis_1_category_scores?.product_development?.formulation?.recommended_ingredients;
    if (!ingredients || !Array.isArray(ingredients)) return ['Pending analysis'];
    // Show ALL ingredients without limit
    return ingredients.map(ing => {
      if (typeof ing === 'string') return ing;
      return ing.ingredient || ing.name || 'Unknown';
    });
  };

  // Normalize ingredient name for comparison (lowercase, remove common suffixes/prefixes)
  const normalizeIngredient = (ing: string): string => {
    return ing
      .toLowerCase()
      .replace(/\s*\(.*?\)\s*/g, '') // Remove parenthetical content
      .replace(/\s*(extract|powder|complex|blend|root|leaf|fruit|seed|oil|vitamin|mg|mcg|iu)\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Check if an ingredient matches any in the Our Concept list
  const isMatchingIngredient = (competitorIng: string, ourIngredients: string[]): boolean => {
    const normalizedCompetitor = normalizeIngredient(competitorIng);
    return ourIngredients.some(ourIng => {
      const normalizedOur = normalizeIngredient(ourIng);
      // Check if either contains the other (handles partial matches like "Vitamin D" vs "Vitamin D3")
      return normalizedCompetitor.includes(normalizedOur) || 
             normalizedOur.includes(normalizedCompetitor) ||
             normalizedCompetitor === normalizedOur;
    });
  };

  // Check if Our Concept ingredient matches any competitor
  const isOurIngredientInCompetitors = (ourIng: string): boolean => {
    const normalizedOur = normalizeIngredient(ourIng);
    return displayedProducts.some(product => {
      const { items } = parseCompetitorIngredients(product);
      return items.some(compIng => {
        const normalizedComp = normalizeIngredient(compIng);
        return normalizedComp.includes(normalizedOur) || 
               normalizedOur.includes(normalizedComp) ||
               normalizedComp === normalizedOur;
      });
    });
  };

  const getOurMessaging = (): string[] => {
    const messaging = analysisData?.key_insights?.go_to_market?.messaging;
    if (!messaging || !Array.isArray(messaging) || messaging.length === 0) return ['Pending analysis'];
    return messaging;
  };

  const getOurBuyerProfile = (): string => {
    const profile = analysisData?.analysis_1_category_scores?.customer_insights?.buyer_profile;
    if (!profile) return 'Pending analysis';
    return profile;
  };

  // NEW: Get Pricing Strategy
  const getOurPricing = (): { price: number | null; tier: string | null; justification: string | null } => {
    const pricing = analysisData?.analysis_1_category_scores?.product_development?.pricing;
    const formulaBriefPrice = analysisData?.formula_brief?.target_price;
    const topLevelPrice = analysisData?.recommended_price;
    
    return {
      price: pricing?.recommended_price || formulaBriefPrice || topLevelPrice || null,
      tier: pricing?.pricing_tier || null,
      justification: pricing?.justification || null
    };
  };

  // NEW: Get Opportunity Score
  const getOurOpportunityScore = (): { overall: number | null; details: { label: string; value: number }[] } => {
    const oppScore = analysisData?.analysis_1_category_scores?.opportunity_score;
    const topLevelIndex = analysisData?.opportunity_index;
    
    const overall = oppScore?.overall || topLevelIndex || null;
    const details: { label: string; value: number }[] = [];
    
    if (oppScore?.market_size) details.push({ label: 'Market Size', value: oppScore.market_size });
    if (oppScore?.profit_potential) details.push({ label: 'Profit Potential', value: oppScore.profit_potential });
    if (oppScore?.competition_intensity) details.push({ label: 'Competition', value: oppScore.competition_intensity });
    if (oppScore?.barriers_to_entry) details.push({ label: 'Barriers', value: oppScore.barriers_to_entry });
    
    return { overall, details };
  };

  // NEW: Get Competitive Intelligence
  const getCompetitiveIntel = (): { weaknesses: string[]; gaps: string[] } => {
    const landscape = analysisData?.analysis_1_category_scores?.competitive_landscape;
    return {
      weaknesses: landscape?.exploitable_weaknesses || [],
      gaps: landscape?.market_gaps || []
    };
  };

  // NEW: Get Things to Avoid
  const getThingsToAvoid = (): string[] => {
    const fromLandscape = analysisData?.analysis_1_category_scores?.competitive_landscape?.things_to_avoid;
    const fromFormulation = analysisData?.analysis_1_category_scores?.product_development?.formulation?.things_to_avoid;
    const fromRisks = analysisData?.formula_brief?.risk_factors;
    
    const allItems: string[] = [];
    if (fromLandscape?.length) allItems.push(...fromLandscape);
    if (fromFormulation?.length) allItems.push(...fromFormulation);
    if (fromRisks?.length && allItems.length < 5) {
      fromRisks.slice(0, 5 - allItems.length).forEach(r => {
        if (!allItems.includes(r)) allItems.push(r);
      });
    }
    
    return allItems.slice(0, 5);
  };

  // NEW: Get Go-to-Market Differentiators
  const getOurDifferentiators = (): string[] => {
    const fromGTM = analysisData?.key_insights?.go_to_market?.key_differentiators;
    const fromFormula = analysisData?.formula_brief?.key_differentiators;
    
    if (fromGTM?.length) return fromGTM;
    if (fromFormula?.length) return fromFormula;
    return [];
  };

  // NEW: Get Financial Highlights
  const getFinancialHighlights = (): { investment: string | null; margin: string | null; breakeven: string | null } => {
    const financials = analysisData?.key_insights?.financials;
    return {
      investment: financials?.startup_investment ? String(financials.startup_investment) : null,
      margin: financials?.target_margin ? String(financials.target_margin) : null,
      breakeven: financials?.breakeven_timeline || null
    };
  };

  // NEW: Get Pain Points with Evidence
  const getPainPointsWithEvidence = (): Array<{ painPoint: string; frequency?: number; evidence?: string }> => {
    const painPoints = analysisData?.analysis_1_category_scores?.customer_insights?.pain_points;
    if (!painPoints?.length) return [];
    
    return painPoints.slice(0, 4).map(pp => ({
      painPoint: pp.pain_point || 'Unknown',
      frequency: pp.frequency,
      evidence: pp.evidence
    }));
  };

  // NEW: Get Unmet Needs
  const getUnmetNeeds = (): string[] => {
    return analysisData?.analysis_1_category_scores?.customer_insights?.unmet_needs || [];
  };

  // NEW: Get What Customers Love
  const getWhatCustomersLove = (): string[] => {
    return analysisData?.analysis_1_category_scores?.customer_insights?.love_most || [];
  };

  // NEW: Get Decision Drivers
  const getDecisionDrivers = (): string[] => {
    return analysisData?.analysis_1_category_scores?.customer_insights?.decision_drivers || [];
  };

  // NEW: Get Top 3 Reasons to Proceed (Competitive Advantages)
  const getCompetitiveAdvantages = (): string[] => {
    const advantages: string[] = [];
    
    // Source 1: Key differentiators from go_to_market
    const differentiators = analysisData?.key_insights?.go_to_market?.key_differentiators;
    if (differentiators?.length) {
      differentiators.slice(0, 2).forEach(d => advantages.push(d));
    }
    
    // Source 2: Key differentiators from formula_brief
    if (advantages.length < 3) {
      const formulaDiff = analysisData?.formula_brief?.key_differentiators;
      if (formulaDiff?.length) {
        formulaDiff.slice(0, 3 - advantages.length).forEach(d => {
          if (!advantages.includes(d)) advantages.push(d);
        });
      }
    }
    
    // Source 3: Market gaps from competitive landscape
    if (advantages.length < 3) {
      const gaps = analysisData?.analysis_1_category_scores?.competitive_landscape?.market_gaps;
      if (gaps?.length) {
        gaps.slice(0, 3 - advantages.length).forEach(g => {
          if (!advantages.includes(g)) advantages.push(g);
        });
      }
    }
    
    // Source 4: Top strengths
    if (advantages.length < 3) {
      const topStrengths = analysisData?.top_strengths;
      if (topStrengths?.length) {
        topStrengths.slice(0, 3 - advantages.length).forEach(s => {
          if (s.strength && !advantages.includes(s.strength)) advantages.push(s.strength);
        });
      }
    }
    
    // Source 5: Key features from formulation
    if (advantages.length < 3) {
      const keyFeatures = analysisData?.analysis_1_category_scores?.product_development?.formulation?.key_features;
      if (keyFeatures?.length) {
        keyFeatures.slice(0, 3 - advantages.length).forEach(f => {
          if (!advantages.includes(f)) advantages.push(f);
        });
      }
    }
    
    return advantages.slice(0, 3);
  };

  // NEW: Get primary motivation for Our Concept from customer_insights
  const getOurMotivation = (): string | null => {
    const customerInsights = analysisData?.analysis_1_category_scores?.customer_insights as Record<string, unknown> | undefined;
    if (!customerInsights) return null;
    
    // Try primary_motivation field
    if (customerInsights.primary_motivation) {
      return customerInsights.primary_motivation as string;
    }
    
    // Try purchase_drivers or decision_drivers as fallback
    const purchaseDrivers = customerInsights.purchase_drivers as string[] | undefined;
    if (purchaseDrivers && purchaseDrivers.length > 0) {
      return purchaseDrivers.slice(0, 2).join('. ');
    }
    
    const decisionDrivers = customerInsights.decision_drivers as string[] | undefined;
    if (decisionDrivers && decisionDrivers.length > 0) {
      return decisionDrivers.slice(0, 2).join('. ');
    }
    
    return null;
  };

  const getOurFormFactor = (): string => {
    const formulation = analysisData?.analysis_1_category_scores?.product_development?.formulation;
    const servingSize = formulation?.serving_size;
    const formFactor = formulation?.form_factor;
    
    // Priority 1: Check serving_size for "scoop" (indicates powder)
    if (servingSize && servingSize.toLowerCase().includes('scoop')) {
      return `Powder (${servingSize})`;
    }
    
    // Priority 2: Use form_factor if available
    if (formFactor) return formFactor;
    
    // Priority 3: Search key_features for flavor/taste related items
    const keyFeatures = formulation?.key_features;
    if (keyFeatures && Array.isArray(keyFeatures)) {
      const flavorFeature = keyFeatures.find(f => 
        f.toLowerCase().includes('flavor') || f.toLowerCase().includes('taste')
      );
      if (flavorFeature) return flavorFeature;
    }
    
    return 'Pending analysis';
  };

  // NEW: Get Our Concept Strengths from multiple sources
  const getOurStrengths = (): string[] => {
    const strengths: string[] = [];
    
    // Source 1: top_strengths from category_analyses
    const topStrengths = analysisData?.top_strengths;
    if (topStrengths && Array.isArray(topStrengths)) {
      topStrengths.slice(0, 3).forEach(s => {
        if (s.strength) strengths.push(s.strength);
      });
    }
    
    // Source 2: key_differentiators from formula_brief
    if (strengths.length < 3) {
      const differentiators = analysisData?.formula_brief?.key_differentiators;
      if (differentiators && Array.isArray(differentiators)) {
        differentiators.slice(0, 3 - strengths.length).forEach(d => {
          if (!strengths.includes(d)) strengths.push(d);
        });
      }
    }
    
    // Source 3: key_features from formulation
    if (strengths.length < 3) {
      const keyFeatures = analysisData?.analysis_1_category_scores?.product_development?.formulation?.key_features;
      if (keyFeatures && Array.isArray(keyFeatures)) {
        keyFeatures.slice(0, 3 - strengths.length).forEach(f => {
          if (!strengths.includes(f)) strengths.push(f);
        });
      }
    }
    
    // Source 4: love_most from customer_insights
    if (strengths.length < 3) {
      const loveMost = analysisData?.analysis_1_category_scores?.customer_insights?.love_most;
      if (loveMost && Array.isArray(loveMost)) {
        loveMost.slice(0, 3 - strengths.length).forEach(l => {
          if (!strengths.includes(l)) strengths.push(l);
        });
      }
    }
    
    return strengths.length > 0 ? strengths : ['Pending analysis'];
  };

  // NEW: Get Our Concept Weaknesses/Risks from multiple sources
  const getOurWeaknesses = (): string[] => {
    const weaknesses: string[] = [];
    
    // Source 1: top_weaknesses from category_analyses
    const topWeaknesses = analysisData?.top_weaknesses;
    if (topWeaknesses && Array.isArray(topWeaknesses)) {
      topWeaknesses.slice(0, 3).forEach(w => {
        if (w.weakness) weaknesses.push(w.weakness);
      });
    }
    
    // Source 2: risk_factors from formula_brief
    if (weaknesses.length < 3) {
      const riskFactors = analysisData?.formula_brief?.risk_factors;
      if (riskFactors && Array.isArray(riskFactors)) {
        riskFactors.slice(0, 3 - weaknesses.length).forEach(r => {
          if (!weaknesses.includes(r)) weaknesses.push(r);
        });
      }
    }
    
    // Source 3: unmet_needs (things we need to address)
    if (weaknesses.length < 3) {
      const unmetNeeds = analysisData?.analysis_1_category_scores?.customer_insights?.unmet_needs;
      if (unmetNeeds && Array.isArray(unmetNeeds)) {
        unmetNeeds.slice(0, 3 - weaknesses.length).forEach(n => {
          if (!weaknesses.includes(n)) weaknesses.push(`Address: ${n}`);
        });
      }
    }
    
    return weaknesses.length > 0 ? weaknesses : ['Pending analysis'];
  };

  const getCompetitorFlavors = (product: Product): { flavors: string[]; count: number } => {
    const flavorOptions = product.flavor_options as string[] | null;
    const variationsCount = product.variations_count || 0;
    
    if (flavorOptions && flavorOptions.length > 0) {
      return { 
        flavors: flavorOptions.slice(0, 3),
        count: flavorOptions.length 
      };
    }
    
    return { flavors: [], count: variationsCount };
  };

  // Helper functions for Competitor data
  const hasMarketingAnalysis = (product: Product): boolean => {
    return !!product.marketing_analysis;
  };

  const hasReviewAnalysis = (product: Product): boolean => {
    return !!product.review_analysis;
  };

  const getCompetitorPositioning = (product: Product): string | null => {
    const marketingAnalysis = product.marketing_analysis as Record<string, unknown> | null;
    if (!marketingAnalysis) return null;
    
    // Try lifestyle_positioning.primary_lifestyle first
    const lifestylePos = marketingAnalysis.lifestyle_positioning as Record<string, unknown> | undefined;
    if (lifestylePos?.primary_lifestyle) {
      return lifestylePos.primary_lifestyle as string;
    }
    
    // Fallback to target_demographics.primary_audience
    const targetDemo = marketingAnalysis.target_demographics as Record<string, unknown> | undefined;
    if (targetDemo?.primary_audience) {
      return targetDemo.primary_audience as string;
    }
    
    return null;
  };

  const parseCompetitorIngredients = (product: Product): { items: string[]; fallback: boolean } => {
    // Primary: product.ingredients - show ALL
    if (product.ingredients) {
      const parts = product.ingredients.split(/[,;]/).map(i => i.trim()).filter(Boolean);
      if (parts.length > 0) {
        return { items: parts, fallback: false };
      }
    }
    
    // Fallback: specifications.Ingredients or specifications.Material
    const specs = product.specifications as Record<string, unknown> | null;
    if (specs) {
      const ingredientsSpec = specs.Ingredients || specs.ingredients || specs.Material || specs.material;
      if (ingredientsSpec && typeof ingredientsSpec === 'string') {
        const parts = ingredientsSpec.split(/[,;]/).map(i => i.trim()).filter(Boolean);
        if (parts.length > 0) {
          return { items: parts, fallback: false };
        }
      }
    }
    
    // Final fallback
    return { items: ['See full detail view'], fallback: true };
  };

  const getCompetitorMarketing = (product: Product): string[] | null => {
    const marketingAnalysis = product.marketing_analysis as Record<string, unknown> | null;
    if (!marketingAnalysis) return null;
    
    // Primary: lifestyle_positioning.values_communicated
    const lifestylePos = marketingAnalysis.lifestyle_positioning as Record<string, unknown> | undefined;
    const valuesCommunicated = lifestylePos?.values_communicated as string[] | undefined;
    if (valuesCommunicated && valuesCommunicated.length > 0) {
      return valuesCommunicated.slice(0, 2);
    }
    
    // Fallback: messaging_analysis.key_claims_shown
    const messagingAnalysis = marketingAnalysis.messaging_analysis as Record<string, unknown> | undefined;
    const keyClaims = messagingAnalysis?.key_claims_shown as string[] | undefined;
    if (keyClaims && keyClaims.length > 0) {
      return keyClaims.slice(0, 2);
    }
    
    return null;
  };

  // Fixed: Multi-source Target Audience extraction using correct data paths
  const getCompetitorAudience = (product: Product): string | null => {
    const marketingAnalysis = product.marketing_analysis as Record<string, unknown> | null;
    const reviewAnalysis = product.review_analysis as Record<string, unknown> | null;
    
    // Try 1: creative_brief.target_persona.demographic (PRIMARY - from per-product analysis)
    if (marketingAnalysis) {
      const creativeBrief = marketingAnalysis.creative_brief as Record<string, unknown> | undefined;
      const targetPersona = creativeBrief?.target_persona as Record<string, unknown> | undefined;
      if (targetPersona?.demographic) {
        return targetPersona.demographic as string;
      }
      
      // Try 2: visual_gallery.demographics.primary_audience
      const visualGallery = marketingAnalysis.visual_gallery as Record<string, unknown> | undefined;
      const demographics = visualGallery?.demographics as Record<string, unknown> | undefined;
      if (demographics?.primary_audience) {
        return demographics.primary_audience as string;
      }
    }
    
    // Try 3: review_analysis.demographics_insights.buyer_types (FALLBACK)
    if (reviewAnalysis) {
      const demographics = reviewAnalysis.demographics_insights as Record<string, unknown> | undefined;
      const buyerTypes = demographics?.buyer_types as string[] | undefined;
      if (buyerTypes && buyerTypes.length > 0) {
        return buyerTypes.slice(0, 2).join(', ');
      }
    }
    
    return null;
  };

  // NEW: Get Primary Motivation from creative_brief.target_persona.primary_motivation
  const getCompetitorMotivation = (product: Product): string | null => {
    const marketingAnalysis = product.marketing_analysis as Record<string, unknown> | null;
    if (!marketingAnalysis) return null;
    
    const creativeBrief = marketingAnalysis.creative_brief as Record<string, unknown> | undefined;
    const targetPersona = creativeBrief?.target_persona as Record<string, unknown> | undefined;
    
    if (targetPersona?.primary_motivation) {
      return targetPersona.primary_motivation as string;
    }
    
    return null;
  };

  // NEW: Get Strengths from review_analysis.positive_themes
  const getCompetitorStrengths = (product: Product): Array<{ theme: string; percentage?: number }> => {
    const reviewAnalysis = product.review_analysis as Record<string, unknown> | null;
    if (!reviewAnalysis) return [];
    
    const positiveThemes = reviewAnalysis.positive_themes as Array<{ theme?: string; positive_theme?: string; frequency?: number; mention_rate?: number }> | undefined;
    if (!positiveThemes || !Array.isArray(positiveThemes)) return [];
    
    return positiveThemes.slice(0, 3).map(pt => ({
      theme: pt.theme || pt.positive_theme || 'Unknown',
      percentage: pt.frequency || pt.mention_rate
    }));
  };

  // UPDATED: Get Weaknesses from review_analysis.pain_points
  const getCompetitorWeaknesses = (product: Product): Array<{ issue: string; percentage?: number }> => {
    const reviewAnalysis = product.review_analysis as Record<string, unknown> | null;
    if (!reviewAnalysis) return [];
    
    const painPoints = reviewAnalysis.pain_points as Array<{ pain_point?: string; issue?: string; affected_percentage?: number; frequency?: number }> | undefined;
    if (!painPoints || !Array.isArray(painPoints)) return [];
    
    return painPoints.slice(0, 3).map(pp => ({
      issue: pp.issue || pp.pain_point || 'Unknown issue',
      percentage: pp.affected_percentage || pp.frequency
    }));
  };

  // NEW: Get top competitor advantage (Where Competitors Win)
  const getCompetitorTopWin = (product: Product): { theme: string; percentage?: number } | null => {
    const reviewAnalysis = product.review_analysis as Record<string, unknown> | null;
    if (!reviewAnalysis) return null;
    
    const positiveThemes = reviewAnalysis.positive_themes as Array<{ theme?: string; positive_theme?: string; frequency?: number; mention_rate?: number }> | undefined;
    if (!positiveThemes || !Array.isArray(positiveThemes) || positiveThemes.length === 0) return null;
    
    // Get the top theme (highest frequency)
    const sortedThemes = [...positiveThemes].sort((a, b) => 
      ((b.frequency || b.mention_rate || 0) - (a.frequency || a.mention_rate || 0))
    );
    
    const top = sortedThemes[0];
    return {
      theme: top.theme || top.positive_theme || 'Unknown',
      percentage: top.frequency || top.mention_rate
    };
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  // === FORMULATION DETAILS HELPERS ===
  
  // Get Our Concept formulation specs
  const getOurFormulationSpecs = () => {
    const formulation = analysisData?.analysis_1_category_scores?.product_development?.formulation as Record<string, unknown> | undefined;
    return {
      servingsPerContainer: (formulation?.servings_per_container as number | null) || null,
      servingSize: (formulation?.serving_size as string | null) || null,
      packagingType: (formulation?.form_factor as string | null) || null,
    };
  };

  // Get competitor formulation specs
  const getCompetitorFormulationSpecs = (product: Product) => {
    const supplementFacts = product.supplement_facts_complete as Record<string, unknown> | null;
    return {
      servingsPerContainer: product.servings_per_container || (supplementFacts?.servings_per_container as number | null) || null,
      servingSize: product.serving_size || (supplementFacts?.serving_size as string | null) || null,
      packagingType: product.packaging_type || null,
    };
  };

  // Get competitor nutrients from all_nutrients or supplement_facts_complete - NO LIMIT (show all)
  const getCompetitorNutrients = useCallback((product: Product): Array<{ name: string; amount: number | null; unit: string; dailyValue?: string | number }> => {
    // Try all_nutrients first (preferred - normalized data)
    const allNutrients = product.all_nutrients as Array<{ name: string; amount: number | null; unit: string; daily_value_percent?: string | number }> | null;
    if (allNutrients && allNutrients.length > 0) {
      return allNutrients.map(n => ({
        name: n.name,
        amount: n.amount,
        unit: n.unit,
        dailyValue: n.daily_value_percent
      }));
    }
    
    // Fallback to supplement_facts_complete.all_nutrients
    const supplementFacts = product.supplement_facts_complete as Record<string, unknown> | null;
    const sfNutrients = supplementFacts?.all_nutrients as Array<{ name: string; amount: number | null; unit: string; daily_value_percent?: string | number }> | undefined;
    if (sfNutrients && sfNutrients.length > 0) {
      return sfNutrients.map(n => ({
        name: n.name,
        amount: n.amount,
        unit: n.unit,
        dailyValue: n.daily_value_percent
      }));
    }
    
    return [];
  }, []);

  // Get ALL competitor ingredients (from BOTH ingredients AND other_ingredients fields) - COMBINED list
  const getCompetitorIngredientsList = useCallback((product: Product): string[] => {
    const allIngredients: string[] = [];
    const seen = new Set<string>();
    
    const addIngredients = (text: string) => {
      // Split by comma, semicolon, or parentheses to catch all parts
      const parts = text.split(/[,;]/).map(i => i.trim()).filter(Boolean);
      parts.forEach(part => {
        const normalized = part.toLowerCase().trim();
        if (normalized.length >= 2 && !seen.has(normalized)) {
          seen.add(normalized);
          allIngredients.push(part);
        }
      });
    };
    
    // Add from ingredients field
    if (product.ingredients) {
      addIngredients(product.ingredients);
    }
    
    // Also add from other_ingredients field (combine, not fallback)
    if (product.other_ingredients) {
      addIngredients(product.other_ingredients);
    }
    
    // Also add from specifications.Ingredients if available
    const specs = product.specifications as Record<string, unknown> | null;
    if (specs) {
      const ingredientsSpec = specs.Ingredients || specs.ingredients || specs.Material || specs.material;
      if (ingredientsSpec && typeof ingredientsSpec === 'string') {
        addIngredients(ingredientsSpec);
      }
    }
    
    return allIngredients;
  }, []);

  // Get competitor claims/certifications
  const getCompetitorClaims = (product: Product): string[] => {
    // Try claims_on_label first
    if (product.claims_on_label && Array.isArray(product.claims_on_label)) {
      return product.claims_on_label.slice(0, 6);
    }
    
    // Fallback to supplement_facts_complete.claims_on_label
    const supplementFacts = product.supplement_facts_complete as Record<string, unknown> | null;
    const sfClaims = supplementFacts?.claims_on_label as string[] | undefined;
    if (sfClaims && sfClaims.length > 0) {
      return sfClaims.slice(0, 6);
    }
    
    // Try parsing from claims field
    if (product.claims && typeof product.claims === 'string') {
      return product.claims.split(/[,;]/).map(c => c.trim()).filter(Boolean).slice(0, 6);
    }
    
    return [];
  };

  // Get Our Concept recommended ingredients with dosages from analysis - NO LIMIT (show all)
  // This function pulls from MULTIPLE sources to ensure complete ingredient data including Markdown parsing
  const getOurRecommendedDosages = (): Array<{ ingredient: string; dosage?: string; rationale?: string; form?: string; category?: string }> => {
    const results: Array<{ ingredient: string; dosage?: string; rationale?: string; form?: string; category?: string }> = [];
    const seenIngredients = new Set<string>();
    
    // Helper to parse ingredient string and extract dosage
    const parseIngredient = (ing: string | Record<string, unknown>): { ingredient: string; dosage?: string; rationale?: string } | null => {
      if (typeof ing === 'string') {
        // Improved regex to parse dosage from string like "Apple Cider Vinegar Powder 500mg" or "Vitamin B12 1.2mcg"
        const match = ing.match(/^(.+?)\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|iu|g|ml|μg)(?:\s+.*?)?)$/i);
        if (match) {
          return { ingredient: match[1].trim(), dosage: match[2].trim() };
        }
        // Try alternate pattern for "ingredient amount unit reason" format
        const altMatch = ing.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(mg|mcg|iu|g|ml|μg)\b(.*)$/i);
        if (altMatch) {
          return {
            ingredient: altMatch[1].trim(),
            dosage: `${altMatch[2]}${altMatch[3]}`,
            rationale: altMatch[4]?.trim() || undefined
          };
        }
        // No dosage found, return as-is
        return { ingredient: ing.trim() };
      }
      const ingObj = ing as Record<string, unknown>;
      return {
        ingredient: (ingObj.ingredient as string) || (ingObj.name as string) || 'Unknown',
        dosage: (ingObj.dosage as string) || (ingObj.amount as string) || undefined,
        rationale: (ingObj.rationale as string) || undefined
      };
    };
    
    // Helper to add ingredients while avoiding duplicates
    const addIngredients = (ingredientList: unknown[] | undefined, categoryLabel?: string) => {
      if (!ingredientList || !Array.isArray(ingredientList)) return;
      ingredientList.forEach(ing => {
        const parsed = parseIngredient(ing as string | Record<string, unknown>);
        if (parsed) {
          const normalizedName = parsed.ingredient.toLowerCase().trim();
          if (!seenIngredients.has(normalizedName)) {
            seenIngredients.add(normalizedName);
            results.push({ ...parsed, category: categoryLabel });
          }
        }
      });
    };
    
    // PRIMARY SOURCE: Parse formula_brief_content Markdown (most complete - 27+ ingredients)
    const markdownContent = analysisData?.formula_brief_content;
    if (markdownContent && typeof markdownContent === 'string') {
      const parsedFromMarkdown = parseIngredientTablesFromMarkdown(markdownContent);
      
      if (parsedFromMarkdown.length > 0) {
        // Add ingredients by category
        const categoryMap: Record<string, string> = {
          'primary': 'Primary Active',
          'secondary': 'Secondary Active',
          'tertiary': 'Tertiary Active',
          'excipient': 'Functional Excipient'
        };
        
        parsedFromMarkdown.forEach(ing => {
          const normalizedName = ing.ingredient.toLowerCase().trim();
          if (!seenIngredients.has(normalizedName)) {
            seenIngredients.add(normalizedName);
            results.push({
              ingredient: ing.ingredient,
              dosage: ing.dosage,
              form: ing.form,
              rationale: ing.rationale || ing.function,
              category: categoryMap[ing.category] || ing.category
            });
          }
        });
      }
    }
    
    // FALLBACK: If Markdown parsing yielded no results, use structured JSON sources
    if (results.length === 0) {
      const formulation = analysisData?.analysis_1_category_scores?.product_development?.formulation;
      
      // Source 1: recommended_ingredients (PRIMARY - most complete)
      addIngredients(formulation?.recommended_ingredients as unknown[], 'Primary Active');
      
      // Source 2: key_ingredients (may have additional items)
      addIngredients(formulation?.key_ingredients as unknown[], 'Primary Active');
      
      // Source 3: active_ingredients (may have additional items)
      addIngredients(formulation?.active_ingredients as unknown[], 'Secondary Active');
      
      // Source 4: other_ingredients (inactive/filler ingredients)
      addIngredients(formulation?.other_ingredients as unknown[], 'Functional Excipient');
      
      // Source 5: formula_brief.ingredients (backup source)
      addIngredients(analysisData?.formula_brief?.ingredients as unknown[]);
    }
    
    return results;
  };

  // Get competitor packaging data for comparison
  const getCompetitorPackaging = (product: Product): {
    visualStyle: string | null;
    trustSignals: string[];
    conversionTriggers: string | null;
    claims: string[];
  } => {
    const marketingAnalysis = product.marketing_analysis as Record<string, unknown> | null;
    const designBlueprint = marketingAnalysis?.design_blueprint as Record<string, unknown> | null;
    const packagingIntel = marketingAnalysis?.packaging_intelligence as Record<string, unknown> | null;
    const sourceData = designBlueprint || packagingIntel;
    
    // Visual Style
    const visualStyle = (sourceData?.visual_style as string) || 
                        (designBlueprint?.color_strategy as string) ||
                        null;
    
    // Trust Signals - handle both array and comma-separated string formats
    let trustSignals: string[] = [];
    const rawTrustSignals = sourceData?.trust_signals;
    if (Array.isArray(rawTrustSignals)) {
      trustSignals = rawTrustSignals as string[];
    } else if (typeof rawTrustSignals === 'string' && rawTrustSignals.trim()) {
      trustSignals = rawTrustSignals.split(',').map(s => s.trim()).filter(Boolean);
    }
    
    // Conversion Triggers - handle comma-separated string format
    let conversionTriggers: string | null = null;
    const rawConversionTriggers = sourceData?.conversion_triggers || designBlueprint?.differentiation_factor;
    if (typeof rawConversionTriggers === 'string' && rawConversionTriggers.trim()) {
      conversionTriggers = rawConversionTriggers;
    }
    
    // Claims
    const claims = getCompetitorClaims(product);
    
    return { visualStyle, trustSignals, conversionTriggers, claims };
  };

  // Get Our Concept packaging data
  const getOurPackaging = (): { type?: string; quantity?: string | number; design_elements?: string[] } | null => {
    const productDev = analysisData?.analysis_1_category_scores?.product_development as Record<string, unknown> | undefined;
    const packaging = productDev?.packaging as Record<string, unknown> | undefined;
    if (!packaging) return null;
    return {
      type: packaging.type as string | undefined,
      quantity: packaging.quantity as string | number | undefined,
      design_elements: packaging.design_elements as string[] | undefined,
    };
  };

  // Loading check - placed AFTER all hooks to avoid hooks rules violation
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-[480px] w-[240px] shrink-0" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2 p-3 sm:p-4 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg">
                <Package className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 text-primary" />
                Benchmark Comparison
              </CardTitle>
              <CardDescription className="text-[10px] sm:text-xs md:text-sm">
                Compare your concept against competitors • Click any product for details
              </CardDescription>
            </div>
            
            {/* Filter/Select Competitors Button */}
            <div className="flex items-center gap-2">
              {selectedIds.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearSelection} className="h-8 px-2 text-xs">
                  <X className="w-3 h-3 mr-1" />
                  Clear
                </Button>
              )}
              <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5">
                    <Filter className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Select Competitors</span>
                    {selectedIds.length > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                        {selectedIds.length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="p-3 border-b">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by brand, title, or ASIN..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 h-9"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Select up to {MAX_COMPETITORS} products to compare
                    </p>
                  </div>
                  <ScrollArea className="h-[300px]">
                    <div className="p-2 space-y-1">
                      {filteredProducts.map((product, idx) => {
                        const isSelected = selectedIds.includes(product.id);
                        const isDisabled = !isSelected && selectedIds.length >= MAX_COMPETITORS;
                        return (
                          <div
                            key={product.id}
                            className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${
                              isSelected ? 'bg-primary/10' : isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted'
                            }`}
                            onClick={() => !isDisabled && handleProductSelect(product.id)}
                          >
                            <Checkbox
                              checked={isSelected}
                              disabled={isDisabled}
                              className="pointer-events-none"
                            />
                            <div className="w-8 h-8 rounded bg-muted overflow-hidden shrink-0">
                              {product.main_image_url ? (
                                <img src={product.main_image_url} alt="" className="w-full h-full object-contain" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Package className="w-4 h-4 text-muted-foreground/30" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{product.brand || 'Unknown'}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{product.title?.substring(0, 40)}...</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-muted-foreground">${product.price?.toFixed(2)}</span>
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                  <Star className="w-2.5 h-2.5 fill-chart-2 text-chart-2" />
                                  {product.rating?.toFixed(1)}
                                </span>
                                <span className="text-[10px] text-muted-foreground">{(product.reviews || 0).toLocaleString()} reviews</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {filteredProducts.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">No products found</p>
                      )}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-4 md:px-6 overflow-hidden">
          {/* Mobile: Vertical stack, Desktop: Horizontal scroll */}
          <div className="flex flex-col lg:flex-row lg:items-stretch gap-3 lg:gap-2 md:gap-3 overflow-x-hidden">
            {/* Our Concept Column - Full width on mobile, fixed on desktop */}
            <div className="w-full lg:w-[280px] xl:w-[320px] lg:shrink-0 lg:max-h-[600px] rounded-lg border-2 border-chart-2/50 bg-gradient-to-b from-chart-2/10 to-background dark:from-chart-2/20 overflow-hidden flex flex-col">
              <div className="bg-gradient-to-r from-chart-2 to-chart-2/80 px-2 sm:px-3 py-1.5 sm:py-2 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 rounded-full bg-white/20 flex items-center justify-center">
                    <Target className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-[10px] sm:text-xs md:text-sm truncate">OUR CONCEPT</p>
                    <p className="text-white/80 text-[9px] sm:text-[10px] md:text-xs truncate">Strategy</p>
                  </div>
                </div>
              </div>
              
              <div className="p-2 md:p-3 space-y-2 sm:space-y-3 flex-1 overflow-y-auto">
                {/* COMPETITIVE ADVANTAGE SUMMARY BADGE */}
                {(() => {
                  const advantages = getCompetitiveAdvantages();
                  if (advantages.length === 0) return null;
                  return (
                    <div className="bg-gradient-to-r from-chart-4 to-chart-4/80 rounded-lg p-2 sm:p-2.5 text-white">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Trophy className="w-3 h-3 sm:w-4 sm:h-4" />
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wide">Why Proceed</p>
                        <Badge className="ml-auto text-[7px] sm:text-[8px] h-4 bg-white/20 text-white border-0">
                          Top {advantages.length}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        {advantages.map((adv, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[8px] sm:text-[9px]">
                            <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                              <span className="text-[7px] font-bold">{i + 1}</span>
                            </div>
                            <span className="text-white/95 leading-tight">{adv}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* PRICING & OPPORTUNITY SCORE - Hero Section */}
                {(() => {
                  const pricing = getOurPricing();
                  const oppScore = getOurOpportunityScore();
                  return (
                    <div className="grid grid-cols-2 gap-2">
                      {/* Pricing Card */}
                      <div className="bg-chart-4/10 dark:bg-chart-4/20 rounded-lg p-2 border border-chart-4/20">
                        <p className="text-[8px] sm:text-[9px] text-muted-foreground flex items-center gap-1">
                          <DollarSign className="w-2.5 h-2.5" />
                          Target Price
                        </p>
                        <p className="text-base sm:text-lg font-bold text-chart-4">
                          {pricing.price ? `$${pricing.price.toFixed(2)}` : '—'}
                        </p>
                        {pricing.tier && (
                          <Badge variant="secondary" className="text-[7px] sm:text-[8px] h-4 mt-1">
                            {pricing.tier}
                          </Badge>
                        )}
                      </div>
                      {/* Opportunity Score Card */}
                      <div className="bg-primary/10 dark:bg-primary/20 rounded-lg p-2 border border-primary/20">
                        <p className="text-[8px] sm:text-[9px] text-muted-foreground flex items-center gap-1">
                          <TrendingUp className="w-2.5 h-2.5" />
                          Opportunity
                        </p>
                        <p className="text-base sm:text-lg font-bold text-primary">
                          {oppScore.overall ? `${oppScore.overall}/10` : '—'}
                        </p>
                        {oppScore.overall && oppScore.overall >= 7 && (
                          <Badge className="text-[7px] sm:text-[8px] h-4 mt-1 bg-chart-4 text-white">
                            High Potential
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Opportunity Score Breakdown */}
                {(() => {
                  const oppScore = getOurOpportunityScore();
                  if (oppScore.details.length === 0) return null;
                  return (
                    <div className="bg-muted/30 rounded-lg p-2 border">
                      <p className="text-[8px] sm:text-[9px] font-medium text-muted-foreground mb-1.5">Score Breakdown</p>
                      <div className="grid grid-cols-2 gap-1">
                        {oppScore.details.map((d, i) => (
                          <div key={i} className="flex items-center justify-between text-[8px] sm:text-[9px]">
                            <span className="text-muted-foreground">{d.label}</span>
                            <span className={`font-medium ${d.value >= 7 ? 'text-chart-4' : d.value >= 5 ? 'text-chart-2' : 'text-destructive'}`}>
                              {d.value}/10
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Positioning */}
                <div>
                  <p className="text-[9px] sm:text-[10px] font-semibold mb-1 flex items-center gap-1">
                    <MessageSquare className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary" />
                    Positioning
                  </p>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground">
                    {getOurPositioning()}
                  </p>
                </div>

                {/* Key Differentiators */}
                {(() => {
                  const differentiators = getOurDifferentiators();
                  if (differentiators.length === 0) return null;
                  return (
                    <div className="bg-chart-3/10 dark:bg-chart-3/20 rounded-lg p-2 border border-chart-3/20">
                      <p className="text-[9px] sm:text-[10px] font-semibold mb-1 flex items-center gap-1 text-chart-3">
                        <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        Key Differentiators
                      </p>
                      <div className="space-y-0.5">
                        {differentiators.slice(0, 4).map((d, i) => (
                          <div key={i} className="flex items-start gap-1 text-[9px] sm:text-[10px] text-foreground">
                            <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-chart-3 mt-0.5 shrink-0" />
                            <span>{d}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Go-to-Market Messaging */}
                <div>
                  <p className="text-[9px] sm:text-[10px] font-semibold mb-1 flex items-center gap-1">
                    <Megaphone className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-chart-3" />
                    Go-to-Market Messaging
                  </p>
                  <div className="space-y-0.5">
                    {getOurMessaging().slice(0, 4).map((msg, i) => (
                      <div key={i} className="flex items-start gap-1 text-[9px] sm:text-[10px] text-muted-foreground">
                        <span className="w-1 h-1 rounded-full bg-chart-3 mt-1.5 shrink-0" />
                        <span>{msg}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Competitive Intelligence */}
                {(() => {
                  const intel = getCompetitiveIntel();
                  if (intel.weaknesses.length === 0 && intel.gaps.length === 0) return null;
                  return (
                    <div className="bg-chart-5/10 dark:bg-chart-5/20 rounded-lg p-2 border border-chart-5/20">
                      <p className="text-[9px] sm:text-[10px] font-semibold mb-1.5 flex items-center gap-1 text-chart-5">
                        <Eye className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        Competitive Intelligence
                      </p>
                      {intel.weaknesses.length > 0 && (
                        <div className="mb-2">
                          <p className="text-[8px] sm:text-[9px] font-medium text-muted-foreground mb-0.5">Exploitable Weaknesses</p>
                          <div className="space-y-0.5">
                            {intel.weaknesses.slice(0, 3).map((w, i) => (
                              <div key={i} className="flex items-start gap-1 text-[8px] sm:text-[9px] text-foreground">
                                <XCircle className="w-2.5 h-2.5 text-destructive mt-0.5 shrink-0" />
                                <span>{w}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {intel.gaps.length > 0 && (
                        <div>
                          <p className="text-[8px] sm:text-[9px] font-medium text-muted-foreground mb-0.5">Market Gaps</p>
                          <div className="space-y-0.5">
                            {intel.gaps.slice(0, 3).map((g, i) => (
                              <div key={i} className="flex items-start gap-1 text-[8px] sm:text-[9px] text-foreground">
                                <Target className="w-2.5 h-2.5 text-chart-4 mt-0.5 shrink-0" />
                                <span>{g}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Things to Avoid */}
                {(() => {
                  const avoid = getThingsToAvoid();
                  if (avoid.length === 0) return null;
                  return (
                    <div className="bg-destructive/10 dark:bg-destructive/20 rounded-lg p-2 border border-destructive/20">
                      <p className="text-[9px] sm:text-[10px] font-semibold mb-1 flex items-center gap-1 text-destructive">
                        <XCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        Things to Avoid
                      </p>
                      <div className="space-y-0.5">
                        {avoid.map((item, i) => (
                          <div key={i} className="flex items-start gap-1 text-[8px] sm:text-[9px] text-foreground">
                            <AlertTriangle className="w-2.5 h-2.5 text-destructive mt-0.5 shrink-0" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Financial Highlights */}
                {(() => {
                  const fin = getFinancialHighlights();
                  if (!fin.investment && !fin.margin && !fin.breakeven) return null;
                  return (
                    <div className="bg-muted/50 rounded-lg p-2 border">
                      <p className="text-[9px] sm:text-[10px] font-semibold mb-1.5 flex items-center gap-1">
                        <DollarSign className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-chart-4" />
                        Financial Highlights
                      </p>
                      <div className="grid grid-cols-3 gap-1">
                        {fin.investment && (
                          <div className="bg-background/60 rounded p-1.5 text-center">
                            <p className="text-[7px] sm:text-[8px] text-muted-foreground">Investment</p>
                            <p className="text-[9px] sm:text-[10px] font-medium">{fin.investment}</p>
                          </div>
                        )}
                        {fin.margin && (
                          <div className="bg-background/60 rounded p-1.5 text-center">
                            <p className="text-[7px] sm:text-[8px] text-muted-foreground">Margin</p>
                            <p className="text-[9px] sm:text-[10px] font-medium text-chart-4">{fin.margin}</p>
                          </div>
                        )}
                        {fin.breakeven && (
                          <div className="bg-background/60 rounded p-1.5 text-center">
                            <p className="text-[7px] sm:text-[8px] text-muted-foreground">Breakeven</p>
                            <p className="text-[9px] sm:text-[10px] font-medium">{fin.breakeven}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Pain Points with Evidence */}
                {(() => {
                  const painPoints = getPainPointsWithEvidence();
                  if (painPoints.length === 0) return null;
                  return (
                    <div className="bg-chart-2/10 dark:bg-chart-2/20 rounded-lg p-2 border border-chart-2/20">
                      <p className="text-[9px] sm:text-[10px] font-semibold mb-1.5 flex items-center gap-1 text-chart-2">
                        <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        Customer Pain Points
                      </p>
                      <div className="space-y-1.5">
                        {painPoints.map((pp, i) => (
                          <div key={i} className="text-[8px] sm:text-[9px]">
                            <div className="flex items-center justify-between">
                              <span className="text-foreground font-medium">{pp.painPoint}</span>
                              {pp.frequency && (
                                <Badge variant="secondary" className="text-[7px] h-3.5 bg-chart-2/20 text-chart-2">
                                  {pp.frequency}%
                                </Badge>
                              )}
                            </div>
                            {pp.evidence && (
                              <p className="text-muted-foreground italic mt-0.5 text-[7px] sm:text-[8px]">"{pp.evidence}"</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Unmet Needs */}
                {(() => {
                  const needs = getUnmetNeeds();
                  if (needs.length === 0) return null;
                  return (
                    <div>
                      <p className="text-[9px] sm:text-[10px] font-semibold mb-1 flex items-center gap-1">
                        <Layers className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary" />
                        Unmet Needs (Opportunities)
                      </p>
                      <div className="space-y-0.5">
                        {needs.slice(0, 4).map((need, i) => (
                          <div key={i} className="flex items-start gap-1 text-[8px] sm:text-[9px] text-muted-foreground">
                            <CheckCircle className="w-2.5 h-2.5 text-chart-4 mt-0.5 shrink-0" />
                            <span>{need}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* What Customers Love */}
                {(() => {
                  const love = getWhatCustomersLove();
                  if (love.length === 0) return null;
                  return (
                    <div className="bg-chart-4/10 dark:bg-chart-4/20 rounded-lg p-2 border border-chart-4/20">
                      <p className="text-[9px] sm:text-[10px] font-semibold mb-1 flex items-center gap-1 text-chart-4">
                        <ThumbsUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        What Customers Love
                      </p>
                      <div className="space-y-0.5">
                        {love.slice(0, 4).map((item, i) => (
                          <div key={i} className="flex items-start gap-1 text-[8px] sm:text-[9px] text-foreground">
                            <span className="w-1 h-1 rounded-full bg-chart-4 mt-1.5 shrink-0" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Decision Drivers */}
                {(() => {
                  const drivers = getDecisionDrivers();
                  if (drivers.length === 0) return null;
                  return (
                    <div>
                      <p className="text-[9px] sm:text-[10px] font-semibold mb-1 flex items-center gap-1">
                        <Users className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary" />
                        Purchase Decision Drivers
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {drivers.slice(0, 5).map((driver, i) => (
                          <Badge key={i} variant="outline" className="text-[7px] sm:text-[8px] h-4">
                            {driver}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Target Audience */}
                <div>
                  <p className="text-[9px] sm:text-[10px] font-semibold mb-1 flex items-center gap-1">
                    <Users className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary" />
                    Target Audience
                  </p>
                  <div className="space-y-1.5">
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground">
                      {getOurBuyerProfile()}
                    </p>
                    {getOurMotivation() && (
                      <div className="bg-primary/10 dark:bg-primary/20 rounded p-1.5 border border-primary/20 dark:border-primary/30">
                        <p className="text-[8px] sm:text-[9px] font-medium text-primary mb-0.5">Primary Motivation</p>
                        <p className="text-[8px] sm:text-[9px] text-muted-foreground">
                          {getOurMotivation()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Key Ingredients */}
                <div>
                  <p className="text-[9px] sm:text-[10px] font-semibold mb-1 flex items-center gap-1">
                    <Pill className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-chart-4" />
                    Key Ingredients
                    <Badge variant="secondary" className="text-[7px] sm:text-[8px] h-3.5 sm:h-4 ml-auto">
                      {getOurIngredients().length}
                    </Badge>
                  </p>
                  <div className="space-y-0.5 max-h-24 overflow-y-auto pr-1">
                    {getOurIngredients().map((ing, i) => {
                      const hasMatch = isOurIngredientInCompetitors(ing);
                      return (
                        <div key={i} className={`flex items-start gap-1 text-[8px] sm:text-[9px] ${hasMatch ? 'text-chart-4 font-medium' : 'text-muted-foreground'}`}>
                          {hasMatch ? (
                            <Check className="w-2.5 h-2.5 text-chart-4 mt-0.5 shrink-0" />
                          ) : (
                            <span className="w-1 h-1 rounded-full bg-chart-4 mt-1.5 shrink-0 ml-1" />
                          )}
                          <span>{ing}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* FORMULATION DETAILS SECTION */}
                <div className="bg-primary/5 dark:bg-primary/10 rounded-lg p-1.5 sm:p-2 border border-primary/20 space-y-1.5 sm:space-y-2">
                  <p className="text-[8px] sm:text-[9px] font-semibold flex items-center gap-1 text-primary">
                    <FlaskConical className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    Formulation Details
                  </p>
                  
                  {/* Specs Grid */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {(() => {
                      const specs = getOurFormulationSpecs();
                      return (
                        <>
                          <div className="bg-background/60 rounded p-1 sm:p-1.5">
                            <p className="text-[7px] sm:text-[8px] text-muted-foreground">Servings</p>
                            <p className="text-[8px] sm:text-[9px] font-medium">{specs.servingsPerContainer || '—'}</p>
                          </div>
                          <div className="bg-background/60 rounded p-1 sm:p-1.5">
                            <p className="text-[7px] sm:text-[8px] text-muted-foreground">Serving Size</p>
                            <p className="text-[8px] sm:text-[9px] font-medium">{specs.servingSize || '—'}</p>
                          </div>
                          <div className="bg-background/60 rounded p-1 sm:p-1.5 col-span-2">
                            <p className="text-[7px] sm:text-[8px] text-muted-foreground">Form</p>
                            <p className="text-[8px] sm:text-[9px] font-medium">{specs.packagingType || getOurFormFactor()}</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Recommended Dosages */}
                  {getOurRecommendedDosages().length > 0 && (
                    <div>
                      <p className="text-[7px] sm:text-[8px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                        <Beaker className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                        Recommended Dosages
                      </p>
                      <div className="space-y-0.5 max-h-20 overflow-y-auto">
                        {getOurRecommendedDosages().map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-[8px] sm:text-[9px] gap-1">
                            <span className="text-muted-foreground truncate flex-1">{item.ingredient}</span>
                            {item.dosage && (
                              <Badge variant="secondary" className="text-[7px] sm:text-[8px] h-3.5 shrink-0">{item.dosage}</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Our Strengths */}
                <div className="bg-chart-4/10 dark:bg-chart-4/20 rounded-lg p-2 border border-chart-4/20 dark:border-chart-4/30">
                  <p className="text-[9px] sm:text-[10px] font-semibold mb-1 flex items-center gap-1 text-chart-4">
                    <ThumbsUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    Our Strengths
                  </p>
                  <div className="space-y-0.5">
                    {getOurStrengths().map((strength, i) => (
                      <div key={i} className="flex items-start gap-1 text-[8px] sm:text-[9px] text-foreground">
                        <span className="w-1 h-1 rounded-full bg-chart-4 mt-1.5 shrink-0" />
                        <span>{strength}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Our Risks/Challenges */}
                <div className="bg-chart-2/10 dark:bg-chart-2/20 rounded-lg p-2 border border-chart-2/20 dark:border-chart-2/30">
                  <p className="text-[9px] sm:text-[10px] font-semibold mb-1 flex items-center gap-1 text-chart-2">
                    <AlertTriangle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    Risks & Challenges
                  </p>
                  <div className="space-y-0.5">
                    {getOurWeaknesses().map((weakness, i) => (
                      <div key={i} className="flex items-start gap-1 text-[8px] sm:text-[9px] text-foreground">
                        <span className="w-1 h-1 rounded-full bg-chart-2 mt-1.5 shrink-0" />
                        <span>{weakness}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Competitor Columns - Stack on mobile, Scrollable on desktop */}
            <ScrollArea className="w-full lg:flex-1 overflow-x-hidden h-full">
              <div className="flex flex-col lg:flex-row lg:items-stretch gap-3 lg:gap-2 md:gap-3 pb-4 w-full h-full">
                {displayedProducts.map((product, idx) => (
                  <div 
                    key={product.id} 
                    className="w-full lg:w-[280px] xl:w-[300px] lg:shrink-0 lg:max-h-[600px] rounded-lg border border-border bg-card overflow-hidden cursor-pointer transition-all hover:border-primary hover:shadow-md flex flex-col"
                    onClick={() => handleProductClick(product)}
                  >
                    <div className="bg-gradient-to-r from-muted to-muted/80 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                          #{idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-xs md:text-sm truncate">{product.brand || 'Unknown'}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{product.title?.substring(0, 25)}...</p>
                        </div>
                      </div>
                    </div>

                    <div className="p-2 md:p-3 space-y-3 flex-1 overflow-y-auto">
                      <div className="w-full aspect-square rounded-lg bg-white border overflow-hidden">
                        {product.main_image_url ? (
                          <img 
                            src={product.main_image_url} 
                            alt={product.title || 'Product'} 
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <Package className="w-8 h-8 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="p-1.5 bg-secondary rounded text-center flex-1">
                          <p className="text-[10px] text-muted-foreground">Price</p>
                          <p className="text-sm md:text-base font-bold">{product.price ? `$${product.price.toFixed(2)}` : <span className="inline-flex"><span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse mx-0.5" /><span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:150ms] mx-0.5" /><span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:300ms] mx-0.5" /></span>}</p>
                        </div>
                        <div className="p-1.5 bg-secondary rounded text-center flex-1">
                          <p className="text-[10px] text-muted-foreground">Rating</p>
                        <div className="flex items-center justify-center gap-0.5">
                            <Star className="w-3 h-3 fill-chart-2 text-chart-2" />
                            <span className="text-sm md:text-base font-bold">{product.rating ? product.rating.toFixed(1) : <span className="inline-flex"><span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse mx-0.5" /><span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:150ms] mx-0.5" /><span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:300ms] mx-0.5" /></span>}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-secondary/50 rounded p-1.5">
                        <div className="flex items-center gap-1 mb-1">
                          <TrendingUp className="w-3 h-3 text-primary" />
                          <p className="text-[10px] font-semibold">Sales</p>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-[10px]">
                          <div>
                            <p className="text-muted-foreground">Monthly</p>
                            <p className="font-semibold text-chart-4">{(product.monthly_sales || 0).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Reviews</p>
                            <p className="font-semibold">{(product.reviews || 0).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>

                      {/* Positioning */}
                      <div>
                        <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-primary" />
                          Positioning
                        </p>
                        {hasMarketingAnalysis(product) ? (
                          <p className="text-[10px] text-muted-foreground">
                            {getCompetitorPositioning(product) || 'Not specified'}
                          </p>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">Analysis Pending</span>
                        )}
                      </div>

                      {/* Ingredients */}
                      <div>
                        <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                          <Pill className="w-3 h-3 text-chart-4" />
                          Ingredients
                          {(() => {
                            const { items } = parseCompetitorIngredients(product);
                            return (
                              <Badge variant="secondary" className="text-[9px] h-4 ml-auto">
                                {items.length}
                              </Badge>
                            );
                          })()}
                        </p>
                        <div className="space-y-0.5 max-h-24 overflow-y-auto pr-1">
                          {(() => {
                            const { items, fallback } = parseCompetitorIngredients(product);
                            const ourIngredients = getOurIngredients();
                            return items.map((ing, i) => {
                              const hasMatch = isMatchingIngredient(ing, ourIngredients);
                              return (
                                <div key={i} className={`flex items-start gap-1 text-[10px] ${hasMatch ? 'text-chart-4 font-medium' : fallback ? 'text-primary' : 'text-muted-foreground'}`}>
                                  {hasMatch ? (
                                    <Check className="w-3 h-3 text-chart-4 mt-0.5 shrink-0" />
                                  ) : (
                                    <span className="w-1 h-1 rounded-full bg-chart-4 mt-1.5 shrink-0 ml-1" />
                                  )}
                                  <span>{ing}</span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>

                      {/* FORMULATION DETAILS SECTION */}
                      <div className="bg-primary/5 dark:bg-primary/10 rounded-lg p-2 border border-primary/20 space-y-2">
                        <p className="text-[10px] font-semibold flex items-center gap-1 text-primary">
                          <FlaskConical className="w-3 h-3" />
                          Formulation Details
                        </p>
                        
                        {/* Specs Grid */}
                        <div className="grid grid-cols-2 gap-1.5">
                          {(() => {
                            const specs = getCompetitorFormulationSpecs(product);
                            return (
                              <>
                                <div className="bg-background/60 rounded p-1.5">
                                  <p className="text-[9px] text-muted-foreground">Servings</p>
                                  <p className="text-[10px] font-medium">{specs.servingsPerContainer || '—'}</p>
                                </div>
                                <div className="bg-background/60 rounded p-1.5">
                                  <p className="text-[9px] text-muted-foreground">Serving Size</p>
                                  <p className="text-[10px] font-medium">{specs.servingSize || '—'}</p>
                                </div>
                                <div className="bg-background/60 rounded p-1.5 col-span-2">
                                  <p className="text-[9px] text-muted-foreground">Form</p>
                                  <p className="text-[10px] font-medium">{specs.packagingType || '—'}</p>
                                </div>
                              </>
                            );
                          })()}
                        </div>

                        {/* Nutrient Dosages */}
                        {(() => {
                          const nutrients = getCompetitorNutrients(product);
                          if (nutrients.length === 0) {
                            return (
                              <div className="text-[10px] text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  <span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse" />
                                  <span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:150ms]" />
                                  <span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:300ms]" />
                                  <span className="ml-1">Awaiting label scan</span>
                                </span>
                              </div>
                            );
                          }
                          return (
                            <div>
                              <p className="text-[9px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                <Beaker className="w-2.5 h-2.5" />
                                Key Nutrients
                              </p>
                              <div className="space-y-0.5 max-h-24 overflow-y-auto">
                                {nutrients.map((n, i) => (
                                  <div key={i} className="flex items-center justify-between text-[10px] gap-1">
                                    <span className="text-muted-foreground truncate flex-1">{n.name}</span>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <Badge variant="secondary" className="text-[9px] h-4">
                                        {n.amount !== null ? `${n.amount}${n.unit}` : '—'}
                                      </Badge>
                                      {n.dailyValue && (
                                        <span className="text-[9px] text-muted-foreground">({n.dailyValue}% DV)</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Claims/Certifications */}
                        {(() => {
                          const claims = getCompetitorClaims(product);
                          if (claims.length === 0) return null;
                          return (
                            <div>
                              <p className="text-[9px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                <Award className="w-2.5 h-2.5" />
                                Claims
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {claims.map((claim, i) => (
                                  <Badge key={i} variant="outline" className="text-[9px] h-4 font-normal">
                                    {claim}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Flavors & Variants */}
                      <div>
                        <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                          <Palette className="w-3 h-3 text-chart-5" />
                          Flavors & Variants
                        </p>
                        {(() => {
                          const flavorData = getCompetitorFlavors(product);
                          if (flavorData.flavors.length === 0 && flavorData.count === 0) {
                            return <p className="text-[10px] text-muted-foreground">Single variant</p>;
                          }
                          if (flavorData.flavors.length > 0) {
                            return (
                              <div className="flex flex-wrap gap-1">
                                {flavorData.flavors.map((flavor, i) => (
                                  <span key={i} className="inline-flex items-center px-1.5 py-0.5 text-[9px] rounded-full bg-secondary text-muted-foreground">
                                    {flavor}
                                  </span>
                                ))}
                                {flavorData.count > 3 && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] rounded-full bg-muted text-muted-foreground font-medium">
                                    +{flavorData.count - 3}
                                  </span>
                                )}
                              </div>
                            );
                          }
                          return (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] rounded-full bg-secondary text-muted-foreground">
                              {flavorData.count} variants
                            </span>
                          );
                        })()}
                      </div>

                      {/* Marketing Strategy */}
                      <div>
                        <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                          <Megaphone className="w-3 h-3 text-chart-3" />
                          Marketing
                        </p>
                        {hasMarketingAnalysis(product) ? (
                          <div className="space-y-0.5">
                            {(() => {
                              const marketing = getCompetitorMarketing(product);
                              if (!marketing || marketing.length === 0) {
                                return <p className="text-[10px] text-muted-foreground">Not specified</p>;
                              }
                              return marketing.map((item, i) => (
                                <div key={i} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                                  <span className="w-1 h-1 rounded-full bg-chart-3 mt-1.5 shrink-0" />
                                  <span>{item}</span>
                                </div>
                              ));
                            })()}
                          </div>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">Analysis Pending</span>
                        )}
                      </div>

                      {/* Target Audience */}
                      <div>
                        <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                          <Users className="w-3 h-3 text-primary" />
                          Target Audience
                        </p>
                        {hasMarketingAnalysis(product) ? (
                          <div className="space-y-1.5">
                            <p className="text-[10px] text-muted-foreground max-h-20 overflow-y-auto">
                              {getCompetitorAudience(product) || 'Not specified'}
                            </p>
                            {getCompetitorMotivation(product) && (
                              <div className="bg-primary/10 dark:bg-primary/20 rounded p-1.5 border border-primary/20 dark:border-primary/30">
                                <p className="text-[9px] font-medium text-primary mb-0.5">Primary Motivation</p>
                                <p className="text-[10px] text-muted-foreground max-h-16 overflow-y-auto">
                                  {getCompetitorMotivation(product)}
                                </p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">Analysis Pending</span>
                        )}
                      </div>

                      {/* Where Competitors Win - NEW */}
                      <div className="bg-chart-4/10 dark:bg-chart-4/20 rounded-lg p-2 border border-chart-4/20 dark:border-chart-4/30">
                        <p className="text-[10px] font-semibold mb-1 flex items-center gap-1 text-chart-4">
                          <Trophy className="w-3 h-3" />
                          Where They Win
                        </p>
                        {hasReviewAnalysis(product) ? (
                          (() => {
                            const topWin = getCompetitorTopWin(product);
                            if (!topWin) {
                              return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse" /><span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:150ms]" /><span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:300ms]" /></span>;
                            }
                            return (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-medium text-foreground">{topWin.theme}</span>
                                {topWin.percentage && (
                                  <Badge variant="secondary" className="text-[9px] h-4 bg-chart-4/20 text-chart-4">
                                    {topWin.percentage}%
                                  </Badge>
                                )}
                              </div>
                            );
                          })()
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">Analysis Pending</span>
                        )}
                      </div>

                      {/* Strengths (from Reviews) */}
                      <div>
                        <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                          <ThumbsUp className="w-3 h-3 text-chart-4" />
                          Strengths (Reviews)
                        </p>
                        {hasReviewAnalysis(product) ? (
                          <div className="space-y-0.5">
                            {(() => {
                              const strengths = getCompetitorStrengths(product);
                              if (strengths.length === 0) {
                                return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse" /><span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:150ms]" /><span className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:300ms]" /></span>;
                              }
                              return strengths.map((s, i) => (
                                <div key={i} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                                  <span className="w-1 h-1 rounded-full bg-chart-4 mt-1.5 shrink-0" />
                                  <span>{s.theme}</span>
                                  {s.percentage && (
                                    <span className="text-chart-4 font-medium ml-auto">{s.percentage}%</span>
                                  )}
                                </div>
                              ));
                            })()}
                          </div>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">Analysis Pending</span>
                        )}
                      </div>

                      {/* Weaknesses (from Reviews) */}
                      <div>
                        <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                          <ThumbsDown className="w-3 h-3 text-destructive" />
                          Weaknesses (Reviews)
                        </p>
                        {hasReviewAnalysis(product) ? (
                          <div className="space-y-0.5">
                            {(() => {
                              const weaknesses = getCompetitorWeaknesses(product);
                              if (weaknesses.length === 0) {
                                return <p className="text-[10px] text-muted-foreground">No issues reported</p>;
                              }
                              return weaknesses.map((w, i) => (
                                <div key={i} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                                  <span className="w-1 h-1 rounded-full bg-destructive mt-1.5 shrink-0" />
                                  <span>{w.issue}</span>
                                  {w.percentage && (
                                    <span className="text-destructive font-medium ml-auto">{w.percentage}%</span>
                                  )}
                                </div>
                              ));
                            })()}
                          </div>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">Analysis Pending</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Empty slots to show capacity */}
                {Array.from({ length: Math.max(0, MAX_COMPETITORS - displayedProducts.length) }).map((_, idx) => (
                  <div key={`empty-${idx}`} className="w-[280px] md:w-[320px] shrink-0 rounded-lg border border-dashed border-border bg-muted/20 flex flex-col items-center justify-center min-h-[480px] gap-2">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-primary/40 animate-pulse" />
                      <span className="w-2 h-2 rounded-full bg-primary/40 animate-pulse [animation-delay:150ms]" />
                      <span className="w-2 h-2 rounded-full bg-primary/40 animate-pulse [animation-delay:300ms]" />
                    </span>
                    <p className="text-xs text-muted-foreground">Loading...</p>
                  </div>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </CardContent>
      </Card>

      {/* UNIFIED INGREDIENT & DOSAGE COMPARISON */}
      <IngredientComparisonSection 
        ourDosages={getOurRecommendedDosages()}
        competitors={displayedProducts}
        getCompetitorNutrients={getCompetitorNutrients}
        getCompetitorIngredientsList={getCompetitorIngredientsList}
        ourPrice={analysisData?.formula_brief?.target_price as number | undefined}
        ourServings={getOurFormulationSpecs().servingsPerContainer || undefined}
        labelClaims={analysisData?.formula_brief_content ? parseFinishedProductSpecifications(analysisData.formula_brief_content as string) : []}
      />

      {/* PACKAGING STRATEGY COMPARISON */}
      <PackagingComparisonSection
        ourPackaging={getOurPackaging()}
        competitors={displayedProducts}
        getCompetitorPackaging={getCompetitorPackaging}
      />

      {/* Product Detail Modal */}
      <ProductDetailModal 
        product={selectedProduct}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </>
  );
}
