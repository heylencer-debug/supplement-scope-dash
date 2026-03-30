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
import {
  Link2, ChevronRight, MessageSquare, FlaskConical, LayoutDashboard, GitBranch,
  Pencil, Trash2, Check, X,
} from "lucide-react";

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
  source: "p12" | "living";
  // P12 metadata
  form_type?: string | null;
  target_price?: number | null;
  cogs_target?: number | null;
  positioning?: string | null;
  qa_verdict?: string | null;
  qa_score?: string | null;
  fda_score?: string | null;
  fda_status?: string | null;
  competitive_score?: string | null;
}

interface MfrComment {
  id: string;
  session_token: string;
  category_id: string;
  version_label: string;
  author_name: string;
  comment: string;
  created_at: string;
}

type TabKey = "overview" | "formula" | "comments";

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

/** Extract P12 metadata from formula_briefs.ingredients JSON */
function extractP12Metadata(ingredients: Record<string, unknown>) {
  const qaReport = (ingredients?.qa_report as string) ?? "";
  let qaVerdict = "";
  if (qaReport) {
    const m = qaReport.match(/\*\*Overall:\*\*\s*(.+)/)
      || qaReport.match(/Overall:\s*(APPROVED[^.\n]*|NEEDS MAJOR REVISION[^.\n]*)/i)
      || qaReport.match(/(APPROVED WITH ADJUSTMENTS|APPROVED|NEEDS MAJOR REVISION)/i);
    qaVerdict = m?.[1]?.trim() ?? "";
  }

  let qaScore: string | null = null;
  if (qaReport) {
    const m = qaReport.match(/\*\*QA Score:\*\*\s*([\d.]+)/) || qaReport.match(/QA Score:\s*([\d.]+)/);
    qaScore = m?.[1] ?? null;
  }

  const fda = (ingredients?.fda_compliance as Record<string, unknown>) ?? {};
  const fdaScore = fda.compliance_score != null ? String(fda.compliance_score) : null;
  const fdaStatus = (fda.compliance_status as string) ?? "";

  let competitiveScore: string | null = null;
  const rawBench = ingredients?.competitive_benchmarking;
  if (rawBench) {
    const report = typeof rawBench === "string" ? rawBench : JSON.stringify(rawBench);
    const m = report.match(/Overall.*?competitiveness.*?([\d.]+)\s*\/\s*10/i)
      || report.match(/competitiveness.*?([\d.]+)\s*\/\s*10/i)
      || report.match(/([\d.]+)\s*\/\s*10/);
    competitiveScore = m?.[1] ?? null;
  }

  return { qa_verdict: qaVerdict || null, qa_score: qaScore, fda_score: fdaScore, fda_status: fdaStatus, competitive_score: competitiveScore };
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
  if (!text) return <p className="text-sm text-gray-400 py-4">{fallback}</p>;
  return <pre className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">{text}</pre>;
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

  // Load versions: P12 base from formula_briefs + living versions from formula_brief_versions
  useEffect(() => {
    if (!selectedCat) return;
    setActiveItem(null);
    setActiveTab("overview");

    const briefsQ = supabase
      .from("formula_briefs")
      .select("id, category_id, created_at, updated_at, ingredients, form_type, target_price, cogs_target, positioning")
      .eq("category_id", selectedCat.id)
      .order("created_at", { ascending: true })
      .limit(1);

    const liveQ = supabase
      .from("formula_brief_versions")
      .select("id, category_id, created_at, version_number, is_active, formula_brief_content, change_summary")
      .eq("category_id", selectedCat.id)
      .order("version_number", { ascending: true });

    Promise.all([briefsQ, liveQ]).then(([{ data: briefs }, { data: live }]) => {
      const all: UnifiedVersion[] = [];

      // P12 base version from formula_briefs
      if (briefs?.length) {
        const b = briefs[0] as any;
        const ingredients = (b.ingredients ?? {}) as Record<string, unknown>;
        const p12Meta = extractP12Metadata(ingredients);
        // Get the full formula text — prefer adjusted_formula > final_formula_brief
        const formulaContent = (ingredients.adjusted_formula ?? ingredients.final_formula_brief ?? "") as string;
        const changeSummary = `Dual AI formula brief — ${[
          ingredients.formula_brief_model_grok && `Grok`,
          ingredients.formula_brief_model_claude && `Claude Sonnet`,
        ].filter(Boolean).join(" + ") || "AI Generated"}`;

        all.push({
          id: b.id,
          label: "v1",
          category_id: b.category_id,
          created_at: b.created_at,
          version_number: 0,
          is_active: !live?.some((v: any) => v.is_active),
          formula_brief_content: formulaContent,
          change_summary: changeSummary,
          source: "p12",
          form_type: b.form_type,
          target_price: b.target_price,
          cogs_target: b.cogs_target,
          positioning: b.positioning,
          ...p12Meta,
        });
      }

      // Living versions from formula_brief_versions
      if (live?.length) {
        for (const v of live as any[]) {
          all.push({
            id: v.id,
            label: `v${(briefs?.length ? 1 : 0) + v.version_number}`,
            category_id: v.category_id,
            created_at: v.created_at,
            version_number: v.version_number,
            is_active: v.is_active,
            formula_brief_content: v.formula_brief_content,
            change_summary: v.change_summary,
            source: "living",
          });
        }
      }

      setVersions(all);
      if (all.length) setActiveItem(all[all.length - 1]); // default to latest
    });
  }, [selectedCat]);

  // Load comments
  const loadComments = useCallback(() => {
    if (!activeItem || !selectedCat) return;
    supabase
      .from("manufacturer_comments")
      .select("*")
      .eq("category_id", selectedCat.id)
      .eq("version_label", activeItem.label)
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
    await supabase.from("manufacturer_comments").insert({
      session_token: "00000000-0000-0000-0000-000000000000",
      category_id: selectedCat.id,
      version_label: activeItem.label,
      author_name: authorName || "DOVIVE Team",
      comment: commentText.trim(),
    });
    setCommentText("");
    setSubmitting(false);
    loadComments();
  };

  const generateLink = async () => {
    if (!mfrName.trim()) {
      toast({ title: "Enter a manufacturer name first" });
      return;
    }
    setGeneratingLink(true);
    const token = crypto.randomUUID();
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

  // ─── Derived ────────────────────────────────────────────────────────────────

  const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "formula",  label: "Formula",  icon: FlaskConical },
    { key: "comments", label: "Comments", icon: MessageSquare },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-gray-50">

      {/* ── Left Sidebar: Categories ─────────────────────────────────────────── */}
      <div className="w-52 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-100">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Projects</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="py-2 px-2 space-y-0.5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCat(cat)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-all flex items-center gap-2 group ${
                  selectedCat?.id === cat.id
                    ? "bg-indigo-50 text-indigo-700 font-semibold"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  selectedCat?.id === cat.id ? "bg-indigo-500" : "bg-gray-300 group-hover:bg-gray-400"
                }`} />
                <span className="truncate text-xs">{cat.name}</span>
                {cat.total_products ? (
                  <span className="ml-auto text-[10px] text-gray-400 flex-shrink-0">{cat.total_products}</span>
                ) : null}
              </button>
            ))}
          </div>
        </ScrollArea>

        {/* Share Portal */}
        <div className="p-3 border-t border-gray-100 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Share Portal</p>
          <Input
            placeholder="Manufacturer name"
            value={mfrName}
            onChange={(e) => setMfrName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generateLink()}
            className="h-7 text-xs"
          />
          <Button
            onClick={generateLink}
            disabled={generatingLink || !mfrName.trim()}
            size="sm"
            className="w-full h-7 text-xs gap-1"
          >
            <Link2 className="w-3 h-3" />
            {generatingLink ? "Generating…" : "Copy Link"}
          </Button>
        </div>
      </div>

      {/* ── Version List ─────────────────────────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900 truncate">{selectedCat?.name ?? "—"}</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {selectedCat?.total_products ?? 0} products · {versions.length} version{versions.length !== 1 ? "s" : ""}
          </p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {versions.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">No formula versions yet</p>
            )}

            {versions.map((item) => {
              const isSelected = activeItem?.id === item.id;
              const baseCard = `cursor-pointer transition-all border rounded-lg ${
                isSelected
                  ? "border-indigo-200 shadow-sm bg-indigo-50/40"
                  : "border-gray-100 hover:border-gray-200 hover:shadow-sm bg-white"
              }`;

              return (
                <Card key={item.id} onClick={() => { setActiveItem(item); setActiveTab("overview"); }} className={baseCard}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {item.source === "living" && <GitBranch className="w-3 h-3 text-purple-500" />}
                        <span className="text-sm font-bold text-gray-800">{item.label}</span>
                        {item.is_active && (
                          <span className="text-[9px] px-1.5 py-0 bg-purple-100 text-purple-700 rounded-full font-semibold">active</span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400">{formatDate(item.created_at)}</span>
                    </div>

                    {item.form_type && (
                      <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">
                        {item.form_type}
                      </span>
                    )}

                    {item.positioning && (
                      <p className="text-[11px] text-gray-500 leading-tight line-clamp-2">{item.positioning}</p>
                    )}

                    {item.change_summary && !item.positioning && (
                      <p className="text-[11px] text-gray-500 leading-tight line-clamp-2">{item.change_summary}</p>
                    )}

                    {item.qa_verdict && (
                      <Badge className={`text-[10px] px-2 py-0 border ${verdictColor(item.qa_verdict)}`}>
                        {item.qa_verdict.length > 26 ? item.qa_verdict.slice(0, 26) + "…" : item.qa_verdict}
                      </Badge>
                    )}

                    {item.fda_status && !item.qa_verdict && (
                      <p className="text-[11px] text-gray-400 truncate">{item.fda_status}</p>
                    )}

                    {(item.qa_score || item.fda_score || item.competitive_score) && (
                      <div className="flex gap-3 pt-1">
                        <ScoreChip label="QA" value={item.qa_score ?? null} max={10} />
                        <ScoreChip label="FDA" value={item.fda_score ?? null} max={100} />
                        <ScoreChip label="Comp" value={item.competitive_score ?? null} max={10} />
                      </div>
                    )}

                    {item.target_price != null && (
                      <p className="text-[11px] text-gray-400">
                        Target <span className="font-semibold text-gray-600">${item.target_price}</span>
                        {item.cogs_target != null ? ` · COGS $${item.cogs_target}` : ""}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* ── Detail Panel ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {!activeItem ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select a formula version
          </div>
        ) : (
          <>
            {/* Tab bar */}
            <div className="border-b border-gray-100 px-4 flex items-center gap-0">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === key
                      ? "border-indigo-500 text-indigo-700"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {key === "comments" && comments.length > 0 && (
                    <span className="ml-1 bg-indigo-100 text-indigo-700 text-[10px] px-1.5 rounded-full">
                      {comments.length}
                    </span>
                  )}
                </button>
              ))}
              <div className="ml-auto pr-2 flex items-center gap-2">
                <span className="text-xs text-gray-400">{activeItem.label}</span>
                {activeItem.is_active && (
                  <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                    {activeItem.source === "p12" ? "P12 Base" : "Active"}
                  </span>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="px-6 py-5">

                {/* ── OVERVIEW ── */}
                {activeTab === "overview" && (
                  <div className="max-w-xl space-y-3">
                    <MetaRow label="Version" value={activeItem.label} />
                    <MetaRow label="Source" value={activeItem.source === "p12" ? "P12 Formula (FDA Compliance)" : "Living Version"} />
                    <MetaRow label="Created" value={formatDate(activeItem.created_at)} />
                    {activeItem.change_summary && (
                      <MetaRow label="Summary" value={activeItem.change_summary} />
                    )}
                    <MetaRow label="Status" value={activeItem.is_active ? "Active" : "Archived"} />
                    {activeItem.form_type && <MetaRow label="Form type" value={activeItem.form_type} />}
                    {activeItem.target_price != null && <MetaRow label="Target price" value={`$${activeItem.target_price}`} />}
                    {activeItem.cogs_target != null && <MetaRow label="COGS target" value={`$${activeItem.cogs_target}`} />}
                    {activeItem.qa_verdict && <MetaRow label="QA Verdict" value={activeItem.qa_verdict} />}
                    {activeItem.fda_score && <MetaRow label="FDA Score" value={`${activeItem.fda_score}/100`} />}
                    {activeItem.competitive_score && <MetaRow label="Competitive Score" value={`${activeItem.competitive_score}/10`} />}
                    <p className="text-xs text-gray-400 pt-2">
                      View the <button onClick={() => setActiveTab("formula")} className="text-indigo-600 underline">Formula tab</button> for the full document.
                    </p>
                  </div>
                )}

                {/* ── FORMULA ── */}
                {activeTab === "formula" && (
                  <div className="space-y-6 max-w-3xl">
                    <div>
                      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">
                        {activeItem.source === "p12" ? "P12 Formula Brief" : `Version ${activeItem.label}`}
                        {activeItem.change_summary ? ` — ${activeItem.change_summary}` : ""}
                      </h3>
                      <SectionText text={activeItem.formula_brief_content} fallback="No formula content available." />
                    </div>
                  </div>
                )}

                {/* ── COMMENTS ── */}
                {activeTab === "comments" && (
                  <div className="max-w-2xl">
                    {comments.length === 0 ? (
                      <p className="text-sm text-gray-400 py-8 text-center">No comments yet for {activeItem.label}.</p>
                    ) : (
                      <div className="space-y-4">
                        {comments.map((c) => {
                          const isInternal = c.session_token === "00000000-0000-0000-0000-000000000000";
                          const isEditing = editingId === c.id;
                          return (
                            <div key={c.id} className="flex gap-3 group">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                isInternal ? "bg-indigo-100 text-indigo-700" : "bg-purple-100 text-purple-700"
                              }`}>
                                {getInitials(c.author_name)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-semibold text-gray-800">{c.author_name}</span>
                                  {!isInternal && (
                                    <span className="text-[9px] px-1.5 py-0 bg-purple-100 text-purple-600 rounded-full">manufacturer</span>
                                  )}
                                  <span className="text-[10px] text-gray-400">{formatDate(c.created_at)}</span>
                                  <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {isInternal && !isEditing && (
                                      <button
                                        onClick={() => { setEditingId(c.id); setEditText(c.comment); }}
                                        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                                        title="Edit"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                    )}
                                    {!isEditing && (
                                      <button
                                        onClick={() => deleteComment(c.id)}
                                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                                        title="Delete"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                    {isEditing && (
                                      <>
                                        <button
                                          onClick={() => saveEdit(c.id)}
                                          className="p-1 rounded hover:bg-green-50 text-gray-400 hover:text-green-600"
                                          title="Save"
                                        >
                                          <Check className="w-3 h-3" />
                                        </button>
                                        <button
                                          onClick={() => { setEditingId(null); setEditText(""); }}
                                          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
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
                                    className="text-sm resize-none w-full"
                                    autoFocus
                                  />
                                ) : (
                                  <p className="text-sm text-gray-700 leading-relaxed">{c.comment}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <Separator className="my-4" />
                    <div className="space-y-3">
                      <Input
                        placeholder="Your name"
                        value={authorName}
                        onChange={(e) => setAuthorName(e.target.value)}
                        className="h-8 text-sm w-48"
                      />
                      <div className="flex gap-2">
                        <Textarea
                          placeholder="Add a comment… (Cmd+Enter to send)"
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) submitComment(); }}
                          rows={3}
                          className="flex-1 resize-none text-sm"
                        />
                        <Button
                          onClick={submitComment}
                          disabled={submitting || !commentText.trim()}
                          size="sm"
                          className="self-end"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
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
