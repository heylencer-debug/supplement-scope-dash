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
  Palette,
  UtensilsCrossed,
  LayoutGrid,
  Upload,
  X
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
import { MockupImages, StrategyCustomization, PackagingCustomizations } from "@/hooks/usePackagingAnalysis";
import { useMockupHistory } from "@/hooks/useMockupHistory";
import { useFlatLayoutHistory } from "@/hooks/useFlatLayoutHistory";
import { MockupHistoryGallery } from "@/components/dashboard/MockupHistoryGallery";
import { FlatLayoutHistoryGallery } from "@/components/dashboard/FlatLayoutHistoryGallery";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SuggestedTone {
  primary_tone: string;
  tone_descriptors: string[];
  emotional_appeal: string;
  copy_voice: string;
}

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
    suggested_tone?: SuggestedTone;
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
  categoryId?: string;
  formulaVersionId?: string | null;
  detectedFlavor?: string | null;
  customizations?: PackagingCustomizations | null;
  onSaveCustomizations?: (strategyType: 'match_leaders' | 'match_disruptors', updates: StrategyCustomization) => Promise<void>;
  onClearCustomizations?: (strategyType: 'match_leaders' | 'match_disruptors') => Promise<void>;
}

const packagingFormatOptions = [
  // Pouches
  { value: "soft chew resealable pouch", label: "Resealable Pouch (Soft Chews)" },
  { value: "resealable stand-up pouch", label: "Stand-Up Pouch" },
  // Standard Jars
  { value: "wide-mouth plastic jar", label: "Wide-Mouth Jar (Plastic)" },
  { value: "narrow-mouth plastic jar", label: "Tall Slim Jar (Plastic)" },
  { value: "glass jar with screw cap", label: "Glass Jar" },
  { value: "narrow-mouth glass jar", label: "Tall Slim Jar (Glass)" },
  { value: "tall clear glass jar", label: "Tall Jar Glass (Clear)" },
  // Specialty Jars
  { value: "hexagonal glass jar", label: "Hexagonal Glass Jar" },
  { value: "square glass jar", label: "Square Glass Jar" },
  { value: "amber apothecary jar", label: "Amber Apothecary Jar" },
  { value: "cobalt blue glass jar", label: "Cobalt Blue Glass Jar" },
  { value: "mason jar", label: "Mason Jar" },
  // Bottles
  { value: "supplement bottle with flip cap", label: "Bottle (Flip Cap)" },
  { value: "dropper bottle", label: "Dropper Bottle" },
  { value: "amber dropper bottle", label: "Amber Dropper Bottle" },
  { value: "squeeze bottle", label: "Squeeze Bottle" },
  { value: "pump bottle", label: "Pump Bottle" },
  // Other Formats
  { value: "tube packaging", label: "Tube" },
  { value: "sachet packet", label: "Sachet/Packet" },
  { value: "blister pack", label: "Blister Pack" },
  { value: "tin container", label: "Tin Container" },
  { value: "kraft paper bag", label: "Kraft Paper Bag" },
];

