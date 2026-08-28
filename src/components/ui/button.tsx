import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { useRipple } from "@/hooks/useRipple";

/**
 * The shadcn `Button` is the SAME control as the raw `.pearl-*` buttons the
 * pages hand-write (see ProductExplorer/NewAnalysis/Dashboard). Previously it
 * shipped its own flat shadcn skin — a different fill, a different shadow and
 * a 20px radius against the pearl system's 10px — so the two frameworks sat
 * side by side in the same section looking like two different products. That
 * was the "framework inconsistency" complaint.
 *
 * Each variant now maps onto its pearl tier, so `<Button variant="ghost">` and
 * `<button className="pearl-quiet">` render identically. Radius, fill, gloss,
 * shadow, weight and font-size all come from `.pearl-*` in index.css — the
 * single source — so no radius/typography utilities are declared here (the
 * Tailwind utilities layer is emitted after @layer components and would win,
 * which is exactly how the old 20px radius escaped the scale).
 */
const buttonVariants = cva(
  "group relative inline-flex items-center justify-center gap-2 whitespace-nowrap ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "pearl-button",
        destructive: "pearl-danger",
        outline: "pearl-secondary",
        secondary: "pearl-secondary",
        ghost: "pearl-quiet",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-9 px-4",
        lg: "h-11 px-7",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  enableRipple?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, enableRipple = true, onClick, children, ...props }, ref) => {
    const { ripples, createRipple } = useRipple();
    
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (enableRipple && !asChild) {
        createRipple(e);
      }
      onClick?.(e);
    };

    if (asChild) {
      return <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>{children}</Slot>;
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={handleClick}
        {...props}
      >
        {/* Ripple container */}
        {enableRipple && ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="absolute rounded-full bg-current opacity-20 animate-ripple pointer-events-none"
            style={{
              left: ripple.x,
              top: ripple.y,
              width: ripple.size,
              height: ripple.size,
            }}
          />
        ))}
        {/* Button content */}
        <span className="relative z-10 inline-flex items-center justify-center gap-2">
          {children}
        </span>
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
