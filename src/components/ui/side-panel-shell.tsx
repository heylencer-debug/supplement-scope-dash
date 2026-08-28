import * as React from "react";
import { X } from "lucide-react";

/**
 * SidePanelShell — fixed full-height right-edge drawer, ported from getnoodle's
 * shared side-panel wrapper. Distinct from BrandModal (centered dialog): use
 * this for detail/drawer views, BrandModal for confirmations/small forms.
 *
 * `data-pearl-scope="sidepanel"` sets `--pearl-h` to the panel height floor
 * (`--pearl-h-panel`, 2.75rem) for any pearl-button/pearl-quiet control inside —
 * see the `[data-pearl-scope='sidepanel']` rule in index.css.
 */
export interface SidePanelShellProps {
  title: React.ReactNode;
  icon: React.ReactNode;
  /** Panel width in px. Default 480. */
  width?: number | string;
  onClose: () => void;
  children: React.ReactNode;
  /** Optional pinned footer strip (~40px). */
  footer?: React.ReactNode;
  /** Optional action buttons between title and close button. */
  headerRight?: React.ReactNode;
}

export const SidePanelShell: React.FC<SidePanelShellProps> = ({
  title,
  icon,
  width = 480,
  onClose,
  children,
  footer,
  headerRight,
}) => {
  return (
    <div
      data-pearl-scope="sidepanel"
      className="fixed top-0 right-0 h-screen bg-background border-l border-border/50 z-[1100] flex flex-col overflow-hidden shadow-2xl"
      style={{ width, maxWidth: "100vw" }}
    >
      <div className="h-14 min-h-14 flex items-center gap-2.5 px-4 border-b border-border/50 shrink-0 bg-background">
        <span className="flex items-center text-primary">{icon}</span>
        <span className="flex-1 text-[15px] font-semibold text-foreground truncate flex items-center min-w-0">
          {title}
        </span>
        {headerRight}
        <button
          onClick={onClose}
          aria-label="Close panel"
          className="pearl-quiet flex items-center justify-center h-11 w-11 rounded-md text-muted-foreground hover:text-foreground"
        >
          <X className="w-[18px] h-[18px]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">{children}</div>

      {footer && (
        <div className="shrink-0 h-10 flex items-center gap-2 px-4 border-t border-border/50 bg-background">
          {footer}
        </div>
      )}
    </div>
  );
};

export default SidePanelShell;