const toneOptions = [
  { value: "auto", label: "AI Suggested", description: "Use AI-recommended tone" },
  { value: "premium", label: "Premium", description: "Luxury, sophisticated, high-end" },
  { value: "clinical", label: "Clinical", description: "Scientific, medical, trust-focused" },
  { value: "playful", label: "Playful", description: "Fun, friendly, approachable" },
  { value: "natural", label: "Natural", description: "Organic, earthy, wholesome" },
  { value: "bold", label: "Bold", description: "Aggressive, energetic, powerful" },
  { value: "wellness", label: "Wellness", description: "Calm, balanced, holistic" },
  { value: "scientific", label: "Scientific", description: "Data-driven, research-backed" },
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
  categoryId,
  formulaVersionId,
  detectedFlavor,
  logoImageUrl,
  savedCustomization,
  onSaveCustomizations,
  onClearCustomizations,
}: {
  strategy: PackagingStrategy;
  strategyType: 'match_leaders' | 'match_disruptors';
  mockupUrl: string | null;
  onSaveMockup: (imageUrl: string) => Promise<void>;
  categoryId?: string;
  formulaVersionId?: string | null;
  detectedFlavor?: string | null;
  logoImageUrl?: string | null;
  savedCustomization?: StrategyCustomization | null;
  onSaveCustomizations?: (updates: StrategyCustomization) => Promise<void>;
  onClearCustomizations?: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedMockup, setGeneratedMockup] = useState<string | null>(mockupUrl);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [isEditingColors, setIsEditingColors] = useState(false);
  const [showPreview, setShowPreview] = useState(true); // Show preview by default
  
  // Flat layout state
  const [isGeneratingFlat, setIsGeneratingFlat] = useState(false);
  const [flatLayoutUrl, setFlatLayoutUrl] = useState<string | null>(null);
  const [isFlatModalOpen, setIsFlatModalOpen] = useState(false);
  const [flatLayoutMode, setFlatLayoutMode] = useState<'full' | 'front_only'>('full');
  
  // Mockup history
  const { 
    history, 
    isLoading: isHistoryLoading, 
    saveMockupToHistory, 
    deleteMockupFromHistory 
  } = useMockupHistory({
    categoryId, 
    strategyType,
    formulaVersionId 
  });
  
  // Flat layout history
  const {
    history: flatHistory,
    isLoading: isFlatHistoryLoading,
    saveFlatLayoutToHistory,
    deleteFlatLayoutFromHistory
  } = useFlatLayoutHistory({
    categoryId,
    strategyType,
    formulaVersionId
  });
  
  // Handler for restoring mockup from history
  const handleRestoreMockup = async (imageUrl: string) => {
    setGeneratedMockup(imageUrl);
    await onSaveMockup(imageUrl);
    toast({
      title: 'Mockup Restored',
      description: 'Previous mockup has been restored as the current one.',
    });
  };
  
  // Handler for restoring flat layout from history
  const handleRestoreFlatLayout = (imageUrl: string) => {
    setFlatLayoutUrl(imageUrl);
    setIsFlatModalOpen(true);
    toast({
      title: 'Flat Layout Restored',
      description: 'Previous flat layout has been restored.',
    });
  };
  
  // Editable mock content - initialize from saved customization or original
  // Always prioritize saved customization (includes Gemini rewrites) over original mock_content
  const originalFrontPanelText = strategy.mock_content?.front_panel_text || '';
  
  const [editedFrontPanelText, setEditedFrontPanelText] = useState(
    savedCustomization?.front_panel_text ?? originalFrontPanelText
  );
  const hasTextEdits = editedFrontPanelText !== originalFrontPanelText;
  
  // AI rewrite state
  const [isRewriting, setIsRewriting] = useState(false);
  const [selectedRewriteStyle, setSelectedRewriteStyle] = useState<string | null>(null);
  
  const rewriteStyles = [
    { value: 'professional', label: 'Professional', icon: '🏥' },
    { value: 'playful', label: 'Playful', icon: '🎉' },
    { value: 'premium', label: 'Premium', icon: '✨' },
    { value: 'minimal', label: 'Minimal', icon: '◻️' },
    { value: 'bold', label: 'Bold', icon: '💪' },
  ];

  const handleRewriteText = async (style: string) => {
    setIsRewriting(true);
    setSelectedRewriteStyle(style);
    try {
      const { data, error } = await supabase.functions.invoke('rewrite-label-text', {
        body: {
          currentText: editedFrontPanelText,
          style,
          productContext: strategy.design_brief?.primary_claim
        }
      });

      if (error) throw error;
      if (data?.rewrittenText) {
        setEditedFrontPanelText(data.rewrittenText);
        // Auto-save the rewritten text
        onSaveCustomizations?.({ front_panel_text: data.rewrittenText });
        toast({
          title: 'Label Rewritten',
          description: `Text updated with ${style} style.`,
        });
      }
    } catch (err) {
      console.error('Rewrite error:', err);
      toast({
        title: 'Rewrite Failed',
        description: err instanceof Error ? err.message : 'Failed to rewrite text',
        variant: 'destructive',
      });
    } finally {
      setIsRewriting(false);
      setSelectedRewriteStyle(null);
    }
  };
  
  // Editable colors - initialize from saved customization or original
  const originalPrimaryColor = strategy.design_brief?.primary_color?.hex || '#1e3a5f';
  const originalSecondaryColor = strategy.design_brief?.secondary_color?.hex || '#ffffff';
  const originalAccentColor = strategy.design_brief?.accent_color?.hex || '#0ea5e9';
  const [editedPrimaryColor, setEditedPrimaryColor] = useState(
    savedCustomization?.primary_color ?? originalPrimaryColor
  );
  const [editedSecondaryColor, setEditedSecondaryColor] = useState(
    savedCustomization?.secondary_color ?? originalSecondaryColor
  );
  const [editedAccentColor, setEditedAccentColor] = useState(
    savedCustomization?.accent_color ?? originalAccentColor
  );
  const hasColorEdits = 
    editedPrimaryColor !== originalPrimaryColor ||
    editedSecondaryColor !== originalSecondaryColor ||
    editedAccentColor !== originalAccentColor;
  
  const isLeaders = strategyType === 'match_leaders';
  const Icon = isLeaders ? Crown : Rocket;
  const title = isLeaders ? 'Match Leaders' : 'Match Disruptors';
  const accentClass = isLeaders ? 'text-blue-600 bg-blue-500/10' : 'text-orange-600 bg-orange-500/10';
  
  // Get recommended packaging format from strategy - prioritize saved customization
  const recommendedFormat = strategy.design_brief?.packaging_format || "soft chew resealable pouch";
  const [selectedFormat, setSelectedFormat] = useState(
    savedCustomization?.packaging_format ?? recommendedFormat
  );
  
  // Tone selector - defaults to saved customization or "auto"
  const [selectedTone, setSelectedTone] = useState<string>(
    savedCustomization?.selected_tone ?? "auto"
  );
  
  // Handle packaging format change with persistence
  const handleFormatChange = (format: string) => {
    setSelectedFormat(format);
    onSaveCustomizations?.({ packaging_format: format });
  };
  
  // Handle tone change with persistence
  const handleToneChange = (tone: string) => {
    setSelectedTone(tone);
    onSaveCustomizations?.({ selected_tone: tone });
  };
  
  // Sync format from saved customization when it changes
  useEffect(() => {
    if (savedCustomization?.packaging_format) {
      setSelectedFormat(savedCustomization.packaging_format);
    }
  }, [savedCustomization?.packaging_format]);
  
  // Sync tone from saved customization when it changes  
  useEffect(() => {
    if (savedCustomization?.selected_tone) {
      setSelectedTone(savedCustomization.selected_tone);
    }
  }, [savedCustomization?.selected_tone]);

  // Update when mockupUrl prop changes, but NOT while generating (prevents race condition)
  useEffect(() => {
    if (!isGenerating && !isGeneratingFlat) {
      setGeneratedMockup(mockupUrl);
    }
  }, [mockupUrl, isGenerating, isGeneratingFlat]);
  
  // Initialize text from saved customization or original when strategy changes
  // Always prioritize saved customization (includes Gemini rewrites)
  useEffect(() => {
    if (savedCustomization?.front_panel_text) {
      setEditedFrontPanelText(savedCustomization.front_panel_text);
    } else {
      setEditedFrontPanelText(strategy.mock_content?.front_panel_text || '');
    }
  }, [strategy.mock_content?.front_panel_text, savedCustomization?.front_panel_text]);
  
  // Initialize colors from saved customization or original when strategy changes
  useEffect(() => {
    if (!savedCustomization?.primary_color) {
      setEditedPrimaryColor(strategy.design_brief?.primary_color?.hex || '#1e3a5f');
    }
    if (!savedCustomization?.secondary_color) {
      setEditedSecondaryColor(strategy.design_brief?.secondary_color?.hex || '#ffffff');
    }
    if (!savedCustomization?.accent_color) {
      setEditedAccentColor(strategy.design_brief?.accent_color?.hex || '#0ea5e9');
    }
  }, [
    strategy.design_brief?.primary_color?.hex, 
    strategy.design_brief?.secondary_color?.hex, 
    strategy.design_brief?.accent_color?.hex,
    savedCustomization?.primary_color,
    savedCustomization?.secondary_color,
    savedCustomization?.accent_color
  ]);
  
  // Auto-save text on blur
  const handleTextBlur = () => {
    if (editedFrontPanelText !== originalFrontPanelText) {
      onSaveCustomizations?.({ front_panel_text: editedFrontPanelText });
    }
  };
  
  // Auto-save colors on change
  const handlePrimaryColorChange = (color: string) => {
    setEditedPrimaryColor(color);
    onSaveCustomizations?.({ primary_color: color });
  };
  
  const handleSecondaryColorChange = (color: string) => {
    setEditedSecondaryColor(color);
    onSaveCustomizations?.({ secondary_color: color });
  };
  
  const handleAccentColorChange = (color: string) => {
    setEditedAccentColor(color);
    onSaveCustomizations?.({ accent_color: color });
  };
  
  const resetTextToOriginal = async () => {
    setEditedFrontPanelText(originalFrontPanelText);
    await onClearCustomizations?.();
  };
  
  const resetColorsToOriginal = async () => {
    setEditedPrimaryColor(originalPrimaryColor);
    setEditedSecondaryColor(originalSecondaryColor);
    setEditedAccentColor(originalAccentColor);
    // Save the cleared colors
    onSaveCustomizations?.({ 
      primary_color: originalPrimaryColor, 
      secondary_color: originalSecondaryColor, 
      accent_color: originalAccentColor 
    });
  };
  
  const generateMockup = async () => {
    setIsGenerating(true);
    try {
      const designBrief = strategy.design_brief;
      const mockContent = strategy.mock_content;
      const elements = strategy.elements_checklist;

      // Determine the tone to use - either user-selected or AI-suggested
      const effectiveTone = selectedTone === "auto" 
        ? designBrief.suggested_tone 
        : { 
            primary_tone: selectedTone, 
            tone_descriptors: toneOptions.find(t => t.value === selectedTone)?.description?.split(', ') || [],
            emotional_appeal: toneOptions.find(t => t.value === selectedTone)?.description || '',
            copy_voice: selectedTone 
          };

      // Detect if user has customized colors from the original
      const colorsCustomized = 
        editedPrimaryColor !== strategy.design_brief?.primary_color?.hex ||
        editedSecondaryColor !== strategy.design_brief?.secondary_color?.hex ||
        editedAccentColor !== strategy.design_brief?.accent_color?.hex;

      // Detect if text has been customized (different from original mock content)
      const originalFrontPanelText = mockContent?.front_panel_text || '';
      const textCustomized = editedFrontPanelText !== originalFrontPanelText && editedFrontPanelText.length > 0;

      // Extract product name from customized text if available (first line is typically product name)
      const extractedProductName = textCustomized && editedFrontPanelText
        ? editedFrontPanelText.split('\n')[0].trim()
        : (designBrief as any).product_name || designBrief.primary_claim;

      // Only use original brand name if text hasn't been customized by AI rewriter
      const effectiveBrandName = textCustomized
        ? '' // Let the front panel text be the source of truth
        : (designBrief as any).brand_name || 'PREMIUM';

      // Log the data being sent to mockup generator for debugging
      console.log("Sending to mockup generator:", {
        labelAtmosphere: (designBrief as any).label_atmosphere,
        labelHierarchy: (designBrief as any).label_hierarchy,
        claimsWithIcons: (designBrief as any).claims_with_icons,
        colorsCustomized,
        textCustomized,
        extractedProductName,
        effectiveBrandName,
      });

      const { data, error } = await supabase.functions.invoke('generate-product-mockup', {
        body: {
          logoImageUrl, // Pass logo image
          designBrief: {
            // Brand & Product Identity - use extracted values when text is customized
            brandName: effectiveBrandName,
            productName: extractedProductName,
            textCustomized, // Flag to tell edge function to prioritize frontPanelText
            // Colors
            primaryColor: { hex: editedPrimaryColor, name: strategy.design_brief?.primary_color?.name || 'Primary' },
            secondaryColor: { hex: editedSecondaryColor, name: strategy.design_brief?.secondary_color?.name || 'Secondary' },
            accentColor: { hex: editedAccentColor, name: strategy.design_brief?.accent_color?.name || 'Accent' },
            colorsCustomized, // NEW: Flag to tell edge function to prioritize user colors
            // Claims & Content
            primaryClaim: designBrief.primary_claim,
            certifications: designBrief.certifications,
            bulletPoints: elements?.bullet_points || [],
            callToAction: elements?.call_to_action,
            headlineFont: designBrief.headline_font,
            bodyFont: designBrief.body_font,
            frontPanelText: editedFrontPanelText,
            backPanelText: mockContent?.back_panel_text,
            keyDifferentiators: designBrief.key_differentiators,
            trustSignals: elements?.trust_signals || [],
            packagingFormat: selectedFormat,
            flavorText: detectedFlavor,
            suggestedTone: effectiveTone,
            heroImagery: (designBrief as any).hero_imagery,
            // NEW: Pass AI-generated label design fields
            labelAtmosphere: (designBrief as any).label_atmosphere,
            labelHierarchy: (designBrief as any).label_hierarchy,
            claimsWithIcons: (designBrief as any).claims_with_icons,
          }
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.imageUrl) {
        setGeneratedMockup(data.imageUrl);
        await onSaveMockup(data.imageUrl);
        
        // Save to history
        await saveMockupToHistory(
          data.imageUrl,
          strategyType,
          selectedFormat,
          {
            colors: {
              primary: editedPrimaryColor,
              accent: editedAccentColor,
              background: editedSecondaryColor
            },
            text: {
              headline: designBrief.primary_claim
            }
          }
        );
        
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

  const generateFlatLayout = async () => {
    // Require a generated mockup first
    if (!generatedMockup) {
      toast({
        title: 'Generate Mockup First',
        description: 'Please generate a 3D mockup before creating the flat layout.',
        variant: 'destructive',
      });
      return;
    }
    
    // Debug logging
    console.log("Generating flat layout with reference image");
    console.log("Reference image type:", generatedMockup.startsWith('data:image') ? 'base64' : generatedMockup.startsWith('http') ? 'URL' : 'unknown');
    console.log("Reference image length:", generatedMockup.length);
    
    setIsGeneratingFlat(true);
    try {
      const designBrief = strategy.design_brief;
      const mockContent = strategy.mock_content;
      const elements = strategy.elements_checklist;

      const effectiveTone = selectedTone === "auto" 
        ? designBrief.suggested_tone 
        : { 
            primary_tone: selectedTone, 
            tone_descriptors: toneOptions.find(t => t.value === selectedTone)?.description?.split(', ') || [],
            emotional_appeal: toneOptions.find(t => t.value === selectedTone)?.description || '',
            copy_voice: selectedTone 
          };

      const { data, error } = await supabase.functions.invoke('generate-product-mockup', {
        body: {
          mode: 'flat_layout',
          flatLayoutMode: flatLayoutMode,
          referenceImageUrl: generatedMockup,
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
            frontPanelText: editedFrontPanelText,
            backPanelText: mockContent?.back_panel_text,
            keyDifferentiators: designBrief.key_differentiators,
            trustSignals: elements?.trust_signals || [],
            packagingFormat: selectedFormat,
            flavorText: detectedFlavor,
            suggestedTone: effectiveTone,
            heroImagery: (designBrief as any).hero_imagery,
            // NEW: Pass AI-generated label design fields
            labelAtmosphere: (designBrief as any).label_atmosphere,
            labelHierarchy: (designBrief as any).label_hierarchy,
            claimsWithIcons: (designBrief as any).claims_with_icons,
          }
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.imageUrl) {
        setFlatLayoutUrl(data.imageUrl);
        setIsFlatModalOpen(true);
        
        // Save to history
        if (categoryId) {
          await saveFlatLayoutToHistory(
            data.imageUrl,
            selectedFormat,
            {
              colors: { primary: editedPrimaryColor, secondary: editedSecondaryColor, accent: editedAccentColor },
              layout_mode: flatLayoutMode
            }
          );
        }
        
        toast({
          title: 'Flat Layout Generated!',
          description: 'Print-ready layout is ready for download.',
        });
      }
    } catch (err) {
      console.error('Flat layout generation error:', err);
      toast({
        title: 'Generation Failed',
        description: err instanceof Error ? err.message : 'Failed to generate flat layout',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingFlat(false);
    }
  };

  const downloadFlatLayout = () => {
    if (!flatLayoutUrl) return;
    const link = document.createElement('a');
    link.href = flatLayoutUrl;
    link.download = `flat-layout-${strategyType}.png`;
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

      {/* Detected Flavor */}
      {detectedFlavor && (
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-3.5 h-3.5 text-amber-600" />
            <div>
              <p className="text-xs font-medium text-amber-700">Detected Flavor</p>
              <p className="text-xs text-amber-600">{detectedFlavor}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tone Selector */}
      <div className="p-2.5 bg-purple-500/10 border border-purple-500/20 rounded-lg space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
          <p className="text-xs font-medium text-purple-700">Design Tone</p>
        </div>
        
        <Select value={selectedTone} onValueChange={handleToneChange}>
          <SelectTrigger className="w-full bg-background/80 h-8 text-xs border-purple-500/30">
            <SelectValue placeholder="Select tone" />
          </SelectTrigger>
          <SelectContent>
            {toneOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex flex-col">
                  <span className="font-medium">{option.label}</span>
                  <span className="text-[10px] text-muted-foreground">{option.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Show AI suggestion when "auto" is selected */}
        {selectedTone === "auto" && strategy.design_brief?.suggested_tone && (
          <div className="text-[10px] text-purple-600 bg-purple-500/10 rounded px-2 py-1">
            <span className="font-medium">AI suggests: </span>
            <span className="capitalize">{strategy.design_brief.suggested_tone.primary_tone}</span>
            {strategy.design_brief.suggested_tone.emotional_appeal && (
              <span> • {strategy.design_brief.suggested_tone.emotional_appeal}</span>
            )}
          </div>
        )}
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
        <Select value={selectedFormat} onValueChange={handleFormatChange}>
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

      {/* Logo indicator (upload is handled in parent) */}
      {logoImageUrl && (
        <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
          <img 
            src={logoImageUrl} 
            alt="Brand logo" 
            className="h-8 w-auto max-w-[60px] object-contain rounded border bg-white p-0.5" 
          />
          <p className="text-xs text-emerald-600 flex items-center gap-1">
            ✓ Logo will be applied
          </p>
        </div>
      )}

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
            onBlur={handleTextBlur}
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
          
          {/* AI Rewrite Options */}
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border/50">
            <span className="text-[10px] text-muted-foreground w-full mb-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Rewrite with Gemini 3 Pro:
            </span>
            {rewriteStyles.map((style) => (
              <Button
                key={style.value}
                variant="outline"
                size="sm"
                onClick={() => handleRewriteText(style.value)}
                disabled={isRewriting}
                className="h-6 px-2 text-[10px] gap-1"
              >
                {isRewriting && selectedRewriteStyle === style.value ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <span>{style.icon}</span>
                )}
                {style.label}
              </Button>
            ))}
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
                  onChange={(e) => handlePrimaryColorChange(e.target.value)}
                  className="w-8 h-8 p-0.5 cursor-pointer rounded border-border"
                />
                <Input
                  type="text"
                  value={editedPrimaryColor}
                  onChange={(e) => handlePrimaryColorChange(e.target.value)}
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
                  onChange={(e) => handleSecondaryColorChange(e.target.value)}
                  className="w-8 h-8 p-0.5 cursor-pointer rounded border-border"
                />
                <Input
                  type="text"
                  value={editedSecondaryColor}
                  onChange={(e) => handleSecondaryColorChange(e.target.value)}
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
                  onChange={(e) => handleAccentColorChange(e.target.value)}
                  className="w-8 h-8 p-0.5 cursor-pointer rounded border-border"
                />
                <Input
                  type="text"
                  value={editedAccentColor}
                  onChange={(e) => handleAccentColorChange(e.target.value)}
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
          
          {/* Flat Layout Options */}
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <Select value={flatLayoutMode} onValueChange={(v: 'full' | 'front_only') => setFlatLayoutMode(v)}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Dieline (All Panels)</SelectItem>
                  <SelectItem value="front_only">Front Panel Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={generateFlatLayout}
              disabled={isGeneratingFlat}
              className="w-full gap-1.5 text-xs"
            >
              {isGeneratingFlat ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating Flat...
                </>
              ) : (
                <>
                  <LayoutGrid className="w-3.5 h-3.5" />
                  Generate {flatLayoutMode === 'front_only' ? 'Front Panel' : 'Flat Layout'}
                </>
              )}
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

      {/* Mockup History Gallery */}
      {categoryId && (
        <MockupHistoryGallery
          history={history}
          isLoading={isHistoryLoading}
          onRestore={handleRestoreMockup}
          onDelete={deleteMockupFromHistory}
        />
      )}
      
      {/* Flat Layout History Gallery */}
      {categoryId && (
        <FlatLayoutHistoryGallery
          history={flatHistory}
          isLoading={isFlatHistoryLoading}
          onRestore={handleRestoreFlatLayout}
          onDelete={deleteFlatLayoutFromHistory}
        />
      )}

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

      {/* Flat Layout Modal with Tabs */}
      <Dialog open={isFlatModalOpen} onOpenChange={setIsFlatModalOpen}>
        <DialogContent className="max-w-5xl w-full p-0 overflow-hidden max-h-[90vh]">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <LayoutGrid className={cn("w-5 h-5", isLeaders ? "text-blue-600" : "text-orange-600")} />
              {title} Flat Layout
            </DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="preview" className="w-full">
            <div className="px-4">
              <TabsList className="grid w-full grid-cols-2 h-9">
                <TabsTrigger value="preview" className="text-xs">Preview</TabsTrigger>
                <TabsTrigger value="history" className="text-xs">
                  History ({flatHistory.length})
                </TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="preview" className="p-4 pt-3 mt-0">
              {flatLayoutUrl ? (
                <div className="relative">
                  <img 
                    src={flatLayoutUrl} 
                    alt={`${title} Flat Layout - Print Ready`}
                    className="w-full h-auto rounded-lg shadow-lg bg-muted max-h-[60vh] object-contain"
                  />
                  <div className="absolute bottom-4 right-4 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={downloadFlatLayout} className="gap-1.5 shadow-lg">
                      <Download className="w-4 h-4" />
                      Download for Photoshop
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <LayoutGrid className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-sm">No flat layout generated yet</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center mt-3">
                {flatLayoutMode === 'front_only' 
                  ? 'This shows the front panel only, ready for print production.'
                  : 'This flat layout shows all panels unwrapped and ready for print production or editing in Photoshop.'}
              </p>
            </TabsContent>
            
            <TabsContent value="history" className="p-4 pt-3 mt-0">
              {flatHistory.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto">
                  {flatHistory.map((item) => (
                    <div 
                      key={item.id} 
                      className="group relative rounded-lg border border-border overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all bg-muted"
                      onClick={() => handleRestoreFlatLayout(item.image_url)}
                    >
                      <img 
                        src={item.image_url} 
                        alt="Flat layout"
                        className="w-full aspect-square object-cover"
                      />
                      <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button size="sm" variant="secondary" className="gap-1 text-xs">
                          <Eye className="w-3 h-3" />
                          View
                        </Button>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-background/90 text-[10px] text-center py-1 px-1">
                        <div className="font-medium">
                          {new Date(item.created_at).toLocaleDateString()}
                        </div>
                        {item.design_settings?.layout_mode === 'front_only' && (
                          <Badge variant="secondary" className="text-[8px] h-3 px-1 mt-0.5">
                            Front Only
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : isFlatHistoryLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-2">Loading history...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <LayoutGrid className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-sm">No flat layouts in history yet</p>
                  <p className="text-xs mt-1">Generate a flat layout to start building history</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function DualMockupGenerator({ analysis, mockupImages, onSaveMockup, categoryId, formulaVersionId, detectedFlavor, customizations, onSaveCustomizations, onClearCustomizations }: DualMockupGeneratorProps) {
  const { toast } = useToast();
  
  // Shared logo state - persisted to database
  const [logoImageUrl, setLogoImageUrl] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isLoadingLogo, setIsLoadingLogo] = useState(true);
  
  // Load logo from database on mount
  useEffect(() => {
    if (!categoryId) {
      setIsLoadingLogo(false);
      return;
    }
    
    const loadLogo = async () => {
      try {
        const { data, error } = await supabase
          .from('categories')
          .select('logo_image_url')
          .eq('id', categoryId)
          .single();
        
        if (error) throw error;
        if (data?.logo_image_url) {
          setLogoImageUrl(data.logo_image_url);
        }
      } catch (err) {
        console.error('Failed to load logo:', err);
      } finally {
        setIsLoadingLogo(false);
      }
    };
    
    loadLogo();
  }, [categoryId]);
  
  // Save logo to database
  const saveLogo = async (url: string | null) => {
    if (!categoryId) return;
    
    try {
      const { error } = await supabase
        .from('categories')
        .update({ logo_image_url: url })
        .eq('id', categoryId);
      
      if (error) throw error;
    } catch (err) {
      console.error('Failed to save logo:', err);
      toast({
        title: 'Failed to Save Logo',
        description: 'Logo will still be used but may not persist.',
        variant: 'destructive',
      });
    }
  };
  
  // Logo upload handler
  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid File',
        description: 'Please upload an image file (PNG, JPG, SVG).',
        variant: 'destructive',
      });
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File Too Large',
        description: 'Logo image must be under 5MB.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsUploadingLogo(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const url = e.target?.result as string;
      setLogoImageUrl(url);
      await saveLogo(url);
      setIsUploadingLogo(false);
      toast({
        title: 'Logo Saved',
        description: 'Your logo has been saved and will be used for all mockups in this category.',
      });
    };
    reader.onerror = () => {
      setIsUploadingLogo(false);
      toast({
        title: 'Upload Failed',
        description: 'Failed to read the logo file.',
        variant: 'destructive',
      });
    };
    reader.readAsDataURL(file);
  };
  
  const handleRemoveLogo = async () => {
    setLogoImageUrl(null);
    await saveLogo(null);
    toast({
      title: 'Logo Removed',
      description: 'The logo has been removed from this category.',
    });
  };

  if (!analysis?.match_leaders || !analysis?.match_disruptors) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Package className="w-4 h-4 text-chart-2" />
        <span className="text-sm font-medium text-foreground">Generate Mockups for Both Strategies</span>
      </div>
      
      {/* Shared Logo Upload Section */}
      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-emerald-600" />
            <p className="text-sm font-medium text-emerald-700">Brand Logo</p>
            <span className="text-xs text-muted-foreground">(shared for both strategies)</span>
          </div>
          {logoImageUrl && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 px-2 hover:bg-destructive/10 hover:text-destructive text-xs"
              onClick={handleRemoveLogo}
            >
              <X className="h-3 w-3 mr-1" />
              Remove
            </Button>
          )}
        </div>
        
        {isLoadingLogo ? (
          <div className="flex items-center gap-2 p-2.5 bg-background/50 rounded border border-emerald-500/20">
            <Loader2 className="h-4 w-4 text-emerald-500 animate-spin" />
            <span className="text-xs text-muted-foreground">Loading saved logo...</span>
          </div>
        ) : logoImageUrl ? (
          <div className="flex items-center gap-3 p-2 bg-background/50 rounded border border-emerald-500/20">
            <img 
              src={logoImageUrl} 
              alt="Brand logo" 
              className="h-12 w-auto max-w-[100px] object-contain rounded border bg-white p-1" 
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                ✓ Logo saved for this category
              </p>
              <p className="text-[10px] text-muted-foreground">
                Will be placed at top of all generated mockups
              </p>
            </div>
          </div>
        ) : (
          <label className="flex items-center gap-2 p-3 border-2 border-dashed border-emerald-500/30 rounded-lg cursor-pointer hover:bg-emerald-500/5 transition-colors">
            {isUploadingLogo ? (
              <Loader2 className="h-4 w-4 text-emerald-500 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 text-emerald-500" />
            )}
            <span className="text-sm text-emerald-700">
              {isUploadingLogo ? 'Processing...' : 'Upload your brand logo (PNG, JPG, SVG)'}
            </span>
            <input 
              type="file" 
              accept="image/png,image/jpeg,image/svg+xml,image/webp" 
              onChange={handleLogoUpload}
              className="hidden" 
              disabled={isUploadingLogo}
            />
          </label>
        )}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MockupCard
          strategy={analysis.match_leaders}
          strategyType="match_leaders"
          mockupUrl={mockupImages.match_leaders}
          onSaveMockup={(url) => onSaveMockup(url, 'match_leaders')}
          categoryId={categoryId}
          formulaVersionId={formulaVersionId}
          detectedFlavor={detectedFlavor}
          logoImageUrl={logoImageUrl}
          savedCustomization={customizations?.match_leaders}
          onSaveCustomizations={onSaveCustomizations ? (updates) => onSaveCustomizations('match_leaders', updates) : undefined}
          onClearCustomizations={onClearCustomizations ? () => onClearCustomizations('match_leaders') : undefined}
        />
        <MockupCard
          strategy={analysis.match_disruptors}
          strategyType="match_disruptors"
          mockupUrl={mockupImages.match_disruptors}
          onSaveMockup={(url) => onSaveMockup(url, 'match_disruptors')}
          categoryId={categoryId}
          formulaVersionId={formulaVersionId}
          detectedFlavor={detectedFlavor}
          logoImageUrl={logoImageUrl}
          savedCustomization={customizations?.match_disruptors}
          onSaveCustomizations={onSaveCustomizations ? (updates) => onSaveCustomizations('match_disruptors', updates) : undefined}
          onClearCustomizations={onClearCustomizations ? () => onClearCustomizations('match_disruptors') : undefined}
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
