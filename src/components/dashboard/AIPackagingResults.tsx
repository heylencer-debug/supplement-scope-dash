import { PackagingDesignAnalysis } from "@/hooks/usePackagingAnalysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Palette, 
  Layout, 
  Shield, 
  FileText, 
  Zap, 
  Target,
  ListOrdered,
  Copy,
  CheckCircle2,
  AlertCircle,
  Lightbulb
} from "lucide-react";

interface AIPackagingResultsProps {
  analysis: PackagingDesignAnalysis;
}

export function AIPackagingResults({ analysis }: AIPackagingResultsProps) {
  const getImportanceBadgeColor = (importance: string) => {
    switch (importance) {
      case 'critical': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'high': return 'bg-chart-2/10 text-chart-2 border-chart-2/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getAdvantageColor = (score: string) => {
    switch (score) {
      case 'strong': return 'bg-chart-4/10 text-chart-4 border-chart-4/20';
      case 'moderate': return 'bg-chart-2/10 text-chart-2 border-chart-2/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'easy': return 'bg-chart-4/10 text-chart-4';
      case 'moderate': return 'bg-chart-2/10 text-chart-2';
      default: return 'bg-destructive/10 text-destructive';
    }
  };

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 1: return 'Must Have';
      case 2: return 'Important';
      default: return 'Nice to Have';
    }
  };

  if (!analysis) {
    return null;
  }

  return (
    <div className="space-y-6 mt-6">
      {/* Summary Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-primary" />
            Design Strategy Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-foreground">{analysis.summary?.design_strategy}</p>
          
          <div className="flex flex-wrap gap-2">
            {(analysis.summary?.key_differentiators || []).map((diff, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {diff}
              </Badge>
            ))}
          </div>
          
          <div className="p-3 bg-background rounded-lg border border-border/50">
            <span className="text-xs font-medium text-muted-foreground">Shelf Positioning:</span>
            <p className="text-sm text-foreground mt-1">{analysis.summary?.target_shelf_positioning}</p>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for detailed sections */}
      <Tabs defaultValue="visual" className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7 h-auto gap-1">
          <TabsTrigger value="visual" className="text-xs py-2 px-2">
            <Palette className="w-3 h-3 mr-1 hidden sm:inline" />Visual
          </TabsTrigger>
          <TabsTrigger value="layout" className="text-xs py-2 px-2">
            <Layout className="w-3 h-3 mr-1 hidden sm:inline" />Layout
          </TabsTrigger>
          <TabsTrigger value="trust" className="text-xs py-2 px-2">
            <Shield className="w-3 h-3 mr-1 hidden sm:inline" />Trust
          </TabsTrigger>
          <TabsTrigger value="copy" className="text-xs py-2 px-2">
            <FileText className="w-3 h-3 mr-1 hidden sm:inline" />Copy
          </TabsTrigger>
          <TabsTrigger value="triggers" className="text-xs py-2 px-2">
            <Zap className="w-3 h-3 mr-1 hidden sm:inline" />Triggers
          </TabsTrigger>
          <TabsTrigger value="competitive" className="text-xs py-2 px-2">
            <Target className="w-3 h-3 mr-1 hidden sm:inline" />Compete
          </TabsTrigger>
          <TabsTrigger value="mock" className="text-xs py-2 px-2">
            <Copy className="w-3 h-3 mr-1 hidden sm:inline" />Mock
          </TabsTrigger>
        </TabsList>

        {/* Visual Design Tab */}
        <TabsContent value="visual" className="mt-4 space-y-4">
          {/* Color Palette */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Color Palette</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: 'Primary', color: analysis.visual_design.primary_color },
                  { label: 'Secondary', color: analysis.visual_design.secondary_color },
                  { label: 'Accent', color: analysis.visual_design.accent_color }
                ].map(({ label, color }) => (
                  <div key={label} className="p-3 rounded-lg border border-border/50 space-y-2">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-lg border border-border shadow-sm" 
                        style={{ backgroundColor: color.hex }}
                      />
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">{label}</p>
                        <p className="text-sm font-semibold">{color.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{color.hex}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{color.psychology}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{analysis.visual_design.color_rationale}</p>
            </CardContent>
          </Card>

          {/* Typography */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Typography</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Headline Font</p>
                  <p className="text-lg font-bold">{analysis.visual_design.typography.headline_font}</p>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">Body Font</p>
                  <p className="text-lg">{analysis.visual_design.typography.body_font}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{analysis.visual_design.typography.font_rationale}</p>
            </CardContent>
          </Card>

          {/* Imagery & Aesthetic */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Imagery & Aesthetic</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Imagery Style</p>
                <p className="text-sm">{analysis.visual_design.imagery_style}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Overall Aesthetic</p>
                <p className="text-sm">{analysis.visual_design.overall_aesthetic}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Layout Tab */}
        <TabsContent value="layout" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Front Panel Layout</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Layout Structure</p>
                <p className="text-sm">{analysis.front_panel.layout_structure}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Visual Hierarchy</p>
                <ol className="space-y-1">
                  {(analysis.front_panel?.visual_hierarchy || []).map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                        {idx + 1}
                      </span>
                      {item}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                <p className="text-xs font-medium text-primary mb-1">Primary Claim</p>
                <p className="text-lg font-bold text-foreground">{analysis.front_panel?.primary_claim}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Secondary Claims</p>
                <div className="flex flex-wrap gap-2">
                  {(analysis.front_panel?.secondary_claims || []).map((claim, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {claim}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Brand Positioning</p>
                <p className="text-sm italic">"{analysis.front_panel?.brand_positioning_statement}"</p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Required Elements</p>
                <ul className="space-y-1">
                  {(analysis.front_panel?.required_elements || []).map((element, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-3 h-3 text-chart-4" />
                      {element}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trust Signals Tab */}
        <TabsContent value="trust" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Recommended Certifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(analysis.trust_signals?.recommended_certifications || []).map((cert, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-border/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{cert.badge}</span>
                    <Badge className={getImportanceBadgeColor(cert.importance)}>
                      {cert.importance}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{cert.rationale}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Trust Building Elements</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {(analysis.trust_signals?.trust_building_elements || []).map((element, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm">
                    <Shield className="w-3 h-3 text-chart-1" />
                    {element}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Copy Content Tab */}
        <TabsContent value="copy" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Headlines & Copy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                <p className="text-xs font-medium text-muted-foreground mb-1">Headline</p>
                <p className="text-xl font-bold text-foreground">{analysis.copy_content.headline}</p>
              </div>

              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs font-medium text-muted-foreground mb-1">Subheadline</p>
                <p className="text-base text-foreground">{analysis.copy_content.subheadline}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Bullet Points</p>
                <ul className="space-y-2">
                  {(analysis.copy_content?.bullet_points || []).map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-3 bg-chart-4/10 rounded-lg border border-chart-4/20">
                <p className="text-xs font-medium text-chart-4 mb-1">Call to Action</p>
                <p className="text-sm font-semibold">{analysis.copy_content.call_to_action}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Back Panel Copy</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{analysis.copy_content.back_panel_copy}</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conversion Triggers Tab */}
        <TabsContent value="triggers" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Psychological Conversion Triggers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(analysis.conversion_triggers || []).map((trigger, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-border/50 space-y-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-chart-2" />
                    <span className="font-medium text-sm">{trigger.trigger}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Placement: </span>
                      <span>{trigger.placement}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Principle: </span>
                      <span className="text-chart-3">{trigger.psychological_principle}</span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Competitive Tab */}
        <TabsContent value="competitive" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Competitive Positioning</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-chart-4/5 rounded-lg border border-chart-4/20">
                <p className="text-xs font-medium text-chart-4 mb-1">vs. Market Leader: {analysis.competitive_positioning?.vs_leader?.competitor}</p>
                <p className="text-sm">{analysis.competitive_positioning?.vs_leader?.our_advantage}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Market Gap Filled</p>
                <p className="text-sm">{analysis.competitive_positioning?.market_gap_filled}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Differentiation Elements</p>
                <div className="flex flex-wrap gap-2">
                  {(analysis.competitive_positioning?.differentiation_elements || []).map((element, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {element}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Competitor Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(analysis.competitor_comparison || []).map((comp, idx) => (
                  <div key={idx} className="p-3 rounded-lg border border-border/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{comp.competitor}</span>
                      <Badge className={getAdvantageColor(comp.advantage_score)}>
                        {comp.advantage_score}
                      </Badge>
                    </div>
                    <div className="text-xs space-y-1">
                      <p><span className="text-muted-foreground">Their approach:</span> {comp.their_approach}</p>
                      <p><span className="text-chart-4">Our counter:</span> {comp.our_counter_strategy}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Implementation Priorities */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ListOrdered className="w-4 h-4" />
                Implementation Priorities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(analysis.implementation_priorities || []).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2 rounded-lg border border-border/50">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      item.priority === 1 ? 'bg-destructive/10 text-destructive' :
                      item.priority === 2 ? 'bg-chart-2/10 text-chart-2' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {item.priority}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.element}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.impact}</p>
                    </div>
                    <Badge className={getComplexityColor(item.complexity)}>
                      {item.complexity}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Mock Content Tab */}
        <TabsContent value="mock" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Front Panel Text (Ready to Use)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-muted/30 rounded-lg border border-border font-mono text-sm whitespace-pre-wrap">
                {analysis.mock_content.front_panel_text}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Back Panel Text (Ready to Use)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-muted/30 rounded-lg border border-border font-mono text-sm whitespace-pre-wrap">
                {analysis.mock_content.back_panel_text}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Side Panel Suggestions</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {(analysis.mock_content?.side_panel_suggestions || []).map((suggestion, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <AlertCircle className="w-3 h-3 text-chart-3 mt-1" />
                    {suggestion}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
