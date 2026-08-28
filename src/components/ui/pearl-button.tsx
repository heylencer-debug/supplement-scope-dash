import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * PearlButton — ported from getnoodle's reference pearl-button component
 * (src/components/ui/pearl-button.tsx) and extended with the five variants
 * this dashboard's "Option C" restyle needs. getnoodle's original only knew
 * tone plain/brand/neon and was explicitly unused ("the specimen, not the
 * part") — here it IS the part: a real, importable button.
 *
 * Structure is preserved from the source: a `.pearl-wrap` > `.pearl-label`
 * span pair carrying the ✧/✦ sparkle swap, because index.css's `.pearl-*`
 * rules target those class names directly.
 */
export type PearlButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Convenience for the text-only case; `children` wins when both are given. */
  label?: string;
  /**
   * primary   -> .pearl-button (electric blue gloss fill)
   * secondary -> .pearl-secondary (neutral smoke fill)
   * quiet     -> .pearl-quiet (near-transparent, brightens on hover)
   * danger    -> .pearl-danger (red fill)
   * pill      -> .pearl-pill (fully rounded electric/neon CTA)
   */
  variant?: "primary" | "secondary" | "quiet" | "danger" | "pill";
  /** Only meaningful with variant="pill" — swaps electric for neon yellow. */
  neon?: boolean;
  /** Hide the ✧/✦ pair. */
  withSparkle?: boolean;
};

const VARIANT_CLASS: Record<NonNullable<PearlButtonProps["variant"]>, string> = {
  primary: "pearl-button",
  secondary: "pearl-secondary",
  quiet: "pearl-quiet",
  danger: "pearl-danger",
  pill: "pearl-pill",
};

export const PearlButton = React.forwardRef<HTMLButtonElement, PearlButtonProps>(
  (
    {
      label = "Pearl Button",
      children,
      className,
      variant = "primary",
      neon = false,
      withSparkle = true,
      type = "button",
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(VARIANT_CLASS[variant], neon && variant === "pill" && "pearl-neon", className)}
      {...props}
    >
      <span className="pearl-wrap">
        <span className="pearl-label">
          {withSparkle && (
            <>
              <span className="pearl-spark-idle" aria-hidden="true">
                ✧
              </span>
              <span className="pearl-spark-hover" aria-hidden="true">
                ✦
              </span>
            </>
          )}
          {children ?? label}
        </span>
      </span>
    </button>
  ),
);
PearlButton.displayName = "PearlButton";

export default PearlButton;
