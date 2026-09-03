import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { FormulaPDF } from "@/components/FormulaPDF";
import { FormulaViewer } from "@/components/FormulaViewer";
import { ActivityTimeline, type TimelineComment, type TimelineVersion } from "@/components/ActivityTimeline";
import { Paperclip, X, FileText, Image } from "lucide-react";
import { displayFormulaLabel } from "@/lib/formulaLabels";
import { extractFormulaVariantsFromText, countFormulaVariants, buildAllThreeFormulasMarkdown, type RawFormulaVariants } from "@/lib/canonicalFormula";
import { TriFormulaView, type PerFormulaSignoff } from "@/components/dashboard/FormulaBriefTab";
import { generateManufacturerPDF } from "@/lib/manufacturerPDF";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MfrSession {
  id: string;
  token: string;
  manufacturer_name: string;
  expires_at: string | null;
}

interface Category {
  id: string;
  name: string;
  total_products: number;
}

interface MfrComment {
  id: string;
  session_token: string;
  category_id: string;
  version_label: string;
  author_name: string;
  comment: string;
  created_at: string;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type VerdictKey = "APPROVED" | "ADJUSTMENTS" | "NON-COMPLIANT" | "COMPLIANT" | "UNKNOWN";

function verdictBadge(verdict: string | null) {
  if (!verdict)
    return <Badge className="text-xs bg-muted text-muted-foreground border-border">No QA</Badge>;
  const upper = verdict.toUpperCase();
  if (upper.includes("APPROVED") && !upper.includes("ADJUST"))
    return <Badge className="text-xs bg-chart-4/10 text-chart-4 border-chart-4/20">APPROVED</Badge>;
  if (upper.includes("ADJUST"))
    return (
      <Badge className="text-xs bg-amber-50 text-amber-700 border-amber-200">
        APPROVED WITH ADJUSTMENTS
      </Badge>
    );
  if (upper.includes("NON") || upper.includes("FAIL"))
    return <Badge className="text-xs bg-destructive/10 text-destructive border-destructive/20">NON-COMPLIANT</Badge>;
  if (upper.includes("COMPLIANT"))
    return <Badge className="text-xs bg-chart-4/10 text-chart-4 border-chart-4/20">COMPLIANT</Badge>;
  return <Badge className="text-xs bg-muted text-muted-foreground border-border">{verdict}</Badge>;
}

function getPromotedPipelineId(changeSummary: string | null | undefined): string | null {
  if (!changeSummary) return null;

  const taggedMatch = changeSummary.match(/\[pipeline:([^\]]+)\]/i);
  if (taggedMatch?.[1]) {
    return taggedMatch[1].trim().toLowerCase();
  }

  const normalized = changeSummary.toLowerCase();
  if (!normalized.includes("set as active from")) return null;

  if (normalized.includes("grok") || normalized.includes("formula a")) return "grok";
  if (normalized.includes("sonnet") || normalized.includes("claude") || normalized.includes("formula b")) return "claude";
  if (normalized.includes("qa approved final") || normalized.includes("qa final")) return "qa-final";
  if (normalized.includes("ai generated brief") || normalized.includes("legacy")) return "legacy";
  if (normalized.includes("compliance")) return "compliance";

  return null;
}

// ─── Access Denied Screen ────────────────────────────────────────────────────

function AccessDenied() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">Access Denied</h1>
        <p className="text-muted-foreground text-sm">
          This link is invalid or has expired. Please contact the team for a new link.
        </p>
      </div>
    </div>
  );
}

// ─── Loading Screen ──────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex items-center gap-3 text-muted-foreground">
        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <span className="text-sm">Loading portal…</span>
      </div>
    </div>
  );
}

// ─── Main Portal ─────────────────────────────────────────────────────────────

