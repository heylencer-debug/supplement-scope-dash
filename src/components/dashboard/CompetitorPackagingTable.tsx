import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  ChevronDown, 
  Package, 
  Palette, 
  Tag, 
  Award,
  Circle,
  Square,
  Triangle,
  Hexagon,
  Heart,
  Star,
  MessageSquare,
  Sparkles
} from "lucide-react";
import type { CompetitorPackagingAnalysis } from "@/hooks/usePackagingImageAnalysis";

interface CompetitorPackagingTableProps {
  analyses: CompetitorPackagingAnalysis[];
}

// Get icon for product content shape
function getShapeIcon(shape: string | null) {
  if (!shape) return null;
  const lower = shape.toLowerCase();
  if (lower.includes('bear') || lower.includes('round') || lower.includes('sphere') || lower.includes('circle')) {
    return <Circle className="w-3 h-3" />;
  }
  if (lower.includes('bone') || lower.includes('rectangle') || lower.includes('square')) {
    return <Square className="w-3 h-3" />;
  }
  if (lower.includes('triangle') || lower.includes('wedge')) {
    return <Triangle className="w-3 h-3" />;
  }
  if (lower.includes('heart')) {
    return <Heart className="w-3 h-3" />;
  }
  if (lower.includes('star')) {
    return <Star className="w-3 h-3" />;
  }
  return <Hexagon className="w-3 h-3" />;
}

// Get color dot style
function getColorStyle(color: string) {
  const colorMap: Record<string, string> = {
    'orange': 'bg-orange-500',
    'yellow': 'bg-yellow-400',
    'red': 'bg-red-500',
    'pink': 'bg-pink-400',
    'purple': 'bg-purple-500',
    'blue': 'bg-blue-500',
    'green': 'bg-green-500',
    'brown': 'bg-amber-700',
    'tan': 'bg-amber-300',
    'white': 'bg-white border border-border',
    'black': 'bg-gray-900',
    'gray': 'bg-gray-400',
    'grey': 'bg-gray-400',
    'gold': 'bg-yellow-500',
    'amber': 'bg-amber-500',
    'beige': 'bg-amber-100',
    'cream': 'bg-amber-50',
  };
  
  const lower = color.toLowerCase();
  for (const [key, value] of Object.entries(colorMap)) {
    if (lower.includes(key)) return value;
  }
  return 'bg-gray-300';
}

// Get tone badge color
function getToneBadgeStyle(tone: string) {
  const lower = tone.toLowerCase();
  if (lower.includes('clinical') || lower.includes('scientific')) {
    return 'bg-chart-3/10 text-chart-3 border-chart-3/20';
  }
  if (lower.includes('playful') || lower.includes('fun')) {
    return 'bg-chart-2/10 text-chart-2 border-chart-2/20';
  }
  if (lower.includes('premium') || lower.includes('luxury')) {
    return 'bg-chart-5/10 text-chart-5 border-chart-5/20';
  }
  if (lower.includes('aggressive') || lower.includes('urgent')) {
    return 'bg-destructive/10 text-destructive border-destructive/20';
  }
  if (lower.includes('wellness') || lower.includes('natural')) {
    return 'bg-chart-4/10 text-chart-4 border-chart-4/20';
  }
  return 'bg-muted text-muted-foreground border-border';
}

// Get urgency indicator
function getUrgencyIndicator(level: string) {
  switch (level) {
    case 'high':
      return { color: 'text-destructive', label: 'High Urgency' };
    case 'medium':
      return { color: 'text-chart-2', label: 'Medium Urgency' };
    case 'low':
    default:
      return { color: 'text-chart-4', label: 'Low Urgency' };
  }
}

