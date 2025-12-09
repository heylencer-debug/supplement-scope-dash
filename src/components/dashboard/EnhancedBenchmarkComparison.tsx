import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Star, TrendingUp, Pill, Target, MessageSquare, Package, Users, Megaphone, AlertTriangle, CheckCircle, XCircle, Palette, Search, Filter, X, Trophy, ThumbsUp, ThumbsDown, Check, FlaskConical, Scale, Award, Beaker, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import { useProducts, Product } from "@/hooks/useProducts";
import ProductDetailModal from "@/components/ProductDetailModal";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
interface EnhancedBenchmarkComparisonProps {
  categoryId?: string;
  analysisData?: {
    key_insights?: {
      go_to_market?: {
        positioning?: string;
        messaging?: string[];
      };
    };
    analysis_1_category_scores?: {
      product_development?: {
        formulation?: {
          recommended_ingredients?: Array<string | { ingredient?: string; name?: string }>;
          form_factor?: string;
          key_features?: string[];
          serving_size?: string;
        };
      };
      customer_insights?: {
        buyer_profile?: string;
        love_most?: string[];
        pain_points?: Array<{ pain_point?: string; frequency?: number }>;
        unmet_needs?: string[];
      };
    };
    top_strengths?: Array<{ strength?: string; description?: string }>;
    top_weaknesses?: Array<{ weakness?: string; description?: string }>;
    formula_brief?: {
      key_differentiators?: string[];
      risk_factors?: string[];
    };
  } | null;
  isLoading?: boolean;
}

const MAX_COMPETITORS = 3;

// Nutrient Comparison Table Component
interface NutrientComparisonTableProps {
  ourDosages: Array<{ ingredient: string; dosage?: string; rationale?: string }>;
  competitors: Product[];
  getCompetitorNutrients: (product: Product) => Array<{ name: string; amount: number | null; unit: string; dailyValue?: string | number }>;
}