export default function ManufacturerPortal() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<MfrSession | null>(null);
  const [denied, setDenied] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Unified version model (same as internal portal)
  interface UnifiedVersion {
    id: string;
    label: string;
    created_at: string;
    formula_text: string;
    change_summary: string | null;
    comment_labels?: string[];
    qa_verdict: string | null;
    qa_score: string | null;
    fda_score: string | null;
    fda_status: string | null;
    // 2026-09-03 follow-up (tri-formula on the public manufacturer portal):
    // structured when available (compliance/qa-final pipeline entries carry
    // `ingredients.formula_variants`), else a text-extraction fallback run
    // against `formula_text` itself (covers `formula_brief_versions`
    // snapshots).
    variants?: RawFormulaVariants | null;
    signoff?: PerFormulaSignoff | null;
    comparativeVerdict?: string | null;
  }

  const [versions, setVersions] = useState<UnifiedVersion[]>([]);
  const [brifsLoading, setBriefsLoading] = useState(false);
  const [publishedLabel, setPublishedLabel] = useState<string | null | undefined>(undefined);
  const [publishedVersion, setPublishedVersion] = useState<UnifiedVersion | null>(null);

  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);

  const [comments, setComments] = useState<MfrComment[]>([]);
  const [activeCommentVersion, setActiveCommentVersion] = useState<string | null>(null);

  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [allCatComments, setAllCatComments] = useState<MfrComment[]>([]);

  // ── Validate token ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setDenied(true);
      setLoading(false);
      return;
    }
    (async () => {
      // maybeSingle(): an invalid/typo'd/expired link is a normal,
      // expected outcome here — single() 406'd on every bad-token load
      // instead of just resolving to "no session found" (already handled
      // below via the `!data` branch).
      const { data } = await (supabase.from as any)("manufacturer_sessions")
        .select("id,token,manufacturer_name,expires_at")
        .eq("token", token)
        .maybeSingle();

      if (!data) {
        setDenied(true);
        setLoading(false);
        return;
      }
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setDenied(true);
        setLoading(false);
        return;
      }
      setSession(data as MfrSession);
      setLoading(false);
    })();
  }, [token]);

  // ── Load categories (only those with a shared version) ────────────────────
  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data: pubRows } = await supabase
        .from("manufacturer_published_versions")
        .select("category_id");

      const ids = (pubRows ?? []).map((r: any) => r.category_id);
      if (ids.length === 0) return;

      const { data } = await supabase
        .from("categories")
        .select("id,name,total_products,updated_at")
        .in("id", ids)
        .order("updated_at", { ascending: false });

      if (data && data.length > 0) {
        setCategories(data as Category[]);
        setSelectedCategoryId(data[0].id);
      }
    })();
  }, [session]);

  // ── Build unified versions (same logic as internal portal) ────────────────
  useEffect(() => {
    if (!selectedCategoryId) return;
    setBriefsLoading(true);
    setExpandedVersionId(null);
    setActiveCommentVersion(null);
    setComments([]);
    setPublishedLabel(undefined);
    setPublishedVersion(null);

    (async () => {
      const [{ data: liveVersions }, { data: briefData }, { data: pubData }, { data: allComments }] = await Promise.all([
        supabase
          .from("formula_brief_versions")
          .select("*")
          .eq("category_id", selectedCategoryId)
          .order("version_number", { ascending: true }),
        supabase
          .from("formula_briefs")
          .select("id, created_at, ingredients")
          .eq("category_id", selectedCategoryId)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("manufacturer_published_versions")
          .select("version_label")
          .eq("category_id", selectedCategoryId)
          .maybeSingle(),
        (supabase.from as any)("manufacturer_comments")
          .select("*")
          .eq("category_id", selectedCategoryId)
          .order("created_at", { ascending: false }),
      ]);
      setAllCatComments((allComments ?? []) as MfrComment[]);

      const liveVersionRows = (liveVersions ?? []) as any[];
      const all: UnifiedVersion[] = [];
      const promotedPipelineVersions = new Map<string, any>();

      for (const version of liveVersionRows) {
        const pipelineId = getPromotedPipelineId(version.change_summary);
        if (!pipelineId) continue;

        const existing = promotedPipelineVersions.get(pipelineId);
        if (!existing || version.is_active || version.version_number > existing.version_number) {
          promotedPipelineVersions.set(pipelineId, version);
        }
      }

      // Living versions from formula_brief_versions
      for (const v of liveVersionRows) {
        if (getPromotedPipelineId(v.change_summary)) continue;

        all.push({
          id: v.id,
          label: `v${v.version_number}`,
          created_at: v.created_at,
          formula_text: v.formula_brief_content ?? "",
          change_summary: v.change_summary,
          comment_labels: [`v${v.version_number}`],
          qa_verdict: null, qa_score: null, fda_score: null, fda_status: null,
          variants: extractFormulaVariantsFromText(v.formula_brief_content ?? ""),
        });
      }

      // Pipeline versions from formula_briefs.ingredients
      if (briefData) {
        const ing = briefData.ingredients as any;
        const variantsRaw = ing?.formula_variants as { proven?: string | null; edge?: string | null; recommended?: string | null } | null | undefined;
        const variants: RawFormulaVariants | null = variantsRaw && (variantsRaw.proven || variantsRaw.edge || variantsRaw.recommended)
          ? { proven: variantsRaw.proven || null, edge: variantsRaw.edge || null, recommended: variantsRaw.recommended || null }
          : null;
        const signoff = (ing?.final_signoff?.per_formula as PerFormulaSignoff | undefined) || null;
        const comparativeVerdict = (ing?.comparative_verdict as string | undefined) || null;
        const qaReport = (ing?.qa_report as string) ?? "";
        const qaVerdictM = qaReport.match(/\*\*Overall:\*\*\s*(.+)/)
          || qaReport.match(/Overall:\s*(APPROVED[^.\n]*|NEEDS MAJOR REVISION[^.\n]*)/i)
          || qaReport.match(/(APPROVED WITH ADJUSTMENTS|APPROVED|NEEDS MAJOR REVISION)/i);
        const qaVerdict = qaVerdictM?.[1]?.trim() ?? null;
        const qaScoreM = qaReport.match(/\*\*QA Score:\*\*\s*([\d.]+)/) || qaReport.match(/QA Score:\s*([\d.]+)/);
        const qaScore = qaScoreM?.[1] ?? null;
        const fda = (ing?.fda_compliance as any) ?? {};
        const fdaScore = fda.compliance_score != null ? String(fda.compliance_score) : null;
        const fdaStatus = (fda.compliance_status as string) ?? null;

        if (ing?.ai_generated_brief_grok) {
          const promotedVersion = promotedPipelineVersions.get("grok");
          all.push({ id: "grok", label: "Formula A — Grok", created_at: briefData.created_at ?? "", formula_text: ing.ai_generated_brief_grok, change_summary: "Deep scientific reasoning", comment_labels: promotedVersion ? ["Formula A — Grok", `v${promotedVersion.version_number}`] : ["Formula A — Grok"], qa_verdict: qaVerdict, qa_score: qaScore, fda_score: fdaScore, fda_status: fdaStatus });
        }
        if (ing?.ai_generated_brief_claude) {
          const promotedVersion = promotedPipelineVersions.get("claude");
          all.push({ id: "claude", label: "Formula B — Sonnet", created_at: briefData.created_at ?? "", formula_text: ing.ai_generated_brief_claude, change_summary: "1M context synthesis", comment_labels: promotedVersion ? ["Formula B — Sonnet", `v${promotedVersion.version_number}`] : ["Formula B — Sonnet"], qa_verdict: qaVerdict, qa_score: qaScore, fda_score: fdaScore, fda_status: fdaStatus });
        } else if (ing?.ai_generated_brief) {
          const promotedVersion = promotedPipelineVersions.get("legacy");
          all.push({ id: "legacy", label: "AI Generated Brief", created_at: briefData.created_at ?? "", formula_text: ing.ai_generated_brief, change_summary: "Initial AI brief", comment_labels: promotedVersion ? ["AI Generated Brief", `v${promotedVersion.version_number}`] : ["AI Generated Brief"], qa_verdict: qaVerdict, qa_score: qaScore, fda_score: fdaScore, fda_status: fdaStatus });
        }
        const complianceContent = ing?.final_formula_brief || ing?.adjusted_formula;
        if (complianceContent) {
          const promotedVersion = promotedPipelineVersions.get("compliance");
          all.push({ id: "compliance", label: "⚖️ Compliance", created_at: briefData.created_at ?? "", formula_text: complianceContent, change_summary: "Initial formula brief from market analysis pipeline", comment_labels: promotedVersion ? ["⚖️ Compliance", `v${promotedVersion.version_number}`] : ["⚖️ Compliance"], qa_verdict: qaVerdict, qa_score: qaScore, fda_score: fdaScore, fda_status: fdaStatus, variants, signoff, comparativeVerdict });
        }
        if (ing?.final_formula_brief) {
          const promotedVersion = promotedPipelineVersions.get("qa-final");
          all.push({ id: "qa-final", label: "✅ QA Approved Final", created_at: briefData.created_at ?? "", formula_text: ing.final_formula_brief, change_summary: `${ing?.qa_verdict?.verdict || "Reviewed"} · Score: ${ing?.qa_verdict?.score || "—"}/10`, comment_labels: promotedVersion ? ["✅ QA Approved Final", `v${promotedVersion.version_number}`] : ["✅ QA Approved Final"], qa_verdict: qaVerdict, qa_score: qaScore, fda_score: fdaScore, fda_status: fdaStatus, variants, signoff, comparativeVerdict });
        }
      }

      setVersions(all);
      const rawPublishedLabel = pubData?.version_label ?? null;
      const found = rawPublishedLabel
        ? all.find(v => v.comment_labels?.includes(rawPublishedLabel) || v.label === rawPublishedLabel) ?? null
        : null;
      setPublishedLabel(found?.label ?? rawPublishedLabel);
      setPublishedVersion(found);
      if (found) {
        setActiveCommentVersion(found.label);
        loadComments(selectedCategoryId, found.comment_labels ?? [found.label]);
      }
      setBriefsLoading(false);
    })();
  }, [selectedCategoryId]);

  // ── Load comments ──────────────────────────────────────────────────────────
  const loadComments = useCallback(
    async (categoryId: string, versionLabels: string[]) => {
      const { data } = await (supabase.from as any)("manufacturer_comments")
        .select("*")
        .eq("category_id", categoryId)
        .in("version_label", versionLabels)
        .order("created_at", { ascending: true });
      setComments((data ?? []) as MfrComment[]);
    },
    []
  );

  // Polling every 10 seconds
  useEffect(() => {
    if (!selectedCategoryId || !activeCommentVersion) return;
    const activeVersion = versions.find((version) => version.label === activeCommentVersion);
    if (!activeVersion) return;
    const id = setInterval(() => {
      loadComments(selectedCategoryId, activeVersion.comment_labels ?? [activeCommentVersion]);
    }, 10000);
    return () => clearInterval(id);
  }, [selectedCategoryId, activeCommentVersion, loadComments, versions]);

  // ── Submit comment ─────────────────────────────────────────────────────────
  async function handleSubmitComment() {
    if (!commentText.trim() && !attachmentFile) return;
    if (!session || !selectedCategoryId || !activeCommentVersion) return;
    setSubmitting(true);
    setSubmitError(null);

    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;
    let attachmentType: string | null = null;

    if (attachmentFile) {
      const safeName = attachmentFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const safeVersion = activeCommentVersion.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${selectedCategoryId}/${safeVersion}/${Date.now()}-${safeName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("manufacturer-uploads")
        .upload(path, attachmentFile, { upsert: false });
      if (uploadError) {
        setSubmitError(`Upload failed: ${uploadError.message}`);
        setSubmitting(false);
        return;
      }
      const { data: { publicUrl } } = supabase.storage
        .from("manufacturer-uploads")
        .getPublicUrl(uploadData.path);
      attachmentUrl = publicUrl;
      attachmentName = attachmentFile.name;
      attachmentType = attachmentFile.type || "application/octet-stream";
    }

    const { error } = await (supabase.from as any)("manufacturer_comments").insert({
      session_token: session.token,
      category_id: selectedCategoryId,
      version_label: activeCommentVersion,
      author_name: session.manufacturer_name,
      comment: commentText.trim(),
      attachment_url: attachmentUrl,
      attachment_name: attachmentName,
      attachment_type: attachmentType,
    });
    if (error) {
      setSubmitError("Failed to send. Please try again.");
    } else {
      setCommentText("");
      setAttachmentFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      const activeVersion = versions.find((version) => version.label === activeCommentVersion);
      await loadComments(selectedCategoryId, activeVersion?.comment_labels ?? [activeCommentVersion]);
      // Refresh history feed
      const { data: refreshed } = await (supabase.from as any)("manufacturer_comments")
        .select("*").eq("category_id", selectedCategoryId).order("created_at", { ascending: false });
      setAllCatComments((refreshed ?? []) as MfrComment[]);
    }
    setSubmitting(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <LoadingScreen />;
  if (denied) return <AccessDenied />;

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  return (
    <div className="min-h-screen bg-background flex flex-col" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Top bar */}
      <header className="h-12 border-b border-border flex items-center px-5 gap-4 shrink-0 bg-background z-10">
        <span className="font-semibold text-foreground text-sm tracking-tight">DOVIVE</span>
        <span className="text-muted-foreground/40 text-sm">|</span>
        <span className="text-muted-foreground text-sm">Manufacturer Portal</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
            {getInitials(session?.manufacturer_name ?? "M")}
          </div>
          <span className="text-sm text-foreground/90">{session?.manufacturer_name}</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 border-r border-border bg-muted/40 shrink-0 flex flex-col">
          <div className="px-4 pt-5 pb-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">
              Projects
            </p>
          </div>
          <ScrollArea className="flex-1 px-2">
            <div className="space-y-0.5 pb-4">
              {categories.map((cat) => {
                const active = cat.id === selectedCategoryId;
                return (
                  <Button
                    key={cat.id}
                    variant="ghost"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={[
                      "w-full justify-start text-left px-3 py-2 h-auto rounded-md text-sm font-normal transition-colors",
                      active
                        ? "bg-primary/10 text-primary font-medium hover:bg-primary/10"
                        : "text-muted-foreground hover:bg-muted",
                    ].join(" ")}
                  >
                    <span className="mr-1.5 text-xs">{active ? "●" : "○"}</span>
                    {cat.name.length > 22 ? cat.name.slice(0, 22) + "…" : cat.name}
                  </Button>
                );
              })}
            </div>
          </ScrollArea>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {!selectedCategory ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Select a project from the sidebar.
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
              {/* Category header */}
              <div>
                <h1 className="text-2xl font-semibold text-foreground">{selectedCategory.name}</h1>
                <p className="text-sm text-muted-foreground mt-1">{selectedCategory.total_products} products analyzed</p>
              </div>

              {/* Formula versions */}
              <section>
                <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">
                  Formula Versions
                </h2>

                {brifsLoading || publishedLabel === undefined ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
                    ))}
                  </div>
                ) : publishedLabel === null ? (
                  <Panel className="border border-border">
                    <CardContent className="py-8 text-center text-muted-foreground text-sm">
                      No formula version has been shared yet. Check back soon.
                    </CardContent>
                  </Panel>
                ) : !publishedVersion ? (
                  <Panel className="border border-border">
                    <CardContent className="py-8 text-center text-muted-foreground text-sm">
                      Loading shared formula…
                    </CardContent>
                  </Panel>
                ) : (() => {
                  const v = publishedVersion;
                  const isExpanded = expandedVersionId === v.id;
                  const isCommentActive = activeCommentVersion === v.label;
                  return (
                    <div className="space-y-3">
                      <Panel
                        className={[
                          "border transition-shadow",
                          isCommentActive ? "border-primary/30 shadow-sm" : "border-border",
                        ].join(" ")}
                      >
                        <CardHeader className="pb-2 pt-4 px-5">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-semibold text-foreground text-sm">{displayFormulaLabel(v.label)}</span>
                            <span className="text-xs text-muted-foreground">{formatDate(v.created_at)}</span>
                            {verdictBadge(v.qa_verdict)}
                            {countFormulaVariants(v.variants) >= 2 && (
                              <Badge className="text-xs bg-primary/10 text-primary border-primary/20">
                                {countFormulaVariants(v.variants)} formulas
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                            {v.qa_score && <span>QA Score: <strong className="text-foreground/90">{v.qa_score}/10</strong></span>}
                            {v.fda_score && <span>FDA: <strong className="text-foreground/90">{v.fda_score}/100</strong></span>}
                            {v.fda_status && <span className="text-muted-foreground">{v.fda_status}</span>}
                          </div>
                        </CardHeader>
                        <CardContent className="px-5 pb-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => setExpandedVersionId(isExpanded ? null : v.id)}
                            >
                              {isExpanded ? "Hide Formula" : "View Formula"}
                            </Button>
                            {countFormulaVariants(v.variants) >= 2 ? (
                              // Tri-formula version: mirror the Dashboard's Factory
                              // Handoff "All 3 Formulas" build (same generateManufacturerPDF
                              // composer + buildAllThreeFormulasMarkdown assembly) — cover
                              // note, each formula as its own titled section with its
                              // sign-off verdict, then the comparative verdict at the end —
                              // instead of the react-pdf single-document dump.
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7 gap-1"
                                onClick={() => generateManufacturerPDF({
                                  categoryName: selectedCategory?.name || "Formula",
                                  positioning: `All three candidate formulas (Proven / Edge / Recommended) for ${session?.manufacturer_name ?? "the manufacturer"} to quote and compare.`,
                                  finalFormulaBrief: buildAllThreeFormulasMarkdown(v.variants!, v.signoff, v.comparativeVerdict),
                                })}
                              >
                                ⬇ Download PDF (All 3)
                              </Button>
                            ) : (
                              <PDFDownloadLink
                                document={
                                  <FormulaPDF
                                    categoryName={selectedCategory?.name ?? ""}
                                    versionLabel={v.label}
                                    formulaText={v.formula_text}
                                    date={formatDate(v.created_at)}
                                    qaScore={v.qa_score}
                                    fdaScore={v.fda_score}
                                    qaVerdict={v.qa_verdict}
                                    manufacturerName={session?.manufacturer_name}
                                  />
                                }
                                fileName={`DOVIVE-${(selectedCategory?.name ?? "Formula").replace(/\s+/g, "-")}-${v.label}.pdf`}
                              >
                                {({ loading: pdfLoading }) => (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-7 gap-1"
                                    disabled={pdfLoading}
                                  >
                                    {pdfLoading ? "Preparing…" : "⬇ Download PDF"}
                                  </Button>
                                )}
                              </PDFDownloadLink>
                            )}
                            <Button
                              variant={isCommentActive ? "default" : "ghost"}
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => {
                                setActiveCommentVersion(v.label);
                                loadComments(selectedCategoryId!, v.comment_labels ?? [v.label]);
                              }}
                            >
                              Comments
                              {isCommentActive && comments.length > 0 && (
                                <span className="ml-1.5 bg-primary-foreground/20 rounded-full px-1.5 py-0 text-[10px]">
                                  {comments.length}
                                </span>
                              )}
                            </Button>
                          </div>

                          {isExpanded && (
                            <div className="mt-4 p-5 rounded-lg bg-muted/40 border border-border max-h-[600px] overflow-y-auto">
                              {countFormulaVariants(v.variants) >= 2 ? (
                                <TriFormulaView
                                  variants={v.variants!}
                                  signoff={v.signoff}
                                  comparativeVerdict={v.comparativeVerdict}
                                />
                              ) : (
                                <FormulaViewer text={v.formula_text} />
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Panel>
                    </div>
                  );
                })()}
              </section>

              {/* Comment thread */}
              {activeCommentVersion && (
                <section>
                  <Separator className="mb-6" />
                  <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-4">
                    Comments on {activeCommentVersion}
                  </h2>

                  {/* Comment list */}
                  <div className="space-y-4 mb-6">
                    {comments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No comments yet. Be the first to leave a note.</p>
                    ) : (
                      comments.map((c) => (
                        <div key={c.id} className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0 mt-0.5">
                            {getInitials(c.author_name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span className="text-sm font-medium text-foreground">{c.author_name}</span>
                              <span className="text-xs text-muted-foreground">{formatTime(c.created_at)}</span>
                            </div>
                            {c.comment && (
                              <p className="text-sm text-foreground/80 leading-relaxed">{c.comment}</p>
                            )}
                            {c.attachment_url && (
                              <div className="mt-2">
                                {c.attachment_type?.startsWith("image/") ? (
                                  <a href={c.attachment_url} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={c.attachment_url}
                                      alt={c.attachment_name ?? "attachment"}
                                      className="max-w-xs max-h-48 rounded-lg border border-border object-cover hover:opacity-90 transition-opacity"
                                    />
                                  </a>
                                ) : (
                                  <a
                                    href={c.attachment_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 text-xs text-primary hover:opacity-80 bg-primary/5 hover:bg-primary/10 border border-primary/10 rounded-lg px-3 py-2 transition-colors"
                                  >
                                    <FileText className="w-3.5 h-3.5 shrink-0" />
                                    <span className="truncate max-w-[200px]">{c.attachment_name ?? "Attachment"}</span>
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Comment input */}
                  <div className="border border-border rounded-lg overflow-hidden">
                    <Input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)}
                    />
                    <Textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Add a comment or attach a file…"
                      className="border-0 resize-none text-sm focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none min-h-[80px]"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          handleSubmitComment();
                        }
                      }}
                    />
                    {attachmentFile && (
                      <div className="px-3 py-2 bg-primary/5 border-t border-primary/10 flex items-center gap-2">
                        {attachmentFile.type.startsWith("image/") ? (
                          <Image className="w-3.5 h-3.5 text-primary shrink-0" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                        )}
                        <span className="text-xs text-primary flex-1 truncate">{attachmentFile.name}</span>
                        <span className="text-xs text-primary/60">
                          {(attachmentFile.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setAttachmentFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          className="h-5 w-5 text-primary/60 hover:text-primary"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-t border-border">
                      {submitError ? (
                        <span className="text-xs text-destructive">{submitError}</span>
                      ) : (
                        <div className="flex items-center gap-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => fileInputRef.current?.click()}
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            title="Attach a file"
                          >
                            <Paperclip className="w-4 h-4" />
                          </Button>
                          <span className="text-xs text-muted-foreground">Cmd+Enter to send</span>
                        </div>
                      )}
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={(!commentText.trim() && !attachmentFile) || submitting}
                        onClick={handleSubmitComment}
                      >
                        {submitting ? "Sending…" : "Send"}
                      </Button>
                    </div>
                  </div>
                </section>
              )}

              {/* Project History */}
              {(allCatComments.length > 0 || versions.length > 0) && (
                <section>
                  <Separator className="mb-6" />
                  <h2 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-5">
                    Project History
                  </h2>
                  <ActivityTimeline
                    comments={allCatComments as TimelineComment[]}
                    versions={versions.map((v) => ({
                      id: v.id,
                      label: displayFormulaLabel(v.label),
                      created_at: v.created_at,
                      change_summary: v.change_summary ?? undefined,
                      source: getPromotedPipelineId(v.change_summary) ? "pipeline" as const : "version" as const,
                    }))}
                    showVersionChip={true}
                  />
                </section>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
