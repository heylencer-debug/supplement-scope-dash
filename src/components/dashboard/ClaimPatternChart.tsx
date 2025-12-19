import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { TrendingUp, Target, FlaskConical, Leaf, Zap, Hash, MessageSquare } from "lucide-react";

interface CompetitorAnalysis {
  brand: string;
  label_content: {
    x_in_1_claim?: string | null;
    benefit_claims?: string[];
    claims?: string[];
    badges?: string[];
    all_visible_text?: string[];
  };
}

interface ClaimPatternChartProps {
  analyses: CompetitorAnalysis[];
}

interface ClaimPattern {
  name: string;
  count: number;
  percentage: number;
  icon: React.ReactNode;
  color: string;
  description: string;
}

export function ClaimPatternChart({ analyses }: ClaimPatternChartProps) {
  const claimPatterns = useMemo(() => {
    if (!analyses || analyses.length === 0) return null;

    const patterns = {
      xIn1Count: 0,
      benefitFocusedCount: 0,
      clinicalCount: 0,
      dosageCount: 0,
      naturalCleanCount: 0,
      simpleDirectCount: 0
    };

    // Analyze each competitor's claim style
    analyses.forEach(comp => {
      const allClaims = [
        ...(comp.label_content?.benefit_claims || []),
        ...(comp.label_content?.claims || []),
        ...(comp.label_content?.badges || [])
      ];
      const claimsText = allClaims.join(' ').toLowerCase();
      const allText = (comp.label_content?.all_visible_text || []).join(' ').toLowerCase();
      const combinedText = claimsText + ' ' + allText;

      // X-in-1 pattern detection
      if (comp.label_content?.x_in_1_claim || /\d+[-\s]?in[-\s]?1/i.test(combinedText)) {
        patterns.xIn1Count++;
      }

      // Benefit-focused pattern (e.g., "Complete Joint Support", "Total Wellness")
      if (/complete|total|full|comprehensive|ultimate|advanced|support|health|wellness/i.test(combinedText)) {
        patterns.benefitFocusedCount++;
      }

      // Clinical/Scientific pattern (e.g., "Clinically Proven", "Lab-Tested")
      if (/clinic|proven|study|research|doctor|pharma|lab|tested|verified|science|formula/i.test(combinedText)) {
        patterns.clinicalCount++;
      }

      // Dosage-focused pattern (e.g., "Maximum Strength 500mg", "High Potency")
      if (/\d+\s*(mg|mcg|iu|billion)/i.test(combinedText) || /strength|potency|dose|powerful|maximum|extra/i.test(combinedText)) {
        patterns.dosageCount++;
      }

      // Natural/Clean pattern (e.g., "Pure & Natural", "Organic")
      if (/natural|organic|pure|clean|plant|vegan|non-gmo|wholesome|raw|earth/i.test(combinedText)) {
        patterns.naturalCleanCount++;
      }

      // Simple/Direct pattern (short, direct claims without elaborate descriptors)
      if (allClaims.length <= 4 && allClaims.every(c => c.length < 35)) {
        patterns.simpleDirectCount++;
      }
    });

    const totalCompetitors = analyses.length;

    const patternData: ClaimPattern[] = [
      {
        name: 'X-in-1',
        count: patterns.xIn1Count,
        percentage: Math.round((patterns.xIn1Count / totalCompetitors) * 100),
        icon: <Hash className="w-4 h-4" />,
        color: 'hsl(var(--chart-1))',
        description: 'Ingredient count claims'
      },
      {
        name: 'Benefit',
        count: patterns.benefitFocusedCount,
        percentage: Math.round((patterns.benefitFocusedCount / totalCompetitors) * 100),
        icon: <Target className="w-4 h-4" />,
        color: 'hsl(var(--chart-2))',
        description: 'Benefit-focused messaging'
      },
      {
        name: 'Clinical',
        count: patterns.clinicalCount,
        percentage: Math.round((patterns.clinicalCount / totalCompetitors) * 100),
        icon: <FlaskConical className="w-4 h-4" />,
        color: 'hsl(var(--chart-3))',
        description: 'Science/clinical claims'
      },
      {
        name: 'Potency',
        count: patterns.dosageCount,
        percentage: Math.round((patterns.dosageCount / totalCompetitors) * 100),
        icon: <Zap className="w-4 h-4" />,
        color: 'hsl(var(--chart-4))',
        description: 'Dosage/strength focus'
      },
      {
        name: 'Natural',
        count: patterns.naturalCleanCount,
        percentage: Math.round((patterns.naturalCleanCount / totalCompetitors) * 100),
        icon: <Leaf className="w-4 h-4" />,
        color: 'hsl(var(--chart-5))',
        description: 'Clean/natural positioning'
      },
      {
        name: 'Simple',
        count: patterns.simpleDirectCount,
        percentage: Math.round((patterns.simpleDirectCount / totalCompetitors) * 100),
        icon: <MessageSquare className="w-4 h-4" />,
        color: 'hsl(var(--primary))',
        description: 'Simple, direct claims'
      }
    ].sort((a, b) => b.count - a.count);

    // Determine dominant style
    const dominant = patternData[0];
    const secondary = patternData[1].count >= totalCompetitors * 0.3 ? patternData[1] : null;

    return {
      patterns: patternData,
      dominant,
      secondary,
      totalCompetitors
    };
  }, [analyses]);

  if (!claimPatterns) return null;

  const chartData = claimPatterns.patterns.map(p => ({
    name: p.name,
    value: p.count,
    percentage: p.percentage,
    fill: p.color
  }));

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <TrendingUp className="w-4 h-4 text-primary" />
          Competitor Claim Pattern Analysis
        </CardTitle>
        <CardDescription className="text-xs">
          Detected claim styles from {claimPatterns.totalCompetitors} competitors
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dominant Style Banner */}
        <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
          <div className="p-2 rounded-full bg-primary/20 text-primary">
            {claimPatterns.dominant.icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                Dominant Style: {claimPatterns.dominant.name}
              </span>
              <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30 text-[10px]">
                {claimPatterns.dominant.percentage}%
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {claimPatterns.dominant.description}
              {claimPatterns.secondary && (
                <span> • Secondary: {claimPatterns.secondary.name} ({claimPatterns.secondary.percentage}%)</span>
              )}
            </p>
          </div>
        </div>

        {/* Bar Chart */}
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20 }}>
              <XAxis type="number" hide />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={60}
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border border-border rounded-lg p-2 shadow-lg">
                        <p className="text-sm font-medium text-foreground">{data.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {data.value} competitors ({data.percentage}%)
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pattern Grid */}
        <div className="grid grid-cols-3 gap-2">
          {claimPatterns.patterns.slice(0, 6).map((pattern) => (
            <div
              key={pattern.name}
              className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border/50"
            >
              <div 
                className="p-1.5 rounded-md" 
                style={{ backgroundColor: `${pattern.color}20`, color: pattern.color }}
              >
                {pattern.icon}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{pattern.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {pattern.count}/{claimPatterns.totalCompetitors} ({pattern.percentage}%)
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Insight */}
        <div className="p-3 bg-muted/30 rounded-lg border border-border/50 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">💡 Insight: </span>
          {claimPatterns.dominant.percentage >= 60 ? (
            <>This category has a clear dominant claim style ({claimPatterns.dominant.name}). Your packaging should match this style to compete effectively.</>
          ) : claimPatterns.dominant.percentage >= 40 ? (
            <>The market shows a moderate preference for {claimPatterns.dominant.name} claims. Consider using this style while adding unique differentiators.</>
          ) : (
            <>No single claim style dominates this category. You have flexibility to choose the style that best highlights your product's strengths.</>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
