/**
 * FormulaVersionsPanel — the Manufacturer tab's version timeline.
 *
 * Replaces the wide "Formula Brief Versions" table that used to live inside
 * ManufacturerFeedback.tsx with a flat card-row timeline sized for the
 * Manufacturer tab's 2-column layout. Reuses the EXACT same queries/
 * mutations ManufacturerFeedback.tsx already used (formula_brief_versions +
 * the formula_briefs pipeline drafts, the same setActive/delete write
 * paths) — no new write paths are introduced here, per the "don't invent
 * promotion logic" constraint. ManufacturerFeedback.tsx itself is
 * unchanged and still owns the full submit-feedback workflow at its other
 * call site (the orphaned ManufacturerFeedbackPage.tsx).
 *
 * Newest first, active version pinned to the top.
 */
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { FileText, Star, Eye, Clock, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DocumentModal } from "@/components/ui/document-modal";
import { MarkdownDoc } from "@/lib/markdownDoc";
import { cn } from "@/lib/utils";
import { extractFormulaVariantsFromText, countFormulaVariants, type RawFormulaVariants } from "@/lib/canonicalFormula";
import { TriFormulaView, type PerFormulaSignoff } from "@/components/dashboard/FormulaBriefTab";

interface FormulaVersionsPanelProps {
  categoryId: string;
  keyword: string;
}

interface VersionRow {
  id: string;
  version_number: number;
  formula_brief_content: string;
  change_summary: string | null;
  is_active: boolean;
  created_at: string;
}

interface PipelineBrief {
  id: string;
  label: string;
  emoji: string;
  subtitle: string;
  content: string;
  created_at: string | null;
  // 2026-09-03 follow-up (tri-formula in Manufacturer tab): structured
  // Proven/Edge/Recommended split, read straight off `ingredients.
  // formula_variants` (P9) when this pipeline brief IS the tri-formula
  // "## FINAL FORMULA BRIEF" document (compliance/qa-final). Absent on any
  // brief generated before 2026-09-03 — `rows` below falls back to a
  // text-based extraction so older/manual snapshots still badge correctly
  // if they happen to contain the same subsection headings.
  variants?: RawFormulaVariants | null;
  signoff?: PerFormulaSignoff | null;
  comparativeVerdict?: string | null;
}

/** change_summary is sometimes AI-generated text that self-wraps in
 * markdown bold — this is a plain one-line clamp (no markdown renderer),
 * so strip the literal marks instead of rendering them. */
