import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Crown, 
  Rocket, 
  Sparkles, 
  Loader2, 
  RefreshCw, 
  Download, 
  ZoomIn,
  ImageIcon,
  Package,
  Pencil,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Eye,
  EyeOff,
  Palette
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { MockupImages } from "@/hooks/usePackagingAnalysis";

interface PackagingStrategy {
  target_competitors: string[];
  strategy_summary: string;
  design_brief: {
    primary_color: { hex: string; name: string };
    secondary_color: { hex: string; name: string };
    accent_color: { hex: string; name: string };
    headline_font: string;
    body_font: string;
    primary_claim: string;
    key_differentiators: string[];
    certifications: string[];
    packaging_format?: string;
  };
  elements_checklist: {
    front_panel_hierarchy: string[];
    bullet_points: string[];
    call_to_action: string;
    trust_signals: string[];
  };
  mock_content: {
    front_panel_text: string;
    back_panel_text: string;
    side_panel_suggestions: string[];
  };
  reasoning: string;
}

interface DualPackagingAnalysis {
  match_leaders: PackagingStrategy;
  match_disruptors: PackagingStrategy;
  recommendation?: {
    preferred_strategy: 'match_leaders' | 'match_disruptors';
    reasoning: string;
  };
}

interface DualMockupGeneratorProps {
  analysis: DualPackagingAnalysis;
  mockupImages: MockupImages;
  onSaveMockup: (imageUrl: string, strategyType: 'match_leaders' | 'match_disruptors') => Promise<void>;
}

const packagingFormatOptions = [
  { value: "soft chew resealable pouch", label: "Resealable Pouch (Soft Chews)" },
  { value: "resealable stand-up pouch", label: "Stand-Up Pouch" },
  { value: "wide-mouth plastic jar", label: "Wide-Mouth Jar (Plastic)" },
  { value: "narrow-mouth plastic jar", label: "Narrow-Mouth Jar (Plastic)" },
  { value: "glass jar with screw cap", label: "Glass Jar" },
  { value: "narrow-mouth glass jar", label: "Narrow-Mouth Jar (Glass)" },
  { value: "supplement bottle with flip cap", label: "Bottle (Flip Cap)" },
  { value: "dropper bottle", label: "Dropper Bottle" },
  { value: "squeeze bottle", label: "Squeeze Bottle" },
  { value: "pump bottle", label: "Pump Bottle" },
  { value: "tube packaging", label: "Tube" },
  { value: "sachet packet", label: "Sachet/Packet" },
  { value: "blister pack", label: "Blister Pack" },
  { value: "tin container", label: "Tin Container" },
];

