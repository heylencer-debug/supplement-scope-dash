import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * DOCUMENT MODAL — THE big wide "read the report" modal for Dovive.
 *
 * Every long-form AI document view (formula briefs, QA reports,
 * competitive benchmarking, FDA/DSHEA compliance, market intelligence,
 * manufacturer version briefs, product detail) routes through this
 * component instead of a small BrandModal or ad-hoc Dialog.
 *
 * - WIDE: max-w-6xl, h-[88vh], internal scroll only (page never scrolls).
 * - CLINICAL LIGHT: brand lives in a thin iris gradient frame
 *   (.pearl-gradient-border-modal, src/index.css) + a compact light
 *   header band — the interior is always `bg-card`/ink, never dark. This
 *   is a formulator tool; the reading surface stays clinical.
 * - Reading column defaults to max-w-[78ch] centered with generous
 *   padding for prose comfort — override via `bodyClassName` for
 *   dashboard-dense content (e.g. ProductDetailModal) that needs full
 *   width instead of a narrow prose column.
 * - Fill children with `.document-prose` (see src/lib/markdownDoc.tsx's
 *   `MarkdownDoc`) for full document typography.
 */

export interface DocumentModalChip {
  label?: string;
  value: React.ReactNode;
}

export interface DocumentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Small pill chips under the title — category/version/date/model/etc. */
  chips?: DocumentModalChip[];
  /** Optional image/icon rendered left of the title (e.g. product thumb). */
  thumbnail?: React.ReactNode;
  /** Extra controls (e.g. Download PDF) rendered in the header band, before Close. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Override the reading column's width/padding (default: centered 78ch). */
  bodyClassName?: string;
}

export function DocumentModal({
  open,
  onOpenChange,
  title,
  subtitle,
  chips,
  thumbnail,
  actions,
  children,
  bodyClassName,
}: DocumentModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[1200] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none"
          style={{ background: "var(--overlay-bg)" }}
        />
        <DialogPrimitive.Content
          className={cn(
            "pearl-gradient-border-modal fixed left-1/2 top-1/2 z-[1210] -translate-x-1/2 -translate-y-1/2",
            "pointer-events-auto",
            "w-[calc(100vw-1.5rem)] max-w-6xl h-[88vh]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "motion-reduce:animate-none",
          )}
          style={{ boxShadow: "var(--overlay-shadow)" }}
        >
          <div className="pearl-gradient-border-modal-inner flex flex-col h-full overflow-hidden">
            {/* Header band — compact, light, always visible (never scrolls) */}
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border shrink-0">
              <div className="flex items-start gap-3 min-w-0">
                {thumbnail && <div className="shrink-0">{thumbnail}</div>}
                <div className="min-w-0 space-y-1.5">
                  <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-foreground leading-snug line-clamp-2">
                    {title}
                  </DialogPrimitive.Title>
                  {subtitle ? (
                    <DialogPrimitive.Description className="text-sm text-muted-foreground">
                      {subtitle}
                    </DialogPrimitive.Description>
                  ) : (
                    <DialogPrimitive.Description className="sr-only">
                      {typeof title === "string" ? title : "Document"}
                    </DialogPrimitive.Description>
                  )}
                  {chips && chips.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {chips.map((chip, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center h-5 px-2 rounded-full bg-muted text-[11px] font-medium whitespace-nowrap"
                        >
                          {chip.label ? <span className="text-muted-foreground/70 mr-1">{chip.label}</span> : null}
                          <span className="text-foreground">{chip.value}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {actions}
                <DialogPrimitive.Close
                  aria-label="Close"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground opacity-80 transition-[opacity,background-color] duration-150 hover:opacity-100 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </DialogPrimitive.Close>
              </div>
            </div>

            {/* Reading surface — the ONLY thing that scrolls */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-card">
              <div className={cn("mx-auto max-w-[78ch] px-10 py-8 sm:px-12 sm:py-10", bodyClassName)}>
                {children}
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default DocumentModal;
