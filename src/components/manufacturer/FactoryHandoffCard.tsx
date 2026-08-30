/**
 * FactoryHandoffCard — compact status card for the Manufacturer tab's
 * right column. Reads the same "factory" stage the Formula tab's journey
 * timeline already computes (useFormulaJourney) — no new state machine,
 * no new write path. The actual "Generate Manufacturer Link" action lives
 * in the tab's header (unchanged); this card is status + a way into the
 * full manufacturer portal (comments, publishing, chat) at /manufacturer-portal,
 * where the promote/publish controls for a manufacturer session actually live.
 */
import { Link } from "react-router-dom";
import { Factory, ArrowUpRight, Check } from "lucide-react";
import { useFormulaJourney } from "@/hooks/useFormulaJourney";
import { cn } from "@/lib/utils";

interface FactoryHandoffCardProps {
  categoryId: string;
}

export function FactoryHandoffCard({ categoryId }: FactoryHandoffCardProps) {
  const { stages, isLoading } = useFormulaJourney(categoryId);
  const factoryStage = stages.find((s) => s.id === "factory");

  return (
    <div className="rounded-[var(--radius)] border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Factory className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">Factory Handoff</span>
              {!isLoading && factoryStage && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full",
                    factoryStage.state === "done" && "border border-chart-4/30 text-chart-4 bg-chart-4/10",
                    factoryStage.state === "current" && "bg-[hsl(var(--brand-ink))] text-[hsl(var(--brand-neon))]",
                    factoryStage.state === "pending" && "border border-border bg-muted text-muted-foreground"
                  )}
                >
                  {factoryStage.state === "done" && <Check className="h-2.5 w-2.5" />}
                  {factoryStage.state === "done" ? "Done" : factoryStage.state === "current" ? "In Progress" : "Pending"}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isLoading ? "Loading…" : factoryStage?.headline ?? "—"}
            </p>
          </div>
        </div>
      </div>
      <Link
        to="/manufacturer-portal"
        className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border text-xs text-primary hover:bg-primary/5 transition-colors"
      >
        Manage in portal
        <ArrowUpRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

export default FactoryHandoffCard;
