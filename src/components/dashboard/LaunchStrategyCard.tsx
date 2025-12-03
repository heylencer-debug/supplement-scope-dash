import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Rocket, Quote, Megaphone, CheckCircle2, Target, Zap } from "lucide-react";

interface GoToMarket {
  positioning?: string;
  messaging?: string[];
  differentiation?: string[];
  launch_strategy?: {
    pricing_approach?: string;
    review_strategy?: string;
    advertising?: string;
  };
}

interface LaunchStrategyCardProps {
  goToMarket: GoToMarket | null;
  isLoading?: boolean;
  competitorLifestyle?: string | null;
  showComparison?: boolean;
}

export function LaunchStrategyCard({ 
  goToMarket, 
  isLoading = false,
  competitorLifestyle,
  showComparison = false 
}: LaunchStrategyCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!goToMarket) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Rocket className="h-5 w-5 text-primary" />
            Launch Strategy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No launch strategy data available yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const launchTactics = [
    { 
      label: "Pricing Approach", 
      value: goToMarket.launch_strategy?.pricing_approach,
      icon: Target
    },
    { 
      label: "Review Strategy", 
      value: goToMarket.launch_strategy?.review_strategy,
      icon: CheckCircle2
    },
    { 
      label: "Advertising", 
      value: goToMarket.launch_strategy?.advertising,
      icon: Megaphone
    },
  ].filter(t => t.value);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Rocket className="h-5 w-5 text-primary" />
          Launch Strategy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Winning Hook / Positioning */}
        {goToMarket.positioning && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Quote className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">Winning Hook</h4>
            </div>
            
            {showComparison && competitorLifestyle ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <Badge className="absolute -top-2 left-3 text-xs bg-primary text-primary-foreground">
                    Your Strategy
                  </Badge>
                  <p className="text-sm italic text-foreground leading-relaxed pt-1">
                    "{goToMarket.positioning}"
                  </p>
                </div>
                <div className="relative p-4 rounded-lg bg-muted/50 border border-border">
                  <Badge variant="outline" className="absolute -top-2 left-3 text-xs">
                    Competitor
                  </Badge>
                  <p className="text-sm italic text-muted-foreground leading-relaxed pt-1">
                    "{competitorLifestyle}"
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative p-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                <Quote className="absolute top-2 left-2 h-6 w-6 text-primary/20" />
                <p className="text-sm italic text-foreground leading-relaxed pl-4">
                  "{goToMarket.positioning}"
                </p>
              </div>
            )}
          </div>
        )}

        {/* Ad Angles / Messaging */}
        {goToMarket.messaging && goToMarket.messaging.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-amber-500" />
              <h4 className="text-sm font-semibold text-foreground">Ad Angles</h4>
            </div>
            <ul className="space-y-2">
              {goToMarket.messaging.map((msg, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Zap className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <span>{msg}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Launch Tactics Checklist */}
        {launchTactics.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <h4 className="text-sm font-semibold text-foreground">Launch Tactics</h4>
            </div>
            <div className="space-y-3">
              {launchTactics.map((tactic, index) => {
                const Icon = tactic.icon;
                return (
                  <div key={index} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-medium text-foreground">{tactic.label}</span>
                      {tactic.label === "Pricing Approach" && tactic.value && (
                        <Badge variant="outline" className="ml-auto text-xs capitalize">
                          {tactic.value}
                        </Badge>
                      )}
                    </div>
                    {tactic.label !== "Pricing Approach" && tactic.value && (
                      <p className="text-xs text-muted-foreground leading-relaxed pl-6">
                        {tactic.value}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Differentiation Points */}
        {goToMarket.differentiation && goToMarket.differentiation.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-500" />
              <h4 className="text-sm font-semibold text-foreground">Differentiation</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {goToMarket.differentiation.map((diff, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {diff}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
