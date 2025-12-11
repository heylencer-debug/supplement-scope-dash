import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  delay?: number;
}

function Skeleton({ className, delay = 0, style, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/80",
        // Shimmer overlay
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:animate-[shimmer_1.5s_ease-in-out_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-primary/10 before:to-transparent",
        // Secondary shimmer for depth
        "after:absolute after:inset-0 after:-translate-x-full",
        "after:animate-[shimmer_1.5s_ease-in-out_infinite_0.3s]",
        "after:bg-gradient-to-r after:from-transparent after:via-white/15 after:to-transparent",
        className
      )}
      style={{
        ...style,
        animationDelay: delay ? `${delay}ms` : undefined,
      }}
      {...props}
    />
  );
}

function SkeletonCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[20px] border-0 bg-card p-6 shadow-soft",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:animate-[shimmer_1.5s_ease-in-out_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-primary/5 before:to-transparent",
        className
      )}
      {...props}
    />
  );
}

// Text skeleton with multiple lines
interface SkeletonTextProps {
  lines?: number;
  className?: string;
  lastLineWidth?: string;
}

function SkeletonText({ lines = 3, className, lastLineWidth = "w-2/3" }: SkeletonTextProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {[...Array(lines)].map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4",
            i === lines - 1 ? lastLineWidth : "w-full"
          )}
          delay={i * 100}
        />
      ))}
    </div>
  );
}

// Avatar skeleton
interface SkeletonAvatarProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

function SkeletonAvatar({ size = "md", className }: SkeletonAvatarProps) {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
    xl: "h-16 w-16",
  };

  return (
    <Skeleton className={cn("rounded-full", sizeClasses[size], className)} />
  );
}

// Button skeleton
interface SkeletonButtonProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

function SkeletonButton({ size = "md", className }: SkeletonButtonProps) {
  const sizeClasses = {
    sm: "h-9 w-20",
    md: "h-11 w-28",
    lg: "h-12 w-36",
  };

  return (
    <Skeleton className={cn("rounded-[20px]", sizeClasses[size], className)} />
  );
}

// Chart skeleton
interface SkeletonChartProps {
  type?: "bar" | "line" | "pie" | "area";
  className?: string;
}

function SkeletonChart({ type = "bar", className }: SkeletonChartProps) {
  if (type === "pie") {
    return (
      <div className={cn("flex items-center justify-center p-6", className)}>
        <Skeleton className="h-48 w-48 rounded-full" />
      </div>
    );
  }

  if (type === "line" || type === "area") {
    return (
      <div className={cn("relative h-48 p-4", className)}>
        {/* Y-axis labels */}
        <div className="absolute left-0 top-4 bottom-4 w-8 flex flex-col justify-between">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-3 w-6" delay={i * 50} />
          ))}
        </div>
        {/* Chart area */}
        <div className="ml-10 h-full relative">
          <svg className="w-full h-full" preserveAspectRatio="none">
            <path
              d="M0,80 Q50,40 100,60 T200,30 T300,50 T400,20"
              className="stroke-muted fill-none stroke-[3]"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 bg-gradient-to-t from-muted/30 to-transparent rounded-lg" />
        </div>
        {/* X-axis labels */}
        <div className="ml-10 flex justify-between mt-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-3 w-8" delay={i * 50} />
          ))}
        </div>
      </div>
    );
  }

  // Bar chart
  return (
    <div className={cn("flex items-end justify-around gap-3 h-48 p-4", className)}>
      {[...Array(7)].map((_, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2">
          <Skeleton
            className="w-full rounded-t-md"
            style={{ height: `${30 + Math.random() * 70}%` }}
            delay={i * 100}
          />
          <Skeleton className="h-3 w-8" delay={i * 100 + 50} />
        </div>
      ))}
    </div>
  );
}

// Table skeleton
interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

function SkeletonTable({ rows = 5, columns = 4, className }: SkeletonTableProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex gap-4 pb-3 border-b border-border/50">
        {[...Array(columns)].map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" delay={i * 50} />
        ))}
      </div>
      {/* Rows */}
      {[...Array(rows)].map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 py-2">
          {[...Array(columns)].map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn("h-4 flex-1", colIndex === 0 && "w-1/4 flex-none")}
              delay={rowIndex * 100 + colIndex * 50}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// KPI Card skeleton
function SkeletonKPICard({ className }: { className?: string }) {
  return (
    <SkeletonCard className={cn("p-6", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-16" delay={100} />
        </div>
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    </SkeletonCard>
  );
}

// Product card skeleton
function SkeletonProductCard({ className }: { className?: string }) {
  return (
    <SkeletonCard className={cn("p-4 space-y-4", className)}>
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-4 w-full" delay={100} />
      <Skeleton className="h-4 w-3/4" delay={150} />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" delay={200} />
        <Skeleton className="h-6 w-16 rounded-full" delay={250} />
      </div>
      <div className="flex justify-between items-center pt-2">
        <Skeleton className="h-6 w-20" delay={300} />
        <Skeleton className="h-4 w-12" delay={350} />
      </div>
    </SkeletonCard>
  );
}

// List item skeleton
function SkeletonListItem({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 p-4 bg-secondary/30 rounded-xl", className)}>
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full max-w-md" delay={50} />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" delay={100} />
    </div>
  );
}

// Form field skeleton
function SkeletonFormField({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-11 w-full rounded-xl" delay={50} />
    </div>
  );
}

// Image skeleton with aspect ratio
interface SkeletonImageProps {
  aspectRatio?: "square" | "video" | "wide" | "portrait";
  className?: string;
}

function SkeletonImage({ aspectRatio = "square", className }: SkeletonImageProps) {
  const aspectClasses = {
    square: "aspect-square",
    video: "aspect-video",
    wide: "aspect-[2/1]",
    portrait: "aspect-[3/4]",
  };

  return (
    <Skeleton className={cn("w-full rounded-lg", aspectClasses[aspectRatio], className)} />
  );
}

// Badge skeleton
function SkeletonBadge({ className }: { className?: string }) {
  return <Skeleton className={cn("h-6 w-16 rounded-full", className)} />;
}

// Staggered grid skeleton
interface SkeletonGridProps {
  count?: number;
  columns?: 2 | 3 | 4;
  children?: (index: number) => React.ReactNode;
  className?: string;
}

function SkeletonGrid({ count = 6, columns = 3, children, className }: SkeletonGridProps) {
  const gridClasses = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div className={cn("grid gap-6", gridClasses[columns], className)}>
      {[...Array(count)].map((_, i) => (
        <div key={i} style={{ animationDelay: `${i * 100}ms` }} className="animate-fade-in">
          {children ? children(i) : <SkeletonCard className="h-48" />}
        </div>
      ))}
    </div>
  );
}

export {
  Skeleton,
  SkeletonCard,
  SkeletonText,
  SkeletonAvatar,
  SkeletonButton,
  SkeletonChart,
  SkeletonTable,
  SkeletonKPICard,
  SkeletonProductCard,
  SkeletonListItem,
  SkeletonFormField,
  SkeletonImage,
  SkeletonBadge,
  SkeletonGrid,
};
