import React, { useState, useMemo, useCallback, useEffect, Fragment } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Star, TrendingUp, TrendingDown, Pill, Target, MessageSquare, Package, Users, Megaphone, AlertTriangle, CheckCircle, XCircle, Palette, Search, Filter, X, Trophy, ThumbsUp, ThumbsDown, Check, FlaskConical, Scale, Award, Beaker, ChevronDown, ChevronUp, BarChart3, DollarSign, Eye, Layers, Shield, Tag, Sparkles, FileText, Loader2, Zap, Brain, ArrowUp, ArrowDown, Minus, Plus, RefreshCw, ArrowRight, ArrowUpDown, Calendar, Clock, GitBranch } from "lucide-react";
import { useProducts, Product } from "@/hooks/useProducts";
import ProductDetailModal from "@/components/ProductDetailModal";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, RadialBarChart, RadialBar, LineChart, Line } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useIngredientAnalysis, IngredientAnalysis } from "@/hooks/useIngredientAnalysis";
import AIAnalysisResults from "@/components/dashboard/AIAnalysisResults";
import { useCompetitiveAnalysis } from "@/hooks/useCompetitiveAnalysis";
import { CompetitiveAnalysisResults } from "@/components/dashboard/CompetitiveAnalysisResults";
interface VersionInfo {
  versionNumber: number;
  isActive: boolean;
  changeSummary?: string | null;
}

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
    products_snapshot?: {
      formula_references?: Array<{
        asin: string;
        age_months?: number;
        monthly_revenue?: number;
        monthly_sales?: number;
        brand?: string;
        title?: string;
      }>;
      top_performers?: Array<{
        asin: string;
        monthly_revenue?: number;
        monthly_sales?: number;
      }>;
    } | null;
  } | null;
  isLoading?: boolean;
  formulaVersionId?: string | null;
  versionInfo?: VersionInfo;
}

const MAX_COMPETITORS = 15;

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
  versionInfo?: {
    versionNumber?: number;
    isActive?: boolean;
    changeSummary?: string | null;
  };
}

// AIAnalysisResults is now imported from @/components/dashboard/AIAnalysisResults

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

