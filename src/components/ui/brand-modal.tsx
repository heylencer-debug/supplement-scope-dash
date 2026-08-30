import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X as PiX } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * BRAND MODAL — THE canonical small/medium modal for Dovive. New confirms,
 * small forms, and quick-view popups should use this, not roll their own
 * Dialog chrome. For big long-form documents (formula briefs, QA/benchmark/
 * FDA reports, product detail) use `DocumentModal` instead — it's the same
 * family, wide and document-shaped.
 *
 * CLINICAL LIGHT SHELL (2026-08-30): this used to force a `.dark
 * brand-iris-surface` (core-black orb) interior — inherited from getnoodle,
 * where BrandModal's black-on-black is the house style. Dovive is a
 * formulator tool ("we need to be clinical about it" — user), so every
 * modal interior must read as a clean light document, never dark mode. The
 * shell now uses the same iris-gradient RIM as DocumentModal
 * (`.pearl-gradient-border-modal`, src/index.css) — brand survives as a
 * ~1.5px gradient frame, the interior is plain `bg-card`/ink tokens. No
 * caller needs to change: every existing consumer already renders its
 * content with theme tokens (`text-foreground`/`bg-card`/etc, verified via
 * repo-wide audit), so removing the forced `.dark` scope just makes those
 * tokens resolve to their light values instead of dark ones.
 *
 * What you get for free:
 * - centered, prop-controlled max-width (`size`: sm 28rem / md 34rem / lg 44rem)
 * - max-height with INTERNAL scroll (never edge-to-edge full-bleed)
 * - header slot (icon chip + title + description), body, optional footer
 * - 44×44 close button, Esc + focus trap (Radix), `prefers-reduced-motion`
 * - mobile: full-width minus 1rem margin, capped to the dynamic viewport
 *
 * Usage:
 * ```tsx
 * <BrandModal
 *   open={open}
 *   onOpenChange={setOpen}
 *   size="md"
 *   icon={<PiBuildings className="text-[20px]" />}
 *   title="Team"
 *   description="Everyone with a seat gets access to all workspaces."
 *   footer={<Button onClick={save}>Save</Button>}
 * >
 *   ...scrollable body...
 * </BrandModal>
 * ```
 *
 * PORT NOTE (supplement-scope-dash): the only change from getnoodle's
 * src/components/ui/brand-modal.tsx is the close-icon import — the original
 * uses `PiX` from `react-icons`, which isn't a dependency in this repo.
 * Swapped for lucide-react's `X` (already a dependency here, shadcn default),
 * aliased back to the name `PiX` so nothing else in this file changes.
 */

const SIZE_CLASS = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-[34rem]',
  lg: 'sm:max-w-[44rem]',
} as const;

export interface BrandModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Max width on ≥sm screens. Phones always get full width minus margin. */
  size?: keyof typeof SIZE_CLASS;
  /** Optional icon rendered in an accent chip beside the title. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** Optional one-liner under the title. */
  description?: React.ReactNode;
  /** Optional action row pinned below the scrollable body. */
  footer?: React.ReactNode;
  /** Extra classes for the modal shell (rarely needed). */
  className?: string;
  /** Extra classes for the scrollable body. */
  bodyClassName?: string;
  children: React.ReactNode;
}

export const BrandModal = ({
  open,
  onOpenChange,
  size = 'md',
  icon,
  title,
  description,
  footer,
  className,
  bodyClassName,
  children,
}: BrandModalProps) => (
  <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-[1200] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none"
        style={{ background: 'var(--overlay-bg)' }}
      />
      <DialogPrimitive.Content
        className={cn(
          // Shell: thin iris-gradient rim (same recipe as DocumentModal),
          // plain light interior — see file header for why this is no
          // longer a forced-dark `.brand-iris-surface` fill.
          'pearl-gradient-border-modal fixed left-1/2 top-1/2 z-[1210] -translate-x-1/2 -translate-y-1/2',
          'pointer-events-auto',
          'w-[calc(100vw-1rem)] max-h-[calc(100dvh-2rem)] sm:w-full sm:max-h-[min(85dvh,52rem)]',
          SIZE_CLASS[size],
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'motion-reduce:animate-none',
          className,
        )}
        style={{ boxShadow: 'var(--overlay-shadow)' }}
      >
        <div className="pearl-gradient-border-modal-inner flex flex-col overflow-hidden pointer-events-auto max-h-[inherit]">
          {/* Header row — always rendered so the close button always exists. */}
          <div className="flex items-start gap-3 p-5 pb-4 sm:p-6 sm:pb-4">
            {icon && (
              <span
                className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 text-primary shrink-0"
                aria-hidden="true"
              >
                {icon}
              </span>
            )}
            <div className="flex-1 min-w-0 space-y-1">
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-foreground">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-sm leading-relaxed text-muted-foreground">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                // Radix warns without a description; keep the tree a11y-clean.
                <DialogPrimitive.Description className="sr-only">
                  {typeof title === 'string' ? title : 'Dialog'}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="shrink-0 -mr-2 -mt-1 inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground opacity-70 transition-[opacity,background-color] duration-150 hover:opacity-100 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            >
              <PiX className="text-[20px]" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          {/* Body — the ONLY thing that scrolls. */}
          <div className={cn('flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6', bodyClassName)}>
            {children}
          </div>

          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-border p-5 pt-4 sm:flex-row sm:justify-end sm:p-6 sm:pt-4">
              {footer}
            </div>
          )}
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
);

export default BrandModal;
