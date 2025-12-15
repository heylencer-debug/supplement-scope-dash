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
  Hexagon
} from "lucide-react";
import type { CompetitorPackagingAnalysis } from "@/hooks/usePackagingImageAnalysis";

interface CompetitorPackagingTableProps {
  analyses: CompetitorPackagingAnalysis[];
}

// Get icon for product form shape
function getShapeIcon(shape: string | null) {
  if (!shape) return null;
  const lower = shape.toLowerCase();
  if (lower.includes('bear') || lower.includes('round') || lower.includes('sphere')) {
    return <Circle className="w-3 h-3" />;
  }
  if (lower.includes('bone') || lower.includes('rectangle')) {
    return <Square className="w-3 h-3" />;
  }
  if (lower.includes('triangle') || lower.includes('wedge')) {
    return <Triangle className="w-3 h-3" />;
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
            <TableHead className="min-w-[200px]">Label Content</TableHead>
            <TableHead className="w-[150px]">Product Form</TableHead>
            <TableHead className="w-[150px]">Packaging</TableHead>
            <TableHead className="w-[40px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {analyses.map((item) => {
            const isExpanded = expandedRows.has(item.asin);
            
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
                      <div className="space-y-1">
                        <p className="font-medium text-sm text-foreground line-clamp-1">
                          {item.label_content.main_title || item.brand}
                        </p>
                        {item.label_content.subtitle && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {item.label_content.subtitle}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {item.label_content.badges.slice(0, 3).map((badge, idx) => (
                            <Badge 
                              key={idx} 
                              variant="secondary" 
                              className="text-[9px] py-0 px-1.5 bg-chart-4/10 text-chart-4 border-chart-4/20"
                            >
                              {badge}
                            </Badge>
                          ))}
                          {item.label_content.badges.length > 3 && (
                            <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                              +{item.label_content.badges.length - 3}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    {/* Product Form */}
                    <TableCell className="py-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-xs capitalize">
                            {item.product_form.type}
                          </Badge>
                        </div>
                        {item.product_form.shape && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {getShapeIcon(item.product_form.shape)}
                            <span className="capitalize">{item.product_form.shape}</span>
                          </div>
                        )}
                        {item.product_form.colors.length > 0 && (
                          <div className="flex items-center gap-1">
                            {item.product_form.colors.slice(0, 4).map((color, idx) => (
                              <div 
                                key={idx}
                                className={cn(
                                  "w-3 h-3 rounded-full",
                                  getColorStyle(color)
                                )}
                                title={color}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Packaging */}
                    <TableCell className="py-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground capitalize">
                          {item.packaging.type}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {item.packaging.material} • {item.packaging.color}
                        </p>
                        {item.packaging.features.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.packaging.features.slice(0, 2).map((feature, idx) => (
                              <Badge 
                                key={idx} 
                                variant="secondary" 
                                className="text-[9px] py-0 px-1.5"
                              >
                                {feature}
                              </Badge>
                            ))}
                          </div>
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
                      <TableCell colSpan={5} className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {/* Full Label Content */}
                          <div>
                            <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                              <Tag className="w-3.5 h-3.5 text-chart-1" />
                              Label Details
                            </h4>
                            {item.label_content.elements.length > 0 && (
                              <div className="mb-2">
                                <p className="text-[10px] uppercase text-muted-foreground mb-1">Elements</p>
                                <ul className="text-xs space-y-0.5">
                                  {item.label_content.elements.map((el, idx) => (
                                    <li key={idx} className="text-foreground">• {el}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {item.label_content.claims.length > 0 && (
                              <div>
                                <p className="text-[10px] uppercase text-muted-foreground mb-1">Claims</p>
                                <div className="flex flex-wrap gap-1">
                                  {item.label_content.claims.map((claim, idx) => (
                                    <Badge 
                                      key={idx} 
                                      variant="secondary" 
                                      className="text-[10px] py-0.5"
                                    >
                                      {claim}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Full Badges */}
                          <div>
                            <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                              <Award className="w-3.5 h-3.5 text-chart-4" />
                              All Badges & Certifications
                            </h4>
                            {item.label_content.badges.length > 0 ? (
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
                            ) : (
                              <p className="text-xs text-muted-foreground">No badges detected</p>
                            )}
                          </div>

                          {/* Full Product Form */}
                          <div>
                            <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                              <Palette className="w-3.5 h-3.5 text-chart-2" />
                              Product Appearance
                            </h4>
                            <div className="space-y-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">Type: </span>
                                <span className="text-foreground capitalize">{item.product_form.type}</span>
                              </div>
                              {item.product_form.shape && (
                                <div>
                                  <span className="text-muted-foreground">Shape: </span>
                                  <span className="text-foreground capitalize">{item.product_form.shape}</span>
                                </div>
                              )}
                              {item.product_form.colors.length > 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground">Colors: </span>
                                  <div className="flex items-center gap-1.5">
                                    {item.product_form.colors.map((color, idx) => (
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
                              {item.product_form.texture_notes && (
                                <div>
                                  <span className="text-muted-foreground">Texture: </span>
                                  <span className="text-foreground">{item.product_form.texture_notes}</span>
                                </div>
                              )}
                            </div>
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
