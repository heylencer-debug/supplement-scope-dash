/**
 * ProcessingLoader — the branded "working" indicator for a LONG run.
 *
 * Visual: brand flair shapes flowing along a smooth noodle-like curve via
 * MarqueeAlongSvgPath (CSS motion path — offset-distance is a transform-class,
 * compositor-friendly property).
 *
 * WHY THIS EXISTS ALONGSIDE `BrandLoader`. They answer different questions.
 * `BrandLoader` is ONE SLOT: shapes take turns in a single icon-sized square, so
 * it drops into a button or beside a label and says "busy". This one is a
 * JOURNEY: shapes travel left to right along a strand, which says "your thing is
 * moving through a pipeline". Reach for this when the wait is measured in tens of
 * seconds or minutes (an analysis, a render); reach for BrandLoader when it is a
 * fetch.
 *
 * PORTED FROM getnoodle (2026-09-03) for Dovive's Formula Journey — the
 * dedicated running-state visual for the formula-chain (P9-P13, typically
 * 15-25 minutes). Local adaptation: `text-brand-accent`/`bg-brand-accent`
 * both already resolve here (tailwind.config.ts maps `brand-accent` to
 * `hsl(var(--brand-electric))` directly — this repo's accent token is a
 * flat static color, not getnoodle's dark-mode-flipping neon alias, so no
 * further token porting was needed; see reference_getnoodle_css_traps.md
 * trap #1 before assuming otherwise in a future pass).
 *
 * REPO MOTION LAW compliance (kept from source):
 *   - Render this ONLY while a run is active. Every call site mounts it on a
 *     busy/pending state and unmounts it the moment the run settles — the
 *     animation is state-driven, never ambient.
 *   - Movement is transform/opacity only (offset-path positioning).
 *   - prefers-reduced-motion collapses to a static brand shape with the
 *     pre-approved opacity pulse — no positional motion at all. The reduced
 *     branch is inside THIS component, so every call site inherits it by
 *     construction rather than by remembering to ask.
 */
import React from "react";
import { useReducedMotion } from "motion/react";
import MarqueeAlongSvgPath from "@/components/ui/marquee-along-svg-path";
import { cn } from "@/lib/utils";

import bolt from "@/assets/flair/bolt.webp";
import cross from "@/assets/flair/cross.webp";
import diamond from "@/assets/flair/diamond.webp";
import ring from "@/assets/flair/ring.webp";
import hourglass from "@/assets/flair/hourglass.webp";

export type ProcessingLoaderSize = "full-pane" | "inline" | "card";

/** One noodle strand, drawn in a 260×80 design box. Smaller variants scale
 *  it with a PURE-CSS transform (not the marquee's `responsive` mode, which
 *  measures clientWidth on mount — keep-alive panes mount hidden, so a JS
 *  measurement would read 0 and collapse the visual. The same trap waits
 *  for any surface that mounts its loader behind a hidden tab). */
const NOODLE_PATH =
  "M 10 48 C 40 10, 70 10, 100 40 C 130 70, 160 70, 190 40 C 205 25, 225 20, 250 30";
const NOODLE_VIEWBOX = "0 0 260 80";

const MARQUEE_SIZES: Record<ProcessingLoaderSize, { box: string; scale: number }> = {
  "full-pane": { box: "w-[260px] h-[80px]", scale: 1 },
  card: { box: "w-[180px] h-[56px]", scale: 0.692 },
  inline: { box: "w-[96px] h-[30px]", scale: 0.369 },
};

/**
 * THE FLOWING SHAPES — the real brand flair art from `src/assets/flair/`,
 * not icon-font glyphs.
 *
 * WHY THESE FOUR, AND WHY NOT SIMPLY BRANDLOADER'S FOUR. A marquee and a single
 * popping slot are different problems. Here the shapes are small AND moving AND
 * scaled down by up to 0.369, so the only thing that survives is the DISTRIBUTION
 * OF MASS — you cannot read detail on a 9px shape crossing a curve, you can only
 * read "diagonal", "symmetric cross", "solid wedge", "hole". These four are
 * maximally different on exactly that axis:
 *
 *   bolt     a diagonal slash
 *   cross    a symmetric X
 *   diamond  a solid wedge
 *   ring     an open O
 *
 * AND THEY SURVIVE A LIGHT GROUND. The flair art is full-colour iridescent
 * gradient, so it cannot be tinted with `text-*` the way a font glyph can — it
 * has to hold on both. bolt, cross, diamond and ring all carry a saturated
 * core and hold on both light and dark grounds.
 */
