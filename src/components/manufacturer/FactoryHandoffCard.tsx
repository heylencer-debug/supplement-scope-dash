/**
 * FactoryHandoffCard — compact status card for the Manufacturer tab's
 * right column. Reads the same "factory" stage the Formula tab's journey
 * timeline already computes (useFormulaJourney) — no new state machine,
 * no new write path. The actual "Generate Manufacturer Link" action lives
 * in the tab's header (unchanged); this card is status + a way into the
 * full manufacturer portal (comments, publishing, chat) at /manufacturer-portal,
 * where the promote/publish controls for a manufacturer session actually live.
 *
 * 2026-09-03 follow-up (tri-formula handoff selector): when the category's
 * canonical formula has a Proven/Edge/Recommended split (useFormulaJourney's
 * `canonicalFormula.variants`, same source TriFormulaView reads elsewhere),
 * this card also lets the user pick WHICH formula the factory handoff
 * document is built around — defaults to Recommended (the one every other
 * downstream document already treats as canonical). The chosen variant's
 * name is stamped into both the preview and the downloaded PDF so there's
 * no ambiguity about which formula a manufacturer received. Entirely
 * frontend: `generateManufacturerPDF` is a client-side markdown→HTML→print
 * composer (src/lib/manufacturerPDF.ts), no AI call and no backend/edge
 * function involved. Graceful fallback: on a legacy (non-tri-formula) brief
 * the selector doesn't render and Preview/Download just use the single
 * canonical document, exactly as the handoff concept already implied.
 *
 * 2026-09-03 follow-up #2 ("send the 3 formulas to the manufacturer"): the
 * handoff selector now also offers "All 3 Formulas" — and defaults to it
 * for tri-formula categories, since the whole point of the user's request
 * is letting the factory quote/compare Proven vs Edge vs Recommended rather
 * than committing to one upfront. The three single-variant options above
 * stay available for when a formula HAS been chosen and the handoff should
 * be scoped to just that one. `buildAllThreeFormulasMarkdown` (shared with
 * the Manufacturer Portal pages — see canonicalFormula.ts) assembles one
 * document: cover note, then each formula as its own titled section with
 * its per-formula sign-off verdict, then the comparative "when to launch
 * which" verdict at the end. Legacy (non-tri-formula) briefs are unaffected
 * — `hasVariants` gates all of this off.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Factory, ArrowUpRight, Check, Eye, Download } from "lucide-react";
import { useFormulaJourney } from "@/hooks/useFormulaJourney";
import { cn } from "@/lib/utils";
import { DocumentModal } from "@/components/ui/document-modal";
import { MarkdownDoc } from "@/lib/markdownDoc";
import { Button } from "@/components/ui/button";
import { generateManufacturerPDF } from "@/lib/manufacturerPDF";
import { buildAllThreeFormulasMarkdown } from "@/lib/canonicalFormula";

interface FactoryHandoffCardProps {
  categoryId: string;
  categoryName?: string;
}

type SingleVariantKey = "recommended" | "proven" | "edge";
type VariantKey = SingleVariantKey | "all3";

const VARIANT_META: Record<SingleVariantKey, { label: string; description: string }> = {
  recommended: { label: "Recommended Blend", description: "Our blend of both — the formula that ships" },
  proven: { label: "Proven", description: "What the established winners agree on" },
  edge: { label: "Edge", description: "What the new winners are betting on" },
};

const ALL3_META = { label: "All 3 Formulas", description: "Send Proven, Edge, and Recommended for the manufacturer to quote and compare" };

export function FactoryHandoffCard({ categoryId, categoryName }: FactoryHandoffCardProps) {
  const { stages, canonicalFormula, isLoading } = useFormulaJourney(categoryId);
  const factoryStage = stages.find((s) => s.id === "factory");
  // Defaults to "all 3" — irrelevant for legacy (non-tri-formula) briefs,
  // since the resolution logic below only branches on it when hasVariants.
  const [selectedVariant, setSelectedVariant] = useState<VariantKey>("all3");
  const [previewOpen, setPreviewOpen] = useState(false);

  const variants = canonicalFormula.variants;
  const hasVariants = !!(variants && (variants.proven || variants.edge || variants.recommended));
  const hasFormula = !!canonicalFormula.source;
  const isAll3 = hasVariants && selectedVariant === "all3";

  // The document the handoff is built around: "all 3" (assembled below),
  // the selected single variant when a tri-formula split exists (falling
  // back to whichever variant is actually populated), or the single
  // canonical document on a legacy brief.
  const resolvedVariant: SingleVariantKey | null = hasVariants && !isAll3
    ? (variants![selectedVariant as SingleVariantKey] ? (selectedVariant as SingleVariantKey) : (["recommended", "proven", "edge"] as SingleVariantKey[]).find((k) => variants![k]) ?? null)
    : null;
  const variantContent = resolvedVariant ? variants![resolvedVariant] : canonicalFormula.fullDocument;
  const variantLabel = resolvedVariant ? VARIANT_META[resolvedVariant].label : null;

  // Handoff content is prefixed with an explicit "which formula is this"
  // banner — visible in both the preview modal and the PDF — so the choice
  // is never ambiguous once this document leaves the dashboard.
  const handoffContent = isAll3
    ? buildAllThreeFormulasMarkdown(variants!, canonicalFormula.perFormulaSignoff, canonicalFormula.comparativeVerdict)
    : (variantContent
        ? (variantLabel
            ? `## HANDOFF FORMULA: ${variantLabel}\n\n_This factory handoff document is built around the **${variantLabel}** formula${hasVariants ? " (one of three adjudicated formulas — Proven / Edge / Recommended Blend)" : ""}._\n\n---\n\n${variantContent}`
            : variantContent)
        : null);

  const signoffVerdict = isAll3 ? undefined : (resolvedVariant ? canonicalFormula.perFormulaSignoff?.[resolvedVariant]?.verdict : canonicalFormula.verdict);

  function handleDownloadPDF() {
    if (!handoffContent) return;
    generateManufacturerPDF({
      categoryName: categoryName || "Formula",
      positioning: isAll3
        ? "Factory handoff document — all three candidate formulas (Proven / Edge / Recommended) for the manufacturer to quote and compare."
        : (variantLabel ? `Factory handoff document — built around the ${variantLabel} formula.` : undefined),
      finalFormulaBrief: handoffContent,
      qaVerdict: signoffVerdict ? { score: null, verdict: signoffVerdict, summary: `Sign-off verdict for ${variantLabel ?? "this formula"}` } : null,
    });
  }

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
              {hasVariants && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-primary/30 text-primary bg-primary/10">
                  3 formulas
                </span>
              )}
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

      {/* Formula selector — only when this category has a real Proven/Edge/
          Recommended split. "All 3 Formulas" stays preselected on every
          remount (no persistence) so the default handoff lets the factory
          quote/compare all three; the three single-variant options below
          stay available for when a formula HAS been chosen and the handoff
          should be scoped to just that one. */}
      {hasFormula && (
        <div className="px-4 pb-3 border-t border-border pt-3">
          {hasVariants && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Handoff formula
              </p>
              <button
                type="button"
                onClick={() => setSelectedVariant("all3")}
                className={cn(
                  "w-full text-[11px] font-semibold px-2 py-1.5 rounded-md border transition-colors mb-1.5",
                  isAll3
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
                title={ALL3_META.description}
              >
                {ALL3_META.label}
              </button>
              <div className="flex gap-1 mb-2">
                {(["recommended", "proven", "edge"] as SingleVariantKey[]).map((key) => {
                  const disabled = !variants![key];
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedVariant(key)}
                      className={cn(
                        "flex-1 text-[11px] font-medium px-2 py-1.5 rounded-md border transition-colors truncate",
                        selectedVariant === key && !disabled && !isAll3
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted",
                        disabled && "opacity-40 cursor-not-allowed"
                      )}
                      title={VARIANT_META[key].description}
                    >
                      {VARIANT_META[key].label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                {isAll3 ? ALL3_META.description : (variantLabel ? VARIANT_META[selectedVariant as SingleVariantKey].description : "No formula content yet")}
              </p>
            </>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-[11px] flex-1"
              disabled={!handoffContent}
              onClick={() => setPreviewOpen(true)}
            >
              <Eye className="w-3 h-3" />
              Preview
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-[11px] flex-1"
              disabled={!handoffContent}
              onClick={handleDownloadPDF}
            >
              <Download className="w-3 h-3" />
              Download PDF
            </Button>
          </div>
        </div>
      )}

      <DocumentModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={`Factory Handoff${isAll3 ? " — All 3 Formulas" : variantLabel ? ` — ${variantLabel}` : ""}`}
        subtitle={categoryName}
        chips={signoffVerdict ? [{ label: "Sign-off", value: signoffVerdict }] : undefined}
      >
        <MarkdownDoc content={handoffContent ?? "No formula content available yet."} />
      </DocumentModal>

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