function NutrientComparisonTable({ ourDosages, competitors, getCompetitorNutrients }: NutrientComparisonTableProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('chart');

  // Build unified nutrient list from all sources
  const comparisonData = useMemo(() => {
    // Collect all unique nutrient names
    const nutrientMap = new Map<string, {
      ourDosage: string | null;
      competitors: Array<{ brand: string; amount: string | null; dailyValue?: string | number }>;
    }>();

    // Add our recommended dosages
    ourDosages.forEach(item => {
      const normalizedName = item.ingredient.toLowerCase().trim();
      nutrientMap.set(normalizedName, {
        ourDosage: item.dosage || null,
        competitors: []
      });
    });

    // Add competitor nutrients
    competitors.forEach(product => {
      const nutrients = getCompetitorNutrients(product);
      nutrients.forEach(nutrient => {
        const normalizedName = nutrient.name.toLowerCase().trim();
        
        // Check if this nutrient or similar exists
        let matchedKey: string | null = null;
        for (const [key] of nutrientMap) {
          if (normalizedName.includes(key) || key.includes(normalizedName) ||
              normalizedName.split(' ').some(word => key.includes(word) && word.length > 3)) {
            matchedKey = key;
            break;
          }
        }

        const competitorEntry = {
          brand: product.brand || 'Unknown',
          amount: nutrient.amount !== null ? `${nutrient.amount}${nutrient.unit}` : null,
          dailyValue: nutrient.dailyValue
        };

        if (matchedKey) {
          nutrientMap.get(matchedKey)!.competitors.push(competitorEntry);
        } else {
          // Add new nutrient from competitor
          nutrientMap.set(normalizedName, {
            ourDosage: null,
            competitors: [competitorEntry]
          });
        }
      });
    });

    // Convert to array and sort by whether we have a dosage first
    return Array.from(nutrientMap.entries())
      .map(([name, data]) => ({
        name: name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        ...data
      }))
      .sort((a, b) => {
        if (a.ourDosage && !b.ourDosage) return -1;
        if (!a.ourDosage && b.ourDosage) return 1;
        return 0;
      })
      .slice(0, 15); // Limit to 15 rows
  }, [ourDosages, competitors, getCompetitorNutrients]);

  // Build chart data - extract numeric values for visualization
  const chartData = useMemo(() => {
    const parseNumeric = (value: string | null): number => {
      if (!value) return 0;
      const match = value.match(/[\d.]+/);
      return match ? parseFloat(match[0]) : 0;
    };

    return comparisonData
      .filter(row => row.ourDosage || row.competitors.some(c => c.amount))
      .slice(0, 8) // Limit to 8 nutrients for readability
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
  }, [comparisonData, competitors]);

  const chartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {
      'Our Concept': {
        label: 'Our Concept',
        color: 'hsl(var(--chart-2))',
      },
    };
    
    competitors.forEach((p, i) => {
      const key = `#${i + 1} ${p.brand?.substring(0, 10) || 'Unknown'}`;
      const colors = ['hsl(var(--chart-1))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];
      config[key] = {
        label: p.brand || 'Unknown',
        color: colors[i % colors.length],
      };
    });
    
    return config;
  }, [competitors]);

  if (comparisonData.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <div className="cursor-pointer hover:opacity-80 transition-opacity">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Scale className="w-4 h-4 text-primary" />
                  Nutrient Dosage Comparison
                </CardTitle>
                <CardDescription className="text-xs">
                  Side-by-side comparison of ingredient amounts across products
                </CardDescription>
              </div>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <div className="flex items-center bg-muted rounded-lg p-0.5">
                <Button
                  variant={viewMode === 'chart' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={(e) => { e.stopPropagation(); setViewMode('chart'); }}
                >
                  <BarChart3 className="w-3 h-3 mr-1" />
                  Chart
                </Button>
                <Button
                  variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={(e) => { e.stopPropagation(); setViewMode('table'); }}
                >
                  <Scale className="w-3 h-3 mr-1" />
                  Table
                </Button>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {viewMode === 'chart' ? (
              /* BAR CHART VIEW */
              <div className="space-y-4">
                <ChartContainer config={chartConfig} className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={100} 
                        tick={{ fontSize: 10 }} 
                        className="text-muted-foreground"
                      />
                      <ChartTooltip 
                        content={<ChartTooltipContent />}
                        cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                      />
                      <Legend 
                        wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                      />
                      <Bar 
                        dataKey="Our Concept" 
                        fill="hsl(var(--chart-2))" 
                        radius={[0, 4, 4, 0]}
                        barSize={12}
                      />
                      {competitors.map((p, i) => {
                        const key = `#${i + 1} ${p.brand?.substring(0, 10) || 'Unknown'}`;
                        const colors = ['hsl(var(--chart-1))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];
                        return (
                          <Bar 
                            key={p.id}
                            dataKey={key} 
                            fill={colors[i % colors.length]} 
                            radius={[0, 4, 4, 0]}
                            barSize={12}
                          />
                        );
                      })}
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
                
                {/* Chart Legend Note */}
                <p className="text-[10px] text-muted-foreground text-center">
                  Values shown in mg (or original units). Larger bars indicate higher dosages.
                </p>
              </div>
            ) : (
              /* TABLE VIEW */
              <div className="space-y-3">
                <ScrollArea className="w-full">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-[180px] text-xs font-semibold">Nutrient</TableHead>
                        <TableHead className="text-xs font-semibold text-center bg-chart-2/10 border-x border-chart-2/20">
                          <div className="flex items-center justify-center gap-1">
                            <Target className="w-3 h-3 text-chart-2" />
                            Our Concept
                          </div>
                        </TableHead>
                        {competitors.map((p, i) => (
                          <TableHead key={p.id} className="text-xs font-semibold text-center min-w-[100px]">
                            <div className="truncate max-w-[120px]" title={p.brand || 'Unknown'}>
                              #{i + 1} {p.brand || 'Unknown'}
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comparisonData.map((row, idx) => (
                        <TableRow key={idx} className="hover:bg-muted/30">
                          <TableCell className="text-xs font-medium py-2">
                            {row.name}
                          </TableCell>
                          <TableCell className="text-center bg-chart-2/5 border-x border-chart-2/10 py-2">
                            {row.ourDosage ? (
                              <Badge variant="secondary" className="text-[10px] bg-chart-2/20 text-chart-2 font-semibold">
                                {row.ourDosage}
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          {competitors.map((p, i) => {
                            const compData = row.competitors.find(c => c.brand === (p.brand || 'Unknown'));
                            return (
                              <TableCell key={p.id} className="text-center py-2">
                                {compData?.amount ? (
                                  <div className="flex flex-col items-center gap-0.5">
                                    <Badge variant="outline" className="text-[10px] font-medium">
                                      {compData.amount}
                                    </Badge>
                                    {compData.dailyValue && (
                                      <span className="text-[9px] text-muted-foreground">
                                        {compData.dailyValue}% DV
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
                
                {/* Legend */}
                <div className="flex items-center gap-4 pt-3 border-t text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-chart-2" />
                    <span>Our Recommended</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>DV = Daily Value</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>— = Not specified</span>
                  </div>
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
  
  // All products sorted by reviews for selection pool
  const allProductsSorted = useMemo(() => 
    [...(products || [])].sort((a, b) => (b.reviews || 0) - (a.reviews || 0)),
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

  const getOurMessaging = (): string => {
    const messaging = analysisData?.key_insights?.go_to_market?.messaging;
    if (!messaging || !Array.isArray(messaging) || messaging.length === 0) return 'Pending analysis';
    return messaging[0];
  };

  const getOurBuyerProfile = (): string => {
    const profile = analysisData?.analysis_1_category_scores?.customer_insights?.buyer_profile;
    if (!profile) return 'Pending analysis';
    return profile;
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

  // Get competitor nutrients from all_nutrients or supplement_facts_complete
  const getCompetitorNutrients = (product: Product): Array<{ name: string; amount: number | null; unit: string; dailyValue?: string | number }> => {
    // Try all_nutrients first (preferred - normalized data)
    const allNutrients = product.all_nutrients as Array<{ name: string; amount: number | null; unit: string; daily_value_percent?: string | number }> | null;
    if (allNutrients && allNutrients.length > 0) {
      return allNutrients.slice(0, 8).map(n => ({
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
      return sfNutrients.slice(0, 8).map(n => ({
        name: n.name,
        amount: n.amount,
        unit: n.unit,
        dailyValue: n.daily_value_percent
      }));
    }
    
    return [];
  };

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

  // Get Our Concept recommended ingredients with dosages from analysis
  const getOurRecommendedDosages = (): Array<{ ingredient: string; dosage?: string; rationale?: string }> => {
    const ingredients = analysisData?.analysis_1_category_scores?.product_development?.formulation?.recommended_ingredients;
    if (!ingredients || !Array.isArray(ingredients)) return [];
    
    return ingredients.slice(0, 8).map(ing => {
      if (typeof ing === 'string') {
        // Parse dosage from string like "Magnesium Glycinate 400mg"
        const match = ing.match(/^(.+?)\s*(\d+\s*(?:mg|mcg|iu|g|ml))?$/i);
        return {
          ingredient: match ? match[1].trim() : ing,
          dosage: match?.[2] || undefined
        };
      }
      const ingObj = ing as Record<string, unknown>;
      return {
        ingredient: (ingObj.ingredient as string) || (ingObj.name as string) || 'Unknown',
        dosage: (ingObj.dosage as string) || (ingObj.amount as string) || undefined,
        rationale: (ingObj.rationale as string) || undefined
      };
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <Package className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                Benchmark Comparison
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
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
        <CardContent className="px-2 md:px-6">
          <div className="flex gap-2 md:gap-3">
            {/* Our Concept Column - Fixed */}
            <div className="w-[280px] md:w-[320px] shrink-0 rounded-lg border-2 border-chart-2/50 bg-gradient-to-b from-chart-2/10 to-background dark:from-chart-2/20 overflow-hidden">
              <div className="bg-gradient-to-r from-chart-2 to-chart-2/80 px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-white/20 flex items-center justify-center">
                    <Target className="w-3 h-3 md:w-4 md:h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-xs md:text-sm truncate">OUR CONCEPT</p>
                    <p className="text-white/80 text-[10px] md:text-xs truncate">Strategy</p>
                  </div>
                </div>
              </div>
              
              <div className="p-2 md:p-3 space-y-3">
                <div className="w-full aspect-square rounded-lg bg-gradient-to-br from-chart-2/20 to-chart-2/10 dark:from-chart-2/30 dark:to-chart-2/20 flex items-center justify-center">
                  <div className="text-center">
                    <Target className="w-10 h-10 md:w-12 md:h-12 text-chart-2/50 mx-auto" />
                    <p className="text-[10px] text-chart-2/70 mt-1">Your Product</p>
                  </div>
                </div>

                {/* Positioning */}
                <div>
                  <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3 text-primary" />
                    Positioning
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {getOurPositioning()}
                  </p>
                </div>

                {/* Ingredients */}
                <div>
                  <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                    <Pill className="w-3 h-3 text-chart-4" />
                    Key Ingredients
                    <Badge variant="secondary" className="text-[9px] h-4 ml-auto">
                      {getOurIngredients().length}
                    </Badge>
                  </p>
                  <div className="space-y-0.5 max-h-24 overflow-y-auto pr-1">
                    {getOurIngredients().map((ing, i) => {
                      const hasMatch = isOurIngredientInCompetitors(ing);
                      return (
                        <div key={i} className={`flex items-start gap-1 text-[10px] ${hasMatch ? 'text-chart-4 font-medium' : 'text-muted-foreground'}`}>
                          {hasMatch ? (
                            <Check className="w-3 h-3 text-chart-4 mt-0.5 shrink-0" />
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
                <div className="bg-primary/5 dark:bg-primary/10 rounded-lg p-2 border border-primary/20 space-y-2">
                  <p className="text-[10px] font-semibold flex items-center gap-1 text-primary">
                    <FlaskConical className="w-3 h-3" />
                    Formulation Details
                  </p>
                  
                  {/* Specs Grid */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {(() => {
                      const specs = getOurFormulationSpecs();
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
                            <p className="text-[10px] font-medium">{specs.packagingType || getOurFormFactor()}</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Recommended Dosages */}
                  {getOurRecommendedDosages().length > 0 && (
                    <div>
                      <p className="text-[9px] font-medium text-muted-foreground mb-1 flex items-center gap-1">
                        <Beaker className="w-2.5 h-2.5" />
                        Recommended Dosages
                      </p>
                      <div className="space-y-0.5 max-h-20 overflow-y-auto">
                        {getOurRecommendedDosages().map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-[10px] gap-1">
                            <span className="text-muted-foreground truncate flex-1">{item.ingredient}</span>
                            {item.dosage && (
                              <Badge variant="secondary" className="text-[9px] h-4 shrink-0">{item.dosage}</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Flavors & Form Factor */}
                <div>
                  <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                    <Palette className="w-3 h-3 text-chart-5" />
                    Flavors & Form
                  </p>
                  <span className="inline-flex items-center px-2 py-0.5 text-[10px] rounded-full bg-chart-5/10 text-chart-5">
                    {getOurFormFactor()}
                  </span>
                </div>

                {/* Marketing Strategy */}
                <div>
                  <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                    <Megaphone className="w-3 h-3 text-chart-3" />
                    Marketing Strategy
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {getOurMessaging()}
                  </p>
                </div>

                {/* Target Audience */}
                <div>
                  <p className="text-[10px] font-semibold mb-1 flex items-center gap-1">
                    <Users className="w-3 h-3 text-primary" />
                    Target Audience
                  </p>
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground max-h-20 overflow-y-auto">
                      {getOurBuyerProfile()}
                    </p>
                    {getOurMotivation() && (
                      <div className="bg-primary/10 dark:bg-primary/20 rounded p-1.5 border border-primary/20 dark:border-primary/30">
                        <p className="text-[9px] font-medium text-primary mb-0.5">Primary Motivation</p>
                        <p className="text-[10px] text-muted-foreground max-h-16 overflow-y-auto">
                          {getOurMotivation()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Our Strengths */}
                <div className="bg-chart-4/10 dark:bg-chart-4/20 rounded-lg p-2 border border-chart-4/20 dark:border-chart-4/30">
                  <p className="text-[10px] font-semibold mb-1 flex items-center gap-1 text-chart-4">
                    <ThumbsUp className="w-3 h-3" />
                    Our Strengths
                  </p>
                  <div className="space-y-0.5">
                    {getOurStrengths().map((strength, i) => (
                      <div key={i} className="flex items-start gap-1 text-[10px] text-foreground">
                        <span className="w-1 h-1 rounded-full bg-chart-4 mt-1.5 shrink-0" />
                        <span>{strength}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Our Risks/Challenges */}
                <div className="bg-chart-2/10 dark:bg-chart-2/20 rounded-lg p-2 border border-chart-2/20 dark:border-chart-2/30">
                  <p className="text-[10px] font-semibold mb-1 flex items-center gap-1 text-chart-2">
                    <AlertTriangle className="w-3 h-3" />
                    Risks & Challenges
                  </p>
                  <div className="space-y-0.5">
                    {getOurWeaknesses().map((weakness, i) => (
                      <div key={i} className="flex items-start gap-1 text-[10px] text-foreground">
                        <span className="w-1 h-1 rounded-full bg-chart-2 mt-1.5 shrink-0" />
                        <span>{weakness}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Competitor Columns - Scrollable */}
            <ScrollArea className="flex-1">
              <div className="flex gap-2 md:gap-3 pb-4">
                {displayedProducts.map((product, idx) => (
                  <div 
                    key={product.id} 
                    className="w-[280px] md:w-[320px] shrink-0 rounded-lg border border-border bg-card overflow-hidden cursor-pointer transition-all hover:border-primary hover:shadow-md"
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

                    <div className="p-2 md:p-3 space-y-3">
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

      {/* NUTRIENT DOSAGE COMPARISON TABLE */}
      <NutrientComparisonTable 
        ourDosages={getOurRecommendedDosages()}
        competitors={displayedProducts}
        getCompetitorNutrients={getCompetitorNutrients}
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
