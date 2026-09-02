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
 *
 * PORTED FROM getnoodle (2026-09-03) — this repo's earlier port (Pearl pass)
 * predated getnoodle's `size`-as-class rewrite and had no call sites; this
 * replaces it with the current upstream version verbatim. Same four flair
 * assets (bolt/cross/hourglass/sparkle) were already present in
 * src/assets/flair/, so no new asset porting was needed for this file.
 */
const SHAPES = [hourglass, sparkle, cross, bolt];

/**
 * Must match the `brand-pop` cycle in index.css. Each shape STRIDES by
 * CYCLE_MS / SHAPES.length; the keyframes keep it visible for slightly longer
 * than that stride so the outgoing shape is still fading as the next arrives.
 * That small overlap is what makes it a handoff rather than a blink.
 */
const CYCLE_MS = 2600;

/**
 * The default slot, as a CLASS rather than an inline style — 32px, same number
 * this has always rendered at.
 *
 * WHY A CLASS AND NOT `size = 32`. It used to be a default parameter written
 * straight into `style`, and an inline style beats a plain utility class, so
 * every `<BrandLoader className="w-3 h-3" />` in the app silently rendered 32px.
 * Twenty-eight call sites asked for 12–16px and got 32. Nothing warned, because
 * the class WAS on the element — it just lost. A gate that reads the class
 * attribute passes on that bug; only a measured box catches it.
 *
 * As a class it goes through `cn` (tailwind-merge), which is the codebase's
 * existing conflict resolver: `twMerge('h-8 w-8', 'w-3 h-3')` returns `w-3 h-3`.
 * The caller's class wins BY DEFINITION rather than by cascade order or
 * specificity — worth insisting on in this stylesheet, where source order and
 * specificity have burned us before.
 */
export const BRAND_LOADER_DEFAULT_SIZE_CLASS = 'h-8 w-8';

/** `w-`/`h-`/`size-` utilities, including responsive and state variants. */
export const BRAND_LOADER_SIZE_CLASS_RE = /(?:^|\s)(?:[a-z-]+:)*(?:size|[wh])-/;

export const BrandLoader = ({
  size,
  className,
  label = 'Loading',
}: {
  /**
   * Edge length of the slot, in px. Inline wants 14–24; a page wants 56+.
   *
   * OPTIONAL WITH NO DEFAULT, on purpose. Leaving it out is how a caller says
   * "I am sizing this with classes"; giving it a default would put an inline
   * style on every instance and take that choice away again.
   *
   * Pass this OR a `w-`/`h-`/`size-` class, not both. Both is a dev warning.
   */
  size?: number;
  className?: string;
  /** Announced by screen readers. The spinner it replaced announced nothing. */
  label?: string;
}) => {
  // The two APIs both work now, so the only way left to be surprised is to use
  // BOTH and not know which wins. Say so out loud instead of picking silently —
  // silence is what let the original bug live at 28 call sites.
  if (import.meta.env.DEV && size !== undefined && className && BRAND_LOADER_SIZE_CLASS_RE.test(className)) {
    console.warn(
      `[BrandLoader] Got size={${size}} AND a sizing class ("${className}"). ` +
        'The inline size wins. Pick one — the prop for a computed px value, ' +
        'the class for anything Tailwind can express.',
    );
  }

  return (
    <div
      role="status"
      aria-label={label}
      // the marker for "house loading language, not a generic spinner" — a few
      // tests assert on it, and it is the honest name for what this now is
      data-noodle-loader=""
      className={cn('relative shrink-0', BRAND_LOADER_DEFAULT_SIZE_CLASS, className)}
      // ONLY when asked for. An unconditional inline style is the whole bug.
      style={size === undefined ? undefined : { width: size, height: size }}
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
};

export default BrandLoader;
