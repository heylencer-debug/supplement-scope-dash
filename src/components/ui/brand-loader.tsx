import { cn } from "@/lib/utils";

/**
 * BrandLoader — simplified port of getnoodle's src/components/ui/brand-loader.tsx.
 *
 * getnoodle cycles four brand-flair webp images (hourglass/sparkle/cross/bolt)
 * in a stacked slot. Those assets don't exist in this repo, so instead of
 * copying binaries across projects, this renders a single pulsing/spinning
 * pearl-gloss shape (a rounded square with the same inset gloss recipe as the
 * pearl buttons) that reads as "brand loader" without needing image assets.
 * Same external API (size/className/label) so call sites stay consistent if
 * an asset-based version ever replaces this.
 */
export const BrandLoader = ({
  size = 32,
  className,
  label = "Loading",
}: {
  /** Edge length of the slot, in px. Inline wants 14–24; a page wants 56+. */
  size?: number;
  className?: string;
  /** Announced by screen readers. */
  label?: string;
}) => (
  <div
    role="status"
    aria-label={label}
    data-noodle-loader=""
    className={cn("relative shrink-0", className)}
    style={{ width: size, height: size }}
  >
    <span className="brand-loader-shape" aria-hidden="true" />
  </div>
);

export default BrandLoader;
