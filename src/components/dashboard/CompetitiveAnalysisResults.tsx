import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Target, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle2, 
  AlertTriangle,
  Zap,
  Shield,
  ArrowRight,
  Lightbulb,
  Ban
} from "lucide-react";
import type { CompetitiveAnalysis } from "@/hooks/useCompetitiveAnalysis";

interface CompetitiveAnalysisResultsProps {
  analysis: CompetitiveAnalysis;
}

export function CompetitiveAnalysisResults({ analysis }: CompetitiveAnalysisResultsProps) {
  const getPositionColor = (position: string) => {
    switch (position) {
      case "Leader": return "bg-chart-4 text-white";
      case "Challenger": return "bg-chart-3 text-white";
      case "Follower": return "bg-chart-2 text-white";
      case "Niche": return "bg-chart-5 text-white";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case "high": return "bg-chart-4/10 text-chart-4 border-chart-4/20";
      case "medium": return "bg-chart-2/10 text-chart-2 border-chart-2/20";
      case "low": return "bg-muted text-muted-foreground border-muted";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy": return "bg-chart-4/10 text-chart-4 border-chart-4/20";
      case "moderate": return "bg-chart-2/10 text-chart-2 border-chart-2/20";
      case "hard": return "bg-destructive/10 text-destructive border-destructive/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6 animate-enter">
      {/* Overall Position Summary */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Overall Competitive Position
            </CardTitle>
            <Badge className={getPositionColor(analysis.summary.overall_position)}>
              {analysis.summary.overall_position}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Market Readiness</span>
                <span className="font-medium">{analysis.summary.market_readiness_score}/100</span>
              </div>
              <Progress value={analysis.summary.market_readiness_score} className="h-2" />
            </div>
          </div>
          
          <p className="text-sm text-foreground/80 italic">
            "{analysis.summary.key_message}"
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-chart-4">
                <CheckCircle2 className="h-4 w-4" />
                Top Advantages
              </div>
              <ul className="space-y-1">
                {analysis.summary.top_advantages.map((advantage, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-chart-4 mt-1">✓</span>
                    <span>{advantage}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Critical Gaps
              </div>
              <ul className="space-y-1">
                {analysis.summary.critical_gaps.map((gap, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-destructive mt-1">⚠</span>
                    <span>{gap}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-Competitor Comparisons */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Competitor-by-Competitor Analysis
        </h3>
        
        <div className="grid gap-4">
          {analysis.competitor_comparisons.slice(0, 5).map((comp, i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="pb-3 bg-muted/30">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-sm text-muted-foreground">vs.</p>
                    <CardTitle className="text-base">{comp.competitor_brand}</CardTitle>
                    <p className="text-sm text-muted-foreground line-clamp-1">{comp.competitor_product}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Displacement Potential</p>
                    <div className="flex items-center gap-2">
                      <Progress value={comp.displacement_potential * 10} className="w-20 h-2" />
                      <span className="font-bold text-lg">{comp.displacement_potential}/10</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Where We Win */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-chart-4">
                      <TrendingUp className="h-4 w-4" />
                      Where We Win
                    </div>
                    <div className="space-y-2">
                      {comp.where_we_win.map((win, j) => (
                        <div key={j} className="p-2 rounded-lg bg-chart-4/5 border border-chart-4/10">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{win.area}</span>
                            <Badge variant="outline" className={getImpactColor(win.impact)}>
                              {win.impact}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{win.our_advantage}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Where They Win */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-chart-2">
                      <TrendingDown className="h-4 w-4" />
                      Where They Win
                    </div>
                    <div className="space-y-2">
                      {comp.where_they_win.map((loss, j) => (
                        <div key={j} className="p-2 rounded-lg bg-chart-2/5 border border-chart-2/10">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{loss.area}</span>
                            <Badge variant="outline" className={getDifficultyColor(loss.difficulty)}>
                              {loss.difficulty} to match
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">{loss.their_advantage}</p>
                          <p className="text-xs flex items-center gap-1">
                            <ArrowRight className="h-3 w-3 text-primary" />
                            <span className="text-primary">{loss.how_to_match}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-3 rounded-lg bg-muted/50 border">
                  <p className="text-sm">
                    <strong>Verdict:</strong> {comp.overall_verdict}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Priority Improvements */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Priority Improvements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {analysis.priority_improvements.map((improvement, i) => (
              <div 
                key={i} 
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                  {improvement.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium">{improvement.improvement}</span>
                    <Badge variant="outline" className={getDifficultyColor(improvement.implementation_difficulty)}>
                      {improvement.implementation_difficulty}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Target: {improvement.target_competitor} • {improvement.expected_impact}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Strategic Recommendations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Strategic Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Positioning Strategy</h4>
            <p className="text-sm text-muted-foreground">
              {analysis.strategic_recommendations.positioning_strategy}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Target className="h-4 w-4 text-chart-4" />
                Messaging Focus
              </h4>
              <div className="flex flex-wrap gap-1">
                {analysis.strategic_recommendations.messaging_focus.map((msg, i) => (
                  <Badge key={i} variant="outline" className="bg-chart-4/5 border-chart-4/20">
                    {msg}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <Zap className="h-4 w-4 text-chart-3" />
                Differentiation Levers
              </h4>
              <div className="flex flex-wrap gap-1">
                {analysis.strategic_recommendations.differentiation_levers.map((lever, i) => (
                  <Badge key={i} variant="outline" className="bg-chart-3/5 border-chart-3/20">
                    {lever}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-destructive">
              <Ban className="h-4 w-4" />
              Avoid Competing On
            </h4>
            <div className="flex flex-wrap gap-1">
              {analysis.strategic_recommendations.avoid_competing_on.map((avoid, i) => (
                <Badge key={i} variant="outline" className="bg-destructive/5 border-destructive/20 text-destructive">
                  {avoid}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
