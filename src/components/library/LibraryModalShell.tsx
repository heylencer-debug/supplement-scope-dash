/**
 * LibraryModalShell — the Noodle Takeout modal's shell, generalised for the
 * app's small libraries (Prompt Library, Noodle Notes).
 *
 * PORTED VERBATIM from ~/getnoodle/src/components/library/LibraryModalShell.tsx
 * (structure/classes/copy untouched) for the future Noodle-subapp merge, per
 * coordinator instruction 2026-08-28. Deviations, both load-bearing and both
 * documented at the exact line they occur:
 *   1. `react-icons/pi` isn't a dependency here (same reason every other
 *      verbatim Noodle port in this repo — pearl-button/brand-card/brand-modal
 *      — made this swap) — icons re-mapped to lucide-react, aliased back to
 *      the original `Pi*` names so the JSX below is otherwise unchanged.
 *   2. `framer-motion` isn't a dependency here either — `motion.*` wrappers
 *      replaced with plain elements + CSS transitions preserving the same
 *      classes; `AnimatePresence` replaced with a plain conditional render
 *      (the drawer loses its enter/exit animation, gains nothing else
 *      different — see the two spots marked DEVIATION below).
 *
 * The user's stated plan is for the whole Dovive app to eventually mount as a
 * Noodle subapp (like Notes/Prompt Library today) — this file exists so that
 * merge is a copy-paste, not a rewrite. It is NOT used as a top-level page
 * wrapper in supplement-scope-dash today (Dovive is a routed SPA, not a
 * dialog launched from within a host app) — see
 * src/components/layout/AppSidebar.tsx / Layout.tsx for how this repo's
 * *persistent page* rail+header reuse this shell's anatomy without the
 * Dialog wrapper (a page can't sanely live inside a focus-trapped modal).
 *
 * Original header comment, preserved:
 *
 *   ┌────────────┬──────────────────────────────────────────┐
 *   │  RAIL      │  HEADER (.dark) — chip + title + close   │
 *   │  (.dark,   ├──────────────────────────────────────────┤
 *   │   iris)    │  CONTENT PANE — the editor / detail      │
 *   │  brand band│                                          │
 *   │  search    │                                          │
 *   │  facets    │                                          │
 *   │  rows      │                                          │
 *   │  footer    │                                          │
 *   └────────────┴──────────────────────────────────────────┘
 *
 * WHAT IS COPIED FROM TAKEOUT, ON PURPOSE:
 *  - full-height dialog (`h-[88vh]`), `p-0 gap-0 flex flex-row`, `sr-only`
 *    DialogTitle (the visible brand row lives in a collapsible rail, so the
 *    accessible name must not depend on it being mounted);
 *  - the rail is `.dark brand-iris-surface` with a `bg-black/45` brand plate
 *    and a full-height `bg-black/60 backdrop-blur-xl` glass panel, so every
 *    control inside has its own ground and never depends on where the
 *    gradient falls;
 *  - shadcn Tabs as the facet switcher, with count badges;
 *  - the ≥1152px static-rail / below-that slide-in-drawer split;
 *  - `pearl-quiet` chrome, `pearl-iris pearl-state-only` rows.
 *
 * WHAT IS DELIBERATELY NOT COPIED: Takeout forces `.light` on its content pane
 * because its panes are long analysis REPORTS meant to be read on paper-white.
 * These two libraries are app-native editors, so the pane here follows the app
 * theme (`bg-card` / `text-foreground`). Forcing light would make them the only
 * two editors in the product that ignore the theme. The rail still forces
 * `.dark`, exactly as Takeout does, so the family resemblance holds in either
 * scope.
 */
import React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  X as PiX,
  PanelLeft as PiSidebarSimple,
  Search as PiMagnifyingGlass,
  RefreshCw as PiArrowsClockwise,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/** True at ≥1152px — same breakpoint as Takeout's static sidebar. Below it the
 *  rail becomes a slide-in drawer: prompt/note lists don't reduce to icons, so
 *  collapsing is the honest tablet answer. */
export function useWideLibraryModal(): boolean {
  const [wide, setWide] = React.useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1152px)').matches,
  );
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1152px)');
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

export interface LibraryFacet {
  id: string;
  label: string;
  /** Short label used when the rail is tight — falls back to `label`. */
  shortLabel?: string;
  count: number;
  disabled?: boolean;
  /** Tooltip hint for a disabled facet (e.g. "open a workspace first"). */
  hint?: string;
}

