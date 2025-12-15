import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Crown, 
  Rocket, 
  CheckCircle2,
  Copy,
  ChevronDown,
  Sparkles,
  ThumbsUp
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Strategy structure from Claude's dual output
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
  recommendation: {
    preferred_strategy: 'match_leaders' | 'match_disruptors';
    reasoning: string;
  };
}

interface DualPackagingStrategiesProps {
  analysis: DualPackagingAnalysis;
  onSelectStrategy?: (strategyType: 'match_leaders' | 'match_disruptors', strategy: PackagingStrategy) => void;
}

function StrategyCard({ 
  strategy, 
  type, 
  isRecommended,
  onSelect 
}: { 
  strategy: PackagingStrategy; 
  type: 'match_leaders' | 'match_disruptors';
  isRecommended: boolean;
  onSelect?: () => void;
}) {
  const { toast } = useToast();
  const [contentOpen, setContentOpen] = useState(false);
  
  const isLeaders = type === 'match_leaders';
  const Icon = isLeaders ? Crown : Rocket;
  const title = isLeaders ? 'Match Leaders' : 'Match Disruptors';
  const subtitle = isLeaders ? 'Conservative Approach' : 'Aggressive Approach';
  
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied!', description: `${label} copied to clipboard` });
    } catch (err) {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all duration-300",
      isRecommended && "ring-2 ring-primary shadow-lg"
    )}>
      {/* Header accent bar */}
      <div 
        className="h-1.5 w-full"
        style={{ backgroundColor: strategy.design_brief.primary_color?.hex || (isLeaders ? '#1e3a5f' : '#e53e3e') }}
      />
      
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "p-2 rounded-lg",
              isLeaders ? "bg-blue-500/10 text-blue-600" : "bg-orange-500/10 text-orange-600"
            )}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {title}
                {isRecommended && (
                  <Badge variant="default" className="text-xs gap-1">
                    <ThumbsUp className="w-3 h-3" />
                    Recommended
                  </Badge>
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Target Competitors */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Target Competitors</p>
          <div className="flex flex-wrap gap-1.5">
            {strategy.target_competitors?.map((comp, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {comp}
              </Badge>
            ))}
          </div>
        </div>
        
        {/* Strategy Summary */}
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-sm">{strategy.strategy_summary}</p>
        </div>
        
        {/* Primary Claim */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Primary Claim</p>
          <div className="flex items-center justify-between p-3 bg-card border border-border rounded-lg">
            <span className="font-semibold text-foreground">
              {strategy.design_brief.primary_claim}
            </span>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => copyToClipboard(strategy.design_brief.primary_claim, 'Primary claim')}
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        
        {/* Colors */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Color Palette</p>
          <div className="flex gap-2">
            {[
              { color: strategy.design_brief.primary_color, label: 'Primary' },
              { color: strategy.design_brief.secondary_color, label: 'Secondary' },
              { color: strategy.design_brief.accent_color, label: 'Accent' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div 
                  className="w-6 h-6 rounded-md border border-border shadow-sm"
                  style={{ backgroundColor: color?.hex || '#ccc' }}
                />
                <span className="text-xs text-muted-foreground">{color?.hex}</span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Key Differentiators */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Key Differentiators</p>
          <div className="flex flex-wrap gap-1.5">
            {strategy.design_brief.key_differentiators?.map((diff, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">
                {diff}
              </Badge>
            ))}
          </div>
        </div>
        
        {/* Bullet Points */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Bullet Points</p>
          <ul className="space-y-1">
            {strategy.elements_checklist.bullet_points?.slice(0, 4).map((bullet, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-chart-4 mt-0.5 shrink-0" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
        
        {/* Expandable Mock Content */}
        <Collapsible open={contentOpen} onOpenChange={setContentOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              <span className="text-sm">View Mock Content</span>
              <ChevronDown className={cn("w-4 h-4 transition-transform", contentOpen && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-muted-foreground">Front Panel</p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-xs"
                  onClick={() => copyToClipboard(strategy.mock_content.front_panel_text, 'Front panel')}
                >
                  <Copy className="w-3 h-3 mr-1" /> Copy
                </Button>
              </div>
              <pre className="text-xs p-3 bg-muted/50 rounded-lg whitespace-pre-wrap font-mono">
                {strategy.mock_content.front_panel_text}
              </pre>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-muted-foreground">Back Panel</p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-xs"
                  onClick={() => copyToClipboard(strategy.mock_content.back_panel_text, 'Back panel')}
                >
                  <Copy className="w-3 h-3 mr-1" /> Copy
                </Button>
              </div>
              <pre className="text-xs p-3 bg-muted/50 rounded-lg whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                {strategy.mock_content.back_panel_text}
              </pre>
            </div>
          </CollapsibleContent>
        </Collapsible>
        
        {/* Reasoning */}
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">{strategy.reasoning}</p>
        </div>
        
        {/* Select Button */}
        {onSelect && (
          <Button 
            onClick={onSelect}
            className="w-full gap-2"
            variant={isRecommended ? "default" : "outline"}
          >
            <Sparkles className="w-4 h-4" />
            Use This Strategy
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function DualPackagingStrategies({ analysis, onSelectStrategy }: DualPackagingStrategiesProps) {
  if (!analysis?.match_leaders || !analysis?.match_disruptors) {
    return null;
  }
  
  const recommendedType = analysis.recommendation?.preferred_strategy || 'match_leaders';
  
  return (
    <div className="space-y-6">
      {/* Recommendation Banner */}
      {analysis.recommendation && (
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <ThumbsUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h4 className="font-semibold text-foreground">
                AI Recommendation: {recommendedType === 'match_leaders' ? 'Match Leaders' : 'Match Disruptors'}
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                {analysis.recommendation.reasoning}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Strategy Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <StrategyCard 
          strategy={analysis.match_leaders}
          type="match_leaders"
          isRecommended={recommendedType === 'match_leaders'}
          onSelect={onSelectStrategy ? () => onSelectStrategy('match_leaders', analysis.match_leaders) : undefined}
        />
        <StrategyCard 
          strategy={analysis.match_disruptors}
          type="match_disruptors"
          isRecommended={recommendedType === 'match_disruptors'}
          onSelect={onSelectStrategy ? () => onSelectStrategy('match_disruptors', analysis.match_disruptors) : undefined}
        />
      </div>
    </div>
  );
}

// Type guard to check if analysis has dual strategies
export function isDualStrategyAnalysis(analysis: any): analysis is DualPackagingAnalysis {
  return analysis && 
    typeof analysis === 'object' && 
    'match_leaders' in analysis && 
    'match_disruptors' in analysis;
}
