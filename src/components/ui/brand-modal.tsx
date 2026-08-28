import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * BrandModal — ported from getnoodle's src/components/ui/brand-modal.tsx.
 * The shared `.brand-iris-surface` wrapped around Radix Dialog. Two
 * adaptations for this repo:
 *   - `PiX` (react-icons) swapped for lucide-react's `X` — react-icons isn't
 *     a dependency here, lucide-react already is (shadcn default).
 *   - `bg-brand-accent/15` swapped for a literal electric-blue tint since
 *     this repo's Tailwind tokens don't define `brand-accent`.
 */
const SIZE_CLASS = {
  sm: "sm:max-w-md",
  md: "sm:max-w-[34rem]",
  lg: "sm:max-w-[44rem]",
} as const;

export interface BrandModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: keyof typeof SIZE_CLASS;
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export const BrandModal = ({
  open,
  onOpenChange,
  size = "md",
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
        className="fixed inset-0 z-[1200] bg-black/70 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none"
      />
      <DialogPrimitive.Content
        className={cn(
          "dark brand-iris-surface fixed left-1/2 top-1/2 z-[1210] -translate-x-1/2 -translate-y-1/2",
          "flex flex-col overflow-hidden rounded-2xl pointer-events-auto",
          "w-[calc(100vw-1rem)] max-h-[calc(100dvh-2rem)] sm:w-full sm:max-h-[min(85dvh,52rem)]",
          SIZE_CLASS[size],
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "motion-reduce:animate-none",
          className,
        )}
        style={
          {
            "--iris-orb-rx": "160%",
            "--iris-orb-ry": "150%",
            "--iris-orb-x": "46%",
            "--iris-orb-y": "44%",
            "--iris-orb-solid": "62%",
            boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          } as React.CSSProperties
        }
      >
        <div className="flex items-start gap-3 p-5 pb-4 sm:p-6 sm:pb-4">
          {icon && (
            <span
              className="inline-flex items-center justify-center h-10 w-10 rounded-lg shrink-0"
              style={{ background: "hsl(var(--brand-electric) / 0.15)", color: "hsl(var(--brand-electric))" }}
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
              <DialogPrimitive.Description className="text-sm leading-relaxed opacity-70">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">
                {typeof title === "string" ? title : "Dialog"}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            aria-label="Close"
            className="shrink-0 -mr-2 -mt-1 inline-flex h-11 w-11 items-center justify-center rounded-lg opacity-70 transition-[opacity,background-color] duration-150 hover:opacity-100 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        </div>

        <div className={cn("flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6", bodyClassName)}>
          {children}
        </div>

        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-white/10 p-5 pt-4 sm:flex-row sm:justify-end sm:p-6 sm:pt-4">
            {footer}
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
);

export default BrandModal;
