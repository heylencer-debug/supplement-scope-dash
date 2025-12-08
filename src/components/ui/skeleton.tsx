import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
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
      {...props}
    />
  );
}

function SkeletonCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/50 bg-card p-6",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:animate-[shimmer_1.5s_ease-in-out_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-primary/5 before:to-transparent",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton, SkeletonCard };
