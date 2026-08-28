import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border-0 px-3 py-1 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 animate-badge-enter hover:scale-105",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-red-100 text-red-700",
        success: "bg-green-100 text-green-700",
        warning: "bg-amber-100 text-amber-700",
        outline: "border border-border bg-transparent text-foreground",
        pulse: "bg-primary/10 text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

/**
 * Renders a <span>, not a <div>: badges are routinely dropped inside running
 * copy (`<p>`), and a <div> there is invalid HTML — React was logging a
 * validateDOMNesting warning from EnhancedBenchmarkComparison for exactly
 * this. `inline-flex` already gives the block-ish box, so nothing changes
 * visually.
 */
function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
