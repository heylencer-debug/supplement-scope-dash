import { cn } from "@/lib/utils";
import { Flame, TrendingUp, Minus } from "lucide-react";

interface TrendHeatIndicatorProps {
  level: "hot" | "warm" | "cool";
  label?: string;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const levelConfig = {
  hot: {
    icon: Flame,
    bgClass: "bg-destructive/10",
    textClass: "text-destructive",
    borderClass: "border-destructive/30",
    pulseClass: "animate-pulse",
    label: "Hot Trend",
  },
  warm: {
    icon: TrendingUp,
    bgClass: "bg-chart-2/10",
    textClass: "text-chart-2",
    borderClass: "border-chart-2/30",
    pulseClass: "",
    label: "Rising",
  },
  cool: {
    icon: Minus,
    bgClass: "bg-muted/50",
    textClass: "text-muted-foreground",
    borderClass: "border-border",
    pulseClass: "",
    label: "Stable",
  },
};

const sizeConfig = {
  sm: "text-xs px-2 py-1 gap-1",
  md: "text-sm px-3 py-1.5 gap-1.5",
  lg: "text-base px-4 py-2 gap-2",
};

const iconSizes = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

export function TrendHeatIndicator({
  level,
  label,
  showIcon = true,
  size = "md",
  className,
}: TrendHeatIndicatorProps) {
  const config = levelConfig[level];
  const Icon = config.icon;
  const displayLabel = label || config.label;

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        config.bgClass,
        config.textClass,
        config.borderClass,
        config.pulseClass,
        sizeConfig[size],
        className
      )}
    >
      {showIcon && <Icon className={cn(iconSizes[size], level === "hot" && "fill-current")} />}
      <span>{displayLabel}</span>
    </div>
  );
}
