import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * BrandCard — ported from getnoodle's src/components/ui/brand-card.tsx.
 * Wears the shared `.brand-iris-surface` treatment (eerie-black radial orb
 * over the panel colour) so every restyled dashboard panel shares one
 * surface definition instead of each growing its own decorative layers.
 */
export interface BrandCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Re-proportion the orb for this surface's shape (percentages resolve against the box). */
  orb?: {
    rx?: string;
    ry?: string;
    x?: string;
    y?: string;
    /** How far the black stays fully solid before it begins to fade. */
    solid?: string;
  };
  /** Render as a button, for cards that are themselves the click target. */
  asButton?: boolean;
}

export const BrandCard = React.forwardRef<HTMLDivElement, BrandCardProps>(
  ({ className, orb, asButton, style, children, ...props }, ref) => {
    const vars = {
      ...(orb?.rx ? { "--iris-orb-rx": orb.rx } : {}),
      ...(orb?.ry ? { "--iris-orb-ry": orb.ry } : {}),
      ...(orb?.x ? { "--iris-orb-x": orb.x } : {}),
      ...(orb?.y ? { "--iris-orb-y": orb.y } : {}),
      ...(orb?.solid ? { "--iris-orb-solid": orb.solid } : {}),
    } as React.CSSProperties;

    return React.createElement(
      asButton ? "button" : "div",
      {
        ref,
        // overflow-hidden is not optional: the orb layer can exceed the box.
        className: cn("brand-iris-surface relative overflow-hidden", className),
        style: { ...vars, ...style },
        ...(asButton ? { type: "button" as const } : {}),
        ...props,
      },
      children,
    );
  },
);
BrandCard.displayName = "BrandCard";

export default BrandCard;
