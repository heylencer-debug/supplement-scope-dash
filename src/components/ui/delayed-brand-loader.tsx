/**
 * DelayedBrandLoader — the brand loader, but silent for the first moment.
 *
 * WHY THIS IS NOT JUST `BrandLoader`. The two are visually identical once shown;
 * the difference is what happens when the wait turns out to be short.
 *
 * A stroked spinner is scale-invariant in TIME: any fraction of a rotation still
 * reads as "spinning", so flashing one for 150ms costs nothing. The brand loader
 * is not — `brand-pop` starts at scale(0.62)/opacity 0 and does not reach full
 * opacity until 9% of a 2600ms cycle, i.e. ~234ms. Mount it for 200ms and the
 * user sees a shape begin to arrive and then get yanked, which reads as a glitch
 * rather than as brand. That asymmetry is the whole reason this wrapper exists:
 * swapping a spinner for the brand loader is an upgrade on a slow path and a
 * downgrade on a fast one, unless the fast path simply shows nothing.
 *
 * THE SPACE IS RESERVED THE WHOLE TIME. The slot keeps its width and height
 * before the loader appears, so the accompanying label does not jump sideways
 * when it does.
 *
 * DEFAULT 220ms is just past `brand-pop`'s first full-opacity keyframe: if the
 * loader appears at all, it gets to finish an arrival.
 *
 * PORTED FROM getnoodle (2026-09-03), verbatim — used for the category
 * dashboard and Launchpad library's initial-load gates, where the fetch is
 * often fast (warm cache / already-visited category).
 */
import { useEffect, useState } from 'react';
import {
  BrandLoader,
  BRAND_LOADER_DEFAULT_SIZE_CLASS,
  BRAND_LOADER_SIZE_CLASS_RE,
} from '@/components/ui/brand-loader';
import { cn } from '@/lib/utils';

export const DelayedBrandLoader = ({
  size,
  delayMs = 220,
  className,
  label = 'Loading',
}: {
  /**
   * Edge length in px. Optional with no default, and the placeholder below
   * follows the same rule — see BrandLoader. A default here would put an inline
   * width on the reserved slot and quietly outrank a caller's `w-3 h-3`, which
   * is the exact bug this pair just came out of; the wrapper has to hold the
   * same contract as the thing it wraps or the two disagree.
   */
  size?: number;
  /** Wait this long before showing anything. */
  delayMs?: number;
  className?: string;
  label?: string;
}) => {
  // Warned HERE and not only in BrandLoader: on a fast path the loader never
  // mounts, so delegating the warning would mean the one caller who most needs
  // it never sees it.
  if (import.meta.env.DEV && size !== undefined && className && BRAND_LOADER_SIZE_CLASS_RE.test(className)) {
    console.warn(
      `[DelayedBrandLoader] Got size={${size}} AND a sizing class ("${className}"). ` +
        'The inline size wins, for the placeholder and the loader both. Pick one.',
    );
  }

  const [show, setShow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);

  if (!show) {
    // Reserved, silent, and NOT announced — there is nothing to announce yet.
    // Sized exactly like the loader it is standing in for, by the same rules,
    // so nothing moves at the swap.
    return (
      <span
        aria-hidden
        className={cn('block shrink-0', BRAND_LOADER_DEFAULT_SIZE_CLASS, className)}
        style={size === undefined ? undefined : { width: size, height: size }}
      />
    );
  }

  return <BrandLoader size={size} className={className} label={label} />;
};

export default DelayedBrandLoader;
