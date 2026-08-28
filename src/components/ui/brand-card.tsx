import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * BRAND CARD — the iridescent surface as a component.
 *
 * The surface itself is `.brand-iris-surface` in index.css; this exists so
 * there is ONE place that knows how to wear it, and so the class has a source
 * reference at all — Tailwind purges `@layer components` classes that no file
 * mentions, and the surface silently vanished from the build until this
 * component existed.
 *
 * WHAT IT REPLACES. The Takeout card previously stacked five separate
 * decorative layers of its own — a cyber grid, a blue wash, two blur blobs and
 * an animated bottom border — none shared with anything else in the app. Every
 * new surface that wanted to look branded grew its own set. This is the shared
 * one.
 *
 * CONTRAST IS LOAD-BEARING, not a detail. Smoke reads 15.55:1 on the eerie
 * black orb and 1.01:1 on neon — invisible. The orb is positioned to cover the
 * copy block for that reason, so re-proportioning it via `orb` is a layout
 * decision as much as a visual one: move the black off the text and the text
 * goes with it.
 */
export interface BrandCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Re-proportion the orb for this surface's shape. The defaults are tuned for
   * a WIDE card (roughly 4:1); a square or tall block wants `even`, or its own
   * numbers. Percentages resolve against the box, so the same values give a
   * very different ellipse at a different aspect ratio.
   */
  orb?: {
    rx?: string;
    ry?: string;
    x?: string;
    y?: string;
    /** How far the black stays fully solid before it begins to fade. */
    solid?: string;
  };
  /** Centred, rounder orb — for square-ish blocks. */
  even?: boolean;
  /** Render as a button, for cards that are themselves the click target. */
  asButton?: boolean;
}

export const BrandCard = React.forwardRef<HTMLDivElement, BrandCardProps>(
  ({ className, orb, even, asButton, style, children, ...props }, ref) => {
    const vars = {
      ...(orb?.rx ? { '--iris-orb-rx': orb.rx } : {}),
      ...(orb?.ry ? { '--iris-orb-ry': orb.ry } : {}),
      ...(orb?.x ? { '--iris-orb-x': orb.x } : {}),
      ...(orb?.y ? { '--iris-orb-y': orb.y } : {}),
      ...(orb?.solid ? { '--iris-orb-solid': orb.solid } : {}),
    } as React.CSSProperties;

    return React.createElement(
      asButton ? 'button' : 'div',
      {
        ref,
        // overflow-hidden is not optional: the orb layer is 130% of the box and
        // the edge is drawn on ::after at inset 0, so without it both spill.
        className: cn(
          // `dark` forces the token scope (index.css `.dark`) so ordinary
          // `text-foreground`/`text-muted-foreground` content dropped inside
          // a BrandCard (not just literal `text-brand-smoke` copy) resolves
          // to light-on-dark instead of silently falling through to the
          // app's light tokens — the same dark-on-dark bug BrandModal already
          // guards against. brand-iris-surface is inherently a black/iris
          // surface in every usage, so this is correct unconditionally.
          'dark brand-iris-surface relative overflow-hidden rounded-2xl',
          even && 'brand-iris-surface-even',
          className,
        ),
        style: { ...vars, ...style },
        ...(asButton ? { type: 'button' as const } : {}),
        ...props,
      },
      children,
    );
  },
);
BrandCard.displayName = 'BrandCard';

export default BrandCard;
