import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: ReactNode;
  icon?: ReactNode;
  trend?: string;
  trendDirection?: "up" | "down" | "neutral";
  subtitle?: string;
  className?: string;
  variant?: "default" | "primary" | "success" | "warning";
}

const variantStyles = {
  default: "bg-card border-border",
  primary: "bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20",
  success: "bg-gradient-to-br from-chart-4/5 to-chart-4/10 border-chart-4/20",
  warning: "bg-gradient-to-br from-chart-2/5 to-chart-2/10 border-chart-2/20",
};

export function StatCard({
  title,
  value,
  icon,
  trend,
  trendDirection = "neutral",
  subtitle,
  className,
  variant = "default",
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border p-5 transition-all duration-300 hover:shadow-lg hover:scale-[1.02]",
        variantStyles[variant],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="text-3xl font-bold text-foreground">{value}</div>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
            {icon}
          </div>
        )}
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1">
          {trendDirection === "up" && (
            <TrendingUp className="h-4 w-4 text-chart-4" />
          )}
          {trendDirection === "down" && (
            <TrendingDown className="h-4 w-4 text-destructive" />
          )}
          <span
            className={cn(
              "text-sm font-medium",
              trendDirection === "up" && "text-chart-4",
              trendDirection === "down" && "text-destructive",
              trendDirection === "neutral" && "text-muted-foreground"
            )}
          >
            {trend}
          </span>
        </div>
      )}
    </div>
  );
}