export function CompetitorPackagingTable({ analyses }: CompetitorPackagingTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (asin: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(asin)) {
        next.delete(asin);
      } else {
        next.add(asin);
      }
      return next;
    });
  };

  if (!analyses || analyses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No packaging image analysis available.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="w-[80px]">Image</TableHead>
            <TableHead className="min-w-[180px]">Label Content</TableHead>
            <TableHead className="w-[130px]">Messaging Tone</TableHead>
            <TableHead className="w-[150px]">Product Contents</TableHead>
            <TableHead className="w-[130px]">Packaging</TableHead>
            <TableHead className="w-[40px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {analyses.map((item) => {
            const isExpanded = expandedRows.has(item.asin);
            const urgencyInfo = item.messaging_tone ? getUrgencyIndicator(item.messaging_tone.urgency_level) : null;
            
            return (
              <Collapsible key={item.asin} open={isExpanded} onOpenChange={() => toggleRow(item.asin)} asChild>
                <>
                  <TableRow 
                    className={cn(
                      "cursor-pointer transition-colors",
                      isExpanded && "bg-muted/20"
                    )}
                    onClick={() => toggleRow(item.asin)}
                  >
                    {/* Image */}
                    <TableCell className="p-2">
                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted/50 border border-border">
                        {item.image_url ? (
                          <img 
                            src={item.image_url} 
                            alt={item.brand}
                            className="w-full h-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Label Content */}
                    <TableCell className="py-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-foreground line-clamp-1">
                            {item.label_content?.main_title || item.brand}
                          </p>
                          {item.label_content?.x_in_1_claim && (
                            <Badge className="bg-chart-1 text-white font-bold text-[10px] py-0 px-1.5 shrink-0">
                              {item.label_content.x_in_1_claim}
                            </Badge>
                          )}
                        </div>
                        {item.label_content?.serving_info && (
                          <p className="text-xs text-muted-foreground">
                            {item.label_content.serving_info}
                          </p>
                        )}
                        {item.label_content?.benefit_claims && item.label_content.benefit_claims.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.label_content.benefit_claims.slice(0, 4).map((benefit, idx) => (
                              <Badge 
                                key={idx} 
                                variant="outline" 
                                className="text-[9px] py-0 px-1.5 bg-chart-4/10 text-chart-4 border-chart-4/20"
                              >
                                {benefit}
                              </Badge>
                            ))}
                            {item.label_content.benefit_claims.length > 4 && (
                              <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                                +{item.label_content.benefit_claims.length - 4}
                              </Badge>
                            )}
                          </div>
                        )}
                        {item.label_content?.flavor_text && (
                          <p className="text-[10px] text-chart-2 font-medium">
                            {item.label_content.flavor_text}
                          </p>
                        )}
                      </div>
                    </TableCell>

                    {/* Messaging Tone */}
                    <TableCell className="py-3">
                      {item.messaging_tone ? (
                        <div className="space-y-1.5">
                          <Badge 
                            variant="outline" 
                            className={cn("text-xs capitalize", getToneBadgeStyle(item.messaging_tone.primary_tone))}
                          >
                            {item.messaging_tone.primary_tone}
                          </Badge>
                          {urgencyInfo && (
                            <p className={cn("text-[10px]", urgencyInfo.color)}>
                              {urgencyInfo.label}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">N/A</span>
                      )}
                    </TableCell>

                    {/* Product Contents */}
                    <TableCell className="py-3">
                      {item.product_contents ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-xs capitalize">
                              {item.product_contents.type}
                            </Badge>
                          </div>
                          {item.product_contents.shape && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              {getShapeIcon(item.product_contents.shape)}
                              <span className="capitalize">{item.product_contents.shape}</span>
                            </div>
                          )}
                          {item.product_contents.colors && item.product_contents.colors.length > 0 && (
                            <div className="flex items-center gap-1">
                              {item.product_contents.colors.slice(0, 4).map((color, idx) => (
                                <div 
                                  key={idx}
                                  className={cn(
                                    "w-3 h-3 rounded-full",
                                    getColorStyle(color)
                                  )}
                                  title={color}
                                />
                              ))}
                              {item.product_contents.colors.length > 4 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{item.product_contents.colors.length - 4}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">N/A</span>
                      )}
                    </TableCell>

                    {/* Packaging */}
                    <TableCell className="py-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground capitalize">
                          {item.packaging?.type || 'N/A'}
                        </p>
                        {item.packaging && (
                          <p className="text-xs text-muted-foreground capitalize">
                            {item.packaging.material} • {item.packaging.color}
                          </p>
                        )}
                      </div>
                    </TableCell>

                    {/* Expand Toggle */}
                    <TableCell className="py-3">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <ChevronDown className={cn(
                            "h-4 w-4 transition-transform",
                            isExpanded && "rotate-180"
                          )} />
                        </Button>
                      </CollapsibleTrigger>
                    </TableCell>
                  </TableRow>

                  {/* Expanded Content */}
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/10 hover:bg-muted/10">
                      <TableCell colSpan={6} className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                          {/* Full Label Content */}
                          <div className="md:col-span-2">
                            <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                              <Tag className="w-3.5 h-3.5 text-chart-1" />
                              Label Details
                            </h4>
                            <div className="space-y-3">
                              {item.label_content?.x_in_1_claim && (
                                <div>
                                  <p className="text-[10px] uppercase text-muted-foreground mb-1">Main Claim</p>
                                  <Badge className="bg-chart-1 text-white font-bold">
                                    {item.label_content.x_in_1_claim}
                                  </Badge>
                                </div>
                              )}
                              {item.label_content?.serving_info && (
                                <div>
                                  <p className="text-[10px] uppercase text-muted-foreground mb-1">Serving Info</p>
                                  <p className="text-xs text-foreground">{item.label_content.serving_info}</p>
                                </div>
                              )}
                              {item.label_content?.benefit_claims && item.label_content.benefit_claims.length > 0 && (
                                <div>
                                  <p className="text-[10px] uppercase text-muted-foreground mb-1">Benefit Claims ({item.label_content.benefit_claims.length})</p>
                                  <div className="flex flex-wrap gap-1">
                                    {item.label_content.benefit_claims.map((benefit, idx) => (
                                      <Badge 
                                        key={idx} 
                                        variant="outline" 
                                        className="text-[10px] py-0.5 bg-chart-4/10 text-chart-4 border-chart-4/20"
                                      >
                                        {benefit}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {item.label_content?.certifications && item.label_content.certifications.length > 0 && (
                                <div>
                                  <p className="text-[10px] uppercase text-muted-foreground mb-1">Certifications</p>
                                  <div className="flex flex-wrap gap-1">
                                    {item.label_content.certifications.map((cert, idx) => (
                                      <Badge 
                                        key={idx} 
                                        variant="secondary" 
                                        className="text-[10px] py-0.5"
                                      >
                                        {cert}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {item.label_content?.all_visible_text && item.label_content.all_visible_text.length > 0 && (
                                <div>
                                  <p className="text-[10px] uppercase text-muted-foreground mb-1">All Visible Text ({item.label_content.all_visible_text.length})</p>
                                  <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto pr-2">
                                    {item.label_content.all_visible_text.map((text, idx) => (
                                      <li key={idx} className="text-foreground">• {text}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Full Messaging Tone */}
                          <div>
                            <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                              <MessageSquare className="w-3.5 h-3.5 text-chart-3" />
                              Messaging Tone
                            </h4>
                            {item.messaging_tone ? (
                              <div className="space-y-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Primary Tone: </span>
                                  <Badge 
                                    variant="outline" 
                                    className={cn("capitalize ml-1", getToneBadgeStyle(item.messaging_tone.primary_tone))}
                                  >
                                    {item.messaging_tone.primary_tone}
                                  </Badge>
                                </div>
                                {item.messaging_tone.tone_descriptors && item.messaging_tone.tone_descriptors.length > 0 && (
                                  <div>
                                    <p className="text-muted-foreground mb-1">Descriptors:</p>
                                    <div className="flex flex-wrap gap-1">
                                      {item.messaging_tone.tone_descriptors.map((desc, idx) => (
                                        <Badge key={idx} variant="secondary" className="text-[10px] capitalize">
                                          {desc}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div>
                                  <span className="text-muted-foreground">Urgency: </span>
                                  <span className={cn("capitalize", urgencyInfo?.color)}>
                                    {item.messaging_tone.urgency_level}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Emotional Appeal: </span>
                                  <span className="text-foreground capitalize">{item.messaging_tone.emotional_appeal}</span>
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">No tone analysis available</p>
                            )}
                          </div>

                          {/* Full Product Contents */}
                          <div>
                            <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-chart-2" />
                              Product Contents
                            </h4>
                            {item.product_contents ? (
                              <div className="space-y-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Type: </span>
                                  <span className="text-foreground capitalize">{item.product_contents.type}</span>
                                </div>
                                {item.product_contents.shape && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-muted-foreground">Shape: </span>
                                    {getShapeIcon(item.product_contents.shape)}
                                    <span className="text-foreground capitalize">{item.product_contents.shape}</span>
                                  </div>
                                )}
                                {item.product_contents.colors && item.product_contents.colors.length > 0 && (
                                  <div>
                                    <span className="text-muted-foreground">Colors: </span>
                                    <div className="flex items-center gap-1.5 mt-1">
                                      {item.product_contents.colors.map((color, idx) => (
                                        <div key={idx} className="flex items-center gap-1">
                                          <div 
                                            className={cn(
                                              "w-3 h-3 rounded-full",
                                              getColorStyle(color)
                                            )}
                                          />
                                          <span className="text-foreground capitalize">{color}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {item.product_contents.color_pattern && (
                                  <div>
                                    <span className="text-muted-foreground">Pattern: </span>
                                    <span className="text-foreground capitalize">{item.product_contents.color_pattern}</span>
                                  </div>
                                )}
                                {item.product_contents.texture_appearance && (
                                  <div>
                                    <span className="text-muted-foreground">Texture: </span>
                                    <span className="text-foreground capitalize">{item.product_contents.texture_appearance}</span>
                                  </div>
                                )}
                                {item.product_contents.size_estimate && (
                                  <div>
                                    <span className="text-muted-foreground">Size: </span>
                                    <span className="text-foreground capitalize">{item.product_contents.size_estimate}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">No content analysis available</p>
                            )}
                          </div>

                          {/* Full Badges & Packaging */}
                          <div>
                            <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                              <Award className="w-3.5 h-3.5 text-chart-4" />
                              Badges & Packaging
                            </h4>
                            {item.label_content?.badges && item.label_content.badges.length > 0 ? (
                              <div className="mb-3">
                                <p className="text-[10px] uppercase text-muted-foreground mb-1">Certifications</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {item.label_content.badges.map((badge, idx) => (
                                    <Badge 
                                      key={idx} 
                                      className="text-xs bg-chart-4/10 text-chart-4 border-chart-4/20"
                                    >
                                      {badge}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground mb-3">No badges detected</p>
                            )}
                            
                            {item.packaging && item.packaging.features && item.packaging.features.length > 0 && (
                              <div>
                                <p className="text-[10px] uppercase text-muted-foreground mb-1">Packaging Features</p>
                                <div className="flex flex-wrap gap-1">
                                  {item.packaging.features.map((feature, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-[10px]">
                                      {feature}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  </CollapsibleContent>
                </>
              </Collapsible>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
