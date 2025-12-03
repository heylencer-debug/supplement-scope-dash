import { CheckCircle2, Circle, AlertCircle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ActionItem {
  step?: number | string;
  action?: string;
  timeline?: string;
  month?: string;
  priority?: string;
  status?: string;
  description?: string;
}

interface ActionPlanTimelineProps {
  actionItems: ActionItem[];
  isLoading?: boolean;
}

export function ActionPlanTimeline({
  actionItems,
  isLoading = false,
}: ActionPlanTimelineProps) {
  const getPriorityConfig = (priority: string | undefined) => {
    const p = (priority || "").toLowerCase();
    if (p === "critical" || p === "urgent") {
      return {
        color: "bg-red-500",
        ring: "ring-red-500/20",
        badge: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
        label: "Critical",
      };
    }
    if (p === "high") {
      return {
        color: "bg-amber-500",
        ring: "ring-amber-500/20",
        badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
        label: "High",
      };
    }
    if (p === "medium" || p === "moderate") {
      return {
        color: "bg-[#0ea5e9]",
        ring: "ring-[#0ea5e9]/20",
        badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
        label: "Medium",
      };
    }
    return {
      color: "bg-gray-400",
      ring: "ring-gray-400/20",
      badge: "bg-gray-100 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300",
      label: "Low",
    };
  };

  const getTimelineLabel = (item: ActionItem) => {
    return item.timeline || item.month || "";
  };

  // Group by timeline
  const groupedItems = actionItems.reduce((acc, item) => {
    const timeline = getTimelineLabel(item) || "Unscheduled";
    if (!acc[timeline]) acc[timeline] = [];
    acc[timeline].push(item);
    return acc;
  }, {} as Record<string, ActionItem[]>);

  const timelineKeys = Object.keys(groupedItems);

  if (actionItems.length === 0 && !isLoading) {
    return null;
  }

  const phaseColors = [
    "from-[#0ea5e9] to-[#0284c7]",
    "from-emerald-500 to-emerald-600",
    "from-violet-500 to-violet-600",
    "from-amber-500 to-amber-600",
    "from-rose-500 to-rose-600",
    "from-cyan-500 to-cyan-600",
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-[#1e3a5f]">
          Action Plan Roadmap
        </CardTitle>
        <CardDescription>
          {timelineKeys.length} phases • {actionItems.length} total actions
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        {isLoading ? (
          <div className="flex gap-4">
            <Skeleton className="h-32 w-64 shrink-0" />
            <Skeleton className="h-32 w-64 shrink-0" />
            <Skeleton className="h-32 w-64 shrink-0" />
          </div>
        ) : (
          <ScrollArea className="w-full">
            <div className="flex gap-2 pb-4">
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
                  <div key={timeline} className="flex items-center">
                    {/* Phase Card */}
                    <div className="w-56 shrink-0">
                      {/* Phase Header */}
                      <div className={`bg-gradient-to-r ${gradientColor} rounded-t-lg px-3 py-2`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">
                              {timelineIdx + 1}
                            </div>
                            <span className="text-white text-sm font-semibold truncate">
                              {timeline}
                            </span>
                          </div>
                          {hasCritical && (
                            <AlertCircle className="w-4 h-4 text-white/80" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-white/60 rounded-full transition-all"
                              style={{
                                width: `${items.length > 0 ? (completedCount / items.length) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-white/80 text-xs">
                            {completedCount}/{items.length}
                          </span>
                        </div>
                      </div>

                      {/* Actions List */}
                      <div className="border border-t-0 border-border rounded-b-lg bg-card p-2 space-y-1.5 max-h-36 overflow-y-auto">
                        {items.slice(0, 4).map((item, idx) => {
                          const priorityConfig = getPriorityConfig(item.priority);
                          const isCompleted = item.status?.toLowerCase() === "completed";
                          const actionText = item.action || item.description || "Action item";

                          return (
                            <Tooltip key={idx}>
                              <TooltipTrigger asChild>
                                <div
                                  className={`flex items-center gap-2 p-1.5 rounded text-xs transition-colors hover:bg-accent/50 cursor-default ${
                                    isCompleted ? "opacity-60" : ""
                                  }`}
                                >
                                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityConfig.color}`} />
                                  {isCompleted ? (
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                  ) : (
                                    <Circle className="w-3 h-3 text-muted-foreground shrink-0" />
                                  )}
                                  <span className={`truncate ${isCompleted ? "line-through" : ""}`}>
                                    {actionText}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="max-w-xs">
                                <p className="font-medium">{actionText}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge className={`text-xs ${priorityConfig.badge}`}>
                                    {priorityConfig.label}
                                  </Badge>
                                  {isCompleted && (
                                    <Badge variant="outline" className="text-xs text-emerald-600">
                                      Completed
                                    </Badge>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                        {items.length > 4 && (
                          <div className="text-xs text-muted-foreground text-center py-1">
                            +{items.length - 4} more
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Connector Arrow */}
                    {timelineIdx < timelineKeys.length - 1 && (
                      <div className="px-1 shrink-0">
                        <ArrowRight className="w-4 h-4 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