function IngredientComparisonSection({ ourDosages, competitors, getCompetitorNutrients, getCompetitorIngredientsList, ourPrice, ourServings, labelClaims = [], categoryId, versionInfo }: IngredientComparisonProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'chart' | 'table' | 'gaps'>('chart');
  const [activeTab, setActiveTab] = useState<'new_winners' | 'top_performers'>('new_winners');
  const [showAsinInput, setShowAsinInput] = useState(false);
  const [asinInput, setAsinInput] = useState('');
  
  // AI Analysis hooks - one for each type
  const newWinnersAnalysis = useIngredientAnalysis(categoryId, 'new_winners');
  const topPerformersAnalysis = useIngredientAnalysis(categoryId, 'top_performers');
  
  // Detect analysis availability based on product data
  const analysisAvailability = useMemo(() => {
    if (!competitors || competitors.length === 0) {
      return {
        newWinners: { available: false, reason: 'No products in category', youngCount: 0 },
        topPerformers: { available: true, reason: 'Available' }
      };
    }
    
    // Check for young products (≤24 months) for New Winners
    const youngProducts = competitors.filter(p => p.age_months && p.age_months <= 24);
    const hasYoungProducts = youngProducts.length > 0;
    
    // Check for top performers (products with sales data)
    const hasTopPerformers = competitors.some(p => p.monthly_sales && p.monthly_sales > 0);
    
    return {
      newWinners: {
        available: hasYoungProducts,
        reason: hasYoungProducts 
          ? `${youngProducts.length} young product(s) (≤24 months) found`
          : 'No young products (≤24 months) in this category',
        youngCount: youngProducts.length
      },
      topPerformers: {
        available: hasTopPerformers || competitors.length > 0,
        reason: hasTopPerformers 
          ? `${competitors.length} product(s) with sales data`
          : 'No products with sales data'
      }
    };
  }, [competitors]);
  
  // Auto-select available tab if current tab is not available
  useEffect(() => {
    // If New Winners tab is unavailable (no young products), switch to Top Performers
    if (!analysisAvailability.newWinners.available && activeTab === 'new_winners') {
      if (analysisAvailability.topPerformers.available) {
        setActiveTab('top_performers');
      }
    }
  }, [analysisAvailability, activeTab]);
  
  // Get the active analysis based on selected tab
  const activeAnalysisData = activeTab === 'new_winners' ? newWinnersAnalysis : topPerformersAnalysis;

  // Parse ASINs from input (comma, space, or newline separated)
  const parseAsins = (input: string): string[] => {
    return input
      .split(/[,\s\n]+/)
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length === 10 && /^[A-Z0-9]+$/.test(s));
  };

  const handleRunWithAsins = () => {
    const asins = parseAsins(asinInput);
    if (asins.length === 0) {
      return;
    }
    activeAnalysisData.runAnalysis(asins);
    setShowAsinInput(false);
    setAsinInput('');
  };

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
                  {versionInfo && (
                    <Badge variant={versionInfo.isActive ? "default" : "outline"} className="ml-1 text-[9px] sm:text-[10px]">
                      <GitBranch className="w-2.5 h-2.5 mr-1" />
                      {versionInfo.versionNumber ? `v${versionInfo.versionNumber}` : 'Original'}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-[10px] sm:text-xs">
                  {stats.nutrients} active nutrients • {stats.otherIngredients} other ingredients
                </CardDescription>
              </div>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2">
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
            {/* Tabbed Navigation for New Winners vs Top Performers */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="relative flex items-center bg-muted rounded-lg p-0.5">
                {/* Sliding indicator */}
                <div 
                  className={cn(
                    "absolute top-0.5 bottom-0.5 bg-background rounded-md shadow-sm transition-all duration-300 ease-out",
                    activeTab === 'new_winners' ? 'left-0.5 w-[calc(50%-2px)]' : 'left-[calc(50%+2px)] w-[calc(50%-2px)]'
                  )}
                />
                {/* New Winners Tab - with availability tooltip */}
                <TooltipProvider>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block">
                        <Button 
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "relative z-10 h-8 px-3 text-xs gap-1.5 rounded-md transition-all duration-200",
                            activeTab === 'new_winners' 
                              ? 'text-foreground font-medium' 
                              : 'text-muted-foreground hover:text-foreground',
                            !analysisAvailability.newWinners.available && 'opacity-50 cursor-not-allowed'
                          )}
                          onClick={() => analysisAvailability.newWinners.available && setActiveTab('new_winners')}
                          disabled={!analysisAvailability.newWinners.available}
                        >
                          <Zap className={cn(
                            "w-3 h-3 transition-all duration-200",
                            activeTab === 'new_winners' && analysisAvailability.newWinners.available && "text-amber-500 scale-110",
                            !analysisAvailability.newWinners.available && "text-muted-foreground"
                          )} />
                          <span className={cn(
                            "transition-transform duration-200",
                            activeTab === 'new_winners' && "translate-x-0.5"
                          )}>
                            New Winners
                          </span>
                          {!analysisAvailability.newWinners.available ? (
                            <XCircle className="w-3 h-3 text-muted-foreground" />
                          ) : newWinnersAnalysis.hasAnalysis ? (
                            <CheckCircle className={cn(
                              "w-3 h-3 text-green-500 transition-all duration-200",
                              activeTab === 'new_winners' && "scale-110"
                            )} />
                          ) : newWinnersAnalysis.isNotAvailable ? (
                            <Minus className="w-3 h-3 text-muted-foreground" />
                          ) : newWinnersAnalysis.pollingStatus.isPolling ? (
                            <Loader2 className="w-3 h-3 animate-spin text-primary" />
                          ) : null}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!analysisAvailability.newWinners.available && (
                      <TooltipContent>
                        <p>{analysisAvailability.newWinners.reason}</p>
                      </TooltipContent>
                    )}
                  </UITooltip>
                </TooltipProvider>
                
                {/* Top Performers Tab - enabled if NW completed, not_available, or NW tab unavailable */}
                <TooltipProvider>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block">
                        <Button 
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "relative z-10 h-8 px-3 text-xs gap-1.5 rounded-md transition-all duration-200",
                            activeTab === 'top_performers' 
                              ? 'text-foreground font-medium' 
                              : 'text-muted-foreground hover:text-foreground',
                            // Only disabled if NW is available but hasn't been run yet
                            (analysisAvailability.newWinners.available && !newWinnersAnalysis.hasAnalysis && !newWinnersAnalysis.isNotAvailable) && 'opacity-50 cursor-not-allowed'
                          )}
                          onClick={() => {
                            // Enable if: NW completed, NW not_available, or NW tab is unavailable (no young products)
                            const canClick = newWinnersAnalysis.hasAnalysis || 
                                           newWinnersAnalysis.isNotAvailable || 
                                           !analysisAvailability.newWinners.available;
                            if (canClick) setActiveTab('top_performers');
                          }}
                          disabled={analysisAvailability.newWinners.available && !newWinnersAnalysis.hasAnalysis && !newWinnersAnalysis.isNotAvailable}
                        >
                          <Trophy className={cn(
                            "w-3 h-3 transition-all duration-200",
                            activeTab === 'top_performers' && "text-primary scale-110"
                          )} />
                          <span className={cn(
                            "transition-transform duration-200",
                            activeTab === 'top_performers' && "translate-x-0.5"
                          )}>
                            Top Performers
                          </span>
                          {topPerformersAnalysis.hasAnalysis && (
                            <CheckCircle className={cn(
                              "w-3 h-3 text-green-500 transition-all duration-200",
                              activeTab === 'top_performers' && "scale-110"
                            )} />
                          )}
                          {topPerformersAnalysis.pollingStatus.isPolling && (
                            <Loader2 className="w-3 h-3 animate-spin text-primary" />
                          )}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {analysisAvailability.newWinners.available && !newWinnersAnalysis.hasAnalysis && !newWinnersAnalysis.isNotAvailable && (
                      <TooltipContent>
                        <p>Run New Winners analysis first to establish ingredient count</p>
                      </TooltipContent>
                    )}
                  </UITooltip>
                </TooltipProvider>
              </div>
              
              {/* AI Analysis Buttons for active tab */}
              {!activeAnalysisData.hasAnalysis && !activeAnalysisData.pollingStatus.isPolling && !activeAnalysisData.isNotAvailable && (
                // Hide buttons for Top Performers only if New Winners is available but not run yet
                !(activeTab === 'top_performers' && analysisAvailability.newWinners.available && !newWinnersAnalysis.hasAnalysis && !newWinnersAnalysis.isNotAvailable) && (
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="default"
                      size="sm" 
                      className="h-8 px-3 text-xs transition-all duration-300 hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)] hover:scale-105"
                      onClick={(e) => { e.stopPropagation(); activeAnalysisData.runAnalysis(); }}
                      disabled={activeAnalysisData.isLoading || !categoryId}
                    >
                      {activeAnalysisData.isLoading ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Brain className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Analyze {activeTab === 'new_winners' ? 'New Winners' : 'Top Performers'}
                    </Button>
                    
                    {/* Manual ASIN Selection Popover */}
                    <Popover open={showAsinInput} onOpenChange={setShowAsinInput}>
                      <PopoverTrigger asChild>
                        <Button 
                          variant="outline"
                          size="sm" 
                          className="h-8 px-2 text-xs"
                          disabled={activeAnalysisData.isLoading || !categoryId}
                        >
                          <Target className="w-3.5 h-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80" align="end">
                        <div className="space-y-3">
                          <div>
                            <h4 className="font-medium text-sm mb-1">Analyze Specific Products</h4>
                            <p className="text-xs text-muted-foreground">
                              Enter ASINs to analyze specific products instead of automatic selection.
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Input
                              placeholder="B0123456789, B0987654321..."
                              value={asinInput}
                              onChange={(e) => setAsinInput(e.target.value)}
                              className="text-xs"
                            />
                            <p className="text-[10px] text-muted-foreground">
                              {parseAsins(asinInput).length} valid ASIN{parseAsins(asinInput).length !== 1 ? 's' : ''} detected
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              className="flex-1 text-xs"
                              onClick={handleRunWithAsins}
                              disabled={parseAsins(asinInput).length === 0 || activeAnalysisData.isLoading}
                            >
                              <Brain className="w-3 h-3 mr-1" />
                              Analyze ({parseAsins(asinInput).length})
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => { setShowAsinInput(false); setAsinInput(''); }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                )
              )}
            </div>

            {/* Tab Content with fade transition */}
            <div 
              key={activeTab}
              className="animate-fade-in"
            >
              {/* Tab Description */}
              <div className="mb-4 p-3 rounded-lg bg-muted/50 border border-border/50">
                {activeTab === 'new_winners' ? (
                  <p className="text-xs text-muted-foreground">
                    <Zap className="w-3 h-3 inline mr-1 text-amber-500" />
                    <strong>New Winners:</strong> Compare against young, high-growth products (Formula References) that are disrupting the market with innovative formulations.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    <Trophy className="w-3 h-3 inline mr-1 text-primary" />
                    <strong>Top Performers:</strong> Compare against established best-sellers with proven track records and market-leading formulations.
                  </p>
                )}
              </div>

              {/* Show AI Analysis Results when available */}
              {activeAnalysisData.analysis ? (
                <AIAnalysisResults 
                  analysis={activeAnalysisData.analysis} 
                  onRefresh={() => activeAnalysisData.runAnalysis()} 
                  isLoading={activeAnalysisData.isLoading}
                  versionInfo={versionInfo}
                />
              ) : activeAnalysisData.pollingStatus.isPolling ? (
                /* Polling Progress Indicator */
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="relative mb-6">
                    <div className="p-4 rounded-full bg-primary/10">
                      <Brain className="w-8 h-8 text-primary" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 bg-card rounded-full p-1 border border-border">
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    Analyzing {activeTab === 'new_winners' ? 'New Winners' : 'Top Performers'}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md mb-4">
                    AI is analyzing your formulation against {activeTab === 'new_winners' ? 'emerging high-growth products' : 'market-leading competitors'}. This may take 1-2 minutes...
                  </p>
                  
                  {/* Progress Bar */}
                  <div className="w-full max-w-xs mb-4">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Polling for results...</span>
                      <span>{activeAnalysisData.pollingStatus.attempt} / {activeAnalysisData.pollingStatus.maxAttempts}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
                        style={{ width: `${(activeAnalysisData.pollingStatus.attempt / activeAnalysisData.pollingStatus.maxAttempts) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Time Elapsed */}
                  {activeAnalysisData.pollingStatus.startedAt && (
                    <p className="text-xs text-muted-foreground">
                      Time elapsed: {Math.floor((Date.now() - activeAnalysisData.pollingStatus.startedAt.getTime()) / 1000)}s
                    </p>
                  )}
                </div>
              ) : (
                /* Empty State - Prompt to run analysis */
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="p-4 rounded-full bg-primary/10 mb-4">
                    {activeTab === 'new_winners' ? (
                      <Zap className="w-8 h-8 text-amber-500" />
                    ) : (
                      <Trophy className="w-8 h-8 text-primary" />
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {activeTab === 'new_winners' ? 'New Winners Analysis' : 'Top Performers Analysis'}
                  </h3>
                  
                  {/* Show requirement message for Top Performers if New Winners not done */}
                  {activeTab === 'top_performers' && !newWinnersAnalysis.hasAnalysis ? (
                    <>
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-6 max-w-md">
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="w-4 h-4 inline mr-1.5 mb-0.5" />
                          Run <strong>New Winners</strong> analysis first. This establishes the ingredient count that Top Performers will match for consistent comparison.
                        </p>
                      </div>
                      <Button 
                        onClick={() => setActiveTab('new_winners')}
                        className="gap-2"
                      >
                        <Zap className="w-4 h-4" />
                        Go to New Winners
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground max-w-md mb-6">
                        {activeTab === 'new_winners' 
                          ? 'Analyze your formulation against young, high-growth products to identify emerging trends and innovative formulation strategies.'
                          : 'Analyze your formulation against established market leaders to understand proven formulation strategies and competitive positioning.'
                        }
                      </p>
                      {/* Show ingredient count badge for Top Performers */}
                      {activeTab === 'top_performers' && newWinnersAnalysis.hasAnalysis && (
                        <Badge variant="outline" className="mb-4 text-xs">
                          Using {newWinnersAnalysis.analysis?.ingredient_comparison_table?.summary?.total_our_ingredients || 'N/A'} ingredients from New Winners analysis
                        </Badge>
                      )}
                      <Button 
                        onClick={() => activeAnalysisData.runAnalysis()}
                        disabled={activeAnalysisData.isLoading || !categoryId || (activeTab === 'top_performers' && !newWinnersAnalysis.hasAnalysis)}
                        className={cn(
                          "gap-2 transition-all duration-300 hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)] hover:scale-105"
                        )}
                      >
                        {activeAnalysisData.isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Brain className="w-4 h-4" />
                        )}
                        {activeAnalysisData.isLoading ? 'Analyzing...' : `Analyze ${activeTab === 'new_winners' ? 'New Winners' : 'Top Performers'}`}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
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
  formulaVersionId,
  versionInfo,
}: EnhancedBenchmarkComparisonProps) {
  const { data: products, isLoading: productsLoading } = useProducts(categoryId);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [showOnlyNewWinners, setShowOnlyNewWinners] = useState(false);
  const [sortBy, setSortBy] = useState<'sales' | 'revenue' | 'age' | 'growth'>('sales');
  const [competitorAnalysisOpen, setCompetitorAnalysisOpen] = useState(false);
  const [selectedCompetitorBrand, setSelectedCompetitorBrand] = useState<string | null>(null);
  const { toast } = useToast();
  
  // Competitive Analysis Hook
  const {
    analysis: competitiveAnalysis,
    isLoading: competitiveLoading,
    isPolling: competitivePolling,
    pollingAttempt,
    runAnalysis: runCompetitiveAnalysis,
    clearAnalysis: clearCompetitiveAnalysis,
  } = useCompetitiveAnalysis(categoryId);
  
  // Get formula reference ASINs for prioritization
  const formulaReferenceAsins = useMemo(() => {
    const refs = analysisData?.products_snapshot?.formula_references || [];
    return new Set(refs.map(r => r.asin));
  }, [analysisData?.products_snapshot?.formula_references]);

  // Helper to check if product is a formula reference (New Winner)
  const isFormulaReference = (asin: string) => formulaReferenceAsins.has(asin);

  // Sort comparator based on selected sort option
  const getSortValue = useCallback((product: Product) => {
    switch (sortBy) {
      case 'revenue':
        return product.monthly_revenue || 0;
      case 'age':
        // Lower age = newer = higher priority, so we negate
        return -(product.age_months || 999);
      case 'growth':
        // Estimate growth rate from reviews and age
        const reviewsPerMonth = product.age_months && product.age_months > 0 
          ? (product.reviews || 0) / product.age_months 
          : 0;
        return reviewsPerMonth;
      case 'sales':
      default:
        return product.monthly_sales || 0;
    }
  }, [sortBy]);

  // All products sorted - prioritize formula references, then by selected sort option
  const allProductsSorted = useMemo(() => {
    const allProducts = [...(products || [])];
    
    // Separate formula reference products from others
    const formulaProducts = allProducts.filter(p => formulaReferenceAsins.has(p.asin));
    const otherProducts = allProducts.filter(p => !formulaReferenceAsins.has(p.asin));
    
    // Sort each group by selected sort option
    const sortedFormula = formulaProducts.sort((a, b) => getSortValue(b) - getSortValue(a));
    const sortedOthers = otherProducts.sort((a, b) => getSortValue(b) - getSortValue(a));
    
    // Return formula references first, then others
    return [...sortedFormula, ...sortedOthers];
  }, [products, formulaReferenceAsins, getSortValue]);

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

  // Count of formula references available
  const formulaReferencesCount = useMemo(() => {
    if (!products) return 0;
    return products.filter(p => formulaReferenceAsins.has(p.asin)).length;
  }, [products, formulaReferenceAsins]);

  // Get selected products or default to top products, with optional New Winners filter
  const displayedProducts = useMemo(() => {
    let result = selectedIds.length > 0 
      ? allProductsSorted.filter(p => selectedIds.includes(p.id))
      : allProductsSorted.slice(0, MAX_COMPETITORS);
    
    // Apply New Winners filter if enabled
    if (showOnlyNewWinners && formulaReferenceAsins.size > 0) {
      result = result.filter(p => formulaReferenceAsins.has(p.asin));
    }
    
    return result;
  }, [selectedIds, allProductsSorted, showOnlyNewWinners, formulaReferenceAsins]);

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
    
    // Try creative_brief.target_persona first (most reliable source)
    const creativeBrief = marketingAnalysis.creative_brief as Record<string, unknown> | undefined;
    const targetPersona = creativeBrief?.target_persona as Record<string, unknown> | undefined;
    if (targetPersona?.psychographic) {
      return targetPersona.psychographic as string;
    }
    
    // Try brand_identity.tone
    const brandIdentity = creativeBrief?.brand_identity as Record<string, unknown> | undefined;
    if (brandIdentity?.tone) {
      return brandIdentity.tone as string;
    }
    
    // Try details.customer_sentiment.gap_analysis (summary of positioning)
    const details = marketingAnalysis.details as Record<string, unknown> | undefined;
    const customerSentiment = details?.customer_sentiment as Record<string, unknown> | undefined;
    if (customerSentiment?.gap_analysis) {
      const gap = customerSentiment.gap_analysis as string;
      // Return first 100 chars if it's too long
      return gap.length > 100 ? gap.substring(0, 100) + '...' : gap;
    }
    
    // Try lifestyle_positioning.primary_lifestyle
    const lifestylePos = marketingAnalysis.lifestyle_positioning as Record<string, unknown> | undefined;
    if (lifestylePos?.primary_lifestyle) {
      return lifestylePos.primary_lifestyle as string;
    }
    
    // Fallback to visual_gallery.vibe
    const visualGallery = marketingAnalysis.visual_gallery as Record<string, unknown> | undefined;
    if (visualGallery?.vibe) {
      return visualGallery.vibe as string;
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

  // Get competitor USPs from marketing analysis creative_brief.unique_selling_props
  const getCompetitorUSPs = (product: Product): string[] | null => {
    const marketingAnalysis = product.marketing_analysis as Record<string, unknown> | null;
    if (!marketingAnalysis) return null;
    
    // Primary source: creative_brief.unique_selling_props (AI-extracted USPs)
    const creativeBrief = marketingAnalysis.creative_brief as Record<string, unknown> | undefined;
    const usps = creativeBrief?.unique_selling_props as string[] | undefined;
    if (usps && Array.isArray(usps) && usps.length > 0) {
      return usps;
    }
    
    // Fallback: competitive_analysis.unique_selling_points
    const competitiveAnalysis = marketingAnalysis.competitive_analysis as Record<string, unknown> | undefined;
    const uniqueSellingPoints = competitiveAnalysis?.unique_selling_points as string[] | undefined;
    if (uniqueSellingPoints && Array.isArray(uniqueSellingPoints) && uniqueSellingPoints.length > 0) {
      return uniqueSellingPoints;
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
                {versionInfo && (
                  <Badge variant={versionInfo.isActive ? "default" : "secondary"} className="ml-1 text-[9px] sm:text-[10px] font-medium">
                    <GitBranch className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                    v{versionInfo.versionNumber}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-[10px] sm:text-xs md:text-sm">
                Compare your concept against competitors • Click any product for details
              </CardDescription>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Analyze Competitors Button */}
              <Button 
                variant={competitiveAnalysis ? "outline" : "default"}
                size="sm" 
                onClick={runCompetitiveAnalysis}
                disabled={competitiveLoading || competitivePolling}
                className={cn(
                  "h-8 gap-1.5 transition-all duration-300 hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)] hover:scale-105"
                )}
              >
                {(competitiveLoading || competitivePolling) ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="hidden sm:inline">
                      {competitivePolling ? `Analyzing (${pollingAttempt})...` : "Starting..."}
                    </span>
                  </>
                ) : (
                  <>
                    <Brain className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {competitiveAnalysis ? "Re-Analyze" : "Analyze Competitors"}
                    </span>
                  </>
                )}
              </Button>
              
              {competitiveAnalysis && (
                <Button variant="ghost" size="sm" onClick={clearCompetitiveAnalysis} className="h-8 px-2 text-xs">
                  <X className="w-3 h-3 mr-1" />
                  Clear Analysis
                </Button>
              )}

              {selectedIds.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearSelection} className="h-8 px-2 text-xs">
                  <X className="w-3 h-3 mr-1" />
                  Clear Selection
                </Button>
              )}
              
              {/* New Winners Filter Toggle */}
              {formulaReferencesCount > 0 && (
                <TooltipProvider>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant={showOnlyNewWinners ? "default" : "outline"} 
                        size="sm" 
                        onClick={() => setShowOnlyNewWinners(!showOnlyNewWinners)}
                        className={cn(
                          "h-8 gap-1.5",
                          showOnlyNewWinners && "bg-chart-4 hover:bg-chart-4/90"
                        )}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">New Winners</span>
                        <Badge 
                          variant="secondary" 
                          className={cn(
                            "ml-1 h-5 px-1.5 text-[10px]",
                            showOnlyNewWinners && "bg-white/20 text-white"
                          )}
                        >
                          {formulaReferencesCount}
                        </Badge>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-center">
                      <p className="font-semibold">Formula Reference Products</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        High-growth "New Winners" selected as formulation benchmarks. These products show strong recent performance and serve as models for your formula strategy.
                      </p>
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              )}
              
              {/* Sort Dropdown */}
              <Select value={sortBy} onValueChange={(value: 'sales' | 'revenue' | 'age' | 'growth') => setSortBy(value)}>
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <ArrowUpDown className="w-3 h-3 mr-1.5" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales" className="text-xs">
                    <span className="flex items-center gap-1.5">
                      <TrendingUp className="w-3 h-3" />
                      Monthly Sales
                    </span>
                  </SelectItem>
                  <SelectItem value="revenue" className="text-xs">
                    <span className="flex items-center gap-1.5">
                      <DollarSign className="w-3 h-3" />
                      Revenue
                    </span>
                  </SelectItem>
                  <SelectItem value="age" className="text-xs">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />
                      Newest First
                    </span>
                  </SelectItem>
                  <SelectItem value="growth" className="text-xs">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Growth Rate
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
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
                                <span className="text-[10px] text-muted-foreground">${product.price != null ? Number(product.price).toFixed(2) : '—'}</span>
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
            <div className="w-full lg:w-[280px] xl:w-[320px] lg:shrink-0 lg:max-h-[750px] rounded-lg border-2 border-chart-2/50 bg-gradient-to-b from-chart-2/10 to-background dark:from-chart-2/20 overflow-hidden flex flex-col">
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
                          {pricing.price != null ? `$${Number(pricing.price).toFixed(2)}` : '—'}
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
                {displayedProducts.map((product, idx) => {
                  const hasIngredients = !!product.ingredients;
                  const hasReviews = !!product.review_analysis;
                  const hasMarketing = !!product.marketing_analysis;
                  const hasBsrHistory = !!(product.historical_data as { bsr_monthly?: Record<string, number> } | null)?.bsr_monthly;
                  const hasCompetitorAnalysis = competitiveAnalysis?.competitor_comparisons.some(
                    c => c.competitor_brand?.toLowerCase() === product.brand?.toLowerCase()
                  );
                  
                  return (
                  <div 
                    key={product.id} 
                    className="group relative w-full lg:w-[280px] xl:w-[300px] lg:shrink-0 lg:max-h-[750px] rounded-lg border border-border bg-card overflow-hidden cursor-pointer transition-all hover:border-primary hover:shadow-md flex flex-col"
                    onClick={() => handleProductClick(product)}
                  >
                    {/* AI Analysis Available Badge */}
                    {hasCompetitorAnalysis && (
                      <div className="absolute top-2 right-2 z-10">
                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-medium shadow-sm">
                          <Brain className="w-2.5 h-2.5" />
                          <span>AI</span>
                        </div>
                      </div>
                    )}
                    
                    <div className={cn(
                      "bg-gradient-to-r px-3 py-2",
                      isFormulaReference(product.asin) 
                        ? "from-chart-4/20 to-chart-4/10 border-b-2 border-chart-4" 
                        : "from-muted to-muted/80"
                    )}>
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-6 h-6 md:w-7 md:h-7 rounded-full flex items-center justify-center font-bold text-xs",
                          isFormulaReference(product.asin)
                            ? "bg-chart-4 text-white"
                            : "bg-primary/10 text-primary"
                        )}>
                          #{idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-xs md:text-sm truncate">{product.brand || 'Unknown'}</p>
                            {isFormulaReference(product.asin) && (
                              <Badge variant="default" className="text-[8px] h-4 bg-chart-4 text-white gap-0.5 shrink-0">
                                <Zap className="w-2.5 h-2.5" />
                                New Winner
                              </Badge>
                            )}
                          </div>
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
                          <p className="text-sm md:text-base font-bold">{product.price != null ? `$${Number(product.price).toFixed(2)}` : <span className="inline-flex"><span className="w-1 h-1 rounded-full bg-muted-foreground/60 mx-0.5" /><span className="w-1 h-1 rounded-full bg-muted-foreground/60 mx-0.5" /><span className="w-1 h-1 rounded-full bg-muted-foreground/60 mx-0.5" /></span>}</p>
                        </div>
                        <div className="p-1.5 bg-secondary rounded text-center flex-1">
                          <p className="text-[10px] text-muted-foreground">Rating</p>
                        <div className="flex items-center justify-center gap-0.5">
                            <Star className="w-3 h-3 fill-chart-2 text-chart-2" />
                            <span className="text-sm md:text-base font-bold">{product.rating ? product.rating.toFixed(1) : <span className="inline-flex"><span className="w-1 h-1 rounded-full bg-muted-foreground/60 mx-0.5" /><span className="w-1 h-1 rounded-full bg-muted-foreground/60 mx-0.5" /><span className="w-1 h-1 rounded-full bg-muted-foreground/60 mx-0.5" /></span>}</span>
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

                      {/* Product Stats Grid - Highlight for Formula References */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className={cn(
                          "rounded p-1.5",
                          isFormulaReference(product.asin) ? "bg-chart-4/10 border border-chart-4/30" : "bg-secondary/50"
                        )}>
                          <p className="text-[9px] text-muted-foreground">Listing Age</p>
                          <p className={cn(
                            "text-[10px] font-semibold",
                            isFormulaReference(product.asin) && "text-chart-4"
                          )}>
                            {product.age_months ? `${product.age_months} mo` : '—'}
                          </p>
                        </div>
                        <div className={cn(
                          "rounded p-1.5",
                          isFormulaReference(product.asin) ? "bg-chart-4/10 border border-chart-4/30" : "bg-secondary/50"
                        )}>
                          <p className="text-[9px] text-muted-foreground">Revenue/mo</p>
                          <p className={cn(
                            "text-[10px] font-semibold",
                            isFormulaReference(product.asin) && "text-chart-4"
                          )}>
                            {product.monthly_revenue ? `$${product.monthly_revenue.toLocaleString()}` : '—'}
                          </p>
                        </div>
                      </div>
                      
                      {/* BSR Rank - separate row */}
                      <div className="bg-secondary/50 rounded p-1.5">
                        <p className="text-[9px] text-muted-foreground">BSR Rank</p>
                        <p className="text-[10px] font-semibold">{product.bsr_current ? `#${product.bsr_current.toLocaleString()}` : (product.rank ? `#${product.rank.toLocaleString()}` : '—')}</p>
                      </div>

                      {/* Mini Performance Trend Chart (2yr) */}
                      {(() => {
                        const historical = product.historical_data as { 
                          bsr_monthly?: Record<string, number>;
                          sales_monthly?: Record<string, number>;
                        } | null;
                        const bsrMonthly = historical?.bsr_monthly;
                        const salesMonthly = historical?.sales_monthly;
                        
                        if ((!bsrMonthly || Object.keys(bsrMonthly).length === 0) && 
                            (!salesMonthly || Object.keys(salesMonthly).length === 0)) return null;
                        
                        // Build 24-month data array (oldest to newest for chart display)
                        const months = Array.from({length: 24}, (_, i) => `month_${24 - i}`);
                        const chartData = months.map((key, idx) => ({
                          month: `${24 - idx}m`,
                          bsr: bsrMonthly?.[key] ?? null,
                          sales: salesMonthly?.[key] ?? null
                        })).filter(d => d.bsr !== null || d.sales !== null);
                        
                        if (chartData.length < 2) return null;
                        
                        // BSR trend calculation
                        const bsrValues = chartData.map(d => d.bsr).filter((v): v is number => v !== null);
                        const bsrFirst = bsrValues[0];
                        const bsrLast = bsrValues[bsrValues.length - 1];
                        const bsrImproved = bsrLast < bsrFirst; // Lower BSR = better
                        const bsrChange = bsrFirst && bsrLast ? Math.abs(bsrFirst - bsrLast) : 0;
                        
                        // Sales trend calculation
                        const salesValues = chartData.map(d => d.sales).filter((v): v is number => v !== null);
                        const salesFirst = salesValues[0];
                        const salesLast = salesValues[salesValues.length - 1];
                        const salesGrowth = salesFirst && salesLast && salesFirst > 0 
                          ? Math.round(((salesLast - salesFirst) / salesFirst) * 100) 
                          : 0;
                        
                        // Calculate domains for dual axis
                        const bsrMin = bsrValues.length > 0 ? Math.min(...bsrValues) * 0.9 : 0;
                        const bsrMax = bsrValues.length > 0 ? Math.max(...bsrValues) * 1.1 : 100;
                        const salesMin = salesValues.length > 0 ? Math.min(...salesValues) * 0.9 : 0;
                        const salesMax = salesValues.length > 0 ? Math.max(...salesValues) * 1.1 : 100;
                        
                        return (
                          <div className="bg-secondary/50 rounded p-1.5">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-[9px] font-semibold flex items-center gap-1">
                                <BarChart3 className="w-3 h-3 text-primary" />
                                Performance (2yr)
                              </p>
                              <div className="flex gap-1">
                                {bsrValues.length >= 2 && (
                                  <Badge variant="secondary" className={`text-[7px] h-4 px-1 ${bsrImproved ? 'bg-chart-4/20 text-chart-4' : 'bg-destructive/20 text-destructive'}`}>
                                    BSR {bsrImproved ? '↑' : '↓'}
                                  </Badge>
                                )}
                                {salesValues.length >= 2 && (
                                  <Badge variant="secondary" className={`text-[7px] h-4 px-1 ${salesGrowth >= 0 ? 'bg-chart-1/20 text-chart-1' : 'bg-destructive/20 text-destructive'}`}>
                                    {salesGrowth >= 0 ? '+' : ''}{salesGrowth}%
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="h-[100px] w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                                  <YAxis 
                                    yAxisId="bsr" 
                                    hide 
                                    reversed 
                                    domain={[bsrMin, bsrMax]} 
                                  />
                                  <YAxis 
                                    yAxisId="sales" 
                                    hide 
                                    orientation="right" 
                                    domain={[salesMin, salesMax]} 
                                  />
                                  <XAxis 
                                    dataKey="month" 
                                    tick={{ fontSize: 7 }} 
                                    axisLine={false} 
                                    tickLine={false}
                                    interval={5}
                                  />
                                  <Tooltip 
                                    contentStyle={{ 
                                      backgroundColor: 'hsl(var(--card))', 
                                      border: '1px solid hsl(var(--border))',
                                      borderRadius: '6px',
                                      fontSize: '9px',
                                      padding: '6px 10px'
                                    }}
                                    labelStyle={{ fontWeight: 600, marginBottom: '4px' }}
                                    labelFormatter={(label) => `${label} ago`}
                                    content={({ active, payload, label }) => {
                                      if (!active || !payload?.length) return null;
                                      const bsrData = payload.find(p => p.dataKey === 'bsr');
                                      const salesData = payload.find(p => p.dataKey === 'sales');
                                      return (
                                        <div className="bg-card border border-border rounded-md p-2 shadow-lg">
                                          <p className="text-[10px] font-semibold mb-1.5 text-foreground">{label} ago</p>
                                          {bsrData?.value != null && (
                                            <div className="flex items-center justify-between gap-3 text-[9px]">
                                              <span className="flex items-center gap-1">
                                                <span className="w-2 h-2 rounded-full bg-chart-4" />
                                                BSR Rank
                                              </span>
                                              <span className="font-semibold">#{Number(bsrData.value).toLocaleString()}</span>
                                            </div>
                                          )}
                                          {salesData?.value != null && (
                                            <div className="flex items-center justify-between gap-3 text-[9px] mt-1">
                                              <span className="flex items-center gap-1">
                                                <span className="w-2 h-2 rounded-full bg-chart-1" />
                                                Monthly Sales
                                              </span>
                                              <span className="font-semibold">{Number(salesData.value).toLocaleString()} units</span>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    }}
                                  />
                                  {bsrValues.length > 0 && (
                                    <Line 
                                      yAxisId="bsr"
                                      type="monotone" 
                                      dataKey="bsr" 
                                      stroke={bsrImproved ? 'hsl(var(--chart-4))' : 'hsl(var(--destructive))'} 
                                      strokeWidth={1.5} 
                                      dot={false} 
                                      activeDot={{ r: 3 }}
                                      name="bsr"
                                    />
                                  )}
                                  {salesValues.length > 0 && (
                                    <Line 
                                      yAxisId="sales"
                                      type="monotone" 
                                      dataKey="sales" 
                                      stroke="hsl(var(--chart-1))" 
                                      strokeWidth={1.5} 
                                      dot={false} 
                                      activeDot={{ r: 3 }}
                                      name="sales"
                                    />
                                  )}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="flex justify-center gap-3 mt-1">
                              <span className="text-[7px] text-muted-foreground flex items-center gap-1">
                                <span className="w-2 h-0.5 bg-chart-4 rounded" /> BSR (↓ better)
                              </span>
                              <span className="text-[7px] text-muted-foreground flex items-center gap-1">
                                <span className="w-2 h-0.5 bg-chart-1 rounded" /> Sales
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* USPs */}
                      <div>
                        {(() => {
                          const usps = getCompetitorUSPs(product);
                          const uspCount = usps?.length || 0;
                          
                          if (!usps || usps.length === 0) {
                            return (
                              <>
                                <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                                  <Award className="w-3 h-3 text-primary" />
                                  USPs
                                  <Badge variant="secondary" className="text-[9px] h-4 ml-auto">
                                    0
                                  </Badge>
                                </p>
                                <p className="text-[10px] text-muted-foreground">Not specified</p>
                              </>
                            );
                          }
                          
                          return (
                            <>
                              <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                                <Award className="w-3 h-3 text-primary" />
                                USPs
                                <Badge variant="secondary" className="text-[9px] h-4 ml-auto">
                                  {uspCount}
                                </Badge>
                              </p>
                              <div className="space-y-0.5 max-h-24 overflow-y-auto pr-1">
                                {usps.map((usp, i) => (
                                  <div key={i} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                                    <span className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                                    <span>{usp}</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          );
                        })()}
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
                                  <span className="w-1 h-1 rounded-full bg-muted-foreground/60" />
                                  <span className="w-1 h-1 rounded-full bg-muted-foreground/60" />
                                  <span className="w-1 h-1 rounded-full bg-muted-foreground/60" />
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
                          <p className="text-[10px] text-muted-foreground max-h-20 overflow-y-auto">
                            {getCompetitorAudience(product) || 'Not specified'}
                          </p>
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
                              return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-1 h-1 rounded-full bg-muted-foreground/60" /><span className="w-1 h-1 rounded-full bg-muted-foreground/60" /><span className="w-1 h-1 rounded-full bg-muted-foreground/60" /></span>;
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
                                return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-1 h-1 rounded-full bg-muted-foreground/60" /><span className="w-1 h-1 rounded-full bg-muted-foreground/60" /><span className="w-1 h-1 rounded-full bg-muted-foreground/60" /></span>;
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
                    
                    {/* View Competitive Analysis Button - Outside card content at bottom */}
                    {competitiveAnalysis && (
                      <div className="px-2 pb-2 md:px-3 md:pb-3 border-t border-border bg-muted/30">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full h-8 text-xs gap-1.5 mt-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCompetitorBrand(product.brand || null);
                            setCompetitorAnalysisOpen(true);
                          }}
                        >
                          <Brain className="w-3 h-3" />
                          View AI Analysis
                        </Button>
                      </div>
                    )}
                  </div>
                  );
                })}

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
        categoryId={categoryId}
        versionInfo={versionInfo}
      />

      {/* Product Detail Modal */}
      <ProductDetailModal 
        product={selectedProduct}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />

      {/* Competitor Analysis Side Panel */}
      <Sheet open={competitorAnalysisOpen} onOpenChange={setCompetitorAnalysisOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {(() => {
            if (!competitiveAnalysis || !selectedCompetitorBrand) return null;
            const compAnalysis = competitiveAnalysis.competitor_comparisons.find(
              c => c.competitor_brand?.toLowerCase() === selectedCompetitorBrand.toLowerCase()
            );
            if (!compAnalysis) return (
              <div className="py-8 text-center text-muted-foreground">
                <SheetHeader>
                  <SheetTitle>vs. {selectedCompetitorBrand}</SheetTitle>
                </SheetHeader>
                <p className="mt-4">No detailed analysis found for this competitor.</p>
                <p className="text-sm mt-2">The AI analysis may not have matched this brand name exactly.</p>
              </div>
            );
            
            const getImpactColor = (impact: string) => {
              switch (impact) {
                case "high": return "bg-chart-4/10 text-chart-4 border-chart-4/20";
                case "medium": return "bg-chart-2/10 text-chart-2 border-chart-2/20";
                default: return "bg-muted text-muted-foreground border-muted";
              }
            };
            
            const getDifficultyColor = (difficulty: string) => {
              switch (difficulty) {
                case "easy": return "bg-chart-4/10 text-chart-4 border-chart-4/20";
                case "moderate": return "bg-chart-2/10 text-chart-2 border-chart-2/20";
                default: return "bg-destructive/10 text-destructive border-destructive/20";
              }
            };
            
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-primary" />
                    vs. {compAnalysis.competitor_brand}
                  </SheetTitle>
                  <SheetDescription className="line-clamp-2">
                    {compAnalysis.competitor_product}
                  </SheetDescription>
                </SheetHeader>
                
                <div className="space-y-6 pt-6">
                  {/* Displacement Potential */}
                  <div className="p-4 rounded-lg bg-muted/30 border">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">Displacement Potential</p>
                      <span className="text-2xl font-bold">{compAnalysis.displacement_potential}/10</span>
                    </div>
                    <Progress value={compAnalysis.displacement_potential * 10} className="h-2" />
                  </div>
                  
                  {/* Where We Win */}
                  <div>
                    <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-chart-4">
                      <TrendingUp className="w-4 h-4" />
                      Where We Win
                    </div>
                    <div className="space-y-2">
                      {compAnalysis.where_we_win.map((win, i) => (
                        <div key={i} className="p-3 rounded-lg bg-chart-4/5 border border-chart-4/10">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{win.area}</span>
                            <Badge variant="outline" className={getImpactColor(win.impact)}>
                              {win.impact} impact
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{win.our_advantage}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Where They Win */}
                  <div>
                    <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-chart-2">
                      <TrendingDown className="w-4 h-4" />
                      Where They Win
                    </div>
                    <div className="space-y-2">
                      {compAnalysis.where_they_win.map((loss, i) => (
                        <div key={i} className="p-3 rounded-lg bg-chart-2/5 border border-chart-2/10">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{loss.area}</span>
                            <Badge variant="outline" className={getDifficultyColor(loss.difficulty)}>
                              {loss.difficulty} to match
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{loss.their_advantage}</p>
                          <p className="text-sm flex items-center gap-1.5">
                            <ArrowRight className="w-3.5 h-3.5 text-primary" />
                            <span className="text-primary">{loss.how_to_match}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Verdict */}
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-sm font-medium mb-1">Overall Verdict</p>
                    <p className="text-sm text-foreground">{compAnalysis.overall_verdict}</p>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </>
  );
}
