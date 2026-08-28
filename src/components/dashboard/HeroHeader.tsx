import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
interface TopProduct {
  main_image_url: string | null;
  brand: string | null;
  title: string | null;
}
interface HeroHeaderProps {
  categoryName: string;
  recommendation: string | null;
  opportunityIndex: number;
  opportunityTier: string | null;
  opportunityTierLabel: string | null;
  executiveSummary?: string | null;
  topProducts?: TopProduct[];
  isLoading?: boolean;
}
export function HeroHeader({
  categoryName,
  recommendation,
  opportunityIndex,
  opportunityTier,
  opportunityTierLabel,
  executiveSummary,
  topProducts = [],
  isLoading = false
}: HeroHeaderProps) {
  // Clean category name - remove leading "=" characters
  const cleanCategoryName = categoryName.replace(/^=+/, '').trim();
  const getTierDisplay = () => {
    if (opportunityTierLabel) return opportunityTierLabel;
    if (opportunityTier) {
      const tierMap: Record<string, string> = {
        "A": "Tier A (Excellent)",
        "B": "Tier B (Good)",
        "C": "Tier C (Fair)",
        "D": "Tier D (Poor)"
      };
      return tierMap[opportunityTier] || opportunityTier;
    }
    // Use the normalized 0-10 value for tier thresholds
    if (score10 >= 7) return "Tier A (Excellent)";
    if (score10 >= 5) return "Tier B (Good)";
    if (score10 >= 3) return "Tier C (Fair)";
    return "Tier D (Poor)";
  };
  // Auto-detect scale: values > 10 are on 0-100 scale, otherwise 0-10
  const score10 = opportunityIndex > 10 ? opportunityIndex / 10 : opportunityIndex;
  const normalizedScore = Math.min(100, Math.max(0, score10 * 10));
  const displayScore = score10.toFixed(1);
  return <div className="relative overflow-hidden rounded-xl bg-card border border-border/60 border-l-2 border-l-primary p-4 text-foreground">
      <div className="relative space-y-3">
        {/* Top Row: Title, Score, and Product Images */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          {/* Left Section: Title, Badge, Score */}
          <div className="flex-1 space-y-2">
            {isLoading ? <>
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-6 w-32" />
              </> : <>
                <div className="flex flex-wrap items-center gap-2 animate-enter">
                  <h1 className="text-lg md:text-xl font-semibold tracking-tight text-foreground">
                    {cleanCategoryName}
                  </h1>
                  {recommendation && <Badge variant="outline" className="text-[11px] px-2 py-0 h-5 font-medium border-border/60 bg-transparent text-muted-foreground">
                      {recommendation}
                    </Badge>}
                </div>

                {/* Compact Score Display */}
                <div className="flex flex-wrap items-center gap-3 animate-enter" style={{ animationDelay: '0.1s' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Opportunity</span>
                    <span className="text-[15px] font-semibold tabular-nums text-foreground">{displayScore}<span className="text-[11px] font-normal text-muted-foreground">/10</span></span>
                    <div className="w-24 h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-foreground/40 transition-all duration-500" style={{ width: `${normalizedScore}%` }} />
                    </div>
                  </div>
                  <span className="inline-flex items-center h-5 px-2 rounded-full border border-border/60 text-[11px] text-muted-foreground">
                    {getTierDisplay()}
                  </span>
                </div>
              </>}
          </div>

          {/* Right Section: Top Products - Bigger Images */}
          <div className="flex flex-col items-start lg:items-end gap-2">
            {isLoading ? <div className="flex -space-x-4">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="w-12 h-12 md:w-14 md:h-14 rounded-lg ring-1 ring-border" />)}
              </div> : topProducts.length > 0 ? <>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  Top Brands
                </span>
                <TooltipProvider>
                  <div className="flex -space-x-3 md:-space-x-4">
                    {topProducts.slice(0, 5).map((product, index) => <Tooltip key={index}>
                        <TooltipTrigger asChild>
                          <div className="relative transition-transform hover:scale-110 hover:z-10">
                            <div className="w-12 h-12 md:w-14 md:h-14 rounded-lg ring-1 ring-border bg-card overflow-hidden">
                              {product.main_image_url ? <img src={product.main_image_url} alt={product.brand || 'Product'} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-muted flex items-center justify-center text-slate-600 text-xs md:text-sm font-medium">
                                  {(product.brand || 'P').slice(0, 2).toUpperCase()}
                                </div>}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[200px]">
                          <p className="font-medium text-sm">{product.brand || 'Unknown Brand'}</p>
                          {product.title && <p className="text-xs text-muted-foreground line-clamp-2">{product.title}</p>}
                        </TooltipContent>
                      </Tooltip>)}
                  </div>
                </TooltipProvider>
              </> : null}
          </div>
        </div>

        {/* Executive Summary */}
        {!isLoading && executiveSummary && <div className="pt-2.5 border-t border-border/60 animate-enter" style={{ animationDelay: '0.2s' }}>
            <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-3">
              {executiveSummary}
            </p>
          </div>}
        {isLoading && <div className="pt-2.5 border-t border-border/60">
            <Skeleton className="h-12 w-full" />
          </div>}
      </div>
    </div>;
}