import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  GitBranch, ArrowLeftRight, FlaskConical, Package, Shield, 
  CheckCircle2, XCircle, ArrowUp, ArrowDown, Minus, X
} from "lucide-react";
import { useIngredientAnalysis } from "@/hooks/useIngredientAnalysis";
import { usePackagingAnalysis } from "@/hooks/usePackagingAnalysis";
import { useCompetitiveAnalysis } from "@/hooks/useCompetitiveAnalysis";

interface FormulaBriefVersion {
  id: string;
  category_id: string;
  version_number: number;
  formula_brief_content: string;
  change_summary: string | null;
  is_active: boolean;
  parent_version_id: string | null;
  created_at: string;
}

interface VersionComparisonViewProps {
  categoryId: string;
  versions: FormulaBriefVersion[];
  onClose: () => void;
}

export function VersionComparisonView({ 
  categoryId, 
  versions, 
  onClose 
}: VersionComparisonViewProps) {
  const [leftVersionId, setLeftVersionId] = useState<string | null>(null);
  const [rightVersionId, setRightVersionId] = useState<string | null>(
    versions.find(v => v.is_active)?.id || null
  );
  const [activeTab, setActiveTab] = useState<'ingredients' | 'packaging' | 'competitive'>('ingredients');

  // Get analyses for both versions
  const leftIngredients = useIngredientAnalysis(categoryId, 'new_winners', leftVersionId || undefined);
  const rightIngredients = useIngredientAnalysis(categoryId, 'new_winners', rightVersionId || undefined);
  
  const leftPackaging = usePackagingAnalysis(categoryId, leftVersionId || undefined);
  const rightPackaging = usePackagingAnalysis(categoryId, rightVersionId || undefined);
  
  const leftCompetitive = useCompetitiveAnalysis(categoryId, leftVersionId || undefined);
  const rightCompetitive = useCompetitiveAnalysis(categoryId, rightVersionId || undefined);

  const getVersionLabel = (versionId: string | null) => {
    if (!versionId) return "Original";
    const version = versions.find(v => v.id === versionId);
    return version ? `v${version.version_number}${version.is_active ? ' (Active)' : ''}` : "Unknown";
  };

  const getVersionInfo = (versionId: string | null) => {
    if (!versionId) return { label: "Original Analysis", summary: "Initial formula brief" };
    const version = versions.find(v => v.id === versionId);
    return { 
      label: `Version ${version?.version_number}${version?.is_active ? ' (Active)' : ''}`,
      summary: version?.change_summary || "No description"
    };
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowLeftRight className="h-4 w-4 text-primary" />
            Version Comparison
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Version Selectors */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Left Version</label>
            <Select
              value={leftVersionId || "original"}
              onValueChange={(value) => setLeftVersionId(value === "original" ? null : value)}
            >
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">Original Analysis</SelectItem>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id} disabled={v.id === rightVersionId}>
                    Version {v.version_number} {v.is_active && "(Active)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground truncate">
              {getVersionInfo(leftVersionId).summary}
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Right Version</label>
            <Select
              value={rightVersionId || "original"}
              onValueChange={(value) => setRightVersionId(value === "original" ? null : value)}
            >
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original" disabled={leftVersionId === null}>Original Analysis</SelectItem>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id} disabled={v.id === leftVersionId}>
                    Version {v.version_number} {v.is_active && "(Active)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground truncate">
              {getVersionInfo(rightVersionId).summary}
            </p>
          </div>
        </div>

        {/* Comparison Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="w-full">
            <TabsTrigger value="ingredients" className="flex-1 text-xs gap-1">
              <FlaskConical className="h-3 w-3" />
              Ingredients
            </TabsTrigger>
            <TabsTrigger value="packaging" className="flex-1 text-xs gap-1">
              <Package className="h-3 w-3" />
              Packaging
            </TabsTrigger>
            <TabsTrigger value="competitive" className="flex-1 text-xs gap-1">
              <Shield className="h-3 w-3" />
              Competitive
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ingredients" className="mt-4">
            <ComparisonPanel
              leftLabel={getVersionLabel(leftVersionId)}
              rightLabel={getVersionLabel(rightVersionId)}
              leftData={leftIngredients.analysis}
              rightData={rightIngredients.analysis}
              leftLoading={leftIngredients.isLoading}
              rightLoading={rightIngredients.isLoading}
              renderComparison={(left, right) => (
                <IngredientComparison left={left} right={right} />
              )}
            />
          </TabsContent>

          <TabsContent value="packaging" className="mt-4">
            <ComparisonPanel
              leftLabel={getVersionLabel(leftVersionId)}
              rightLabel={getVersionLabel(rightVersionId)}
              leftData={leftPackaging.analysis}
              rightData={rightPackaging.analysis}
              leftLoading={leftPackaging.isLoading}
              rightLoading={rightPackaging.isLoading}
              renderComparison={(left, right) => (
                <PackagingComparison left={left} right={right} />
              )}
            />
          </TabsContent>

          <TabsContent value="competitive" className="mt-4">
            <ComparisonPanel
              leftLabel={getVersionLabel(leftVersionId)}
              rightLabel={getVersionLabel(rightVersionId)}
              leftData={leftCompetitive.analysis}
              rightData={rightCompetitive.analysis}
              leftLoading={leftCompetitive.isLoading}
              rightLoading={rightCompetitive.isLoading}
              renderComparison={(left, right) => (
                <CompetitiveComparison left={left} right={right} />
              )}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Generic comparison panel
function ComparisonPanel<T>({
  leftLabel,
  rightLabel,
  leftData,
  rightData,
  leftLoading,
  rightLoading,
  renderComparison
}: {
  leftLabel: string;
  rightLabel: string;
  leftData: T | null;
  rightData: T | null;
  leftLoading: boolean;
  rightLoading: boolean;
  renderComparison: (left: T | null, right: T | null) => React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Left Panel */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <GitBranch className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium">{leftLabel}</span>
        </div>
        <ScrollArea className="h-[400px]">
          {leftLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : !leftData ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <XCircle className="h-6 w-6 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">No analysis available</p>
            </div>
          ) : (
            <div className="pr-2">{renderComparison(leftData, null)}</div>
          )}
        </ScrollArea>
      </div>

      {/* Right Panel */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <GitBranch className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium">{rightLabel}</span>
        </div>
        <ScrollArea className="h-[400px]">
          {rightLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : !rightData ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <XCircle className="h-6 w-6 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">No analysis available</p>
            </div>
          ) : (
            <div className="pr-2">{renderComparison(null, rightData)}</div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

// Ingredient comparison view
function IngredientComparison({ left, right }: { left: any; right: any }) {
  const data = left || right;
  if (!data) return null;

  return (
    <div className="space-y-3">
      {/* Summary Scores */}
      {data.summary && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-chart-4">{data.charts?.coverage_score || '-'}</div>
            <div className="text-[9px] text-muted-foreground">Coverage</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-primary">{data.charts?.uniqueness_score || '-'}</div>
            <div className="text-[9px] text-muted-foreground">Uniqueness</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold text-chart-3">{data.charts?.efficacy_score || '-'}</div>
            <div className="text-[9px] text-muted-foreground">Efficacy</div>
          </div>
        </div>
      )}

      {/* Overall Assessment */}
      {data.summary?.overall_assessment && (
        <div className="p-2 bg-muted/30 rounded-lg">
          <Badge variant="outline" className="mb-1 text-[10px]">
            {data.summary.overall_assessment}
          </Badge>
          <p className="text-xs text-muted-foreground">{data.summary.key_insight}</p>
        </div>
      )}

      {/* Ingredient Count */}
      {data.ingredients && (
        <div className="text-xs">
          <span className="font-medium">{data.ingredients.length}</span>
          <span className="text-muted-foreground"> ingredients analyzed</span>
        </div>
      )}

      {/* SWOT Summary */}
      {data.swot && (
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="p-2 bg-chart-4/10 rounded">
            <div className="font-medium text-chart-4 mb-1">Strengths ({data.swot.strengths?.length || 0})</div>
            {data.swot.strengths?.slice(0, 2).map((s: string, i: number) => (
              <div key={i} className="text-muted-foreground truncate">• {s}</div>
            ))}
          </div>
          <div className="p-2 bg-destructive/10 rounded">
            <div className="font-medium text-destructive mb-1">Weaknesses ({data.swot.weaknesses?.length || 0})</div>
            {data.swot.weaknesses?.slice(0, 2).map((w: string, i: number) => (
              <div key={i} className="text-muted-foreground truncate">• {w}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Packaging comparison view
function PackagingComparison({ left, right }: { left: any; right: any }) {
  const data = left || right;
  if (!data) return null;

  return (
    <div className="space-y-3">
      {/* Design Brief */}
      {data.design_brief && (
        <div className="space-y-2">
          <div className="text-xs font-medium">Design Brief</div>
          {data.design_brief.primary_claim && (
            <div className="p-2 bg-primary/5 rounded-lg border border-primary/20">
              <div className="text-[10px] text-muted-foreground mb-1">Primary Claim</div>
              <div className="text-xs font-medium">{data.design_brief.primary_claim}</div>
            </div>
          )}
          {data.design_brief.colors && (
            <div className="flex gap-1">
              {Object.entries(data.design_brief.colors).slice(0, 4).map(([key, value]: [string, any]) => (
                <div 
                  key={key}
                  className="w-6 h-6 rounded border border-border"
                  style={{ backgroundColor: value }}
                  title={`${key}: ${value}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Trust Signals */}
      {data.design_brief?.trust_signals && (
        <div>
          <div className="text-xs font-medium mb-1">Trust Signals</div>
          <div className="flex flex-wrap gap-1">
            {data.design_brief.trust_signals.slice(0, 5).map((signal: string, i: number) => (
              <Badge key={i} variant="secondary" className="text-[9px]">
                {signal}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Key Differentiators */}
      {data.design_brief?.key_differentiators && (
        <div>
          <div className="text-xs font-medium mb-1">Key Differentiators</div>
          <div className="space-y-1">
            {data.design_brief.key_differentiators.slice(0, 3).map((diff: string, i: number) => (
              <div key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                <CheckCircle2 className="w-3 h-3 text-chart-4 shrink-0 mt-0.5" />
                {diff}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Competitive comparison view
function CompetitiveComparison({ left, right }: { left: any; right: any }) {
  const data = left || right;
  if (!data) return null;

  return (
    <div className="space-y-3">
      {/* Overall Position */}
      {data.overall_position && (
        <div className="p-2 bg-muted/50 rounded-lg">
          <Badge variant="outline" className="mb-1">
            {data.overall_position.market_position || 'Unknown'}
          </Badge>
          <p className="text-xs text-muted-foreground mt-1">
            {data.overall_position.summary}
          </p>
        </div>
      )}

      {/* Competitor Analysis Summary */}
      {data.competitor_analyses && (
        <div>
          <div className="text-xs font-medium mb-2">
            {data.competitor_analyses.length} Competitors Analyzed
          </div>
          <div className="space-y-2">
            {data.competitor_analyses.slice(0, 3).map((comp: any, i: number) => (
              <div key={i} className="p-2 bg-muted/30 rounded text-[10px]">
                <div className="font-medium truncate">{comp.competitor_name || `Competitor ${i + 1}`}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-muted-foreground">Displacement:</span>
                  <Badge 
                    variant={comp.displacement_potential >= 7 ? "default" : "secondary"}
                    className="text-[9px]"
                  >
                    {comp.displacement_potential}/10
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strategic Recommendations */}
      {data.strategic_recommendations && (
        <div>
          <div className="text-xs font-medium mb-1">Recommendations</div>
          <div className="space-y-1">
            {data.strategic_recommendations.slice(0, 3).map((rec: string, i: number) => (
              <div key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                <ArrowUp className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                {rec}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