// CSS-based label preview component
function LabelPreview({
  text,
  primaryColor,
  secondaryColor,
  accentColor,
  packagingFormat,
}: {
  text: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  packagingFormat: string;
}) {
  // Parse the text into structured elements
  const lines = text.split('\n').filter(line => line.trim());
  
  // Extract headline (first line), and categorize other lines
  const headline = lines[0] || 'PRODUCT NAME';
  const checkmarkLines = lines.filter(line => line.startsWith('✓') || line.startsWith('•'));
  const otherLines = lines.slice(1).filter(line => !line.startsWith('✓') && !line.startsWith('•'));
  
  // Find subtitle and quantity info
  const subtitle = otherLines.find(l => 
    l.toLowerCase().includes('formula') || 
    l.toLowerCase().includes('support') ||
    l.toLowerCase().includes('defense') ||
    l.toLowerCase().includes('complex')
  ) || otherLines[0] || '';
  
  const quantityLine = otherLines.find(l => 
    l.toLowerCase().includes('chew') || 
    l.toLowerCase().includes('capsule') ||
    l.toLowerCase().includes('serving') ||
    l.toLowerCase().includes('ct') ||
    l.toLowerCase().includes('net wt')
  ) || '';
  
  const flavorLine = otherLines.find(l => 
    l.toLowerCase().includes('flavor')
  ) || '';
  
  // Determine container shape based on format
  const isPouch = packagingFormat.includes('pouch');
  const isJar = packagingFormat.includes('jar');
  const isBottle = packagingFormat.includes('bottle');
  
  return (
    <div className="relative">
      <Badge 
        variant="outline" 
        className="absolute -top-2 left-2 z-10 text-[9px] bg-background border-border/50"
      >
        Text Preview
      </Badge>
      <div 
        className={cn(
          "rounded-xl overflow-hidden shadow-lg border border-border/30",
          isPouch && "rounded-t-3xl",
          isJar && "rounded-t-lg",
          isBottle && "rounded-t-sm"
        )}
        style={{
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 100%)`,
          minHeight: '240px',
        }}
      >
        {/* Label content */}
        <div 
          className="p-4 flex flex-col h-full"
          style={{ color: secondaryColor }}
        >
          {/* Brand/Headline */}
          <div className="text-center mb-2">
            <h3 
              className="font-bold text-lg tracking-tight leading-tight"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}
            >
              {headline}
            </h3>
          </div>
          
          {/* Subtitle/Claim */}
          {subtitle && (
            <div 
              className="text-center mb-3 px-2 py-1 rounded-md text-xs font-semibold"
              style={{ 
                backgroundColor: `${accentColor}33`,
                border: `1px solid ${accentColor}66`
              }}
            >
              {subtitle}
            </div>
          )}
          
          {/* Benefits checkmarks */}
          {checkmarkLines.length > 0 && (
            <div className="space-y-1 mb-3">
              {checkmarkLines.slice(0, 4).map((line, i) => (
                <div 
                  key={i} 
                  className="flex items-start gap-1.5 text-[10px] leading-tight"
                  style={{ color: secondaryColor }}
                >
                  <span style={{ color: accentColor }}>✓</span>
                  <span className="opacity-90">{line.replace(/^[✓•]\s*/, '')}</span>
                </div>
              ))}
            </div>
          )}
          
          {/* Flavor */}
          {flavorLine && (
            <div 
              className="text-center text-[10px] font-medium mb-2 opacity-80"
            >
              {flavorLine}
            </div>
          )}
          
          {/* Quantity/Net Wt */}
          {quantityLine && (
            <div 
              className="mt-auto text-center text-[9px] opacity-70 pt-2 border-t"
              style={{ borderColor: `${secondaryColor}33` }}
            >
              {quantityLine}
            </div>
          )}
        </div>
      </div>
      <p className="text-[9px] text-muted-foreground text-center mt-1.5">
        Live preview • Edit text above to update
      </p>
    </div>
  );
}

function MockupCard({
  strategy,
  strategyType,
  mockupUrl,
  onSaveMockup,
}: {
  strategy: PackagingStrategy;
  strategyType: 'match_leaders' | 'match_disruptors';
  mockupUrl: string | null;
  onSaveMockup: (imageUrl: string) => Promise<void>;
}) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedMockup, setGeneratedMockup] = useState<string | null>(mockupUrl);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [isEditingColors, setIsEditingColors] = useState(false);
  const [showPreview, setShowPreview] = useState(true); // Show preview by default
  
  // Editable mock content
  const originalFrontPanelText = strategy.mock_content?.front_panel_text || '';
  const [editedFrontPanelText, setEditedFrontPanelText] = useState(originalFrontPanelText);
  const hasTextEdits = editedFrontPanelText !== originalFrontPanelText;
  
  // Editable colors
  const originalPrimaryColor = strategy.design_brief?.primary_color?.hex || '#1e3a5f';
  const originalSecondaryColor = strategy.design_brief?.secondary_color?.hex || '#ffffff';
  const originalAccentColor = strategy.design_brief?.accent_color?.hex || '#0ea5e9';
  const [editedPrimaryColor, setEditedPrimaryColor] = useState(originalPrimaryColor);
  const [editedSecondaryColor, setEditedSecondaryColor] = useState(originalSecondaryColor);
  const [editedAccentColor, setEditedAccentColor] = useState(originalAccentColor);
  const hasColorEdits = 
    editedPrimaryColor !== originalPrimaryColor ||
    editedSecondaryColor !== originalSecondaryColor ||
    editedAccentColor !== originalAccentColor;
  
  const isLeaders = strategyType === 'match_leaders';
  const Icon = isLeaders ? Crown : Rocket;
  const title = isLeaders ? 'Match Leaders' : 'Match Disruptors';
  const accentClass = isLeaders ? 'text-blue-600 bg-blue-500/10' : 'text-orange-600 bg-orange-500/10';
  
  // Get recommended packaging format from strategy
  const recommendedFormat = strategy.design_brief?.packaging_format || "soft chew resealable pouch";
  const [selectedFormat, setSelectedFormat] = useState(recommendedFormat);

  // Update when mockupUrl prop changes
  useEffect(() => {
    setGeneratedMockup(mockupUrl);
  }, [mockupUrl]);
  
  // Reset edited text when strategy changes
  useEffect(() => {
    setEditedFrontPanelText(strategy.mock_content?.front_panel_text || '');
  }, [strategy.mock_content?.front_panel_text]);
  
  // Reset edited colors when strategy changes
  useEffect(() => {
    setEditedPrimaryColor(strategy.design_brief?.primary_color?.hex || '#1e3a5f');
    setEditedSecondaryColor(strategy.design_brief?.secondary_color?.hex || '#ffffff');
    setEditedAccentColor(strategy.design_brief?.accent_color?.hex || '#0ea5e9');
  }, [strategy.design_brief?.primary_color?.hex, strategy.design_brief?.secondary_color?.hex, strategy.design_brief?.accent_color?.hex]);
  
  const resetTextToOriginal = () => {
    setEditedFrontPanelText(originalFrontPanelText);
  };
  
  const resetColorsToOriginal = () => {
    setEditedPrimaryColor(originalPrimaryColor);
    setEditedSecondaryColor(originalSecondaryColor);
    setEditedAccentColor(originalAccentColor);
  };

  const generateMockup = async () => {
    setIsGenerating(true);
    try {
      const designBrief = strategy.design_brief;
      const mockContent = strategy.mock_content;
      const elements = strategy.elements_checklist;

      const { data, error } = await supabase.functions.invoke('generate-product-mockup', {
        body: {
          designBrief: {
            primaryColor: { hex: editedPrimaryColor, name: strategy.design_brief?.primary_color?.name || 'Primary' },
            secondaryColor: { hex: editedSecondaryColor, name: strategy.design_brief?.secondary_color?.name || 'Secondary' },
            accentColor: { hex: editedAccentColor, name: strategy.design_brief?.accent_color?.name || 'Accent' },
            primaryClaim: designBrief.primary_claim,
            certifications: designBrief.certifications,
            bulletPoints: elements?.bullet_points || [],
            callToAction: elements?.call_to_action,
            headlineFont: designBrief.headline_font,
            bodyFont: designBrief.body_font,
            frontPanelText: editedFrontPanelText, // Use edited text
            backPanelText: mockContent?.back_panel_text,
            keyDifferentiators: designBrief.key_differentiators,
            trustSignals: elements?.trust_signals || [],
            packagingFormat: selectedFormat,
          }
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.imageUrl) {
        setGeneratedMockup(data.imageUrl);
        await onSaveMockup(data.imageUrl);
        toast({
          title: 'Mockup Generated!',
          description: `${title} packaging mockup saved successfully.`,
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
    link.download = `product-mockup-${strategyType}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 p-4 bg-card rounded-xl border border-border/50">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className={cn("p-2 rounded-lg", accentClass)}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-sm font-medium">{title}</h4>
          <p className="text-xs text-muted-foreground">
            {isLeaders ? 'Conservative approach' : 'Aggressive approach'}
          </p>
        </div>
      </div>

      {/* Primary Claim Preview */}
      <div className="p-2.5 bg-muted/50 rounded-lg text-center">
        <p className="text-xs text-muted-foreground mb-1">Primary Claim</p>
        <p className="text-sm font-semibold text-foreground">
          {strategy.design_brief?.primary_claim || 'No claim set'}
        </p>
      </div>

      {/* Packaging Format Selector */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Packaging Format
        </label>
        <Select value={selectedFormat} onValueChange={setSelectedFormat}>
          <SelectTrigger className="w-full bg-background h-9 text-sm">
            <SelectValue placeholder="Select format" />
          </SelectTrigger>
          <SelectContent>
            {packagingFormatOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Editable Mock Content */}
      <Collapsible open={isEditingContent} onOpenChange={setIsEditingContent}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-between h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <span className="flex items-center gap-1.5">
              <Pencil className="w-3 h-3" />
              Edit Front Panel Text
              {hasTextEdits && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-amber-500/20 text-amber-600 border-amber-500/30">
                  Modified
                </Badge>
              )}
            </span>
            {isEditingContent ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          <Textarea
            value={editedFrontPanelText}
            onChange={(e) => setEditedFrontPanelText(e.target.value)}
            placeholder="Enter front panel text..."
            className="min-h-[120px] text-xs font-mono leading-relaxed resize-y"
          />
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              This text will be rendered on the package label
            </p>
            {hasTextEdits && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetTextToOriginal}
                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Editable Colors */}
      <Collapsible open={isEditingColors} onOpenChange={setIsEditingColors}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-between h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <span className="flex items-center gap-1.5">
              <Palette className="w-3 h-3" />
              Edit Design Colors
              {hasColorEdits && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-amber-500/20 text-amber-600 border-amber-500/30">
                  Modified
                </Badge>
              )}
            </span>
            {isEditingColors ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Primary</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="color"
                  value={editedPrimaryColor}
                  onChange={(e) => setEditedPrimaryColor(e.target.value)}
                  className="w-8 h-8 p-0.5 cursor-pointer rounded border-border"
                />
                <Input
                  type="text"
                  value={editedPrimaryColor}
                  onChange={(e) => setEditedPrimaryColor(e.target.value)}
                  className="h-7 text-[10px] font-mono px-1.5 uppercase"
                  maxLength={7}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Secondary</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="color"
                  value={editedSecondaryColor}
                  onChange={(e) => setEditedSecondaryColor(e.target.value)}
                  className="w-8 h-8 p-0.5 cursor-pointer rounded border-border"
                />
                <Input
                  type="text"
                  value={editedSecondaryColor}
                  onChange={(e) => setEditedSecondaryColor(e.target.value)}
                  className="h-7 text-[10px] font-mono px-1.5 uppercase"
                  maxLength={7}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Accent</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="color"
                  value={editedAccentColor}
                  onChange={(e) => setEditedAccentColor(e.target.value)}
                  className="w-8 h-8 p-0.5 cursor-pointer rounded border-border"
                />
                <Input
                  type="text"
                  value={editedAccentColor}
                  onChange={(e) => setEditedAccentColor(e.target.value)}
                  className="h-7 text-[10px] font-mono px-1.5 uppercase"
                  maxLength={7}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              Colors used in preview and mockup generation
            </p>
            {hasColorEdits && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetColorsToOriginal}
                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Generate Button */}
      <Button 
        onClick={generateMockup}
        disabled={isGenerating}
        className={cn(
          "w-full gap-2 transition-all duration-300",
          !isGenerating && !generatedMockup && "hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)] hover:scale-105"
        )}
        variant={generatedMockup ? "outline" : "default"}
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating...
          </>
        ) : generatedMockup ? (
          <>
            <RefreshCw className="w-4 h-4" />
            Regenerate
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Generate Mockup
          </>
        )}
      </Button>

      {/* Preview Toggle */}
      {!generatedMockup && !isGenerating && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowPreview(!showPreview)}
          className="w-full h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5"
        >
          {showPreview ? (
            <>
              <EyeOff className="w-3 h-3" />
              Hide Preview
            </>
          ) : (
            <>
              <Eye className="w-3 h-3" />
              Show Preview
            </>
          )}
        </Button>
      )}

      {/* Mockup Display or Preview */}
      {generatedMockup ? (
        <div className="relative group">
          <img 
            src={generatedMockup} 
            alt={`${title} Product Mockup`}
            className="w-full rounded-lg shadow-md cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setIsImageModalOpen(true)}
          />
          {/* Hover overlay */}
          <div 
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            onClick={() => setIsImageModalOpen(true)}
          >
            <div className="bg-black/50 text-white px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5">
              <ZoomIn className="w-3 h-3" />
              Click to enlarge
            </div>
          </div>
          {/* Download button */}
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button 
              size="sm" 
              variant="secondary" 
              onClick={(e) => { e.stopPropagation(); downloadMockup(); }} 
              className="gap-1 h-7 text-xs"
            >
              <Download className="w-3 h-3" />
              Save
            </Button>
          </div>
        </div>
      ) : !isGenerating && showPreview ? (
        <LabelPreview 
          text={editedFrontPanelText}
          primaryColor={editedPrimaryColor}
          secondaryColor={editedSecondaryColor}
          accentColor={editedAccentColor}
          packagingFormat={selectedFormat}
        />
      ) : !isGenerating ? (
        <div className="h-[200px] rounded-lg border-2 border-dashed border-border/50 flex flex-col items-center justify-center text-muted-foreground bg-muted/20">
          <ImageIcon className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-xs font-medium">No mockup yet</p>
          <p className="text-[10px] mt-0.5">Click generate above</p>
        </div>
      ) : null}

      {/* Full Image Modal */}
      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent className="max-w-4xl w-full p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Icon className={cn("w-5 h-5", isLeaders ? "text-blue-600" : "text-orange-600")} />
              {title} Product Mockup
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 pt-0">
            {generatedMockup && (
              <div className="relative">
                <img 
                  src={generatedMockup} 
                  alt={`${title} Product Mockup - Full Size`}
                  className="w-full h-auto rounded-lg shadow-lg"
                />
                <div className="absolute bottom-4 right-4 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={downloadMockup} className="gap-1.5 shadow-lg">
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function DualMockupGenerator({ analysis, mockupImages, onSaveMockup }: DualMockupGeneratorProps) {
  if (!analysis?.match_leaders || !analysis?.match_disruptors) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Package className="w-4 h-4 text-chart-2" />
        <span className="text-sm font-medium text-foreground">Generate Mockups for Both Strategies</span>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MockupCard
          strategy={analysis.match_leaders}
          strategyType="match_leaders"
          mockupUrl={mockupImages.match_leaders}
          onSaveMockup={(url) => onSaveMockup(url, 'match_leaders')}
        />
        <MockupCard
          strategy={analysis.match_disruptors}
          strategyType="match_disruptors"
          mockupUrl={mockupImages.match_disruptors}
          onSaveMockup={(url) => onSaveMockup(url, 'match_disruptors')}
        />
      </div>

      {/* Completion indicator */}
      {mockupImages.match_leaders && mockupImages.match_disruptors && (
        <div className="flex items-center justify-center gap-2 p-3 bg-chart-4/10 rounded-lg border border-chart-4/20">
          <Badge variant="secondary" className="bg-chart-4/20 text-chart-4 border-chart-4/30">
            ✓ Both mockups generated
          </Badge>
        </div>
      )}
    </div>
  );
}
