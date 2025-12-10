import { PackagingDesignAnalysis } from "@/hooks/usePackagingAnalysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Palette, 
  CheckCircle2,
  Copy,
  FileText,
  ChevronDown
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface AIPackagingResultsProps {
  analysis: PackagingDesignAnalysis;
}

export function AIPackagingResults({ analysis }: AIPackagingResultsProps) {
  const { toast } = useToast();
  const [rationaleOpen, setRationaleOpen] = useState(false);

  if (!analysis) {
    return null;
  }

  // Handle both old and new schema
  const designBrief = (analysis as any).design_brief || analysis;
  const elementsChecklist = (analysis as any).elements_checklist || {};
  const mockContent = (analysis as any).mock_content || analysis.mock_content;
  const clientRationale = (analysis as any).client_rationale;

  // Extract colors - handle both schemas
  const primaryColor = designBrief.primary_color || analysis.visual_design?.primary_color;
  const secondaryColor = designBrief.secondary_color || analysis.visual_design?.secondary_color;
  const accentColor = designBrief.accent_color || analysis.visual_design?.accent_color;

  // Extract typography - handle both schemas
  const headlineFont = designBrief.headline_font || analysis.visual_design?.typography?.headline_font;
  const bodyFont = designBrief.body_font || analysis.visual_design?.typography?.body_font;

  // Extract content - handle both schemas
  const primaryClaim = designBrief.primary_claim || analysis.front_panel?.primary_claim || analysis.copy_content?.headline;
  const keyDifferentiators = designBrief.key_differentiators || analysis.summary?.key_differentiators || [];
  const certifications = designBrief.certifications || 
    (analysis.trust_signals?.recommended_certifications || []).map((c: any) => c.badge) || [];

  // Elements checklist - handle both schemas
  const frontPanelHierarchy = elementsChecklist.front_panel_hierarchy || analysis.front_panel?.visual_hierarchy || [];
  const bulletPoints = elementsChecklist.bullet_points || analysis.copy_content?.bullet_points || [];
  const callToAction = elementsChecklist.call_to_action || analysis.copy_content?.call_to_action;
  const trustSignals = elementsChecklist.trust_signals || analysis.trust_signals?.trust_building_elements || [];

  // Mock content
  const frontPanelText = mockContent?.front_panel_text || '';
  const backPanelText = mockContent?.back_panel_text || '';
  const sidePanelSuggestions = mockContent?.side_panel_suggestions || [];

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Copied!',
        description: `${label} copied to clipboard`,
      });
    } catch (err) {
      toast({
        title: 'Failed to copy',
        description: 'Please select and copy manually',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 mt-6">
      {/* Section 1: Design Brief Card */}
      <Card className="border-primary/20">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            Design Brief
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Color Palette */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-3">Color Palette</p>
            <div className="flex gap-4">
              {[
                { label: 'Primary', color: primaryColor },
                { label: 'Secondary', color: secondaryColor },
                { label: 'Accent', color: accentColor }
              ].filter(({ color }) => color).map(({ label, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <div 
                    className="w-12 h-12 rounded-lg border border-border shadow-sm cursor-pointer hover:scale-105 transition-transform" 
                    style={{ backgroundColor: color?.hex }}
                    onClick={() => copyToClipboard(color?.hex || '', `${label} color`)}
                    title="Click to copy hex code"
                  />
                  <div>
                    <p className="text-sm font-medium">{color?.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{color?.hex}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Typography */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Headline Font</p>
              <p className="text-base font-bold">{headlineFont}</p>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Body Font</p>
              <p className="text-base">{bodyFont}</p>
            </div>
          </div>

          {/* Primary Claim */}
          <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
            <p className="text-xs font-medium text-primary mb-2">Primary Claim</p>
            <p className="text-xl font-bold text-foreground">{primaryClaim}</p>
          </div>

          {/* Key Differentiators */}
          {keyDifferentiators.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Key Differentiators</p>
              <div className="flex flex-wrap gap-2">
                {keyDifferentiators.map((diff: string, idx: number) => (
                  <Badge key={idx} variant="secondary" className="text-sm py-1">
                    {diff}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Certifications */}
          {certifications.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Certifications to Include</p>
              <div className="flex flex-wrap gap-2">
                {certifications.map((cert: string, idx: number) => (
                  <Badge key={idx} variant="outline" className="text-sm py-1 border-chart-4/50 text-chart-4">
                    {cert}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Client Rationale - Collapsible */}
          {clientRationale && (
            <Collapsible open={rationaleOpen} onOpenChange={setRationaleOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground hover:text-foreground">
                  <span>Why these choices? (Client rationale)</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${rationaleOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 space-y-3">
                <div className="p-3 bg-muted/20 rounded-lg text-sm">
                  <p className="font-medium text-muted-foreground mb-1">Color Strategy</p>
                  <p>{clientRationale.color_explanation}</p>
                </div>
                <div className="p-3 bg-muted/20 rounded-lg text-sm">
                  <p className="font-medium text-muted-foreground mb-1">Shelf Positioning</p>
                  <p>{clientRationale.positioning_explanation}</p>
                </div>
                <div className="p-3 bg-muted/20 rounded-lg text-sm">
                  <p className="font-medium text-muted-foreground mb-1">Differentiation</p>
                  <p>{clientRationale.differentiation_summary}</p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Elements Checklist */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-chart-4" />
            Elements Checklist
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Front Panel Hierarchy */}
          {frontPanelHierarchy.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3">Front Panel Hierarchy</p>
              <ol className="space-y-2">
                {frontPanelHierarchy.map((item: string, idx: number) => (
                  <li key={idx} className="flex items-center gap-3 text-sm">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
                      {idx + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Bullet Points */}
          {bulletPoints.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-muted-foreground">Bullet Points</p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 text-xs"
                  onClick={() => copyToClipboard(bulletPoints.join('\n• '), 'Bullet points')}
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copy
                </Button>
              </div>
              <ul className="space-y-2">
                {bulletPoints.map((bullet: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Call to Action */}
          {callToAction && (
            <div className="p-3 bg-chart-4/10 rounded-lg border border-chart-4/20">
              <p className="text-xs font-medium text-chart-4 mb-1">Call to Action</p>
              <p className="text-base font-semibold text-foreground">{callToAction}</p>
            </div>
          )}

          {/* Trust Signals */}
          {trustSignals.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Trust Signals</p>
              <div className="flex flex-wrap gap-2">
                {trustSignals.map((signal: string, idx: number) => (
                  <Badge key={idx} variant="outline" className="text-sm py-1">
                    {signal}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Mock Content */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-chart-2" />
              Ready-to-Use Mock Content
            </CardTitle>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => copyToClipboard(
                `FRONT PANEL:\n${frontPanelText}\n\nBACK PANEL:\n${backPanelText}`,
                'All mock content'
              )}
            >
              <Copy className="w-3 h-3 mr-1" />
              Copy All
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Front Panel */}
          {frontPanelText && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Front Panel</p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 text-xs"
                  onClick={() => copyToClipboard(frontPanelText, 'Front panel text')}
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copy
                </Button>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg border border-border/50 font-mono text-sm whitespace-pre-wrap">
                {frontPanelText}
              </div>
            </div>
          )}

          {/* Back Panel */}
          {backPanelText && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Back Panel</p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 text-xs"
                  onClick={() => copyToClipboard(backPanelText, 'Back panel text')}
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copy
                </Button>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg border border-border/50 font-mono text-sm whitespace-pre-wrap max-h-80 overflow-y-auto">
                {backPanelText}
              </div>
            </div>
          )}

          {/* Side Panel Suggestions */}
          {sidePanelSuggestions.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Side Panel Suggestions</p>
              <ul className="space-y-1">
                {sidePanelSuggestions.map((suggestion: string, idx: number) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}