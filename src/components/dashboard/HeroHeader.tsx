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
  topProducts?: TopProduct[];
  isLoading?: boolean;
}

export function HeroHeader({
  categoryName,
  recommendation,
  opportunityIndex,
  opportunityTier,
  opportunityTierLabel,
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
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#1e3a5f] via-[#264a6e] to-[#1e3a5f] p-6 text-white shadow-lg">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white rounded-full blur-3xl translate-y-1/2 -translate-x-1/4" />
      </div>

      <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        {/* Left Section: Title, Badge, Score */}
        <div className="flex-1 space-y-4">
          {isLoading ? (
            <>
              <Skeleton className="h-8 w-64 bg-white/20" />
              <Skeleton className="h-6 w-32 bg-white/20" />
            </>
          ) : (
            <>
              <div className="space-y-2">
                <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
                  {cleanCategoryName}
                </h1>
                {recommendation && (
                  <Badge className={`text-xs px-3 py-1 font-medium ${getVerdictColor(recommendation)}`}>
                    {recommendation}
                  </Badge>
                )}
              </div>

              {/* Compact Score Display */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{displayScore}</span>
                    <span className="text-sm text-white/60">/10</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-white/70">Opportunity Score</span>
                    <div className="w-32 h-2 bg-white/20 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${getScoreColor(normalizedScore)}`}
                        style={{ width: `${normalizedScore}%` }}
                      />
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs text-white/80 border-white/30 bg-white/10">
                  {getTierDisplay()}
                </Badge>
              </div>
            </>
          )}
        </div>

        {/* Right Section: Top Products */}
        <div className="flex flex-col items-start lg:items-end gap-3">
          {isLoading ? (
            <div className="flex -space-x-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="w-12 h-12 rounded-full bg-white/20 ring-2 ring-white/30" />
              ))}
            </div>
          ) : topProducts.length > 0 ? (
            <>
              <span className="text-xs font-medium text-white/60 uppercase tracking-wider">
                Top Brands
              </span>
              <TooltipProvider>
                <div className="flex -space-x-3">
                  {topProducts.slice(0, 5).map((product, index) => (
                    <Tooltip key={index}>
                      <TooltipTrigger asChild>
                        <div className="relative transition-transform hover:scale-110 hover:z-10">
                          <Avatar className="w-12 h-12 ring-2 ring-white/80 bg-white shadow-md">
                            {product.main_image_url ? (
                              <AvatarImage 
                                src={product.main_image_url} 
                                alt={product.brand || 'Product'} 
                                className="object-cover"
                              />
                            ) : null}
                            <AvatarFallback className="bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600 text-xs font-medium">
                              {(product.brand || 'P').slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
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
    </div>
  );
}
