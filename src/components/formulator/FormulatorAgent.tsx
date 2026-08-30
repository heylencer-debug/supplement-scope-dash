/**
 * FormulatorAgent — the floating bottom-right chat agent.
 *
 * Mounted ONCE at the Layout level (see src/components/layout/Layout.tsx)
 * so it exists on every internal page/tab (Products, Market, Formula,
 * Manufacturer, Data Audit, Product Explorer, Packaging, etc.) and follows
 * whatever category is currently selected via useCategoryContext — the
 * same context Dashboard.tsx already reads/writes. It is intentionally
 * absent from the standalone public /mfr/:token portal, since that route
 * isn't wrapped in <Layout>.
 *
 * Hosts the exact same thread/backend as the old inline Manufacturer-tab
 * chat (manufacturer-chat edge function + manufacturer_chat_messages) via
 * the shared <ChatThread> component — see ChatThread.tsx's header comment.
 * Change cards with Approve/Reject work identically here.
 *
 * The panel stays mounted (just visually hidden) while closed so the
 * thread keeps polling in the background — that's what lets the launcher
 * show an unread dot for a new agent reply that arrived while collapsed.
 */
import { useEffect, useState } from "react";
import { FlaskConical, X, Minus, Maximize2, Minimize2 } from "lucide-react";
import { useCategoryContext } from "@/contexts/CategoryContext";
import { ChatThread, type ChatMessageRow } from "@/components/manufacturer/ChatThread";
import { cn } from "@/lib/utils";

export function FormulatorAgent() {
  const { currentCategoryId, categoryName } = useCategoryContext();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Esc closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Reset unread the moment the panel is opened.
  useEffect(() => {
    if (open) setUnread(false);
  }, [open]);

  const handleLatestMessage = (_message: ChatMessageRow) => {
    if (!open) setUnread(true);
  };

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Formulator Agent" : "Open Formulator Agent"}
        className="fixed bottom-5 right-5 z-[1100] h-[52px] w-[52px] rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ background: "hsl(var(--brand-ink))", boxShadow: "0 8px 24px -6px rgba(0,0,0,0.4)" }}
      >
        {open ? (
          <Minus className="h-5 w-5" style={{ color: "hsl(var(--brand-neon))" }} />
        ) : (
          <FlaskConical className="h-5 w-5" style={{ color: "hsl(var(--brand-neon))" }} />
        )}
        {!open && unread && (
          <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-destructive ring-2 ring-background" />
        )}
      </button>

      {/* Panel — kept mounted always; visibility toggled via classes so the
          thread underneath keeps polling while closed (unread detection). */}
      <div
        className={cn(
          "fixed z-[1100] flex flex-col bg-card border border-border rounded-[var(--radius)] shadow-xl overflow-hidden",
          // Research-assistant width: 600px default, 920px expanded — a
          // 420px strip was too narrow for tables/citations (user report).
          "bottom-24 right-5 max-w-[calc(100vw-2.5rem)] h-[80vh] max-h-[820px]",
          expanded ? "w-[920px]" : "w-[600px]",
          "max-sm:inset-x-0 max-sm:bottom-0 max-sm:right-0 max-sm:left-0 max-sm:w-full max-sm:h-[85vh] max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-2xl",
          "transition-all duration-200 ease-out origin-bottom-right",
          open ? "opacity-100 scale-100 translate-y-0 pointer-events-auto" : "opacity-0 scale-95 translate-y-3 pointer-events-none"
        )}
      >
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 bg-[hsl(var(--brand-ink))] text-white">
          <div className="flex items-center gap-2 min-w-0">
            <FlaskConical className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--brand-neon))" }} />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">Formulator Agent</p>
              <p className="text-[11px] text-white/60 truncate leading-tight">
                {categoryName || "No category selected"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-label={expanded ? "Shrink panel" : "Expand panel"}
              className="h-7 w-7 rounded-full hidden sm:flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          {currentCategoryId && categoryName ? (
            <ChatThread
              categoryId={currentCategoryId}
              keyword={categoryName}
              className="h-full"
              hideHeader
              onLatestMessage={handleLatestMessage}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-2">
              <FlaskConical className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-foreground">Pick a category to chat about</p>
              <p className="text-xs text-muted-foreground">
                Select an analysis from the top bar — the agent grounds every reply in that category's formula, QA, benchmarking, and compliance documents.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default FormulatorAgent;
