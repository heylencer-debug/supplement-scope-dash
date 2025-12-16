import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingIndicatorProps {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  text?: string;
}

export function LoadingIndicator({ size = "sm", className, text }: LoadingIndicatorProps) {
  const sizeClasses = {
    xs: "w-3 h-3",
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-muted-foreground animate-fade-in-up", className)}>
      <Loader2 className={cn(sizeClasses[size], "animate-spin")} />
      {text && <span className="text-xs">{text}</span>}
    </span>
  );
}

export function LoadingPulse({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 animate-fade-in-up", className)}>
      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-slow-pulse" />
      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-slow-pulse [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-slow-pulse [animation-delay:300ms]" />
    </span>
  );
}

// Bouncing dots loader
export function LoadingDots({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "w-1.5 h-1.5",
    md: "w-2 h-2",
    lg: "w-3 h-3",
  };

  return (
    <span className={cn("inline-flex items-center gap-1 animate-fade-in-up", className)}>
      <span className={cn(sizeClasses[size], "rounded-full bg-primary animate-dot-bounce")} />
      <span className={cn(sizeClasses[size], "rounded-full bg-primary animate-dot-bounce [animation-delay:0.16s]")} />
      <span className={cn(sizeClasses[size], "rounded-full bg-primary animate-dot-bounce [animation-delay:0.32s]")} />
    </span>
  );
}

// Circular spinner with animated stroke
interface SpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  color?: "primary" | "muted" | "white";
}

export function Spinner({ size = "md", className, color = "primary" }: SpinnerProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
    xl: "w-12 h-12",
  };

  const colorClasses = {
    primary: "stroke-primary",
    muted: "stroke-muted-foreground",
    white: "stroke-white",
  };

  return (
    <div className={cn("animate-fade-in-up", className)}>
      <svg
        className={cn(sizeClasses[size], "animate-spinner-rotate")}
        viewBox="0 0 50 50"
      >
        <circle
          className={cn(colorClasses[color], "animate-spinner-dash")}
          cx="25"
          cy="25"
          r="20"
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

// Growing dots spinner
export function SpinnerGrow({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "w-1.5 h-1.5",
    md: "w-2.5 h-2.5",
    lg: "w-3.5 h-3.5",
  };

  return (
    <span className={cn("inline-flex items-center gap-2 animate-fade-in-up", className)}>
      <span className={cn(sizeClasses[size], "rounded-full bg-primary animate-spinner-grow")} />
      <span className={cn(sizeClasses[size], "rounded-full bg-primary animate-spinner-grow [animation-delay:0.2s]")} />
      <span className={cn(sizeClasses[size], "rounded-full bg-primary animate-spinner-grow [animation-delay:0.4s]")} />
    </span>
  );
}

// Full-page loading overlay with fade transitions
interface LoadingOverlayProps {
  isLoading: boolean;
  text?: string;
  variant?: "spinner" | "dots" | "grow";
}

export function LoadingOverlay({ isLoading, text, variant = "spinner" }: LoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in-up">
      <div className="flex flex-col items-center gap-4">
        {variant === "spinner" && <Spinner size="xl" />}
        {variant === "dots" && <LoadingDots size="lg" />}
        {variant === "grow" && <SpinnerGrow size="lg" />}
        {text && (
          <p className="text-sm font-medium text-muted-foreground animate-slow-pulse">
            {text}
          </p>
        )}
      </div>
    </div>
  );
}

// Inline loading state wrapper with smooth transitions
interface LoadingWrapperProps {
  isLoading: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  className?: string;
}

export function LoadingWrapper({ isLoading, children, fallback, className }: LoadingWrapperProps) {
  return (
    <div className={cn("relative", className)}>
      {isLoading ? (
        <div className="animate-fade-in-up">
          {fallback || (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          )}
        </div>
      ) : (
        <div className="animate-fade-in-up">
          {children}
        </div>
      )}
    </div>
  );
}

// Button loading state
interface ButtonSpinnerProps {
  className?: string;
}

export function ButtonSpinner({ className }: ButtonSpinnerProps) {
  return (
    <Loader2 className={cn("w-4 h-4 animate-spin", className)} />
  );
}

// Skeleton with shimmer effect
interface SkeletonShimmerProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular";
}

export function SkeletonShimmer({ className, variant = "rectangular" }: SkeletonShimmerProps) {
  const variantClasses = {
    text: "h-4 rounded",
    circular: "rounded-full aspect-square",
    rectangular: "rounded-lg",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-muted animate-slow-pulse",
        variantClasses[variant],
        className
      )}
    >
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
    </div>
  );
}
