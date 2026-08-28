import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * PearlButton — a faithful port of the reference component.
 *
 * NOTHING IMPORTS THIS, AND THAT IS DELIBERATE — do not delete it as dead code.
 * It is the REFERENCE the rest of the pearl system is defined against. Three
 * things depend on it existing:
 *
 *   - `src/lib/pearlButton.test.ts` reads this file and the `.pearl-button`
 *     rules together; they are the only place the full surface (base ring,
 *     waterline `::before`, gloss cap `::after`, wrap, label) is asserted in
 *     one piece. `.pearl-quiet`, `.pearl-iris` and `.pearl-tab` are all checked
 *     for agreement WITH those rules, so removing the original leaves the
 *     copies with nothing to be honest against.
 *   - `src/lib/pearlIris.test.ts` slices the stylesheet using
 *     `.pearl-button::before` as its start anchor.
 *   - It is the artifact handed to the video editor as "the pearl button
 *     library" — the one file that shows the effect on its own, unbranded, with
 *     every knob named.
 *
 * Shipping UI does NOT use this component: brand-filled buttons get the pearl
 * from the SWEEP in index.css, and quiet ones from `pearl-quiet` on the
 * `outline`/`secondary`/`ghost` variants in `ui/button.tsx`. Reach for those.
 * This is the specimen, not the part.
 *
 * Three deliberate differences from the snippet, each for a concrete reason:
 *
 * 1. NO INLINE `<style>`. The reference declares its CSS inside the component,
 *    which re-injects the entire sheet into the DOM once per mounted instance
 *    and re-parses it on every mount. With a handful of CTAs on a page that is
 *    a handful of duplicate <style> nodes. The rules live in `src/index.css`
 *    under `.pearl-button`, parsed once.
 *
 * 2. `<span>` INSTEAD OF `<div>`/`<p>`. A <button> may only contain phrasing
 *    content, so `<div class="wrap">` and `<p>` inside it are invalid HTML.
 *    Browsers recover, but it breaks validation and can confuse assistive tech.
 *    The spans carry `display: flex` and read identically.
 *
 * 3. THE SPARKLES ARE `aria-hidden`. They are decoration, and the reference
 *    swaps them on hover — announcing "✧" then "✦" to a screen reader is noise.
 *
 * COLOUR IS NOT BRANDED BY DEFAULT. `--pearl-bg` and `--pearl-white` hold the
 * reference's own values so the effect can be judged on its own; `tone="brand"`
 * or `tone="neon"` overrides just those two knobs.
 */
export type PearlButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Convenience for the text-only case; `children` wins when both are given. */
  label?: string;
  /** `plain` keeps the reference's own colours. The others swap in the brand ramps. */
  tone?: "plain" | "brand" | "neon";
  /** Opt in to the animated aurora edge. Off by default — see index.css. */
  aurora?: boolean;
  /** Hide the ✧/✦ pair. */
  withSparkle?: boolean;
};

export const PearlButton = React.forwardRef<HTMLButtonElement, PearlButtonProps>(
  (
    {
      label = "Pearl Button",
      children,
      className,
      tone = "plain",
      aurora = false,
      withSparkle = true,
      type = "button",
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "pearl-button",
        tone === "brand" && "pearl-brand",
        tone === "neon" && "pearl-neon",
        aurora && "pearl-aurora",
        className,
      )}
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
