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
  isLoading = false,
}: HeroHeaderProps) {
  // Clean category name - remove leading "=" characters
  const cleanCategoryName = categoryName.replace(/^=+/, '').trim();

  const getVerdictColor = (rec: string | null) => {
    const r = (rec || "").toUpperCase();
    if (r.includes("PROCEED") || r.includes("HIGH")) return "bg-emerald-500/90 text-white border-emerald-400";
    if (r.includes("CONSIDER") || r.includes("CAUTION")) return "bg-amber-500/90 text-white border-amber-400";
    if (r.includes("SKIP") || r.includes("AVOID")) return "bg-red-500/90 text-white border-red-400";
    return "bg-primary/90 text-primary-foreground";
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return "bg-emerald-500";
    if (score >= 50) return "bg-amber-500";
    return "bg-red-500";
  };

  const getTierDisplay = () => {
    if (opportunityTierLabel) return opportunityTierLabel;
    if (opportunityTier) {
      const tierMap: Record<string, string> = {
        "A": "Tier A (Excellent)",
        "B": "Tier B (Good)",
        "C": "Tier C (Fair)",
        "D": "Tier D (Poor)",
      };
      return tierMap[opportunityTier] || opportunityTier;
    }
    if (opportunityIndex >= 70) return "Tier A (Excellent)";
    if (opportunityIndex >= 50) return "Tier B (Good)";
    if (opportunityIndex >= 30) return "Tier C (Fair)";
    return "Tier D (Poor)";
  };

  const normalizedScore = Math.min(100, Math.max(0, opportunityIndex));
  const displayScore = (normalizedScore / 10).toFixed(1);

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#1e3a5f] via-[#264a6e] to-[#1e3a5f] p-6 md:p-8 text-white shadow-lg">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
      </div>

      <div className="relative space-y-5">
        {/* Top Row: Title, Score, and Product Images */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          {/* Left Section: Title, Badge, Score */}
          <div className="flex-1 space-y-3">
            {isLoading ? (
              <>
                <Skeleton className="h-8 w-64 bg-white/20" />
                <Skeleton className="h-6 w-32 bg-white/20" />
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">
                    {cleanCategoryName}
                  </h1>
                  {recommendation && (
                    <Badge className={`text-xs px-3 py-1 font-medium ${getVerdictColor(recommendation)}`}>
                      {recommendation}
                    </Badge>
                  )}
                </div>

                {/* Compact Score Display */}
                <div className="flex flex-wrap items-center gap-3 md:gap-4">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl md:text-3xl font-bold">{displayScore}</span>
                      <span className="text-xs md:text-sm text-white/60">/10</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] md:text-xs text-white/70">Opportunity Score</span>
                      <div className="w-20 md:w-32 h-1.5 md:h-2 bg-white/20 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${getScoreColor(normalizedScore)}`}
                          style={{ width: `${normalizedScore}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] md:text-xs text-white/80 border-white/30 bg-white/10">
                    {getTierDisplay()}
                  </Badge>
                </div>
              </>
            )}
          </div>

          {/* Right Section: Top Products - Bigger Images */}
          <div className="flex flex-col items-start lg:items-end gap-2">
            {isLoading ? (
              <div className="flex -space-x-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="w-14 h-14 md:w-16 md:h-16 rounded-lg bg-white/20 ring-2 ring-white/30" />
                ))}
              </div>
            ) : topProducts.length > 0 ? (
              <>
                <span className="text-[10px] md:text-xs font-medium text-white/60 uppercase tracking-wider">
                  Top Brands
                </span>
                <TooltipProvider>
                  <div className="flex -space-x-3 md:-space-x-4">
                    {topProducts.slice(0, 5).map((product, index) => (
                      <Tooltip key={index}>
                        <TooltipTrigger asChild>
                          <div className="relative transition-transform hover:scale-110 hover:z-10">
                            <div className="w-14 h-14 md:w-16 md:h-16 lg:w-20 lg:h-20 rounded-lg ring-2 ring-white/80 bg-white shadow-md overflow-hidden">
                              {product.main_image_url ? (
                                <img 
                                  src={product.main_image_url} 
                                  alt={product.brand || 'Product'} 
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-600 text-xs md:text-sm font-medium">
                                  {(product.brand || 'P').slice(0, 2).toUpperCase()}
                                </div>
                              )}
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[200px]">
                          <p className="font-medium text-sm">{product.brand || 'Unknown Brand'}</p>
                          {product.title && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{product.title}</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TooltipProvider>
              </>
            ) : null}
          </div>
        </div>

        {/* Executive Summary */}
        {!isLoading && executiveSummary && (
          <div className="pt-3 border-t border-white/10">
            <p className="text-xs md:text-sm text-white/80 leading-relaxed line-clamp-3 md:line-clamp-none">
              {executiveSummary}
            </p>
          </div>
        )}
        {isLoading && (
          <div className="pt-3 border-t border-white/10">
            <Skeleton className="h-12 w-full bg-white/20" />
          </div>
        )}
      </div>
    </div>
  );
}
