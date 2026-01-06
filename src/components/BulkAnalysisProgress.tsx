import { X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BulkAnalysisProgress as ProgressType } from "@/hooks/useBulkSupplementAnalysis";

interface BulkAnalysisProgressProps {
  progress: ProgressType;
  onDismiss: () => void;
}

export function BulkAnalysisProgress({ progress, onDismiss }: BulkAnalysisProgressProps) {
  if (progress.status === "idle") return null;

  const percentage = progress.total > 0 
    ? Math.round((progress.completed / progress.total) * 100) 
    : 0;

  const isComplete = progress.status === "complete";
  const isError = progress.status === "error";

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-4">
          {/* Status Icon */}
          <div className="flex-shrink-0">
            {isComplete ? (
              <CheckCircle2 className="w-5 h-5 text-chart-4" />
            ) : isError ? (
              <AlertCircle className="w-5 h-5 text-destructive" />
            ) : (
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            )}
          </div>

          {/* Progress Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-foreground">
                {isComplete 
                  ? "Analysis Complete" 
                  : isError 
                    ? "Analysis Error" 
                    : "Analyzing Supplement Facts..."}
              </span>
              <span className="text-sm text-muted-foreground">
                {progress.completed} / {progress.total}
              </span>
            </div>

            <Progress value={percentage} className="h-2" />

            <div className="flex items-center justify-between mt-1">
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span className="text-chart-4">✓ {progress.success} success</span>
                {progress.failed > 0 && (
                  <span className="text-destructive">✗ {progress.failed} failed</span>
                )}
              </div>
              {progress.currentProduct && (
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {progress.currentProduct}...
                </span>
              )}
            </div>
          </div>

          {/* Dismiss Button */}
          {(isComplete || isError) && (
            <Button
              variant="ghost"
              size="icon"
              className="flex-shrink-0 h-8 w-8"
              onClick={onDismiss}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
