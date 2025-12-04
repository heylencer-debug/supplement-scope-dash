import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Rocket, MessageSquare, Sparkles, ListChecks, Target, Image, FileText, List } from "lucide-react";

interface GoToMarketStrategyProps {
  goToMarket: Record<string, unknown> | null;
}

export function GoToMarketStrategy({ goToMarket }: GoToMarketStrategyProps) {
  if (!goToMarket) return null;

  const positioning = goToMarket.positioning as string | undefined;
  const messaging_angles = goToMarket.messaging_angles as string[] | undefined;
  const differentiation_points = goToMarket.differentiation_points as string[] | undefined;
  const launch_strategy = goToMarket.launch_strategy as { pricing_approach?: string; review_strategy?: string; advertising_budget?: string | number } | undefined;
  const listing_optimization = goToMarket.listing_optimization as { priorities?: Array<{ element?: string; recommendation?: string; priority?: string }> } | undefined;

  const hasData = positioning || messaging_angles?.length || differentiation_points?.length || launch_strategy || listing_optimization;

  if (!hasData) return null;

  return (
    <Card className="border-chart-3/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="w-5 h-5 text-chart-3" />
          Go-To-Market Strategy
        </CardTitle>
        <CardDescription>Launch positioning, messaging, and listing optimization recommendations</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Positioning Statement */}
          {positioning && (
            <div className="p-4 bg-chart-3/10 border border-chart-3/20 rounded-lg">
              <h4 className="font-medium text-sm flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-chart-3" />
                Positioning
              </h4>
              <p className="text-sm text-foreground">{positioning}</p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* Key Messaging Angles */}
            {messaging_angles && messaging_angles.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  Key Messaging Angles
                </h4>
                <div className="space-y-2">
                  {messaging_angles.slice(0, 5).map((message, idx) => (
                    <div key={idx} className="p-3 bg-secondary/50 rounded-lg">
                      <p className="text-sm text-foreground">{message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Differentiation Points */}
            {differentiation_points && differentiation_points.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-chart-2" />
                  Differentiation Points
                </h4>
                <div className="flex flex-wrap gap-2">
                  {differentiation_points.map((point, idx) => (
                    <Badge key={idx} variant="outline" className="bg-chart-2/10 border-chart-2/30 text-foreground">
                      {point}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Launch Strategy */}
          {launch_strategy && (
            <div className="space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Rocket className="w-4 h-4 text-primary" />
                Launch Strategy
              </h4>
              <div className="grid md:grid-cols-3 gap-4">
                {launch_strategy.pricing_approach && (
                  <div className="p-3 bg-secondary rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Pricing Approach</p>
                    <p className="text-sm font-medium text-foreground">{launch_strategy.pricing_approach}</p>
                  </div>
                )}
                {launch_strategy.review_strategy && (
                  <div className="p-3 bg-secondary rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Review Strategy</p>
                    <p className="text-sm font-medium text-foreground">{launch_strategy.review_strategy}</p>
                  </div>
                )}
                {launch_strategy.advertising_budget && (
                  <div className="p-3 bg-secondary rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Ad Budget</p>
                    <p className="text-sm font-medium text-foreground">
                      {typeof launch_strategy.advertising_budget === "number"
                        ? `$${launch_strategy.advertising_budget.toLocaleString()}`
                        : launch_strategy.advertising_budget}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Listing Optimization Priorities */}
          {listing_optimization?.priorities && listing_optimization.priorities.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-primary" />
                Listing Optimization Priorities
              </h4>
              <div className="space-y-2">
                {listing_optimization.priorities.map((item, idx) => (
                  <div key={idx} className="p-3 border rounded-lg flex items-start gap-3">
                    <div className="shrink-0">
                      {item.element === "title" && <FileText className="w-4 h-4 text-muted-foreground" />}
                      {item.element === "bullets" && <List className="w-4 h-4 text-muted-foreground" />}
                      {item.element === "images" && <Image className="w-4 h-4 text-muted-foreground" />}
                      {!["title", "bullets", "images"].includes(item.element || "") && (
                        <ListChecks className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-foreground capitalize">
                          {item.element?.replace(/_/g, " ")}
                        </p>
                        {item.priority && (
                          <Badge
                            variant="outline"
                            className={
                              item.priority.toLowerCase() === "high"
                                ? "bg-destructive/10 text-destructive border-destructive/30"
                                : item.priority.toLowerCase() === "medium"
                                ? "bg-chart-2/10 text-chart-2 border-chart-2/30"
                                : "bg-secondary"
                            }
                          >
                            {item.priority}
                          </Badge>
                        )}
                      </div>
                      {item.recommendation && (
                        <p className="text-xs text-muted-foreground">{item.recommendation}</p>
                      )}
                    </div>
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
