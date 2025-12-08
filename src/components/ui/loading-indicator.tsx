import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingIndicatorProps {
  size?: "xs" | "sm" | "md";
  className?: string;
  text?: string;
}

export function LoadingIndicator({ size = "sm", className, text }: LoadingIndicatorProps) {
  const sizeClasses = {
    xs: "w-3 h-3",
    sm: "w-4 h-4",
    md: "w-5 h-5",
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-muted-foreground", className)}>
      <Loader2 className={cn(sizeClasses[size], "animate-spin")} />
      {text && <span className="text-xs">{text}</span>}
    </span>
  );
}

export function LoadingPulse({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse" />
      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-pulse [animation-delay:300ms]" />
    </span>
  );
}
