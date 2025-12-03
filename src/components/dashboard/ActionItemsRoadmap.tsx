import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ClipboardList, CheckCircle2, Circle, ArrowRight, Calendar } from "lucide-react";

interface ActionItem {
  action?: string;
  step?: string;
  description?: string;
  timeline?: string;
  month?: string | number;
  priority?: string;
  status?: string;
  category?: string;
}

interface ActionItemsRoadmapProps {
  actionItems: unknown[] | null;
}

const getPriorityColor = (priority?: string) => {
  switch (priority?.toLowerCase()) {
    case "critical":
      return "bg-red-500/10 text-red-600 border-red-500/30";
    case "high":
      return "bg-orange-500/10 text-orange-600 border-orange-500/30";
    case "medium":
      return "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
    case "low":
      return "bg-green-500/10 text-green-600 border-green-500/30";
    default:
      return "bg-secondary text-muted-foreground";
  }
};

const getTimelineLabel = (item: ActionItem) => {
  if (item.timeline) return item.timeline;
  if (item.month) return `Month ${item.month}`;
  return null;
};

export function ActionItemsRoadmap({ actionItems }: ActionItemsRoadmapProps) {
  if (!actionItems || actionItems.length === 0) return null;
  
  const items = actionItems as ActionItem[];

  // Group by timeline/month if available
  const groupedByTimeline = items.reduce((acc, item) => {
    const timeline = getTimelineLabel(item) || "General";
    if (!acc[timeline]) acc[timeline] = [];
    acc[timeline].push(item);
    return acc;
  }, {} as Record<string, ActionItem[]>);

  const hasTimelines = Object.keys(groupedByTimeline).length > 1 || !groupedByTimeline["General"];

  // Calculate completion (example: based on status if available)
  const completed = items.filter(item => item.status === "completed" || item.status === "done").length;
  const total = items.length;
  const completionPercent = Math.round((completed / total) * 100);

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-primary" />
          Action Items Roadmap
          <Badge variant="outline" className="ml-2">{total} items</Badge>
        </CardTitle>
        <CardDescription>Prioritized action plan for market entry</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Progress Overview */}
        {completed > 0 && (
          <div className="mb-6 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-medium">{completed}/{total} completed</span>
            </div>
            <Progress value={completionPercent} className="h-2" />
          </div>
        )}

        {/* Timeline View */}
        {hasTimelines ? (
          <div className="space-y-6">
            {Object.entries(groupedByTimeline).map(([timeline, items], timelineIdx) => (
              <div key={timelineIdx} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <h4 className="font-medium text-sm text-foreground">{timeline}</h4>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-2 pl-6">
                  {items.map((item, idx) => (
                    <ActionItemCard key={idx} item={item} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Simple List View */
          <div className="space-y-3">
            {items.map((item, idx) => (
              <ActionItemCard key={idx} item={item} index={idx + 1} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActionItemCard({ item, index }: { item: ActionItem; index?: number }) {
  const isCompleted = item.status === "completed" || item.status === "done";
  const actionText = item.action || item.step || item.description || "Action item";

  return (
    <div
      className={`p-3 border rounded-lg ${
        isCompleted ? "bg-green-500/5 border-green-500/20" : "bg-secondary/30"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Status/Number Icon */}
        <div className="shrink-0 mt-0.5">
          {isCompleted ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : index !== undefined ? (
            <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-medium text-primary">{index}</span>
            </div>
          ) : (
            <Circle className="w-5 h-5 text-muted-foreground" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm ${isCompleted ? "text-muted-foreground line-through" : "text-foreground"}`}>
              {actionText}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              {item.priority && (
                <Badge variant="outline" className={`text-xs ${getPriorityColor(item.priority)}`}>
                  {item.priority}
                </Badge>
              )}
              {item.category && (
                <Badge variant="outline" className="text-xs">
                  {item.category}
                </Badge>
              )}
            </div>
          </div>
          
          {/* Description if action exists separately */}
          {item.action && item.description && (
            <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
