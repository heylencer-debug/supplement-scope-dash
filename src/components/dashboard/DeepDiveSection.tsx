import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from "recharts";

interface CriteriaScore {
  name: string;
  score: number;
  weight?: number;
  weighted_score?: number;
}

interface DeepDiveSectionProps {
  criteriaScores: CriteriaScore[];
  executiveSummary: string | null;
  topOpportunities: string[];
  criticalRisks: string[];
  isLoading?: boolean;
}

const abbreviateLabel = (name: string): string => {
  const abbreviations: Record<string, string> = {
    "demand": "DMD",
    "profitability": "PROF",
    "competition": "COMP",
    "market_size": "SIZE",
    "breakout_potential": "BKOUT",
    "economic_viability": "ECON",
    "pain_points": "PAIN",
    "market_gaps": "GAPS",
    "entry_difficulty": "ENTRY",
    "review_quality": "REVW",
    "pricing_power": "PRICE",
    "growth_trajectory": "GRWTH",
    "brand_concentration": "BRAND",
    "innovation_opportunity": "INNOV",
    "customer_satisfaction": "CSAT",
    "supply_stability": "SUPLY",
    "regulatory_risk": "REG",
    "seasonality": "SEAS",
    "differentiation": "DIFF",
    "consumer_fit": "FIT",
    "trust_level": "TRST",
  };
  
  const key = name.toLowerCase().replace(/\s+/g, '_');
  return abbreviations[key] || name.substring(0, 4).toUpperCase();
};

export function DeepDiveSection({
  criteriaScores,
  executiveSummary,
  topOpportunities,
  criticalRisks,
  isLoading = false,
}: DeepDiveSectionProps) {
  // Transform all criteria scores for radar chart (no limit)
  const radarData = criteriaScores.map((cs) => ({
    criteria: abbreviateLabel(cs.name),
    fullName: cs.name,
    score: cs.score,
    fullMark: 10,
  }));

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      {/* Left: Radar Chart (2/3 width) */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-[#1e3a5f]">
            18-Point Analysis
          </CardTitle>
          <CardDescription>
            Performance across key market criteria
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-[350px]">
              <Skeleton className="w-72 h-72 rounded-full" />
            </div>
          ) : radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <RadarChart data={radarData} margin={{ top: 30, right: 40, bottom: 30, left: 40 }}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis
                  dataKey="criteria"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 8 }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 10]}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                />
                <Radar
                  name="Score"
                  dataKey="score"
                  stroke="#0ea5e9"
                  fill="#0ea5e9"
                  fillOpacity={0.25}
                  strokeWidth={2}
                />
                <Tooltip
                  content={({ payload }) => {
                    if (payload && payload.length > 0) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-popover border border-border rounded-md p-3 shadow-lg">
                          <p className="font-medium text-sm text-foreground">{data.fullName}</p>
                          <p className="text-sm text-[#0ea5e9] font-bold">
                            Score: {data.score}/10
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[350px] text-muted-foreground">
              No criteria scores available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Right: Strategy Column (1/3 width) */}
      <div className="space-y-4">
        {/* Executive Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-[#1e3a5f]">
              Executive Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {executiveSummary || "Executive summary not available yet."}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Top Opportunities */}
        <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Top Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : topOpportunities.length > 0 ? (
              <ul className="space-y-2">
                {topOpportunities.slice(0, 4).map((opp, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                    <span>{opp}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No opportunities identified yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Critical Risks */}
        <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Critical Risks
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : criticalRisks.length > 0 ? (
              <ul className="space-y-2">
                {criticalRisks.slice(0, 4).map((risk, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-red-800 dark:text-red-300">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No critical risks identified yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