const FLOW_ITEMS = [
  <img key="bolt" src={bolt} alt="" aria-hidden draggable={false} className="block h-6 w-6 select-none" />,
  <img key="cross" src={cross} alt="" aria-hidden draggable={false} className="block h-5 w-5 select-none" />,
  <img key="diamond" src={diamond} alt="" aria-hidden draggable={false} className="block h-5 w-5 select-none" />,
  <img key="ring" src={ring} alt="" aria-hidden draggable={false} className="block h-4 w-4 select-none" />,
];

/** The animated centerpiece alone (no text). This export does not check
 *  prefers-reduced-motion; it is the motion half of the pair. A caller that
 *  reaches past `ProcessingLoader` for it owns that check. If you do not
 *  need a bespoke fallback, use `ProcessingLoader` with no message instead. */
export const ProcessingLoaderVisual: React.FC<{ size?: ProcessingLoaderSize; className?: string }> = ({
  size = "full-pane",
  className,
}) => {
  const { box, scale } = MARQUEE_SIZES[size];
  return (
    <div className={cn(box, "shrink-0", className)} aria-hidden data-processing-loader-visual>
      <div
        className="w-[260px] h-[80px] origin-top-left"
        style={scale !== 1 ? { transform: `scale(${scale})` } : undefined}
      >
        <MarqueeAlongSvgPath
          path={NOODLE_PATH}
          viewBox={NOODLE_VIEWBOX}
          showPath
          baseVelocity={12}
          repeat={2}
          className="h-full w-full text-brand-accent/25 [&>div]:h-full [&>div]:w-full"
        >
          {FLOW_ITEMS}
        </MarqueeAlongSvgPath>
      </div>
    </div>
  );
};

/** Reduced-motion fallback: a static brand shape, opacity pulse only.
 *
 *  The hourglass, because it is the one shape in the set that MEANS waiting —
 *  the rest say "brand", it says "this is taking a moment". It sits on the
 *  `bg-brand-accent/12` tile so the artwork has a ground on both themes. */
const StaticGlyph: React.FC<{ size: ProcessingLoaderSize }> = ({ size }) => (
  <div
    className={cn(
      "flex items-center justify-center rounded-2xl bg-brand-accent/12 animate-pulse shrink-0",
      size === "full-pane" ? "w-12 h-12 [&>img]:w-7 [&>img]:h-7" : "",
      size === "card" ? "w-9 h-9 rounded-xl [&>img]:w-5 [&>img]:h-5" : "",
      size === "inline" ? "w-6 h-6 rounded-lg [&>img]:w-4 [&>img]:h-4" : "",
    )}
    aria-hidden
  >
    <img src={hourglass} alt="" draggable={false} className="select-none" />
  </div>
);

export const ProcessingLoader: React.FC<{
  size?: ProcessingLoaderSize;
  /** Primary loading line ("Running formula QA…"). */
  message?: string;
  /** Secondary phase detail / reassurance line. */
  detail?: string;
  className?: string;
}> = ({ size = "full-pane", message, detail, className }) => {
  const reduced = useReducedMotion();
  const visual = reduced ? <StaticGlyph size={size} /> : <ProcessingLoaderVisual size={size} />;

  if (size === "inline") {
    return (
      <div
        className={cn("flex items-center gap-2.5 min-w-0", className)}
        role="status"
        data-processing-loader="inline"
      >
        {visual}
        {(message || detail) && (
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {message && <span className="font-medium text-foreground/80">{message}</span>}
            {message && detail && <span aria-hidden> — </span>}
            {detail}
          </span>
        )}
      </div>
    );
  }

  if (size === "card") {
    return (
      <div
        className={cn("rounded-lg border border-border/60 bg-muted/25 p-3", className)}
        role="status"
        data-processing-loader="card"
      >
        <div className="flex justify-center py-1">{visual}</div>
        {message && (
          <p className="mt-1 text-center text-xs font-medium text-foreground/80">{message}</p>
        )}
        {detail && (
          <p className="mt-0.5 text-center text-xs leading-snug text-muted-foreground">{detail}</p>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col items-center text-center gap-1", className)}
      role="status"
      data-processing-loader="full-pane"
    >
      {visual}
      {message && <p className="text-base font-medium text-foreground">{message}</p>}
      {detail && <p className="text-[13px] leading-relaxed text-muted-foreground">{detail}</p>}
    </div>
  );
};

export default ProcessingLoader;
