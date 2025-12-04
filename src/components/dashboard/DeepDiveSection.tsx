import { useState, useMemo } from "react";
import { Info, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CriteriaCard } from "./CriteriaCard";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip as RechartsTooltip,
} from "recharts";

interface CriteriaScore {
  name: string;
  score: number;
  weight?: number;
  weighted_score?: number;
}

interface CriteriaBreakdown {
  name?: string;
  criterion?: string;
  category?: string;
  raw_score?: number;
  score?: number;
  justification?: string;
  weight?: number;
  weighted_score?: number;
  contribution?: number;
}

interface DeepDiveSectionProps {
  criteriaScores: CriteriaScore[];
  criteriaBreakdown?: CriteriaBreakdown[];
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

const getScoreColor = (score: number): string => {
  if (score >= 7) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 5) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
};

export function DeepDiveSection({
  criteriaScores,
  criteriaBreakdown = [],
  isLoading = false,
}: DeepDiveSectionProps) {
  // Create a map of justifications from criteriaBreakdown
  const justificationMap = new Map<string, CriteriaBreakdown>();
  criteriaBreakdown.forEach(cb => {
    const name = (cb.name || cb.criterion || cb.category || "").toLowerCase().replace(/\s+/g, '_');
    justificationMap.set(name, cb);
  });

  // Transform criteria scores for radar chart with justifications
  const radarData = criteriaScores.map((cs) => {
    const key = cs.name.toLowerCase().replace(/\s+/g, '_');
    const breakdown = justificationMap.get(key);
    return {
      criteria: abbreviateLabel(cs.name),
      fullName: cs.name,
      score: cs.score,
      weight: cs.weight || breakdown?.weight || 1,
      justification: breakdown?.justification || null,
      weightedScore: cs.weighted_score || breakdown?.weighted_score || 0,
      contribution: breakdown?.contribution || 0,
      fullMark: 10,
    };
  });

  // Sort breakdown by weighted score for the panel
  const sortedBreakdown = [...criteriaBreakdown].sort((a, b) => {
    const scoreA = a.weighted_score || (a.raw_score || a.score || 0) * (a.weight || 1);
    const scoreB = b.weighted_score || (b.raw_score || b.score || 0) * (b.weight || 1);
    return scoreB - scoreA;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-[#1e3a5f]">
          18-Point Analysis
        </CardTitle>
        <CardDescription>
          Performance across key market criteria (hover for details)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-[300px]">
            <Skeleton className="w-64 h-64 rounded-full" />
          </div>
        ) : radarData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <RadarChart data={radarData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
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
              <RechartsTooltip
                content={({ payload }) => {
                  if (payload && payload.length > 0) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border border-border rounded-md p-3 shadow-lg max-w-xs">
                        <p className="font-semibold text-sm text-foreground">{data.fullName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-lg font-bold ${getScoreColor(data.score)}`}>
                            {data.score}/10
                          </span>
                          <span className="text-xs text-muted-foreground">
                            (weight: {data.weight}x)
                          </span>
                        </div>
                        {data.justification && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-3">
                            {data.justification}
                          </p>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            No criteria scores available
          </div>
        )}

        {/* Criteria Breakdown Panel - Inline */}
        {sortedBreakdown.length > 0 && (
          <CriteriaBreakdownPanel 
            breakdown={sortedBreakdown} 
            isLoading={isLoading} 
          />
        )}
      </CardContent>
    </Card>
  );
}

type FilterType = "all" | "high" | "medium" | "low";

function CriteriaBreakdownPanel({ 
  breakdown, 
  isLoading 
}: { 
  breakdown: CriteriaBreakdown[]; 
  isLoading: boolean;
}) {
  const [filter, setFilter] = useState<FilterType>("all");

  const counts = useMemo(() => {
    let high = 0, medium = 0, low = 0;
    breakdown.forEach(item => {
      const score = item.raw_score || item.score || 0;
      if (score >= 7) high++;
      else if (score >= 5) medium++;
      else low++;
    });
    return { high, medium, low, total: breakdown.length };
  }, [breakdown]);

  const filteredBreakdown = useMemo(() => {
    if (filter === "all") return breakdown;
    return breakdown.filter(item => {
      const score = item.raw_score || item.score || 0;
      if (filter === "high") return score >= 7;
      if (filter === "medium") return score >= 5 && score < 7;
      return score < 5;
    });
  }, [breakdown, filter]);

  if (breakdown.length === 0) return null;

  return (
    <div className="mt-8 pt-8 border-t">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-[#1e3a5f]">
            Criteria Breakdown
          </h4>
          <Tooltip>
            <TooltipTrigger>
              <Info className="w-4 h-4 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs text-xs">
                Detailed scoring for all market analysis criteria.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Score Distribution */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/30">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{counts.high}</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-900/30">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{counts.medium}</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-100 dark:bg-red-900/30">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs font-medium text-red-700 dark:text-red-400">{counts.low}</span>
          </div>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setFilter("all")}
        >
          All ({counts.total})
        </Button>
        <Button
          variant={filter === "high" ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setFilter("high")}
        >
          Strengths ({counts.high})
        </Button>
        <Button
          variant={filter === "medium" ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setFilter("medium")}
        >
          Moderate ({counts.medium})
        </Button>
        <Button
          variant={filter === "low" ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setFilter("low")}
        >
          Weaknesses ({counts.low})
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredBreakdown.map((item, idx) => {
            const name = item.name || item.criterion || item.category || "Unknown";
            const score = item.raw_score || item.score || 0;
            const weight = item.weight || 1;
            const weightedScore = item.weighted_score || score * weight;
            const contribution = item.contribution || 0;

            return (
              <CriteriaCard
                key={idx}
                name={name}
                score={score}
                weight={weight}
                weightedScore={weightedScore}
                contribution={contribution}
                justification={item.justification}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
