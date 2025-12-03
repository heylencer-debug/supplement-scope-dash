import { CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
        badge: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/50 dark:text-red-300",
        label: "Critical",
      };
    }
    if (p === "high") {
      return {
        color: "bg-amber-500",
        badge: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300",
        label: "High",
      };
    }
    if (p === "medium" || p === "moderate") {
      return {
        color: "bg-[#0ea5e9]",
        badge: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/50 dark:text-blue-300",
        label: "Medium",
      };
    }
    return {
      color: "bg-gray-400",
      badge: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-900/50 dark:text-gray-300",
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-[#1e3a5f]">
          Action Plan Roadmap
        </CardTitle>
        <CardDescription>
          Step-by-step execution plan with priorities
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="relative">
            {/* Timeline visualization */}
            <div className="flex flex-col space-y-6">
              {timelineKeys.map((timeline, timelineIdx) => (
                <div key={timeline} className="relative">
                  {/* Timeline header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#1e3a5f] text-white text-sm font-bold">
                      {timelineIdx + 1}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{timeline}</p>
                      <p className="text-xs text-muted-foreground">
                        {groupedItems[timeline].length} action{groupedItems[timeline].length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>

                  {/* Action items grid */}
                  <div className="ml-5 pl-8 border-l-2 border-border">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {groupedItems[timeline].map((item, idx) => {
                        const priorityConfig = getPriorityConfig(item.priority);
                        const isCompleted = item.status?.toLowerCase() === "completed";

                        return (
                          <div
                            key={idx}
                            className={`relative p-4 rounded-lg border ${
                              isCompleted
                                ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900"
                                : "bg-card border-border"
                            }`}
                          >
                            {/* Priority indicator */}
                            <div
                              className={`absolute top-0 left-0 w-1 h-full rounded-l-lg ${priorityConfig.color}`}
                            />

                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  {isCompleted ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                  ) : item.priority?.toLowerCase() === "critical" ? (
                                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
                                  )}
                                  <span className="text-sm font-medium text-foreground truncate">
                                    {item.action || item.description || "Action item"}
                                  </span>
                                </div>
                                {item.step && (
                                  <p className="text-xs text-muted-foreground ml-6 line-clamp-2">
                                    Step {item.step}
                                  </p>
                                )}
                              </div>
                              <Badge
                                variant="outline"
                                className={`shrink-0 text-xs ${priorityConfig.badge}`}
                              >
                                {priorityConfig.label}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Connector line to next timeline */}
                  {timelineIdx < timelineKeys.length - 1 && (
                    <div className="absolute left-5 top-14 bottom-0 w-0.5 bg-border" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
