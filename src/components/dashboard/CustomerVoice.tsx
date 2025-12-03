import { ThumbsDown, Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface PainPoint {
  pain_point?: string;
  issue?: string;
  theme?: string;
  frequency?: number | string;
  evidence?: string;
}

interface CustomerVoiceProps {
  painPoints: PainPoint[];
  unmetNeeds: string[];
  isLoading?: boolean;
}

export function CustomerVoice({
  painPoints,
  unmetNeeds,
  isLoading = false,
}: CustomerVoiceProps) {
  const getPainPointLabel = (pp: PainPoint) => {
    return pp.pain_point || pp.issue || pp.theme || "Unknown Issue";
  };

  const getFrequency = (pp: PainPoint) => {
    if (typeof pp.frequency === "number") return `${pp.frequency}%`;
    if (typeof pp.frequency === "string") return pp.frequency;
    return null;
  };

  if (painPoints.length === 0 && unmetNeeds.length === 0 && !isLoading) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-[#1e3a5f]">
          Customer Voice
        </CardTitle>
        <CardDescription>
          Key pain points and unmet needs from customer reviews
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Pain Points - Why They Leave */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <ThumbsDown className="w-4 h-4" />
                <p className="text-sm font-semibold">Why They Leave</p>
              </div>
              {painPoints.length > 0 ? (
                <div className="space-y-2">
                  {painPoints.slice(0, 5).map((pp, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-100 dark:border-red-900"
                    >
                      <span className="text-sm text-foreground flex-1">
                        {getPainPointLabel(pp)}
                      </span>
                      {getFrequency(pp) && (
                        <Badge
                          variant="outline"
                          className="ml-2 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border-red-200"
                        >
                          {getFrequency(pp)}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground p-3 bg-secondary rounded-lg">
                  No pain points identified yet.
                </p>
              )}
            </div>

            {/* Unmet Needs - What They Want */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[#0ea5e9]">
                <Lightbulb className="w-4 h-4" />
                <p className="text-sm font-semibold">What They Want</p>
              </div>
              {unmetNeeds.length > 0 ? (
                <div className="space-y-2">
                  {unmetNeeds.slice(0, 5).map((need, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 p-3 bg-[#0ea5e9]/5 rounded-lg border border-[#0ea5e9]/20"
                    >
                      <Lightbulb className="w-4 h-4 mt-0.5 text-[#0ea5e9] shrink-0" />
                      <span className="text-sm text-foreground">{need}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground p-3 bg-secondary rounded-lg">
                  No unmet needs identified yet.
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
