import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Brain, RefreshCw, CheckCircle, AlertTriangle, XCircle, Sparkles,
  ArrowUp, ArrowDown, Minus, Plus, Check, Target, Shield, TrendingUp,
  Clock, Zap, Users, FlaskConical, Link2, AlertCircle, Lightbulb,
  ChevronRight, Beaker, Table2, Package, FileText, Info, DollarSign
} from "lucide-react";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from "recharts";
import { IngredientAnalysis } from "@/hooks/useIngredientAnalysis";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AIAnalysisResultsProps {
  analysis: IngredientAnalysis;
  onRefresh: () => void;
  isLoading: boolean;
}

export function AIAnalysisResults({ analysis, onRefresh, isLoading }: AIAnalysisResultsProps) {
  const [activeTab, setActiveTab] = useState<'ingredients' | 'formulation' | 'summary' | 'clinical' | 'customer' | 'competitive' | 'roadmap'>('ingredients');

  // Guard against incomplete/error analysis data
  if (!analysis?.summary || !analysis?.charts || !analysis?.ingredients) {
    return (
      <div className="bg-gradient-to-br from-primary/5 via-chart-5/5 to-chart-4/5 rounded-xl border border-primary/20 p-6 text-center">
        <Brain className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground">Analysis data is incomplete or still processing</p>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isLoading} className="mt-3">
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
          Retry Analysis
        </Button>
      </div>
    );
  }

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

  const getAdequacyColor = (adequacy: string) => {
    switch (adequacy) {
      case 'optimal': return 'bg-chart-4/10 text-chart-4 border-chart-4/30';
      case 'adequate': return 'bg-chart-3/10 text-chart-3 border-chart-3/30';
      case 'suboptimal': return 'bg-chart-2/10 text-chart-2 border-chart-2/30';
      case 'insufficient': return 'bg-destructive/10 text-destructive border-destructive/30';
      default: return 'bg-muted';
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'text-chart-4';
      case 'medium': return 'text-chart-2';
      case 'low': return 'text-muted-foreground';
      default: return '';
    }
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'easy': return 'bg-chart-4/10 text-chart-4';
      case 'moderate': return 'bg-chart-2/10 text-chart-2';
      case 'complex': return 'bg-destructive/10 text-destructive';
      default: return 'bg-muted';
    }
  };

  const getPhaseColor = (phase: number) => {
    switch (phase) {
      case 1: return 'bg-chart-4 text-white';
      case 2: return 'bg-chart-2 text-white';
      case 3: return 'bg-primary text-white';
      default: return 'bg-muted';
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'border-chart-4/50 text-chart-4';
      case 'medium': return 'border-chart-2/50 text-chart-2';
      case 'low': return 'border-muted-foreground/50 text-muted-foreground';
      default: return '';
    }
  };

  // Prepare SWOT data for radar chart
  const swotRadarData = analysis.swot && analysis.swot.strengths && analysis.swot.weaknesses && analysis.swot.opportunities && analysis.swot.threats ? [
    { subject: 'Strengths', value: analysis.swot.strengths.length, fullMark: 5 },
    { subject: 'Weaknesses', value: analysis.swot.weaknesses.length, fullMark: 5 },
    { subject: 'Opportunities', value: analysis.swot.opportunities.length, fullMark: 5 },
    { subject: 'Threats', value: analysis.swot.threats.length, fullMark: 5 },
  ] : [];

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
              AI Formulation Intelligence
              <Badge className={`${getAssessmentColor(analysis.summary.overall_assessment)} text-[10px]`}>
                {analysis.summary.overall_assessment}
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              {analysis.ingredients.length} ingredients • {analysis.clinical_analysis?.synergy_pairs?.length || 0} synergies • {analysis.priority_roadmap?.length || 0} actions
            </p>
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
      <div className="flex items-center bg-muted rounded-lg p-0.5 overflow-x-auto">
        {[
          { id: 'ingredients', label: 'Ingredients', icon: Table2 },
          { id: 'formulation', label: 'Formulation', icon: Package },
          { id: 'summary', label: 'Summary', icon: Target },
          { id: 'clinical', label: 'Clinical', icon: FlaskConical },
          { id: 'customer', label: 'Customer', icon: Users },
          { id: 'competitive', label: 'Competitive', icon: Shield },
          { id: 'roadmap', label: 'Roadmap', icon: Clock },
        ].map((tab) => (
          <Button 
            key={tab.id}
            variant={activeTab === tab.id ? 'secondary' : 'ghost'} 
            size="sm" 
            className="flex-1 h-7 text-xs gap-1 min-w-fit"
            onClick={() => setActiveTab(tab.id as any)}
          >
            <tab.icon className="w-3 h-3" />
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Ingredients Tab - NEW */}
      {activeTab === 'ingredients' && analysis.ingredient_comparison_table && (
        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-6 gap-2">
            <div className="bg-card rounded-lg p-3 border border-border/50 text-center">
              <div className="text-xl font-bold text-primary">{analysis.ingredient_comparison_table.summary.total_our_ingredients}</div>
              <div className="text-[9px] text-muted-foreground">Our Ingredients</div>
            </div>
            <div className="bg-card rounded-lg p-3 border border-border/50 text-center">
              <div className="text-xl font-bold text-muted-foreground">{analysis.ingredient_comparison_table.summary.total_competitor_avg}</div>
              <div className="text-[9px] text-muted-foreground">Comp. Avg</div>
            </div>
            <div className="bg-chart-4/10 rounded-lg p-3 border border-chart-4/30 text-center">
              <div className="text-xl font-bold text-chart-4">{analysis.ingredient_comparison_table.summary.overlap_count}</div>
              <div className="text-[9px] text-chart-4">In All</div>
            </div>
            <div className="bg-primary/10 rounded-lg p-3 border border-primary/30 text-center">
              <div className="text-xl font-bold text-primary">{analysis.ingredient_comparison_table.summary.unique_to_us_count}</div>
              <div className="text-[9px] text-primary">Unique to Us</div>
            </div>
            <div className="bg-chart-5/10 rounded-lg p-3 border border-chart-5/30 text-center">
              <div className="text-xl font-bold text-chart-5">{analysis.ingredient_comparison_table.summary.alternatives_detected_count || 0}</div>
              <div className="text-[9px] text-chart-5">🔄 Alternatives</div>
            </div>
            <div className="bg-destructive/10 rounded-lg p-3 border border-destructive/30 text-center">
              <div className="text-xl font-bold text-destructive">{analysis.ingredient_comparison_table.summary.missing_from_us_count}</div>
              <div className="text-[9px] text-destructive">Missing</div>
            </div>
          </div>

          {/* Assessment */}
          <div className="bg-card rounded-lg p-3 border border-border/50">
            <p className="text-xs text-muted-foreground">{analysis.ingredient_comparison_table.summary.overall_assessment}</p>
          </div>

          {/* Comparison Table */}
          <div className="bg-card rounded-lg border border-border/50">
            <div className="max-h-[500px] overflow-auto">
              <table className="w-full text-xs min-w-[800px]">
                <thead className="bg-muted sticky top-0 z-10">
                  <tr>
                    <th className="text-left p-2 font-medium text-foreground">Ingredient</th>
                    <th className="text-left p-2 font-medium text-foreground">Category</th>
                    <th className="text-center p-2 font-medium text-primary">Our Concept</th>
                    {analysis.ingredient_comparison_table.competitors.map((c, idx) => (
                      <th key={idx} className="text-center p-2 font-medium text-muted-foreground">
                        {c.brand || `Comp ${idx + 1}`}
                      </th>
                    ))}
                    <th className="text-center p-2 font-medium text-foreground">Status</th>
                    <th className="text-left p-2 font-medium text-foreground">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Group by category */}
                  {['primary_active', 'secondary_active', 'tertiary_active', 'excipient', 'other'].map(category => {
                    const normalizeCategory = (raw: unknown): 'primary_active' | 'secondary_active' | 'tertiary_active' | 'excipient' | 'other' => {
                      const v = typeof raw === 'string' ? raw : '';
                      if (v === 'primary_active' || v === 'secondary_active' || v === 'tertiary_active' || v === 'excipient' || v === 'other') return v;
                      // AI sometimes returns a functional group label (e.g. "Immune Support") in `category`.
                      // Treat unknown categories as "other" so rows still render.
                      return 'other';
                    };

                    const categoryRows = analysis.ingredient_comparison_table?.rows.filter(r => normalizeCategory((r as any).category) === category) || [];
                    if (categoryRows.length === 0) return null;
                    
                    const categoryLabels: Record<string, { label: string; color: string; icon: string }> = {
                      'primary_active': { label: 'Primary Actives', color: 'bg-chart-4/10 text-chart-4', icon: '💊' },
                      'secondary_active': { label: 'Secondary Actives', color: 'bg-chart-3/10 text-chart-3', icon: '🧪' },
                      'tertiary_active': { label: 'Tertiary Actives', color: 'bg-chart-5/10 text-chart-5', icon: '🔬' },
                      'excipient': { label: 'Excipients', color: 'bg-muted text-muted-foreground', icon: '⚗️' },
                      'other': { label: 'Other Ingredients', color: 'bg-muted text-muted-foreground', icon: '📦' },
                    };
                    
                    const catInfo = categoryLabels[category];
                    
                    return (
                      <React.Fragment key={category}>
                        {/* Category Header */}
                        <tr className={`${catInfo.color} border-t border-border`}>
                          <td colSpan={7} className="p-2 font-medium">
                            <span className="mr-1">{catInfo.icon}</span>
                            {catInfo.label} ({categoryRows.length})
                          </td>
                        </tr>
                        {/* Category Rows */}
                        {categoryRows.map((row, idx) => {
                          const statusStyles: Record<string, string> = {
                            'in_all': 'bg-chart-4/20 text-chart-4 border-chart-4/30',
                            'unique_to_us': 'bg-primary/20 text-primary border-primary/30',
                            'missing_from_us': 'bg-destructive/20 text-destructive border-destructive/30',
                            'partial': 'bg-chart-2/20 text-chart-2 border-chart-2/30',
                            'alternative_used': 'bg-chart-5/20 text-chart-5 border-chart-5/30',
                          };
                          const statusLabels: Record<string, string> = {
                            'in_all': '✅ All',
                            'unique_to_us': '🟡 Unique',
                            'missing_from_us': '🔴 Missing',
                            'partial': '⚪ Partial',
                            'alternative_used': '🔄 Alt',
                          };
                          
                          // Helper to render competitor cell with alternative detection
                          const renderCompetitorCell = (competitor: any) => {
                            if (!competitor) return <span className="text-muted-foreground">—</span>;
                            
                            if (competitor.present) {
                              return <span className="text-foreground">{competitor.amount || '✓'}</span>;
                            }
                            
                            if (competitor.uses_alternative && competitor.alternative_name) {
                              return (
                                <div className="text-center">
                                  <span className="text-chart-5 font-medium text-[10px]">🔄 {competitor.alternative_name}</span>
                                  {competitor.alternative_amount && (
                                    <span className="text-[9px] text-muted-foreground block">{competitor.alternative_amount}</span>
                                  )}
                                </div>
                              );
                            }
                            
                            return <span className="text-muted-foreground">—</span>;
                          };
                          
                          return (
                            <tr key={idx} className="border-t border-border/30 hover:bg-muted/30">
                              <td className="p-2 font-medium text-foreground">
                                <div>
                                  {row.ingredient}
                                  {row.functional_group && (
                                    <span className="text-[9px] text-muted-foreground block capitalize">{row.functional_group}</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-2 text-muted-foreground capitalize">{typeof (row as any).category === 'string' ? (row as any).category : 'Other'}</td>
                              <td className="p-2 text-center">
                                {row.our_concept.amount ? (
                                  <div>
                                    <span className="font-medium text-primary">{row.our_concept.amount}</span>
                                    {row.our_concept.form && (
                                      <span className="text-[9px] text-muted-foreground block">{row.our_concept.form}</span>
                                    )}
                                    {(row.our_concept as any).function && (
                                      <span className="text-[8px] text-muted-foreground/70 block italic">{(row.our_concept as any).function}</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="p-2 text-center">{renderCompetitorCell(row.competitor_1)}</td>
                              <td className="p-2 text-center">{renderCompetitorCell(row.competitor_2)}</td>
                              <td className="p-2 text-center">{renderCompetitorCell(row.competitor_3)}</td>
                              <td className="p-2 text-center">
                                <Badge variant="outline" className={`text-[8px] ${statusStyles[row.status] || statusStyles['partial']}`}>
                                  {statusLabels[row.status] || row.status}
                                </Badge>
                              </td>
                              <td className="p-2 text-[10px] text-muted-foreground max-w-[200px]">{row.comparison_note}</td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Ingredients Tab - Empty State */}
      {activeTab === 'ingredients' && !analysis.ingredient_comparison_table && (
        <div className="text-center py-8 text-muted-foreground">
          <Table2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No ingredient comparison data available</p>
          <p className="text-xs">Try refreshing the analysis</p>
        </div>
      )}

      {/* Formulation Details Tab - Raw Competitor Data */}
      {activeTab === 'formulation' && (
        <div className="space-y-4">
          {analysis.competitor_details && analysis.competitor_details.length > 0 ? (
            <>
              {/* Metadata Header - What was sent to AI */}
              {analysis.data_sent_to_ai && (
                <div className="bg-primary/5 rounded-lg p-3 border border-primary/20">
                  <p className="text-xs font-medium text-primary mb-2 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Data Sent to AI
                  </p>
                  <div className="flex flex-wrap gap-2 text-[10px]">
                    <Badge variant="outline" className="bg-background">
                      {analysis.data_sent_to_ai.competitor_count} competitors
                    </Badge>
                    <Badge variant="outline" className="bg-background">
                      {analysis.data_sent_to_ai.competitor_label}
                    </Badge>
                    <Badge variant="outline" className={`bg-background ${analysis.data_sent_to_ai.formula_brief_included ? 'text-chart-4' : 'text-muted-foreground'}`}>
                      Formula Brief: {analysis.data_sent_to_ai.formula_brief_included ? 'Included' : 'Not available'}
                    </Badge>
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-primary" />
                <p className="text-sm font-medium text-foreground">
                  Raw Competitor Formulation Data ({analysis.competitor_details.length} products)
                </p>
              </div>
              
              <ScrollArea className="h-[500px] pr-2">
                <div className="space-y-4">
                  {analysis.competitor_details.map((comp, idx) => (
                    <div key={idx} className="bg-card rounded-lg border border-border/50 overflow-hidden">
                      {/* Competitor Header */}
                      <div className="bg-muted/50 p-3 border-b border-border/30">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground">{comp.brand}</p>
                            <p className="text-xs text-muted-foreground line-clamp-1">{comp.title}</p>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            {comp.price && (
                              <span className="flex items-center gap-1 text-chart-4">
                                <DollarSign className="w-3 h-3" />
                                {comp.price.toFixed(2)}
                              </span>
                            )}
                            {comp.monthly_sales && (
                              <span className="text-muted-foreground">
                                {comp.monthly_sales.toLocaleString()} sales/mo
                              </span>
                            )}
                            {comp.age_months && (
                              <Badge variant="outline" className="text-[9px]">
                                {comp.age_months} months old
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-3 space-y-3">
                        {/* Supplement Facts Complete */}
                        {comp.supplement_facts_complete && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-foreground flex items-center gap-1">
                              <FileText className="w-3 h-3 text-primary" />
                              Supplement Facts
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                              {comp.supplement_facts_complete.serving_size && (
                                <div className="bg-muted/30 rounded p-2">
                                  <span className="text-muted-foreground">Serving Size:</span>
                                  <p className="text-foreground font-medium">{comp.supplement_facts_complete.serving_size}</p>
                                </div>
                              )}
                              {comp.supplement_facts_complete.manufacturer && (
                                <div className="bg-muted/30 rounded p-2">
                                  <span className="text-muted-foreground">Manufacturer:</span>
                                  <p className="text-foreground font-medium">{comp.supplement_facts_complete.manufacturer}</p>
                                </div>
                              )}
                            </div>
                            
                            {/* Active Ingredients */}
                            {comp.supplement_facts_complete.active_ingredients && 
                             Array.isArray(comp.supplement_facts_complete.active_ingredients) && 
                             comp.supplement_facts_complete.active_ingredients.length > 0 && (
                              <div className="bg-chart-4/5 rounded-lg p-2 border border-chart-4/20">
                                <p className="text-[10px] font-medium text-chart-4 mb-1">Active Ingredients</p>
                                <div className="flex flex-wrap gap-1">
                                  {comp.supplement_facts_complete.active_ingredients.slice(0, 10).map((ing: any, i: number) => (
                                    <Badge key={i} variant="outline" className="text-[8px] bg-background">
                                      {typeof ing === 'string' ? ing : ing.name || ing.ingredient || JSON.stringify(ing).substring(0, 30)}
                                      {ing.amount && ` - ${ing.amount}`}
                                    </Badge>
                                  ))}
                                  {comp.supplement_facts_complete.active_ingredients.length > 10 && (
                                    <Badge variant="outline" className="text-[8px] bg-background">
                                      +{comp.supplement_facts_complete.active_ingredients.length - 10} more
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Proprietary Blends */}
                            {comp.supplement_facts_complete.proprietary_blends && (
                              <div className="bg-chart-2/5 rounded-lg p-2 border border-chart-2/20">
                                <p className="text-[10px] font-medium text-chart-2 mb-1">Proprietary Blends</p>
                                <p className="text-[9px] text-foreground">
                                  {typeof comp.supplement_facts_complete.proprietary_blends === 'string' 
                                    ? comp.supplement_facts_complete.proprietary_blends 
                                    : JSON.stringify(comp.supplement_facts_complete.proprietary_blends).substring(0, 200)}
                                </p>
                              </div>
                            )}
                            
                            {/* Label Claims */}
                            {comp.supplement_facts_complete.claims_on_label && 
                             Array.isArray(comp.supplement_facts_complete.claims_on_label) &&
                             comp.supplement_facts_complete.claims_on_label.length > 0 && (
                              <div className="bg-primary/5 rounded-lg p-2 border border-primary/20">
                                <p className="text-[10px] font-medium text-primary mb-1">Label Claims</p>
                                <div className="flex flex-wrap gap-1">
                                  {comp.supplement_facts_complete.claims_on_label.map((claim: string, i: number) => (
                                    <Badge key={i} variant="outline" className="text-[8px] bg-background">
                                      {claim}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* Directions */}
                            {comp.supplement_facts_complete.directions && (
                              <div className="text-[10px]">
                                <span className="text-muted-foreground">Directions: </span>
                                <span className="text-foreground">{comp.supplement_facts_complete.directions}</span>
                              </div>
                            )}
                            
                            {/* Warnings */}
                            {comp.supplement_facts_complete.warnings && (
                              <div className="bg-destructive/5 rounded p-2 border border-destructive/20">
                                <p className="text-[10px] font-medium text-destructive flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  Warnings
                                </p>
                                <p className="text-[9px] text-foreground mt-1">{comp.supplement_facts_complete.warnings}</p>
                              </div>
                            )}
                            
                            {/* Full Raw JSON Toggle */}
                            <details className="mt-2">
                              <summary className="text-[9px] text-primary cursor-pointer hover:underline">
                                View Full Raw JSON
                              </summary>
                              <pre className="text-[8px] text-muted-foreground bg-muted/50 rounded p-2 mt-1 overflow-x-auto max-h-[150px] overflow-y-auto whitespace-pre-wrap">
                                {JSON.stringify(comp.supplement_facts_complete, null, 2)}
                              </pre>
                            </details>
                          </div>
                        )}
                        
                        {/* Other Ingredients */}
                        {comp.other_ingredients && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-foreground flex items-center gap-1">
                              <Beaker className="w-3 h-3 text-muted-foreground" />
                              Other Ingredients (Inactive/Fillers)
                            </p>
                            <p className="text-[10px] text-muted-foreground bg-muted/30 rounded p-2">
                              {comp.other_ingredients}
                            </p>
                          </div>
                        )}
                        
                        {/* Specifications - Now Raw JSON */}
                        {comp.specifications && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-foreground flex items-center gap-1">
                              <Info className="w-3 h-3 text-chart-3" />
                              Specifications (Raw)
                            </p>
                            <pre className="text-[9px] text-muted-foreground bg-muted/30 rounded p-2 overflow-x-auto max-h-[100px] overflow-y-auto whitespace-pre-wrap">
                              {typeof comp.specifications === 'string' 
                                ? comp.specifications 
                                : JSON.stringify(comp.specifications, null, 2)}
                            </pre>
                          </div>
                        )}
                        
                        {/* Important Information - Now Raw JSON */}
                        {comp.important_information && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-foreground flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 text-chart-2" />
                              Important Information (Raw)
                            </p>
                            <pre className="text-[9px] text-muted-foreground bg-chart-2/5 rounded p-2 border border-chart-2/10 overflow-x-auto max-h-[100px] overflow-y-auto whitespace-pre-wrap">
                              {typeof comp.important_information === 'string' 
                                ? comp.important_information 
                                : JSON.stringify(comp.important_information, null, 2)}
                            </pre>
                          </div>
                        )}
                        
                        {/* Nutrients - Full JSON */}
                        {comp.nutrients && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-foreground flex items-center gap-1">
                              <FlaskConical className="w-3 h-3 text-chart-4" />
                              Nutrients (Raw)
                            </p>
                            <pre className="text-[9px] text-muted-foreground bg-chart-4/5 rounded p-2 border border-chart-4/10 overflow-x-auto max-h-[100px] overflow-y-auto whitespace-pre-wrap">
                              {typeof comp.nutrients === 'string' 
                                ? comp.nutrients 
                                : JSON.stringify(comp.nutrients, null, 2)}
                            </pre>
                          </div>
                        )}
                        
                        {/* Raw Ingredients (fallback) */}
                        {comp.ingredients && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-foreground flex items-center gap-1">
                              <FlaskConical className="w-3 h-3 text-primary" />
                              Ingredients List (Raw)
                            </p>
                            <pre className="text-[9px] text-muted-foreground bg-muted/30 rounded p-2 overflow-x-auto max-h-[100px] overflow-y-auto whitespace-pre-wrap">
                              {typeof comp.ingredients === 'string' 
                                ? comp.ingredients 
                                : JSON.stringify(comp.ingredients, null, 2)}
                            </pre>
                          </div>
                        )}
                        
                        {/* Pain Points */}
                        {comp.pain_points && Array.isArray(comp.pain_points) && comp.pain_points.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-foreground flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-chart-2" />
                              Pain Points (Raw)
                            </p>
                            <pre className="text-[9px] text-muted-foreground bg-chart-2/5 rounded p-2 border border-chart-2/10 overflow-x-auto max-h-[100px] overflow-y-auto whitespace-pre-wrap">
                              {JSON.stringify(comp.pain_points, null, 2)}
                            </pre>
                          </div>
                        )}
                        
                        {/* Empty state for this competitor */}
                        {!comp.supplement_facts_complete && !comp.other_ingredients && !comp.specifications && !comp.important_information && !comp.ingredients && !comp.nutrients && (
                          <div className="text-center py-4 text-muted-foreground">
                            <Package className="w-6 h-6 mx-auto mb-1 opacity-50" />
                            <p className="text-[10px]">No detailed formulation data available</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No competitor formulation data available</p>
              <p className="text-xs">Run a new analysis to fetch competitor details</p>
            </div>
          )}
        </div>
      )}

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <div className="space-y-4">
          {/* Recommendation */}
          <div className="bg-card rounded-lg p-3 border border-border/50">
            <p className="text-xs font-medium text-foreground mb-1">Strategic Recommendation</p>
            <p className="text-sm text-muted-foreground">{analysis.summary.recommendation}</p>
          </div>

          {/* SWOT Summary */}
          {analysis.swot && analysis.swot.strengths && analysis.swot.weaknesses && analysis.swot.opportunities && analysis.swot.threats && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-chart-4/5 rounded-lg p-3 border border-chart-4/20">
                <p className="text-xs font-medium text-chart-4 mb-2 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Strengths ({analysis.swot.strengths.length})
                </p>
                <ul className="space-y-1">
                  {analysis.swot.strengths.slice(0, 3).map((s, i) => (
                    <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                      <span className="text-chart-4 mt-0.5">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-destructive/5 rounded-lg p-3 border border-destructive/20">
                <p className="text-xs font-medium text-destructive mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Weaknesses ({analysis.swot.weaknesses.length})
                </p>
                <ul className="space-y-1">
                  {analysis.swot.weaknesses.slice(0, 3).map((w, i) => (
                    <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                      <span className="text-destructive mt-0.5">•</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-chart-3/5 rounded-lg p-3 border border-chart-3/20">
                <p className="text-xs font-medium text-chart-3 mb-2 flex items-center gap-1">
                  <Lightbulb className="w-3 h-3" /> Opportunities ({analysis.swot.opportunities.length})
                </p>
                <ul className="space-y-1">
                  {analysis.swot.opportunities.slice(0, 3).map((o, i) => (
                    <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                      <span className="text-chart-3 mt-0.5">•</span>
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-chart-2/5 rounded-lg p-3 border border-chart-2/20">
                <p className="text-xs font-medium text-chart-2 mb-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Threats ({analysis.swot.threats.length})
                </p>
                <ul className="space-y-1">
                  {analysis.swot.threats.slice(0, 3).map((t, i) => (
                    <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                      <span className="text-chart-2 mt-0.5">•</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Dosage Comparison Chart */}
          {analysis.charts.dosage_comparison && analysis.charts.dosage_comparison.length > 0 && (
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

      {/* Clinical Tab */}
      {activeTab === 'clinical' && (
        <div className="space-y-4">
          {/* Dosage Adequacy */}
          {analysis.clinical_analysis?.dosage_adequacy && analysis.clinical_analysis.dosage_adequacy.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground flex items-center gap-1">
                <FlaskConical className="w-3 h-3" /> Clinical Dosage Adequacy
              </p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {analysis.clinical_analysis.dosage_adequacy.map((item, idx) => (
                  <div 
                    key={idx} 
                    className={`rounded-lg p-3 border ${getAdequacyColor(item.adequacy)}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-foreground">{item.ingredient}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-primary font-medium">Our: {item.our_dosage}</span>
                          <span className="text-[10px] text-muted-foreground">Clinical: {item.clinical_range}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[8px] capitalize ${getAdequacyColor(item.adequacy)}`}>
                        {item.adequacy}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">{item.research_note}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Synergy Pairs */}
          {analysis.clinical_analysis?.synergy_pairs && analysis.clinical_analysis.synergy_pairs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground flex items-center gap-1">
                <Link2 className="w-3 h-3" /> Ingredient Synergies
              </p>
              <div className="grid grid-cols-2 gap-2">
                {analysis.clinical_analysis.synergy_pairs.map((pair, idx) => (
                  <div 
                    key={idx} 
                    className={`rounded-lg p-3 border ${pair.present_in_formula ? 'bg-chart-4/5 border-chart-4/20' : 'bg-muted/50 border-border'}`}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      {pair.present_in_formula ? (
                        <CheckCircle className="w-3 h-3 text-chart-4" />
                      ) : (
                        <XCircle className="w-3 h-3 text-muted-foreground" />
                      )}
                      <span className="text-[10px] font-medium text-foreground">
                        {pair.ingredients.join(' + ')}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{pair.synergy_type}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Customer Tab */}
      {activeTab === 'customer' && (
        <div className="space-y-4">
          {/* Pain Point Solutions */}
          {analysis.customer_insights?.pain_point_solutions && analysis.customer_insights.pain_point_solutions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-chart-4" /> Pain Points We Solve
              </p>
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {analysis.customer_insights.pain_point_solutions.map((item, idx) => (
                  <div key={idx} className="rounded-lg p-3 border bg-chart-4/5 border-chart-4/20">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-foreground">"{item.pain_point}"</p>
                        <p className="text-[10px] text-chart-4 mt-1 flex items-center gap-1">
                          <ChevronRight className="w-3 h-3" />
                          Solved by: <span className="font-medium">{item.solving_ingredient}</span>
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-[8px] ${getConfidenceColor(item.confidence)}`}>
                        {item.confidence} confidence
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2">{item.evidence}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unaddressed Complaints */}
          {analysis.customer_insights?.unaddressed_complaints && analysis.customer_insights.unaddressed_complaints.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-chart-2" /> Unaddressed Complaints
              </p>
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {analysis.customer_insights.unaddressed_complaints.map((item, idx) => (
                  <div key={idx} className="rounded-lg p-3 border bg-chart-2/5 border-chart-2/20">
                    <p className="text-xs font-medium text-foreground">"{item.complaint}"</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      <span className="text-chart-2">Suggestion:</span> {item.suggested_solution}
                    </p>
                    <p className="text-[10px] text-primary mt-1">
                      <span className="font-medium">Consider adding:</span> {item.ingredient_recommendation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Competitive Tab */}
      {activeTab === 'competitive' && (
        <div className="space-y-4">
          {/* Advantages */}
          {analysis.competitive_matrix?.advantages && analysis.competitive_matrix.advantages.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-chart-4" /> Competitive Advantages
              </p>
              <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                {analysis.competitive_matrix.advantages.map((item, idx) => (
                  <div key={idx} className="rounded-lg p-3 border bg-chart-4/5 border-chart-4/20">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Badge variant="outline" className="text-[8px] mb-1">{item.category}</Badge>
                        <p className="text-xs font-medium text-foreground">{item.our_position}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">vs Competitors: {item.vs_competitors}</p>
                      </div>
                      <Badge variant="outline" className={`text-[8px] ${getImpactColor(item.impact)}`}>
                        {item.impact} impact
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vulnerabilities */}
          {analysis.competitive_matrix?.vulnerabilities && analysis.competitive_matrix.vulnerabilities.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground flex items-center gap-1">
                <Shield className="w-3 h-3 text-chart-2" /> Vulnerabilities
              </p>
              <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                {analysis.competitive_matrix.vulnerabilities.map((item, idx) => (
                  <div key={idx} className="rounded-lg p-3 border bg-chart-2/5 border-chart-2/20">
                    <Badge variant="outline" className="text-[8px] mb-1">{item.category}</Badge>
                    <p className="text-xs font-medium text-foreground">{item.risk_description}</p>
                    <p className="text-[10px] text-chart-4 mt-1">
                      <span className="font-medium">Mitigation:</span> {item.mitigation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Roadmap Tab */}
      {activeTab === 'roadmap' && (
        <div className="space-y-4">
          {analysis.priority_roadmap && analysis.priority_roadmap.length > 0 ? (
            [1, 2, 3].map(phase => {
              const phaseItems = analysis.priority_roadmap?.filter(item => item.phase === phase) || [];
              if (phaseItems.length === 0) return null;
              
              return (
                <div key={phase} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${getPhaseColor(phase)}`}>
                      {phase}
                    </div>
                    <p className="text-xs font-medium text-foreground">
                      Phase {phase}: {phase === 1 ? 'Immediate' : phase === 2 ? 'Next Batch' : 'Future'}
                    </p>
                  </div>
                  <div className="space-y-2 pl-8">
                    {phaseItems.map((item, idx) => (
                      <div key={idx} className="rounded-lg p-3 border bg-card border-border/50">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-medium text-foreground flex items-center gap-1">
                              <Zap className="w-3 h-3 text-primary" />
                              {item.action}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Ingredient: <span className="text-foreground">{item.ingredient}</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Impact: <span className="text-chart-4">{item.expected_impact}</span>
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant="outline" className={`text-[8px] ${getComplexityColor(item.complexity)}`}>
                              {item.complexity}
                            </Badge>
                            <span className="text-[9px] text-muted-foreground">{item.timeline}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No roadmap items available</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AIAnalysisResults;
