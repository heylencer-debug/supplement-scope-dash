import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Rocket, Quote, Megaphone, CheckCircle2, Target, Zap, 
  Circle, AlertCircle, Calendar 
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

interface ActionItem {
  step?: number | string;
  action?: string;
  timeline?: string;
  month?: string;
  priority?: string;
  status?: string;
  description?: string;
}

interface LaunchPlanSectionProps {
  goToMarket: GoToMarket | null;
  actionItems: ActionItem[];
  isLoading?: boolean;
}

export function LaunchPlanSection({
  goToMarket,
  actionItems,
  isLoading = false,
}: LaunchPlanSectionProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Rocket className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            Launch Strategy & Action Plan
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Go-to-market strategy and execution roadmap
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 space-y-6 sm:space-y-8">
          {/* Winning Hook Skeleton */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>

          {/* Ad Angles Skeleton */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>

          {/* Launch Tactics Skeleton */}
          <div className="space-y-4">
            <Skeleton className="h-4 w-32" />
            <div className="grid md:grid-cols-3 gap-4">
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Action Plan Timeline Skeleton */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="space-y-0">
                  <Skeleton className="h-12 rounded-t-md rounded-b-none" />
                  <Skeleton className="h-20 rounded-t-none rounded-b-md" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getPriorityConfig = (priority: string | undefined) => {
    const p = (priority || "").toLowerCase();
    if (p === "critical" || p === "urgent") {
      return { color: "bg-destructive", label: "Critical" };
    }
    if (p === "high") {
      return { color: "bg-amber-500", label: "High" };
    }
    if (p === "medium" || p === "moderate") {
      return { color: "bg-primary", label: "Medium" };
    }
    return { color: "bg-muted-foreground", label: "Low" };
  };

  const getTimelineLabel = (item: ActionItem) => {
    return item.timeline || item.month || "";
  };

  // Group actions by timeline
  const groupedItems = actionItems.reduce((acc, item) => {
    const timeline = getTimelineLabel(item) || "Unscheduled";
    if (!acc[timeline]) acc[timeline] = [];
    acc[timeline].push(item);
    return acc;
  }, {} as Record<string, ActionItem[]>);

  const timelineKeys = Object.keys(groupedItems);

  const phaseColors = [
    "from-primary to-primary/80",
    "from-chart-4 to-chart-4/80",
    "from-chart-5 to-chart-5/80",
    "from-chart-2 to-chart-2/80",
    "from-destructive to-destructive/80",
    "from-chart-3 to-chart-3/80",
  ];

  const launchTactics = goToMarket ? [
    { label: "Pricing Approach", value: goToMarket.launch_strategy?.pricing_approach, icon: Target },
    { label: "Review Strategy", value: goToMarket.launch_strategy?.review_strategy, icon: CheckCircle2 },
    { label: "Advertising", value: goToMarket.launch_strategy?.advertising, icon: Megaphone },
  ].filter(t => t.value) : [];

  const hasLaunchStrategy = goToMarket && (
    goToMarket.positioning || 
    (goToMarket.messaging && goToMarket.messaging.length > 0) ||
    launchTactics.length > 0
  );

  const hasActionItems = actionItems.length > 0;

  if (!hasLaunchStrategy && !hasActionItems) {
    return null;
  }

  return (
    <Card className="animate-enter [animation-duration:400ms]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Rocket className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          Launch Strategy & Action Plan
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Go-to-market strategy and execution roadmap
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-6 sm:space-y-8 animate-enter">
        {/* Launch Strategy Section */}
        {hasLaunchStrategy && (
          <div className="space-y-6">
            {/* Winning Hook / Positioning */}
            {goToMarket?.positioning && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Quote className="h-4 w-4 text-primary" />
                  <h4 className="text-xs sm:text-sm font-semibold text-foreground">Winning Hook</h4>
                </div>
                <div className="relative p-3 sm:p-4 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
                  <Quote className="absolute top-2 left-2 h-5 w-5 sm:h-6 sm:w-6 text-primary/20" />
                  <p className="text-xs sm:text-sm italic text-foreground leading-relaxed pl-4">
                    "{goToMarket.positioning}"
                  </p>
                </div>
              </div>
            )}

            {/* Ad Angles / Messaging */}
            {goToMarket?.messaging && goToMarket.messaging.length > 0 && (
              <div className="space-y-2">
              <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-chart-2" />
                  <h4 className="text-xs sm:text-sm font-semibold text-foreground">Ad Angles</h4>
                </div>
                <ul className="space-y-2">
                  {goToMarket.messaging.map((msg, index) => (
                    <li key={index} className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground">
                      <Zap className="h-3 w-3 sm:h-4 sm:w-4 text-chart-2 mt-0.5 shrink-0" />
                      <span>{msg}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Launch Tactics */}
            {launchTactics.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-chart-4" />
                  <h4 className="text-xs sm:text-sm font-semibold text-foreground">Launch Tactics</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                  {launchTactics.map((tactic, index) => {
                    const Icon = tactic.icon;
                    return (
                      <div key={index} className="p-2 sm:p-3 rounded-lg bg-muted/30 border border-border/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="h-3 w-3 sm:h-4 sm:w-4 text-chart-4" />
                          <span className="text-xs sm:text-sm font-medium text-foreground">{tactic.label}</span>
                        </div>
                        <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed">
                          {tactic.value}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Differentiation Points */}
            {goToMarket?.differentiation && goToMarket.differentiation.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-chart-3" />
                  <h4 className="text-xs sm:text-sm font-semibold text-foreground">Differentiation</h4>
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
          </div>
        )}

        {/* Divider if both sections exist */}
        {hasLaunchStrategy && hasActionItems && (
          <div className="border-t border-border" />
        )}

        {/* Action Plan Timeline */}
        {hasActionItems && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <h4 className="text-xs sm:text-sm font-semibold text-foreground">Action Plan Roadmap</h4>
              </div>
              <span className="text-[10px] sm:text-xs text-muted-foreground">
                {timelineKeys.length} phases • {actionItems.length} actions
              </span>
            </div>
            
            <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
              {timelineKeys.map((timeline, timelineIdx) => {
                const items = groupedItems[timeline];
                const completedCount = items.filter(
                  (i) => i.status?.toLowerCase() === "completed"
                ).length;
                const hasCritical = items.some(
                  (i) => i.priority?.toLowerCase() === "critical" || i.priority?.toLowerCase() === "urgent"
                );
                const gradientColor = phaseColors[timelineIdx % phaseColors.length];

                return (
                  <div key={timeline} className="min-w-0">
                    {/* Phase Header */}
                    <div className={`bg-gradient-to-r ${gradientColor} rounded-t-md px-2 py-1.5`}>
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {timelineIdx + 1}
                        </div>
                        <span className="text-white text-xs font-medium truncate flex-1">
                          {timeline}
                        </span>
                        {hasCritical && (
                          <AlertCircle className="w-3 h-3 text-white/80 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-white/70 rounded-full"
                            style={{
                              width: `${items.length > 0 ? (completedCount / items.length) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <span className="text-white/80 text-[10px]">
                          {completedCount}/{items.length}
                        </span>
                      </div>
                    </div>

                    {/* Actions List */}
                    <div className="border border-t-0 border-border rounded-b-md bg-card p-1.5 space-y-1 h-20 overflow-y-auto">
                      {items.slice(0, 3).map((item, idx) => {
                        const priorityConfig = getPriorityConfig(item.priority);
                        const isCompleted = item.status?.toLowerCase() === "completed";
                        const actionText = item.action || item.description || "Action";

                        return (
                          <Tooltip key={idx}>
                            <TooltipTrigger asChild>
                              <div
                                className={`flex items-center gap-1 text-[10px] leading-tight cursor-default ${
                                  isCompleted ? "opacity-50" : ""
                                }`}
                              >
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityConfig.color}`} />
                                {isCompleted ? (
                                  <CheckCircle2 className="w-2.5 h-2.5 text-chart-4 shrink-0" />
                                ) : (
                                  <Circle className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                                )}
                                <span className={`truncate ${isCompleted ? "line-through" : ""}`}>
                                  {actionText}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                              <p className="font-medium text-xs">{actionText}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-[10px]">
                                  {priorityConfig.label}
                                </Badge>
                                {isCompleted && (
                                  <Badge variant="outline" className="text-[10px] text-chart-4">
                                    Done
                                  </Badge>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                      {items.length > 3 && (
                        <div className="text-[10px] text-muted-foreground">
                          +{items.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
