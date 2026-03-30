import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { FormulaPDF } from "@/components/FormulaPDF";
import { FormulaViewer } from "@/components/FormulaViewer";
import {
  Link2, ChevronRight, MessageSquare, FlaskConical, LayoutDashboard, GitBranch,
  Pencil, Trash2, Check, X, Eye, EyeOff, FileText, Clock,
} from "lucide-react";
import { ActivityTimeline, type TimelineComment, type TimelineVersion } from "@/components/ActivityTimeline";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  total_products: number | null;
}

interface UnifiedVersion {
  id: string;
  label: string;
  category_id: string;
  created_at: string;
  version_number: number;
  is_active: boolean;
  formula_brief_content: string;
  change_summary: string | null;
  comment_labels?: string[];
  source: "version" | "pipeline";
  // Extra display metadata
  form_type?: string | null;
  target_price?: number | null;
  cogs_target?: number | null;
  positioning?: string | null;
  qa_verdict?: string | null;
  qa_score?: string | null;
  fda_score?: string | null;
  fda_status?: string | null;
  competitive_score?: string | null;
  // Pipeline-specific
  emoji?: string;
  subtitle?: string;
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

type TabKey = "overview" | "formula" | "comments" | "history";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function verdictColor(verdict: string): string {
  if (/APPROVED$/i.test(verdict)) return "bg-green-100 text-green-800 border-green-200";
  if (/ADJUSTMENTS/i.test(verdict)) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (/NON-COMPLIANT|REVISION|MAJOR/i.test(verdict)) return "bg-red-100 text-red-800 border-red-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function ScoreChip({ label, value, max }: { label: string; value: string | null; max: number }) {
  if (!value) return null;
  const pct = Math.min(100, (parseFloat(value) / max) * 100);
  const color = pct >= 75 ? "text-green-700" : pct >= 50 ? "text-yellow-700" : "text-red-600";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-sm font-bold ${color}`}>{value}<span className="text-[10px] text-gray-400">/{max}</span></span>
      <span className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</span>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-xs text-gray-400 w-32 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-xs text-gray-700 flex-1">{value ?? <span className="text-gray-300">—</span>}</span>
    </div>
  );
}

function SectionText({ text, fallback = "No data available." }: { text: string; fallback?: string }) {
  return <FormulaViewer text={text} fallback={fallback} />;
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ManufacturerPortalInternal() {
  const { toast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);
  const [versions, setVersions] = useState<UnifiedVersion[]>([]);
  const [activeItem, setActiveItem] = useState<UnifiedVersion | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [comments, setComments] = useState<MfrComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [authorName, setAuthorName] = useState("DOVIVE Team");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [mfrName, setMfrName] = useState("");
  const [generatingLink, setGeneratingLink] = useState(false);
  const [publishedLabel, setPublishedLabel] = useState<string | null>(null);
  const [allCatComments, setAllCatComments] = useState<MfrComment[]>([]);

  // Load categories
  useEffect(() => {
    supabase
      .from("categories")
      .select("id, name, total_products")
      .order("updated_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data?.length) {
          setCategories(data as Category[]);
          setSelectedCat(data[0] as Category);
        }
      });
  }, []);

  // Load versions — same data sources as Dashboard Manufacturer tab
  useEffect(() => {
    if (!selectedCat) return;
    setActiveItem(null);
    setActiveTab("overview");

    const versionsQ = supabase
      .from("formula_brief_versions")
      .select("*")
      .eq("category_id", selectedCat.id)
      .order("version_number", { ascending: true });

    const briefsQ = supabase
      .from("formula_briefs")
      .select("ingredients, created_at")
      .eq("category_id", selectedCat.id)
      .limit(1)
      .maybeSingle();

    const publishedQ = supabase
      .from("manufacturer_published_versions")
      .select("version_label")
      .eq("category_id", selectedCat.id)
      .maybeSingle();

    Promise.all([versionsQ, briefsQ, publishedQ]).then(([{ data: liveVersions }, { data: briefData }, { data: pubData }]) => {
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

      // Living versions from formula_brief_versions (same as Dashboard tab)
      if (liveVersionRows.length) {
        for (const v of liveVersionRows) {
          if (getPromotedPipelineId(v.change_summary)) continue;

          all.push({
            id: v.id,
            label: `v${v.version_number}`,
            category_id: v.category_id,
            created_at: v.created_at,
            version_number: v.version_number,
            is_active: v.is_active,
            formula_brief_content: v.formula_brief_content,
            change_summary: v.change_summary,
            comment_labels: [`v${v.version_number}`],
            source: "version",
          });
        }
      }

      // Pipeline briefs from formula_briefs.ingredients (same as Dashboard tab)
      if (briefData) {
        const ing = briefData.ingredients as any;
        if (ing?.ai_generated_brief_grok) {
          const promotedVersion = promotedPipelineVersions.get("grok");
          all.push({
            id: "grok",
            label: "Formula A — Grok",
            category_id: selectedCat.id,
            created_at: briefData.created_at ?? "",
            version_number: -1,
            is_active: promotedVersion?.is_active ?? false,
            formula_brief_content: ing.ai_generated_brief_grok,
            change_summary: "Deep scientific reasoning",
            comment_labels: promotedVersion ? ["Formula A — Grok", `v${promotedVersion.version_number}`] : ["Formula A — Grok"],
            source: "pipeline",
            emoji: "🤖",
            subtitle: "Deep scientific reasoning",
          });
        }
        if (ing?.ai_generated_brief_claude) {
          const promotedVersion = promotedPipelineVersions.get("claude");
          all.push({
            id: "claude",
            label: "Formula B — Sonnet",
            category_id: selectedCat.id,
            created_at: briefData.created_at ?? "",
            version_number: -1,
            is_active: promotedVersion?.is_active ?? false,
            formula_brief_content: ing.ai_generated_brief_claude,
            change_summary: "1M context synthesis",
            comment_labels: promotedVersion ? ["Formula B — Sonnet", `v${promotedVersion.version_number}`] : ["Formula B — Sonnet"],
            source: "pipeline",
            emoji: "🧠",
            subtitle: "1M context synthesis",
          });
        } else if (ing?.ai_generated_brief) {
          const promotedVersion = promotedPipelineVersions.get("legacy");
          all.push({
            id: "legacy",
            label: "AI Generated Brief",
            category_id: selectedCat.id,
            created_at: briefData.created_at ?? "",
            version_number: -1,
            is_active: promotedVersion?.is_active ?? false,
            formula_brief_content: ing.ai_generated_brief,
            change_summary: "Initial AI brief",
            comment_labels: promotedVersion ? ["AI Generated Brief", `v${promotedVersion.version_number}`] : ["AI Generated Brief"],
            source: "pipeline",
            emoji: "🧠",
            subtitle: "Initial AI brief",
          });
        }
        const complianceContent = ing?.final_formula_brief || ing?.adjusted_formula;
        if (complianceContent) {
          const promotedVersion = promotedPipelineVersions.get("compliance");
          all.push({
            id: "compliance",
            label: "⚖️ Compliance",
            category_id: selectedCat.id,
            created_at: briefData.created_at ?? "",
            version_number: -1,
            is_active: promotedVersion?.is_active ?? false,
            formula_brief_content: complianceContent,
            change_summary: "Initial formula brief from market analysis pipeline",
            comment_labels: promotedVersion ? ["⚖️ Compliance", `v${promotedVersion.version_number}`] : ["⚖️ Compliance"],
            source: "pipeline",
            emoji: "⚖️",
            subtitle: "Initial formula brief from market analysis pipeline",
          });
        }
        if (ing?.final_formula_brief) {
          const promotedVersion = promotedPipelineVersions.get("qa-final");
          all.push({
            id: "qa-final",
            label: "✅ QA Approved Final",
            category_id: selectedCat.id,
            created_at: briefData.created_at ?? "",
            version_number: -1,
            is_active: promotedVersion?.is_active ?? false,
            formula_brief_content: ing.final_formula_brief,
            change_summary: `${ing?.qa_verdict?.verdict || 'Reviewed'} · Score: ${ing?.qa_verdict?.score || '—'}/10`,
            comment_labels: promotedVersion ? ["✅ QA Approved Final", `v${promotedVersion.version_number}`] : ["✅ QA Approved Final"],
            source: "pipeline",
            emoji: "✅",
            subtitle: `${ing?.qa_verdict?.verdict || 'Reviewed'} · Score: ${ing?.qa_verdict?.score || '—'}/10`,
          });
        }
      }

      setVersions(all);
      const rawPublishedLabel = pubData?.version_label ?? null;
      const resolvedPublishedItem = rawPublishedLabel
        ? all.find((item) => item.comment_labels?.includes(rawPublishedLabel) || item.label === rawPublishedLabel) ?? null
        : null;
      setPublishedLabel(resolvedPublishedItem?.label ?? rawPublishedLabel);
      // Default to first version (or first pipeline brief)
      const firstVersion = all.find(v => v.is_active) ?? all.find(v => v.source === "version") ?? all[0];
      if (firstVersion) setActiveItem(firstVersion);
    });

    // Load all comments for this category (used in History tab)
    (supabase.from as any)("manufacturer_comments")
      .select("*")
      .eq("category_id", selectedCat.id)
      .order("created_at", { ascending: false })
      .then(({ data }: any) => setAllCatComments((data ?? []) as MfrComment[]));
  }, [selectedCat]);

  // Load comments
  const loadComments = useCallback(() => {
    if (!activeItem || !selectedCat) return;
    supabase
      .from("manufacturer_comments")
      .select("*")
      .eq("category_id", selectedCat.id)
      .in("version_label", activeItem.comment_labels ?? [activeItem.label])
      .order("created_at", { ascending: true })
      .then(({ data }) => setComments((data ?? []) as MfrComment[]));
  }, [activeItem, selectedCat]);

  useEffect(() => {
    loadComments();
    const interval = setInterval(loadComments, 10000);
    return () => clearInterval(interval);
  }, [loadComments]);

  const deleteComment = async (id: string) => {
    await supabase.from("manufacturer_comments").delete().eq("id", id);
    loadComments();
  };

  const saveEdit = async (id: string) => {
    if (!editText.trim()) return;
    await supabase.from("manufacturer_comments").update({ comment: editText.trim() }).eq("id", id);
    setEditingId(null);
    setEditText("");
    loadComments();
  };

  const submitComment = async () => {
    if (!commentText.trim() || !activeItem || !selectedCat) return;
    setSubmitting(true);
    const { error } = await (supabase.from as any)("manufacturer_comments").insert({
      session_token: "00000000-0000-0000-0000-000000000000",
      category_id: selectedCat.id,
      version_label: activeItem.label,
      author_name: authorName || "DOVIVE Team",
      comment: commentText.trim(),
    });
    if (error) {
      toast({ title: "Failed to post comment", description: error.message, variant: "destructive" });
    } else {
      setCommentText("");
      loadComments();
      // Refresh history feed
      (supabase.from as any)("manufacturer_comments")
        .select("*")
        .eq("category_id", selectedCat.id)
        .order("created_at", { ascending: false })
        .then(({ data }: any) => setAllCatComments((data ?? []) as MfrComment[]));
    }
    setSubmitting(false);
  };

  const generateLink = async () => {
    if (!mfrName.trim()) {
      toast({ title: "Enter a manufacturer name first" });
      return;
    }
    setGeneratingLink(true);
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const token = Array.from(crypto.getRandomValues(new Uint8Array(10)))
      .map((b) => chars[b % chars.length]).join("");
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("manufacturer_sessions")
      .insert({ token, manufacturer_name: mfrName.trim(), expires_at: expiresAt });
    setGeneratingLink(false);
    if (error) {
      toast({ title: "Failed to generate link", description: error.message, variant: "destructive" });
      return;
    }
    const url = `${window.location.origin}/mfr/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link copied!", description: url });
      setMfrName("");
    });
  };

  const togglePublish = async (label: string) => {
    if (!selectedCat) return;
    if (publishedLabel === label) {
      await supabase.from("manufacturer_published_versions").delete().eq("category_id", selectedCat.id);
      setPublishedLabel(null);
      toast({ title: "Version unpublished" });
    } else {
      await supabase.from("manufacturer_published_versions").upsert({
        category_id: selectedCat.id,
        version_label: label,
        updated_at: new Date().toISOString(),
      });
      setPublishedLabel(label);
      toast({ title: `${label} is now visible to the manufacturer` });
    }
  };

  // ─── Derived ────────────────────────────────────────────────────────────────

  const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "formula",  label: "Formula",  icon: FlaskConical },
    { key: "comments", label: "Comments", icon: MessageSquare },
    { key: "history",  label: "History",  icon: Clock },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-background">

      {/* ── Left Sidebar: Categories ─────────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 bg-card border-r border-border flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Projects</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="py-3 px-3 space-y-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCat(cat)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl transition-all flex items-center gap-2.5 group ${
                  selectedCat?.id === cat.id
                    ? "bg-primary/10 text-primary font-semibold shadow-sm"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
                  selectedCat?.id === cat.id ? "bg-primary" : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50"
                }`} />
                <span className="truncate text-[13px]">{cat.name}</span>
                {cat.total_products ? (
                  <span className="ml-auto text-[10px] text-muted-foreground/60 flex-shrink-0 tabular-nums">{cat.total_products}</span>
                ) : null}
              </button>
            ))}
          </div>
        </ScrollArea>

        {/* Share Portal */}
        <div className="p-4 border-t border-border space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Share Portal</p>
          <Input
            placeholder="Manufacturer name"
            value={mfrName}
            onChange={(e) => setMfrName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generateLink()}
            className="h-8 text-xs rounded-xl"
          />
          <Button
            onClick={generateLink}
            disabled={generatingLink || !mfrName.trim()}
            size="sm"
            className="w-full h-8 text-xs gap-1.5 rounded-xl"
          >
            <Link2 className="w-3.5 h-3.5" />
            {generatingLink ? "Generating…" : "Copy Link"}
          </Button>
        </div>
      </div>

      {/* ── Version List ─────────────────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 bg-card border-r border-border flex flex-col">
        <div className="px-5 py-5 border-b border-border">
          <h2 className="text-[15px] font-bold text-foreground truncate">{selectedCat?.name ?? "—"}</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {selectedCat?.total_products ?? 0} products · {versions.length} version{versions.length !== 1 ? "s" : ""}
          </p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {versions.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No formula versions yet</p>
            )}

            {versions.map((item) => {
              const isSelected = activeItem?.id === item.id;
              const isPublished = publishedLabel === item.label;

              return (
                <div
                  key={item.id}
                  onClick={() => { setActiveItem(item); setActiveTab("overview"); }}
                  className={`cursor-pointer rounded-xl p-3.5 transition-all duration-200 border ${
                    isSelected
                      ? "border-primary/30 bg-primary/5 shadow-sm"
                      : "border-transparent hover:border-border hover:bg-secondary/50"
                  } ${isPublished ? "ring-1 ring-emerald-400/40" : ""}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.source === "version" && <GitBranch className="w-3.5 h-3.5 text-primary/60 flex-shrink-0" />}
                      {item.source === "pipeline" && item.emoji && <span className="text-sm flex-shrink-0">{item.emoji}</span>}
                      <span className="text-[13px] font-bold text-foreground truncate">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {item.is_active && (
                        <span className="text-[9px] px-2 py-0.5 bg-primary/10 text-primary rounded-full font-bold uppercase tracking-wide">active</span>
                      )}
                      {isPublished && (
                        <span className="text-[9px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold uppercase tracking-wide">shared</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {item.form_type && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
                          {item.form_type}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePublish(item.label); }}
                        title={isPublished ? "Unshare from manufacturer" : "Share this version with manufacturer"}
                        className={`p-1 rounded-lg transition-colors ${isPublished ? "text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50" : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary"}`}
                      >
                        {isPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <span className="text-[10px] text-muted-foreground/60 tabular-nums">{formatDate(item.created_at)}</span>
                    </div>
                  </div>

                  {(item.positioning || (item.change_summary && !item.positioning)) && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mt-2">
                      {item.positioning || item.change_summary}
                    </p>
                  )}

                  {item.qa_verdict && (
                    <div className="mt-2">
                      <Badge className={`text-[10px] px-2 py-0.5 border ${verdictColor(item.qa_verdict)}`}>
                        {item.qa_verdict.length > 30 ? item.qa_verdict.slice(0, 30) + "…" : item.qa_verdict}
                      </Badge>
                    </div>
                  )}

                  {(item.qa_score || item.fda_score || item.competitive_score) && (
                    <div className="flex gap-4 mt-2 pt-2 border-t border-border/50">
                      <ScoreChip label="QA" value={item.qa_score ?? null} max={10} />
                      <ScoreChip label="FDA" value={item.fda_score ?? null} max={100} />
                      <ScoreChip label="Comp" value={item.competitive_score ?? null} max={10} />
                    </div>
                  )}

                  {item.target_price != null && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Target <span className="font-semibold text-foreground">${item.target_price}</span>
                      {item.cogs_target != null ? ` · COGS $${item.cogs_target}` : ""}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* ── Detail Panel ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-card">
        {!activeItem ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <FlaskConical className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm">Select a formula version to view details</p>
          </div>
        ) : (
          <>
            {/* Header bar */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  {activeItem.source === "pipeline" && activeItem.emoji
                    ? <span className="text-base">{activeItem.emoji}</span>
                    : <FlaskConical className="w-4.5 h-4.5 text-primary" />
                  }
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-foreground truncate">{activeItem.label}</h3>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {activeItem.source === "pipeline" ? "Pipeline Source" : `Version ${activeItem.version_number}`}
                    {activeItem.change_summary ? ` — ${activeItem.change_summary}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {activeItem.is_active && (
                  <span className="text-[10px] px-2.5 py-1 bg-primary/10 text-primary rounded-full font-bold uppercase tracking-wide">
                    Active
                  </span>
                )}
                {publishedLabel === activeItem.label && (
                  <span className="text-[10px] px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full font-bold flex items-center gap-1">
                    <Eye className="w-3 h-3" /> Shared
                  </span>
                )}
              </div>
            </div>

            {/* Tab bar */}
            <div className="border-b border-border px-6 flex items-center gap-1 bg-secondary/30">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all ${
                    activeTab === key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {key === "comments" && comments.length > 0 && (
                    <span className="ml-0.5 bg-primary/10 text-primary text-[10px] w-5 h-5 rounded-full inline-flex items-center justify-center font-bold">
                      {comments.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <ScrollArea className="flex-1">
              <div className="px-8 py-7">

                {/* ── OVERVIEW ── */}
                {activeTab === "overview" && (
                  <div className="max-w-2xl space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: "Version", value: activeItem.label },
                        { label: "Source", value: activeItem.source === "pipeline" ? "Pipeline" : "Manual" },
                        { label: "Created", value: formatDate(activeItem.created_at) },
                        { label: "Status", value: activeItem.is_active ? "Active" : "Archived" },
                      ].map((m) => (
                        <div key={m.label} className="bg-secondary/50 rounded-xl px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{m.label}</p>
                          <p className="text-sm font-semibold text-foreground">{m.value}</p>
                        </div>
                      ))}
                    </div>

                    {(activeItem.form_type || activeItem.target_price != null || activeItem.cogs_target != null) && (
                      <div className="grid grid-cols-3 gap-4">
                        {activeItem.form_type && (
                          <div className="bg-secondary/50 rounded-xl px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Form Type</p>
                            <p className="text-sm font-semibold text-foreground">{activeItem.form_type}</p>
                          </div>
                        )}
                        {activeItem.target_price != null && (
                          <div className="bg-secondary/50 rounded-xl px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Target Price</p>
                            <p className="text-sm font-semibold text-foreground">${activeItem.target_price}</p>
                          </div>
                        )}
                        {activeItem.cogs_target != null && (
                          <div className="bg-secondary/50 rounded-xl px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">COGS Target</p>
                            <p className="text-sm font-semibold text-foreground">${activeItem.cogs_target}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {(activeItem.qa_verdict || activeItem.fda_score || activeItem.competitive_score) && (
                      <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Quality Metrics</p>
                        <div className="flex gap-6">
                          <ScoreChip label="QA" value={activeItem.qa_score ?? null} max={10} />
                          <ScoreChip label="FDA" value={activeItem.fda_score ?? null} max={100} />
                          <ScoreChip label="Comp" value={activeItem.competitive_score ?? null} max={10} />
                        </div>
                        {activeItem.qa_verdict && (
                          <Badge className={`text-[10px] px-2.5 py-0.5 border ${verdictColor(activeItem.qa_verdict)}`}>
                            {activeItem.qa_verdict}
                          </Badge>
                        )}
                      </div>
                    )}

                    {activeItem.change_summary && (
                      <div className="bg-secondary/50 rounded-xl px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Summary</p>
                        <p className="text-sm text-foreground leading-relaxed">{activeItem.change_summary}</p>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      View the <button onClick={() => setActiveTab("formula")} className="text-primary font-semibold hover:underline">Formula tab</button> for the full document.
                    </p>
                  </div>
                )}

                {/* ── FORMULA ── */}
                {activeTab === "formula" && (
                  <div className="space-y-6 max-w-3xl">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {activeItem.source === "pipeline" ? activeItem.label : `Version ${activeItem.label}`}
                      </h3>
                      {activeItem.formula_brief_content && (
                        <PDFDownloadLink
                          document={
                            <FormulaPDF
                              categoryName={selectedCat?.name ?? ""}
                              versionLabel={activeItem.label}
                              formulaText={activeItem.formula_brief_content}
                              date={new Date(activeItem.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              qaScore={activeItem.qa_score ?? null}
                              fdaScore={activeItem.fda_score ?? null}
                              qaVerdict={activeItem.qa_verdict ?? null}
                            />
                          }
                          fileName={`DOVIVE-${(selectedCat?.name ?? "Formula").replace(/\s+/g, "-")}-${activeItem.label}.pdf`}
                        >
                          {({ loading }) => (
                            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-xl" disabled={loading}>
                              <FileText className="w-3.5 h-3.5" />
                              {loading ? "Preparing…" : "Download PDF"}
                            </Button>
                          )}
                        </PDFDownloadLink>
                      )}
                    </div>
                    <div className="bg-secondary/30 rounded-xl p-6 border border-border/50">
                      <SectionText text={activeItem.formula_brief_content} fallback="No formula content available." />
                    </div>
                  </div>
                )}

                {/* ── COMMENTS ── */}
                {activeTab === "comments" && (
                  <div className="max-w-2xl">
                    {comments.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <MessageSquare className="w-10 h-10 text-muted-foreground/20 mb-3" />
                        <p className="text-sm text-muted-foreground">No comments yet for {activeItem.label}.</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">Start a conversation below.</p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {comments.map((c) => {
                          const isInternal = c.session_token === "00000000-0000-0000-0000-000000000000";
                          const isEditing = editingId === c.id;
                          return (
                            <div key={c.id} className="flex gap-3.5 group">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                isInternal ? "bg-primary/10 text-primary" : "bg-purple-100 text-purple-700"
                              }`}>
                                {getInitials(c.author_name)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="text-[13px] font-semibold text-foreground">{c.author_name}</span>
                                  {!isInternal && (
                                    <span className="text-[9px] px-2 py-0.5 bg-purple-100 text-purple-600 rounded-full font-semibold uppercase tracking-wide">Mfr</span>
                                  )}
                                  <span className="text-[11px] text-muted-foreground">{formatDate(c.created_at)}</span>
                                  <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {isInternal && !isEditing && (
                                      <button
                                        onClick={() => { setEditingId(c.id); setEditText(c.comment); }}
                                        className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"
                                        title="Edit"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                    )}
                                    {!isEditing && (
                                      <button
                                        onClick={() => deleteComment(c.id)}
                                        className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500"
                                        title="Delete"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                    {isEditing && (
                                      <>
                                        <button
                                          onClick={() => saveEdit(c.id)}
                                          className="p-1.5 rounded-lg hover:bg-green-50 text-muted-foreground hover:text-green-600"
                                          title="Save"
                                        >
                                          <Check className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={() => { setEditingId(null); setEditText(""); }}
                                          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"
                                          title="Cancel"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                                {isEditing ? (
                                  <Textarea
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) saveEdit(c.id); if (e.key === "Escape") { setEditingId(null); setEditText(""); } }}
                                    rows={2}
                                    className="text-sm resize-none w-full rounded-xl"
                                    autoFocus
                                  />
                                ) : (
                                  <>
                                    {c.comment && (
                                      <p className="text-sm text-foreground/80 leading-relaxed">{c.comment}</p>
                                    )}
                                    {c.attachment_url && (
                                      <div className="mt-2.5">
                                        {c.attachment_type?.startsWith("image/") ? (
                                          <a href={c.attachment_url} target="_blank" rel="noopener noreferrer">
                                            <img
                                              src={c.attachment_url}
                                              alt={c.attachment_name ?? "attachment"}
                                              className="max-w-xs max-h-48 rounded-xl border border-border object-cover hover:opacity-90 transition-opacity"
                                            />
                                          </a>
                                        ) : (
                                          <a
                                            href={c.attachment_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 text-xs text-primary hover:text-primary/80 bg-primary/5 hover:bg-primary/10 border border-primary/10 rounded-xl px-3 py-2 transition-colors"
                                          >
                                            <FileText className="w-3.5 h-3.5 shrink-0" />
                                            <span className="truncate max-w-[200px]">{c.attachment_name ?? "Attachment"}</span>
                                          </a>
                                        )}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <Separator className="my-6" />
                    <div className="space-y-3">
                      <Input
                        placeholder="Your name"
                        value={authorName}
                        onChange={(e) => setAuthorName(e.target.value)}
                        className="h-9 text-sm w-52 rounded-xl"
                      />
                      <div className="flex gap-3">
                        <Textarea
                          placeholder="Add a comment… (Cmd+Enter to send)"
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) submitComment(); }}
                          rows={3}
                          className="flex-1 resize-none text-sm rounded-xl"
                        />
                        <Button
                          onClick={submitComment}
                          disabled={submitting || !commentText.trim()}
                          size="sm"
                          className="self-end rounded-xl h-9 w-9 p-0"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── HISTORY ── */}
                {activeTab === "history" && (
                  <div className="max-w-2xl">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-6">
                      Project Activity — {selectedCat?.name}
                    </p>
                    <ActivityTimeline
                      comments={allCatComments as TimelineComment[]}
                      versions={versions.map((v) => ({
                        id: v.id,
                        label: v.label,
                        created_at: v.created_at,
                        change_summary: v.change_summary ?? undefined,
                        source: v.source,
                      } as TimelineVersion))}
                      showVersionChip={true}
                    />
                  </div>
                )}

              </div>
            </ScrollArea>
          </>
        )}
      </div>
    </div>
  );
}
