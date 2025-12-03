import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface HeroHeaderProps {
  categoryName: string;
  recommendation: string | null;
  opportunityIndex: number;
  opportunityTier: string | null;
  opportunityTierLabel: string | null;
  isLoading?: boolean;
}

export function HeroHeader({
  categoryName,
  recommendation,
  opportunityIndex,
  opportunityTier,
  opportunityTierLabel,
  isLoading = false,
}: HeroHeaderProps) {
  const getVerdictColor = (rec: string | null) => {
    const r = (rec || "").toUpperCase();
    if (r.includes("PROCEED") || r.includes("HIGH")) return "bg-emerald-500 text-white border-emerald-600";
    if (r.includes("CONSIDER") || r.includes("CAUTION")) return "bg-amber-500 text-white border-amber-600";
    if (r.includes("SKIP") || r.includes("AVOID")) return "bg-red-500 text-white border-red-600";
    return "bg-primary text-primary-foreground";
  };

  const getGaugeColor = (score: number) => {
    if (score >= 70) return "stroke-emerald-500";
    if (score >= 50) return "stroke-amber-500";
    return "stroke-red-500";
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
  const circumference = 2 * Math.PI * 45;
  const strokeDasharray = `${(normalizedScore / 100) * circumference} ${circumference}`;

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#1e3a5f] to-[#2d4a6f] p-8 text-white">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
      </div>

      <div className="relative flex flex-col lg:flex-row items-center justify-between gap-8">
        {/* Left: Title and Badge */}
        <div className="flex-1 text-center lg:text-left">
          {isLoading ? (
            <>
              <Skeleton className="h-10 w-64 bg-white/20 mb-4" />
              <Skeleton className="h-8 w-48 bg-white/20" />
            </>
          ) : (
            <>
              <h1 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">
                {categoryName}
              </h1>
              {recommendation && (
                <Badge className={`text-sm px-4 py-2 font-semibold ${getVerdictColor(recommendation)}`}>
                  {recommendation}
                </Badge>
              )}
            </>
          )}
        </div>

        {/* Center: Radial Gauge */}
        <div className="flex flex-col items-center">
          {isLoading ? (
            <Skeleton className="w-44 h-44 rounded-full bg-white/20" />
          ) : (
            <>
              <div className="relative w-44 h-44">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {/* Background circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="8"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    className={getGaugeColor(normalizedScore)}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={strokeDasharray}
                    style={{ transition: "stroke-dasharray 0.5s ease-in-out" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-bold">
                    {(normalizedScore / 10).toFixed(1)}
                  </span>
                  <span className="text-sm text-white/70">/10</span>
                </div>
              </div>
              <p className="mt-3 text-sm font-medium text-white/90">Opportunity Score</p>
              <p className="text-xs text-white/60">{getTierDisplay()}</p>
            </>
          )}
        </div>

        {/* Right: Stats Summary */}
        <div className="flex-1 hidden xl:block" />
      </div>
    </div>
  );
}