function stripMarkdown(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/\*\*/g, "").replace(/[_`#]/g, "").trim();
}

function getPromotedPipelineId(changeSummary: string | null | undefined): string | null {
  if (!changeSummary) return null;
  const taggedMatch = changeSummary.match(/\[pipeline:([^\]]+)\]/i);
  if (taggedMatch?.[1]) return taggedMatch[1].trim().toLowerCase();
  const normalized = changeSummary.toLowerCase();
  if (!normalized.includes("set as active from")) return null;
  if (normalized.includes("grok") || normalized.includes("formula a")) return "grok";
  if (normalized.includes("sonnet") || normalized.includes("claude") || normalized.includes("formula b")) return "claude";
  if (normalized.includes("qa approved final") || normalized.includes("qa final")) return "qa-final";
  if (normalized.includes("ai generated brief") || normalized.includes("legacy")) return "legacy";
  if (normalized.includes("compliance")) return "compliance";
  return null;
}

interface DisplayRow {
  key: string;
  title: string;
  isActive: boolean;
  changeSummary: string;
  createdAt: string | null;
  content: string;
  onSetActive: () => void;
  onDelete: (() => void) | null;
  isPending: boolean;
  // 2026-09-03 follow-up: tri-formula split for this row's document —
  // structured `variants` when the pipeline brief carried
  // `ingredients.formula_variants` directly, else a text-extraction fallback
  // run against `content` itself (covers `formula_brief_versions` snapshots,
  // which only ever store the raw markdown string). Either way, "a brief
  // version is one document containing all three" stays true — this never
  // splits a version into separate rows, it only detects when THIS row's
  // document happens to contain all three and lets the viewer render tabs.
  variants: RawFormulaVariants | null;
  signoff?: PerFormulaSignoff | null;
  comparativeVerdict?: string | null;
}

export function FormulaVersionsPanel({ categoryId, keyword }: FormulaVersionsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [viewingId, setViewingId] = useState<string | null>(null);

  const { data: allVersions = [] } = useQuery({
    queryKey: ["formula_brief_versions", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formula_brief_versions")
        .select("*")
        .eq("category_id", categoryId)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data as VersionRow[];
    },
    enabled: !!categoryId,
  });

  const { data: pipelineBriefs } = useQuery({
    queryKey: ["pipeline_formula_briefs", categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formula_briefs")
        .select("ingredients, created_at")
        .eq("category_id", categoryId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const ing = data.ingredients as any;
      const briefs: PipelineBrief[] = [];
      if (ing?.ai_generated_brief_grok) {
        briefs.push({ id: "grok", label: "Working draft (Opus 5)", emoji: "🤖", subtitle: "Deep scientific reasoning", content: ing.ai_generated_brief_grok, created_at: data.created_at });
      }
      if (ing?.ai_generated_brief_claude) {
        briefs.push({ id: "claude", label: "Working draft (Sonnet 5)", emoji: "🧠", subtitle: "1M context synthesis", content: ing.ai_generated_brief_claude, created_at: data.created_at });
      } else if (ing?.ai_generated_brief) {
        briefs.push({ id: "legacy", label: "AI Generated Brief", emoji: "🧠", subtitle: "Initial AI brief", content: ing.ai_generated_brief, created_at: data.created_at });
      }
      // 2026-09-03 follow-up: tri-formula fields — structured on
      // `ingredients.formula_variants` whenever this brief's Final Formula
      // Brief is the Proven/Edge/Recommended Blend document (P9). Null on
      // any brief generated before that shipped.
      const variantsRaw = ing?.formula_variants as { proven?: string | null; edge?: string | null; recommended?: string | null } | null | undefined;
      const variants: RawFormulaVariants | null = variantsRaw && (variantsRaw.proven || variantsRaw.edge || variantsRaw.recommended)
        ? { proven: variantsRaw.proven || null, edge: variantsRaw.edge || null, recommended: variantsRaw.recommended || null }
        : null;
      const signoff = (ing?.final_signoff?.per_formula as PerFormulaSignoff | undefined) || null;
      const comparativeVerdict = (ing?.comparative_verdict as string | undefined) || null;
      const complianceContent = ing?.final_formula_brief || ing?.adjusted_formula;
      if (complianceContent) {
        briefs.push({ id: "compliance", label: "Compliance", emoji: "⚖️", subtitle: "Initial formula brief from market analysis pipeline", content: complianceContent, created_at: data.created_at, variants, signoff, comparativeVerdict });
      }
      if (ing?.final_formula_brief) {
        const verdictText = (ing?.qa_verdict?.verdict || "Reviewed").replace(/\*\*/g, "");
        briefs.push({ id: "qa-final", label: "QA Approved Final", emoji: "✅", subtitle: `${verdictText} · Score: ${ing?.qa_verdict?.score || "—"}/10`, content: ing.final_formula_brief, created_at: data.created_at, variants, signoff, comparativeVerdict });
      }
      return briefs.length > 0 ? briefs : null;
    },
    enabled: !!categoryId,
  });

  const setActiveMutation = useMutation({
    mutationFn: async (payload: { versionId?: string; pipelineBrief?: { id: string; label: string; content: string } }) => {
      const { error: deactivateError } = await supabase
        .from("formula_brief_versions")
        .update({ is_active: false })
        .eq("category_id", categoryId);
      if (deactivateError) throw deactivateError;

      if (payload.versionId) {
        const { error } = await supabase
          .from("formula_brief_versions")
          .update({ is_active: true })
          .eq("id", payload.versionId);
        if (error) throw error;
        return;
      }

      if (payload.pipelineBrief) {
        const pipelineTag = `pipeline:${payload.pipelineBrief.id}`;
        const { data: existing } = await supabase
          .from("formula_brief_versions")
          .select("id")
          .eq("category_id", categoryId)
          .like("change_summary", `%${pipelineTag}%`)
          .limit(1)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("formula_brief_versions")
            .update({ is_active: true })
            .eq("id", existing.id);
          if (error) throw error;
          return;
        }

        const { data: contentMatch } = await supabase
          .from("formula_brief_versions")
          .select("id")
          .eq("category_id", categoryId)
          .eq("formula_brief_content", payload.pipelineBrief.content)
          .limit(1)
          .maybeSingle();

        if (contentMatch) {
          const { error } = await supabase
            .from("formula_brief_versions")
            .update({ is_active: true })
            .eq("id", contentMatch.id);
          if (error) throw error;
          return;
        }

        const maxVersion = allVersions.length > 0 ? Math.max(...allVersions.map((v) => v.version_number)) : 0;
        const { error } = await supabase
          .from("formula_brief_versions")
          .insert({
            category_id: categoryId,
            formula_brief_content: payload.pipelineBrief.content,
            version_number: maxVersion + 1,
            is_active: true,
            change_summary: `[${pipelineTag}] Set as active from: ${payload.pipelineBrief.label}`,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formula_brief_versions"] });
      queryClient.invalidateQueries({ queryKey: ["formulaBrief"] });
      toast({ title: "Active version updated", description: "All analyses will now use this version." });
    },
    onError: () => {
      toast({ title: "Failed to update", description: "Could not set active version.", variant: "destructive" });
    },
  });

  const deleteVersionMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const { error } = await supabase.from("formula_brief_versions").delete().eq("id", versionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["formula_brief_versions"] });
      queryClient.invalidateQueries({ queryKey: ["formula_brief_active_version"] });
      queryClient.invalidateQueries({ queryKey: ["formulaBrief"] });
      toast({ title: "Version deleted", description: "The formula version has been removed." });
    },
    onError: () => {
      toast({ title: "Failed to delete", description: "Could not delete version.", variant: "destructive" });
    },
  });

  const promotedPipelineVersions = useMemo(() => {
    const latestByPipeline = new Map<string, VersionRow>();
    allVersions.forEach((version) => {
      const pipelineId = getPromotedPipelineId(version.change_summary);
      if (!pipelineId) return;
      const existing = latestByPipeline.get(pipelineId);
      if (!existing || version.is_active || version.version_number > existing.version_number) {
        latestByPipeline.set(pipelineId, version);
      }
    });
    return latestByPipeline;
  }, [allVersions]);

  const visibleVersions = useMemo(
    () => allVersions.filter((v) => !getPromotedPipelineId(v.change_summary)),
    [allVersions]
  );

  const visiblePipelineBriefs = useMemo(
    () => (pipelineBriefs ?? []).map((brief) => ({
      ...brief,
      is_active: promotedPipelineVersions.get(brief.id)?.is_active ?? false,
    })),
    [pipelineBriefs, promotedPipelineVersions]
  );

  const rows: DisplayRow[] = useMemo(() => {
    const versionRows: DisplayRow[] = visibleVersions.map((v) => ({
      key: v.id,
      title: `v${v.version_number}`,
      isActive: v.is_active,
      changeSummary: stripMarkdown(v.change_summary?.replace("[USER OVERRIDE] ", "")) || "Initial formula brief",
      createdAt: v.created_at,
      content: v.formula_brief_content,
      onSetActive: () => setActiveMutation.mutate({ versionId: v.id }),
      onDelete: v.is_active ? null : () => {
        if (window.confirm(`Delete v${v.version_number}? This cannot be undone.`)) {
          deleteVersionMutation.mutate(v.id);
        }
      },
      isPending: false,
      // No structured `formula_variants` column on `formula_brief_versions`
      // rows (they only ever store the plain markdown snapshot) — text
      // extraction is the only way to detect a tri-formula document here.
      variants: extractFormulaVariantsFromText(v.formula_brief_content),
    }));

    const pipelineRows: DisplayRow[] = visiblePipelineBriefs.map((pb) => ({
      key: pb.id,
      title: `${pb.emoji} ${pb.label}`,
      isActive: pb.is_active,
      changeSummary: pb.subtitle,
      createdAt: pb.created_at,
      content: pb.content,
      onSetActive: () => setActiveMutation.mutate({ pipelineBrief: { id: pb.id, label: pb.label, content: pb.content } }),
      onDelete: null,
      isPending: false,
      variants: pb.variants ?? extractFormulaVariantsFromText(pb.content),
      signoff: pb.signoff,
      comparativeVerdict: pb.comparativeVerdict,
    }));

    return [...versionRows, ...pipelineRows].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [visibleVersions, visiblePipelineBriefs, setActiveMutation, deleteVersionMutation]);

  const viewingRow = rows.find((r) => r.key === viewingId) ?? null;

  return (
    <div className="rounded-[var(--radius)] border border-border bg-card shadow-sm overflow-hidden flex flex-col">
      <div className="shrink-0 px-5 py-3.5 bg-muted/40 border-b border-border flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileText className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Formula Versions</p>
          <p className="text-xs text-muted-foreground">
            {rows.length} version{rows.length !== 1 ? "s" : ""} · Active version is used for all analyses
          </p>
        </div>
      </div>

      <div className="overflow-y-auto max-h-[65vh] divide-y divide-border/60">
        {rows.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground px-4">
            No formula versions yet.
          </div>
        )}
        {rows.map((row) => (
          <div
            key={row.key}
            className={cn("px-4 py-3 flex items-center gap-3", row.isActive && "bg-primary/5")}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-foreground tabular-nums">{row.title}</span>
                {row.isActive && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-chart-4/30 text-chart-4 bg-chart-4/10">
                    Active
                  </span>
                )}
                {countFormulaVariants(row.variants) >= 2 && (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-primary/30 text-primary bg-primary/10"
                    title="This document contains Proven, Edge, and Recommended Blend formulas"
                  >
                    {countFormulaVariants(row.variants)} formulas
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{row.changeSummary}</p>
              {row.createdAt && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
                  <Clock className="w-2.5 h-2.5" />
                  {format(new Date(row.createdAt), "MMM d, yyyy · h:mm a")}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant={row.isActive ? "default" : "outline"}
                className={cn("h-7 w-7 p-0", !row.isActive && "border-primary/30 text-primary hover:bg-primary/10")}
                disabled={row.isActive || setActiveMutation.isPending}
                title={row.isActive ? "Active" : "Set active"}
                onClick={row.onSetActive}
              >
                <Star className={cn("w-3.5 h-3.5", row.isActive && "fill-current")} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                title="View"
                onClick={() => setViewingId(row.key)}
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>
              {row.onDelete && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  disabled={deleteVersionMutation.isPending}
                  title="Delete"
                  onClick={row.onDelete}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <DocumentModal
        open={viewingId !== null}
        onOpenChange={(open) => !open && setViewingId(null)}
        title={viewingRow ? viewingRow.title : "Formula Brief"}
        subtitle={keyword}
      >
        {viewingRow && countFormulaVariants(viewingRow.variants) >= 2 ? (
          <TriFormulaView
            variants={viewingRow.variants!}
            signoff={viewingRow.signoff}
            comparativeVerdict={viewingRow.comparativeVerdict}
          />
        ) : (
          <MarkdownDoc content={viewingRow?.content ?? "No content available"} />
        )}
      </DocumentModal>
    </div>
  );
}

export default FormulaVersionsPanel;
