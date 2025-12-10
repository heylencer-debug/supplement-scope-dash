import { PackagingDesignAnalysis } from "@/hooks/usePackagingAnalysis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Palette, 
  CheckCircle2,
  Copy,
  FileText,
  ChevronDown,
  Package,
  Sparkles,
  Loader2,
  ImageIcon,
  Download
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";

interface AIPackagingResultsProps {
  analysis: PackagingDesignAnalysis;
}

// Visual mockup component for front panel
function FrontPanelMockup({ 
  primaryColor, 
  secondaryColor, 
  accentColor, 
  headlineFont, 
  bodyFont, 
  primaryClaim, 
  certifications, 
  callToAction,
  bulletPoints
}: {
  primaryColor?: { hex: string; name: string };
  secondaryColor?: { hex: string; name: string };
  accentColor?: { hex: string; name: string };
  headlineFont?: string;
  bodyFont?: string;
  primaryClaim?: string;
  certifications?: string[];
  callToAction?: string;
  bulletPoints?: string[];
}) {
  // Get font family for styling (use generic fallback)
  const getHeadlineStyle = () => {
    if (!headlineFont) return {};
    const fontName = headlineFont.replace(/\s*(Bold|Light|Regular|Medium|Semibold|Black|Italic)/gi, '').trim();
    return { fontFamily: `"${fontName}", sans-serif` };
  };

  const getBodyStyle = () => {
    if (!bodyFont) return {};
    const fontName = bodyFont.replace(/\s*(Bold|Light|Regular|Medium|Semibold|Black|Italic)/gi, '').trim();
    return { fontFamily: `"${fontName}", sans-serif` };
  };

  return (
    <div className="relative w-full max-w-xs mx-auto">
      {/* Package container - bottle/jar shape */}
      <div 
        className="relative rounded-2xl overflow-hidden shadow-xl"
        style={{ 
          backgroundColor: primaryColor?.hex || '#1a365d',
          minHeight: '400px'
        }}
      >
        {/* Top accent bar */}
        <div 
          className="h-3 w-full"
          style={{ backgroundColor: accentColor?.hex || '#f6ad55' }}
        />
        
        {/* Content area */}
        <div className="p-6 flex flex-col items-center text-center space-y-4">
          {/* Brand placeholder */}
          <div 
            className="text-xs font-bold tracking-[0.3em] uppercase opacity-80"
            style={{ 
              color: secondaryColor?.hex || '#ffffff',
              ...getBodyStyle()
            }}
          >
            BRAND NAME
          </div>
          
          {/* Decorative line */}
          <div 
            className="w-16 h-0.5"
            style={{ backgroundColor: accentColor?.hex || '#f6ad55' }}
          />
          
          {/* Primary Claim / Headline */}
          <h2 
            className="text-2xl font-bold leading-tight"
            style={{ 
              color: '#ffffff',
              ...getHeadlineStyle()
            }}
          >
            {primaryClaim || 'Premium Formula'}
          </h2>
          
          {/* Subheadline / Benefits */}
          {bulletPoints && bulletPoints.length > 0 && (
            <div 
              className="text-sm opacity-90 space-y-1"
              style={{ 
                color: '#ffffff',
                ...getBodyStyle()
              }}
            >
              {bulletPoints.slice(0, 3).map((point, idx) => (
                <p key={idx} className="text-xs">• {point}</p>
              ))}
            </div>
          )}
          
          {/* Serving info placeholder */}
          <div 
            className="mt-4 px-4 py-2 rounded-full text-sm font-medium"
            style={{ 
              backgroundColor: 'rgba(255,255,255,0.15)',
              color: '#ffffff',
              ...getBodyStyle()
            }}
          >
            60 Servings
          </div>
          
          {/* Certification badges */}
          {certifications && certifications.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              {certifications.slice(0, 4).map((cert, idx) => (
                <div 
                  key={idx}
                  className="px-2 py-1 rounded text-[10px] font-medium uppercase tracking-wide"
                  style={{ 
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    color: '#ffffff',
                    border: `1px solid ${accentColor?.hex || 'rgba(255,255,255,0.3)'}`
                  }}
                >
                  {cert}
                </div>
              ))}
            </div>
          )}
          
          {/* CTA */}
          {callToAction && (
            <div 
              className="mt-auto pt-6 text-xs font-medium italic opacity-80"
              style={{ 
                color: accentColor?.hex || '#f6ad55',
                ...getBodyStyle()
              }}
            >
              {callToAction}
            </div>
          )}
        </div>
        
        {/* Bottom accent bar */}
        <div 
          className="absolute bottom-0 left-0 right-0 h-3"
          style={{ backgroundColor: secondaryColor?.hex || '#2d3748' }}
        />
      </div>
      
      {/* Color swatches legend */}
      <div className="flex justify-center gap-3 mt-4">
        {primaryColor && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: primaryColor.hex }} />
            <span>Primary</span>
          </div>
        )}
        {secondaryColor && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: secondaryColor.hex }} />
            <span>Secondary</span>
          </div>
        )}
        {accentColor && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-3 h-3 rounded-full border border-border" style={{ backgroundColor: accentColor.hex }} />
            <span>Accent</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function AIPackagingResults({ analysis }: AIPackagingResultsProps) {
  const { toast } = useToast();
  const [rationaleOpen, setRationaleOpen] = useState(false);
  const [generatedMockup, setGeneratedMockup] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

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

  const generateAIMockup = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-product-mockup', {
        body: {
          designBrief: {
            primaryColor,
            secondaryColor,
            accentColor,
            primaryClaim,
            certifications,
            productType: 'supplement gummy bottle'
          }
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.imageUrl) {
        setGeneratedMockup(data.imageUrl);
        toast({
          title: 'Mockup Generated!',
          description: 'AI product image created successfully.',
        });
      }
    } catch (err) {
      console.error('Mockup generation error:', err);
      toast({
        title: 'Generation Failed',
        description: err instanceof Error ? err.message : 'Failed to generate mockup',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadMockup = () => {
    if (!generatedMockup) return;
    const link = document.createElement('a');
    link.href = generatedMockup;
    link.download = 'product-mockup.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 mt-6">
      {/* Section 0: Visual Mockup Preview */}
      <Card className="border-chart-2/20 bg-gradient-to-br from-muted/30 to-muted/10">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="w-5 h-5 text-chart-2" />
                Front Panel Preview
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Visual mockup showing colors, typography, and layout.
              </p>
            </div>
            <Button 
              onClick={generateAIMockup}
              disabled={isGenerating}
              size="sm"
              className="gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate AI Image
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* CSS Mockup */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3 text-center">Layout Preview</p>
              <FrontPanelMockup
                primaryColor={primaryColor}
                secondaryColor={secondaryColor}
                accentColor={accentColor}
                headlineFont={headlineFont}
                bodyFont={bodyFont}
                primaryClaim={primaryClaim}
                certifications={certifications}
                callToAction={callToAction}
                bulletPoints={bulletPoints}
              />
            </div>

            {/* AI Generated Mockup */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3 text-center">AI Product Render</p>
              {generatedMockup ? (
                <div className="relative group">
                  <img 
                    src={generatedMockup} 
                    alt="AI Generated Product Mockup"
                    className="w-full max-w-xs mx-auto rounded-xl shadow-lg"
                  />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="secondary" onClick={downloadMockup} className="gap-1">
                      <Download className="w-3 h-3" />
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-xs mx-auto h-[400px] rounded-xl border-2 border-dashed border-border/50 flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
                  <ImageIcon className="w-12 h-12 mb-3 opacity-30" />
                  <p className="text-sm font-medium">No AI mockup yet</p>
                  <p className="text-xs mt-1">Click "Generate AI Image" above</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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