import { cn } from '@/lib/utils';

import hourglass from '@/assets/flair/hourglass.webp';
import sparkle from '@/assets/flair/sparkle.webp';
import cross from '@/assets/flair/cross.webp';
import bolt from '@/assets/flair/bolt.webp';

/**
 * BRAND LOADER — one slot, brand shapes popping through it in turn.
 *
 * Replaces the generic stroked spinner. A spinner says "busy" in the same voice
 * as every other product; the shapes say it in yours.
 *
 * ONE SLOT, NOT A ROW. The shapes are stacked on top of each other and take
 * turns, so the whole loader occupies a single icon-sized square. That is what
 * lets the same component sit at 14px beside a node's "Generating…" label and
 * at 64px in the middle of the loading screen — a row of shapes fits neither.
 * It also makes the motion a sequence rather than a wave: one thing arrives,
 * leaves, the next arrives, which reads as steps of work happening.
 *
 * CHANGE THE SHAPES HERE. This array is the only place the loading art is
 * named, so editing it changes every loading state in the app at once.
 *
 * WHY THESE FOUR. The hourglass leads because it is the only shape in the set
 * that MEANS waiting — the rest say "brand", it says "this is taking a moment".
 *
 * Not all nine: most lose their silhouette below about 24px. The daisy, the
 * burst and the pinwheel turn to mush at the size a node button needs, which is
 * the opposite of what a loader is for. These four hold their outline small and
 * are distinct enough that the sequence reads as four arrivals rather than one
 * shape wobbling.
 */
const SHAPES = [hourglass, sparkle, cross, bolt];

/**
 * Must match the `brand-pop` cycle in index.css. Each shape STRIDES by
 * CYCLE_MS / SHAPES.length; the keyframes keep it visible for slightly longer
 * than that stride so the outgoing shape is still fading as the next arrives.
 * That small overlap is what makes it a handoff rather than a blink.
 */
const CYCLE_MS = 2600;

export const BrandLoader = ({
  size = 32,
  className,
  label = 'Loading',
}: {
  /** Edge length of the slot, in px. Inline wants 14–24; a page wants 56+. */
  size?: number;
  className?: string;
  /** Announced by screen readers. The spinner it replaced announced nothing. */
  label?: string;
}) => (
  <div
    role="status"
    aria-label={label}
    // the marker for "house loading language, not a generic spinner" — a few
    // tests assert on it, and it is the honest name for what this now is
    data-noodle-loader=""
    className={cn('relative shrink-0', className)}
    style={{ width: size, height: size }}
  >
    {SHAPES.map((src, i) => (
      <img
        key={i}
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="brand-loader-shape absolute inset-0 h-full w-full select-none"
        style={{ animationDelay: `${(i * CYCLE_MS) / SHAPES.length}ms` }}
      />
    ))}
  </div>
);

export default BrandLoader;
