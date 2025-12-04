import { cn } from "@/lib/utils";

interface RadialGaugeProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
  showValue?: boolean;
  grade?: string;
}

export function RadialGauge({
  value,
  max = 100,
  size = 120,
  strokeWidth = 10,
  className,
  label,
  showValue = true,
  grade,
}: RadialGaugeProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  const getColor = () => {
    if (percentage >= 70) return "stroke-green-500";
    if (percentage >= 50) return "stroke-yellow-500";
    return "stroke-red-500";
  };

  const getGradeColor = () => {
    if (!grade) return "text-muted-foreground";
    if (grade === "A" || grade === "A+") return "text-green-600";
    if (grade === "B" || grade === "B+") return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className={cn("relative inline-flex flex-col items-center", className)}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-muted/30"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("transition-all duration-500", getColor())}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {grade && (
          <span className={cn("text-2xl font-bold", getGradeColor())}>{grade}</span>
        )}
        {showValue && !grade && (
          <span className="text-2xl font-bold text-foreground">{Math.round(value)}</span>
        )}
        {showValue && grade && (
          <span className="text-sm text-muted-foreground">{Math.round(value)}/100</span>
        )}
      </div>
      {label && (
        <span className="mt-2 text-xs text-muted-foreground">{label}</span>
      )}
    </div>
  );
}
