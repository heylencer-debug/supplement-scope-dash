import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface CriteriaCardProps {
  name: string;
  score: number;
  weight: number;
  weightedScore: number;
  contribution?: number;
  justification?: string;
}

const getScoreColor = (score: number) => {
  if (score >= 7) return { 
    ring: "stroke-emerald-500", 
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-200 dark:border-emerald-800",
    text: "text-emerald-600 dark:text-emerald-400"
  };
  if (score >= 5) return { 
    ring: "stroke-amber-500", 
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-600 dark:text-amber-400"
  };
  return { 
    ring: "stroke-red-500", 
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-800",
    text: "text-red-600 dark:text-red-400"
  };
};

function ScoreGauge({ score }: { score: number }) {
  const colors = getScoreColor(score);
  const percentage = (score / 10) * 100;
  const circumference = 2 * Math.PI * 18; // radius = 18
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative w-14 h-14 flex items-center justify-center">
      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 44 44">
        {/* Background circle */}
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-muted/30"
        />
        {/* Progress circle */}
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className={colors.ring}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: strokeDashoffset,
            transition: "stroke-dashoffset 0.5s ease-in-out",
          }}
        />
      </svg>
      <span className={cn("absolute text-base font-bold", colors.text)}>
        {score}
      </span>
    </div>
  );
}

export function CriteriaCard({
  name,
  score,
  weight,
  weightedScore,
  contribution,
  justification,
}: CriteriaCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const colors = getScoreColor(score);
  const formattedName = name.replace(/_/g, ' ');

  return (
    <div
      className={cn(
        "rounded-lg border-l-4 p-3 transition-all",
        colors.border,
        colors.bg,
        "hover:shadow-md"
      )}
    >
      <div className="flex items-center gap-3">
        <ScoreGauge score={score} />
        
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm text-foreground capitalize truncate">
            {formattedName}
          </h4>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {weight}x weight
            </span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className={cn("text-xs font-semibold", colors.text)}>
              {weightedScore.toFixed(1)} pts
            </span>
            {contribution !== undefined && contribution > 0 && (
              <>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground">
                  {contribution.toFixed(1)}%
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {justification && (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2 w-full">
            <ChevronDown 
              className={cn(
                "w-3 h-3 transition-transform",
                isOpen && "rotate-180"
              )} 
            />
            <span>{isOpen ? "Hide details" : "Show details"}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p className="text-xs text-muted-foreground leading-relaxed mt-2 pt-2 border-t border-border/50">
              {justification}
            </p>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
