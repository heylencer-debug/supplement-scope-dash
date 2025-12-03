import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, XCircle, FileWarning, Truck, AlertCircle } from "lucide-react";

interface RiskAnalysisProps {
  risks: Record<string, unknown> | null;
}

export function RiskAnalysis({ risks }: RiskAnalysisProps) {
  if (!risks) return null;

  const category_challenges = risks.category_challenges as string[] | undefined;
  const failure_patterns = risks.failure_patterns as string[] | undefined;
  const regulatory = risks.regulatory as string[] | undefined;
  const supply_chain = risks.supply_chain as string[] | undefined;

  const hasData = category_challenges?.length || failure_patterns?.length || regulatory?.length || supply_chain?.length;

  if (!hasData) return null;

  return (
    <Card className="border-red-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          Risk Analysis
        </CardTitle>
        <CardDescription>Category challenges, failure patterns, and risk factors to consider</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Category Challenges */}
          {category_challenges && category_challenges.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-orange-500" />
                Category Challenges
              </h4>
              <div className="space-y-2">
                {category_challenges.map((challenge, idx) => (
                  <div key={idx} className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-lg">
                    <p className="text-sm text-foreground">{challenge}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failure Patterns to Avoid */}
          {failure_patterns && failure_patterns.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                Failure Patterns to Avoid
              </h4>
              <div className="space-y-2">
                {failure_patterns.map((pattern, idx) => (
                  <div key={idx} className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg flex items-start gap-2">
                    <Badge variant="outline" className="shrink-0 bg-red-500/10 text-red-600 border-red-500/30 text-xs">
                      Avoid
                    </Badge>
                    <p className="text-sm text-foreground">{pattern}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Regulatory Requirements */}
          {regulatory && regulatory.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <FileWarning className="w-4 h-4 text-yellow-500" />
                Regulatory Requirements
              </h4>
              <div className="space-y-2">
                {regulatory.map((req, idx) => (
                  <div key={idx} className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0">
                      <span className="text-xs text-yellow-600">{idx + 1}</span>
                    </div>
                    <p className="text-sm text-foreground">{req}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supply Chain Risks */}
          {supply_chain && supply_chain.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Truck className="w-4 h-4 text-purple-500" />
                Supply Chain Risks
              </h4>
              <div className="space-y-2">
                {supply_chain.map((risk, idx) => (
                  <div key={idx} className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg">
                    <p className="text-sm text-foreground">{risk}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
