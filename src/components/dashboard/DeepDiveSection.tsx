import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
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

const getScoreBadgeVariant = (score: number): "default" | "secondary" | "destructive" => {
  if (score >= 7) return "default";
  if (score >= 5) return "secondary";
  return "destructive";
};

const getProgressColor = (score: number): string => {
  if (score >= 7) return "bg-emerald-500";
  if (score >= 5) return "bg-amber-500";
  return "bg-red-500";
};

export function DeepDiveSection({
  criteriaScores,
  criteriaBreakdown = [],
  executiveSummary,
  topOpportunities,
  criticalRisks,
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
    <div className="space-y-6">
      {/* Top Row: Radar Chart + Strategy Column */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Radar Chart (2/3 width) */}
        <Card className="lg:col-span-2">
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

      {/* Bottom: Criteria Breakdown Panel */}
      {sortedBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-[#1e3a5f] flex items-center gap-2">
              Criteria Breakdown
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-4 h-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">
                    Detailed scoring breakdown for all 18 market analysis criteria with AI-generated justifications.
                  </p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <CardDescription>
              Detailed analysis and justification for each scoring criterion
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {sortedBreakdown.map((item, idx) => {
                  const name = item.name || item.criterion || item.category || "Unknown";
                  const score = item.raw_score || item.score || 0;
                  const weight = item.weight || 1;
                  const weightedScore = item.weighted_score || score * weight;
                  const contribution = item.contribution || 0;
                  
                  return (
                    <div 
                      key={idx} 
                      className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-medium text-sm text-foreground capitalize">
                              {name.replace(/_/g, ' ')}
                            </h4>
                            <Badge variant={getScoreBadgeVariant(score)} className="text-xs">
                              {score}/10
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              ({weight}x weight)
                            </span>
                          </div>
                          
                          {/* Score Progress Bar */}
                          <div className="mb-2">
                            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all ${getProgressColor(score)}`}
                                style={{ width: `${(score / 10) * 100}%` }}
                              />
                            </div>
                          </div>
                          
                          {/* Justification */}
                          {item.justification && (
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {item.justification}
                            </p>
                          )}
                        </div>
                        
                        {/* Weighted Score Badge */}
                        <div className="text-right shrink-0">
                          <div className={`text-lg font-bold ${getScoreColor(score)}`}>
                            {weightedScore.toFixed(1)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            weighted
                          </div>
                          {contribution > 0 && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {contribution.toFixed(1)}% contrib.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