export interface LibraryModalShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rendered as a DialogTrigger when the component is uncontrolled. */
  trigger?: React.ReactNode;

  /** Brand plate — the mark and the library's name. */
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  /** Second line on the brand plate (the library's contract, in one clause). */
  railSubtitle?: string;

  /** Header row: a small uppercase chip, then the pane's own title. */
  headerChip?: string;
  headerTitle: React.ReactNode;
  /** Extra header controls, placed before the close button. */
  headerActions?: React.ReactNode;

  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;

  facets: readonly LibraryFacet[];
  facet: string;
  onFacetChange: (id: string) => void;

  onRefresh?: () => void;
  refreshing?: boolean;

  /** The scrolling list of rows for the ACTIVE facet. */
  railList: React.ReactNode;
  /** Pinned rail footer — primary action + quiet actions. */
  railFooter?: React.ReactNode;

  /** The content pane (editor / detail). */
  children: React.ReactNode;
}

export const LibraryModalShell: React.FC<LibraryModalShellProps> = ({
  open,
  onOpenChange,
  trigger,
  icon: Icon,
  title,
  railSubtitle,
  headerChip,
  headerTitle,
  headerActions,
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  facets,
  facet,
  onFacetChange,
  onRefresh,
  refreshing,
  railList,
  railFooter,
  children,
}) => {
  const isWide = useWideLibraryModal();
  const [railOpen, setRailOpen] = React.useState(false);
  // Crossing up to the static layout retires the drawer.
  React.useEffect(() => { if (isWide) setRailOpen(false); }, [isWide]);

  const railBody = (
    <>
      {/* BRAND PLATE — an opaque ink tile on a `bg-black/45` scrim, the same
          construction as Takeout's: this row stands ON the iris colour, so it
          cannot be a tint. Contrast then never depends on gradient phase. */}
      <div className="shrink-0 flex items-center gap-3 rounded-xl bg-black/45 px-3 py-2.5">
        {/* DEVIATION 2: original is a framer-motion spring pop-in
            (scale 0.5->1, rotate -12->0). No framer-motion dependency here —
            plain span, same resting classes, no animation. */}
        <span
          className="inline-flex items-center justify-center h-11 w-11 rounded-lg bg-brand-ink border border-brand-smoke/20 text-brand-smoke shrink-0"
          aria-hidden
        >
          <Icon className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight leading-tight text-brand-smoke truncate">
            {title}
          </p>
          {railSubtitle && (
            <p className="text-xs text-brand-smoke/75 leading-snug line-clamp-2" title={railSubtitle}>
              {railSubtitle}
            </p>
          )}
        </div>
      </div>

      {/* THE GLASS PANEL — full height, so the iris reads as a frame around the
          panel rather than a block beneath it. */}
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-white/10 bg-black/60 backdrop-blur-xl overflow-hidden p-2.5 gap-2">
        <div className="shrink-0 flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <PiMagnifyingGlass
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-10 pl-9 pr-3 text-sm bg-card/70 border-border/60 rounded-md"
            />
          </div>
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Refresh list"
              title="Refresh"
              className="pearl-quiet pearl-radius-tight h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <PiArrowsClockwise className={cn('w-4 h-4', refreshing && 'animate-spin')} aria-hidden />
            </Button>
          )}
        </div>

        {/* FACET SWITCHER — shadcn Tabs for real tablist semantics and roving
            focus. TabsTrigger already carries `pearl-quiet` plus a neutral
            active fill, so no custom hover/active paint is added here (two
            answers to "is this hovered" is the trap the pearl doc warns of). */}
        <Tabs value={facet} onValueChange={onFacetChange} className="shrink-0">
          <TabsList
            aria-label={`${title} views`}
            className={cn(
              'grid w-full h-10 p-1 gap-1 rounded-lg bg-card/80 border border-border/40',
              facets.length >= 3 ? 'grid-cols-3' : facets.length === 2 ? 'grid-cols-2' : 'grid-cols-1',
            )}
          >
            {facets.map((f) => (
              <TabsTrigger
                key={f.id}
                value={f.id}
                disabled={f.disabled}
                title={f.disabled ? f.hint : undefined}
                className="h-8 rounded-md px-1 gap-1.5 text-xs font-semibold cursor-pointer disabled:cursor-not-allowed"
              >
                <span className="truncate">{f.shortLabel ?? f.label}</span>
                {facets.length <= 2 && f.count > 0 && (
                  <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold leading-none tabular-nums">
                    {f.count > 999 ? '1k+' : f.count}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-0.5 px-0.5 space-y-1">{railList}</div>
      </div>

      {railFooter && (
        <div className="shrink-0 border-t border-white/10 pt-2.5 mt-0.5 flex flex-col gap-2">
          {railFooter}
        </div>
      )}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className="!max-w-[1400px] w-[96vw] h-[88vh] p-0 gap-0 flex flex-row overflow-hidden rounded-2xl"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>

        {isWide && (
          <aside className="dark brand-iris-surface w-[360px] shrink-0 text-foreground flex flex-col p-3.5 gap-3 rounded-l-[--radius-xl]">
            {railBody}
          </aside>
        )}

        {/* Tablet/mobile drawer. DEVIATION 2: no AnimatePresence/motion — plain
            conditional render, same resting classes, no enter/exit transition. */}
        {!isWide && railOpen && (
          <div key="library-rail-drawer" className="absolute inset-0 z-30 flex">
            <aside className="dark brand-iris-surface w-[360px] max-w-[85%] h-full text-foreground flex flex-col p-3.5 gap-3 shadow-2xl rounded-l-[--radius-xl]">
              {railBody}
            </aside>
            <button
              type="button"
              aria-label="Close library list"
              className="flex-1 bg-foreground/25 backdrop-blur-[2px] cursor-pointer"
              onClick={() => setRailOpen(false)}
            />
          </div>
        )}

        {/* ══ RIGHT COLUMN — dark header over the theme-following pane ══ */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="dark flex items-center gap-2 sm:gap-3 h-14 px-3 sm:px-4 bg-background text-foreground border-b border-border/60 shrink-0">
            {!isWide && (
              <Button
                variant="ghost"
                size="icon"
                className="pearl-quiet pearl-radius-tight h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => setRailOpen((v) => !v)}
                aria-label={`Toggle ${title} list`}
                title={title}
              >
                <PiSidebarSimple className="w-4 h-4" aria-hidden />
              </Button>
            )}
            {headerChip && (
              <span className="shrink-0 inline-flex items-center h-9 px-3 rounded-md text-xs uppercase tracking-wider font-semibold text-foreground border border-border/70">
                {headerChip}
              </span>
            )}
            <p className="text-sm font-semibold tracking-tight flex-1 min-w-0 truncate">{headerTitle}</p>
            {headerActions}
            <Button
              variant="ghost"
              size="icon"
              className="pearl-quiet pearl-radius-tight ml-auto h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
              aria-label={`Close ${title}`}
              title="Close"
            >
              <PiX className="w-4 h-4" aria-hidden />
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto bg-card text-foreground">{children}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/**
 * A rail ROW. `pearl-iris pearl-state-only` is the repo's declared row language
 * (SessionsPanel.tsx) — the iris answers both a pointer and the held
 * `aria-selected` state, and `pearl-state-only` keeps the list from strobing
 * under a moving mouse. The smoke tint on the selected row is NOT a second
 * answer to the same question: without it, a hovered row and the selected row
 * are indistinguishable the moment the pointer enters the list, and the tint
 * survives forced-colors where a decorative pseudo-element does not.
 */
export const LibraryRow: React.FC<{
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  title?: string;
  /** Hover-revealed action buttons, pinned to the row's top-right. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ selected, dimmed, onClick, title, actions, children }) => (
  <div
    aria-selected={selected}
    className={cn(
      'group relative rounded-lg border pearl-iris pearl-state-only transition-colors',
      selected ? 'border-brand-smoke/45 bg-brand-smoke/10' : 'border-transparent',
      dimmed && 'opacity-60',
    )}
  >
    {onClick ? (
      <button type="button" onClick={onClick} title={title} className="w-full text-left px-2.5 py-2 cursor-pointer">
        {children}
      </button>
    ) : (
      <div className="px-2.5 py-2">{children}</div>
    )}
    {actions && (
      <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-md bg-card/95 backdrop-blur-sm p-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {actions}
      </div>
    )}
  </div>
);

/** Icon button for a LibraryRow's hover actions. */
export const LibraryRowAction: React.FC<{
  onClick: () => void;
  label: string;
  title?: string;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ onClick, label, title, danger, children }) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    aria-label={label}
    title={title ?? label}
    className={cn(
      'pearl-quiet pearl-radius-tight inline-flex h-7 w-7 items-center justify-center rounded bg-card/85 text-muted-foreground cursor-pointer',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      danger ? 'pearl-danger hover:text-destructive' : 'hover:text-foreground',
    )}
  >
    {children}
  </button>
);

/** Rail empty state — reads on the glass panel, same tone as Takeout's. */
export const LibraryRailEmpty: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  headline: string;
  body: React.ReactNode;
}> = ({ icon: Icon, headline, body }) => (
  <div className="mx-0.5 mt-1 rounded-lg border border-white/10 bg-black/20 p-4">
    <Icon className="w-4 h-4 text-brand-smoke/70" aria-hidden />
    <p className="mt-1.5 text-sm font-semibold leading-snug text-brand-smoke">{headline}</p>
    <p className="mt-1 text-xs leading-relaxed text-brand-smoke/75">{body}</p>
  </div>
);

/** A labelled field in a content-pane form. */
export const LibraryField: React.FC<{
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, htmlFor, hint, children }) => (
  <div className="space-y-2">
    <label
      htmlFor={htmlFor}
      className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
    >
      {label}
    </label>
    {children}
    {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
  </div>
);

/** A switch row in a content-pane form (state affordance + explanation). */
export const LibraryToggleRow: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ icon: Icon, label, hint, children }) => (
  <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/40 border border-border/60">
    <div className="flex items-start gap-2.5 min-w-0">
      <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground leading-snug">{label}</p>
        {hint && <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{hint}</p>}
      </div>
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);
