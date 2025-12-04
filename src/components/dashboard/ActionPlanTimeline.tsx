import { CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
        color: "bg-destructive",
        label: "Critical",
      };
    }
    if (p === "high") {
      return {
        color: "bg-chart-2",
        label: "High",
      };
    }
    if (p === "medium" || p === "moderate") {
      return {
        color: "bg-primary",
        label: "Medium",
      };
    }
    return {
      color: "bg-muted-foreground",
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
    "from-primary to-primary/80",
    "from-chart-4 to-chart-4/80",
    "from-chart-5 to-chart-5/80",
    "from-chart-2 to-chart-2/80",
    "from-destructive to-destructive/80",
    "from-chart-3 to-chart-3/80",
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-foreground">
            Action Plan Roadmap
          </CardTitle>
          <CardDescription className="text-xs">
            {timelineKeys.length} phases • {actionItems.length} actions
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
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
        )}
      </CardContent>
    </Card>
  );
}
