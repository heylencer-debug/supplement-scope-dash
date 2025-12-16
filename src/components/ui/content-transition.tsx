import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ContentTransitionProps {
  isLoading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ContentTransition({ 
  isLoading, 
  skeleton, 
  children, 
  className 
}: ContentTransitionProps) {
  return (
    <div className={cn("relative", className)}>
      {isLoading ? (
        <div className="animate-slow-pulse">{skeleton}</div>
      ) : (
        <div className="animate-fade-in [animation-duration:500ms]">{children}</div>
      )}
    </div>
  );
}

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}

export function FadeIn({ children, delay = 0, duration = 300, className }: FadeInProps) {
  return (
    <div 
      className={cn("animate-fade-in", className)}
      style={{ 
        animationDelay: `${delay}ms`,
        animationDuration: `${duration}ms`,
        animationFillMode: 'both'
      }}
    >
      {children}
    </div>
  );
}
