import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * PANEL — the flat content card of the light reading pane.
 *
 * The dashboard body is a data surface, not a brand surface. Gradients and the
 * iridescent `brand-iris-surface` belong to the CHROME only (the rail, the
 * header, BrandModal); anything the user actually reads sits on a plain white
 * card separated from the gray `.takeout-canvas` by a hairline.
 *
 * This replaces the previous body-wide use of the iris `BrandCard`, which
 * forced a dark iris surface (and a `dark` token scope) onto every report
 * section — the single biggest source of visual noise in the pane. That
 * component remains for genuine iris/accent surfaces; ordinary content uses
 * this.
 *
 * Recipe (design spec §3): `rounded-xl border border-border/60 bg-card`.
 * Padding is deliberately NOT baked in — sections compose their own
 * `CardHeader`/`CardContent` or pad directly, and a card that wraps a table or
 * an image grid must be able to go flush.
 */
export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Render as a button, for panels that are themselves the click target. */
  asButton?: boolean;
}

export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  ({ className, asButton, children, ...props }, ref) =>
    React.createElement(
      asButton ? 'button' : 'div',
      {
        ref,
        className: cn(
          'relative overflow-hidden rounded-xl border border-border/60 bg-card text-card-foreground',
          className,
        ),
        ...(asButton ? { type: 'button' as const } : {}),
        ...props,
      },
      children,
    ),
);
Panel.displayName = 'Panel';

export default Panel;
