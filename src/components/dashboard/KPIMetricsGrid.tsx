import { TrendingUp, DollarSign, Users, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingPulse } from "@/components/ui/loading-indicator";

interface KPIMetricsGridProps {
  marketSize: number | null;
  avgPrice: number | null;
  competitionLevel: string | null;
  brandCount: number | null;
  opportunityScore: number | null;
  isLoading?: boolean;
}

export function KPIMetricsGrid({
  marketSize,
  avgPrice,
  competitionLevel,
  brandCount,
  opportunityScore,
  isLoading = false,
}: KPIMetricsGridProps) {
  const formatMarketSize = (value: number | null) => {
    if (!value) return null;
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const getOpportunityLevel = (score: number | null) => {
    if (score === null) return { label: "Unknown", color: "text-muted-foreground" };
    // Normalize to 0-10 scale
    const s10 = score > 10 ? score / 10 : score;
    if (s10 >= 7) return { label: "High Opportunity", color: "text-chart-4" };
    if (s10 >= 4) return { label: "Moderate", color: "text-chart-2" };
    return { label: "Competitive", color: "text-destructive" };
  };

  const kpis = [
    {
      label: "Market Size",
      value: formatMarketSize(marketSize),
      subtext: marketSize ? "/ month" : null,
      icon: TrendingUp,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      label: "Avg Price",
      value: avgPrice ? `$${avgPrice.toFixed(2)}` : null,
      subtext: avgPrice ? "per unit" : null,
      icon: DollarSign,
      iconBg: "bg-chart-4/10",
      iconColor: "text-chart-4",
    },
    {
      label: "Competition",
      value: competitionLevel || null,
      subtext: brandCount ? `${brandCount} Brands` : null,
      icon: Users,
      iconBg: "bg-chart-2/10",
      iconColor: "text-chart-2",
    },
    {
      label: "Opportunity Score",
      value: opportunityScore !== null ? `${(opportunityScore > 10 ? opportunityScore / 10 : opportunityScore).toFixed(1)}/10` : null,
      subtext: opportunityScore !== null ? getOpportunityLevel(opportunityScore).label : null,
      subtextColor: getOpportunityLevel(opportunityScore).color,
      icon: Zap,
      iconBg: "bg-chart-5/10",
      iconColor: "text-chart-5",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {kpis.map((kpi, idx) => (
        <Card
          key={idx}
          className="border-border/50 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-default opacity-0 animate-fade-in"
          style={{ animationDelay: `${idx * 100}ms`, animationFillMode: 'forwards' }}
        >
          <CardContent className="p-4 sm:p-6">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            ) : (
              <div className="animate-enter flex items-start justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">
                    {kpi.label}
                  </p>
                  <p className="text-xl sm:text-2xl font-bold text-foreground">
                    {kpi.value !== null ? kpi.value : <LoadingPulse />}
                  </p>
                  {kpi.subtext && (
                    <p className={`text-[10px] sm:text-xs mt-1 ${(kpi as any).subtextColor || "text-muted-foreground"}`}>
                      {kpi.subtext}
                    </p>
                  )}
                </div>
                <div className={`p-2 sm:p-3 rounded-full ${kpi.iconBg}`}>
                  <kpi.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${kpi.iconColor}`} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
