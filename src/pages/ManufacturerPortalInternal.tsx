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
import { Link2, ChevronRight, MessageSquare, FileText, X } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  total_products: number;
}

interface FormulaBrief {
  id: string;
  category_id: string;
  created_at: string;
  ingredients: Record<string, unknown>;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getVersionLabel(briefs: FormulaBrief[], brief: FormulaBrief): string {
  const sorted = [...briefs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const idx = sorted.findIndex((b) => b.id === brief.id);
  return `v${idx + 1}`;
}

function getQAVerdict(brief: FormulaBrief): string {
  const ing = brief.ingredients as Record<string, unknown>;
  const qa = ing?.qa_report as string | undefined;
  if (!qa) return "";
  const m = qa.match(/\*\*Overall:\*\*\s*(.+)/);
  return m?.[1]?.trim() ?? "";
}

function getQAScore(brief: FormulaBrief): string | null {
  const ing = brief.ingredients as Record<string, unknown>;
  const qa = ing?.qa_report as string | undefined;
  if (!qa) return null;
  const m = qa.match(/\*\*QA Score:\*\*\s*([\d.]+)/);
  return m?.[1] ?? null;
}

function getFDAScore(brief: FormulaBrief): string | null {
  const ing = brief.ingredients as Record<string, unknown>;
  const fda = ing?.fda_compliance as Record<string, unknown> | undefined;
  return fda?.compliance_score != null ? String(fda.compliance_score) : null;
}

function getFDAStatus(brief: FormulaBrief): string {
  const ing = brief.ingredients as Record<string, unknown>;
  const fda = ing?.fda_compliance as Record<string, unknown> | undefined;
  return (fda?.compliance_status as string) ?? "";
}

function verdictColor(verdict: string): string {
  if (/APPROVED$/i.test(verdict)) return "bg-green-100 text-green-800 border-green-200";
  if (/ADJUSTMENTS/i.test(verdict)) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (/NON-COMPLIANT|REVISION|MAJOR/i.test(verdict)) return "bg-red-100 text-red-800 border-red-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ManufacturerPortalInternal() {
  const { toast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);
  const [briefs, setBriefs] = useState<FormulaBrief[]>([]);
  const [activeVersion, setActiveVersion] = useState<FormulaBrief | null>(null);
  const [showFormula, setShowFormula] = useState(false);
  const [comments, setComments] = useState<MfrComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [authorName, setAuthorName] = useState("DOVIVE Team");
  const [submitting, setSubmitting] = useState(false);

  // Share link state
  const [mfrName, setMfrName] = useState("");
  const [generatingLink, setGeneratingLink] = useState(false);

  // Load categories
  useEffect(() => {
    supabase
      .from("categories")
      .select("id, name, total_products")
      .gt("total_products", 0)
      .order("total_products", { ascending: false })
      .then(({ data }) => {
        if (data?.length) {
          setCategories(data as Category[]);
          setSelectedCat(data[0] as Category);
        }
      });
  }, []);

  // Load briefs for selected category
  useEffect(() => {
    if (!selectedCat) return;
    setActiveVersion(null);
    setShowFormula(false);
    supabase
      .from("formula_briefs")
      .select("id, category_id, created_at, ingredients")
      .eq("category_id", selectedCat.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const rows = (data ?? []) as FormulaBrief[];
        setBriefs(rows);
        if (rows.length) setActiveVersion(rows[0]);
      });
  }, [selectedCat]);

  // Load comments for active version
  const loadComments = useCallback(() => {
    if (!activeVersion || !selectedCat) return;
    const vLabel = getVersionLabel(briefs, activeVersion);
    supabase
      .from("manufacturer_comments")
      .select("*")
      .eq("category_id", selectedCat.id)
      .eq("version_label", vLabel)
      .order("created_at", { ascending: true })
      .then(({ data }) => setComments((data ?? []) as MfrComment[]));
  }, [activeVersion, selectedCat, briefs]);

  useEffect(() => {
    loadComments();
    const interval = setInterval(loadComments, 10000);
    return () => clearInterval(interval);
  }, [loadComments]);

  const submitComment = async () => {
    if (!commentText.trim() || !activeVersion || !selectedCat) return;
    setSubmitting(true);
    const vLabel = getVersionLabel(briefs, activeVersion);
    await supabase.from("manufacturer_comments").insert({
      session_token: "00000000-0000-0000-0000-000000000000",
      category_id: selectedCat.id,
      version_label: vLabel,
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
      console.error("Generate link error:", error);
      toast({ title: "Failed to generate link", description: error.message, variant: "destructive" });
      return;
    }
    const url = `${window.location.origin}/mfr/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link copied to clipboard!", description: url });
      setMfrName("");
    });
  };

  const formulaText = (() => {
    if (!activeVersion) return "";
    const ing = activeVersion.ingredients as Record<string, unknown>;
    return (ing?.adjusted_formula ?? ing?.final_formula_brief ?? ing?.ai_generated_brief ?? "") as string;
  })();

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-gray-50">
      {/* ── Left Sidebar: Categories ───────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-100">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Projects</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="py-2 px-2 space-y-0.5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCat(cat)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2 group ${
                  selectedCat?.id === cat.id
                    ? "bg-indigo-50 text-indigo-700 font-semibold"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${selectedCat?.id === cat.id ? "bg-indigo-500" : "bg-gray-300 group-hover:bg-gray-400"}`} />
                <span className="truncate">{cat.name}</span>
                <span className="ml-auto text-[10px] text-gray-400 flex-shrink-0">{cat.total_products}</span>
              </button>
            ))}
          </div>
        </ScrollArea>

        {/* Share link generator */}
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

      {/* ── Main Content ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-6 py-4 bg-white border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">{selectedCat?.name ?? "Select a project"}</h2>
            <p className="text-xs text-gray-400">{selectedCat?.total_products ?? 0} products · {briefs.length} formula version{briefs.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Version list */}
          <div className="w-72 flex-shrink-0 border-r border-gray-100 bg-white flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Formula Versions</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {briefs.length === 0 && (
                  <p className="text-xs text-gray-400 px-2 py-4 text-center">No formula versions yet</p>
                )}
                {briefs.map((brief) => {
                  const vLabel = getVersionLabel(briefs, brief);
                  const verdict = getQAVerdict(brief);
                  const qaScore = getQAScore(brief);
                  const fdaScore = getFDAScore(brief);
                  const fdaStatus = getFDAStatus(brief);
                  const isActive = activeVersion?.id === brief.id;

                  return (
                    <Card
                      key={brief.id}
                      onClick={() => { setActiveVersion(brief); setShowFormula(false); }}
                      className={`cursor-pointer transition-all border ${isActive ? "border-indigo-200 shadow-sm bg-indigo-50/40" : "border-gray-100 hover:border-gray-200 hover:shadow-sm"}`}
                    >
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-gray-800">{vLabel}</span>
                          <span className="text-[10px] text-gray-400">{formatDate(brief.created_at)}</span>
                        </div>
                        {verdict && (
                          <Badge className={`text-[10px] px-2 py-0 border ${verdictColor(verdict)}`}>
                            {verdict.length > 28 ? verdict.slice(0, 28) + "…" : verdict}
                          </Badge>
                        )}
                        <div className="flex gap-3 text-[10px] text-gray-500">
                          {qaScore && <span>QA <span className="font-semibold text-gray-700">{qaScore}/10</span></span>}
                          {fdaScore && <span>FDA <span className="font-semibold text-gray-700">{fdaScore}/100</span></span>}
                        </div>
                        {fdaStatus && (
                          <p className="text-[10px] text-gray-400 truncate">{fdaStatus}</p>
                        )}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveVersion(brief); setShowFormula(true); }}
                            className="flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800"
                          >
                            <FileText className="w-3 h-3" /> View Formula
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setActiveVersion(brief); setShowFormula(false); }}
                            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700"
                          >
                            <MessageSquare className="w-3 h-3" /> Comments
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Formula / Comments panel */}
          <div className="flex-1 flex flex-col min-w-0 bg-white">
            {!activeVersion ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                Select a version to view details
              </div>
            ) : showFormula ? (
              <>
                <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <FileText className="w-4 h-4 text-indigo-500" />
                    Formula — {getVersionLabel(briefs, activeVersion)}
                  </div>
                  <button onClick={() => setShowFormula(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <ScrollArea className="flex-1 px-6 py-4">
                  {formulaText ? (
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">{formulaText}</pre>
                  ) : (
                    <p className="text-sm text-gray-400">No formula available for this version.</p>
                  )}
                </ScrollArea>
              </>
            ) : (
              <>
                <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-semibold text-gray-700">
                    Comments — {getVersionLabel(briefs, activeVersion)} · {selectedCat?.name}
                  </span>
                  <span className="ml-auto text-xs text-gray-400">{comments.length} comment{comments.length !== 1 ? "s" : ""}</span>
                </div>
                <ScrollArea className="flex-1 px-6 py-4">
                  {comments.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">No comments yet. Be the first to add one.</p>
                  ) : (
                    <div className="space-y-4">
                      {comments.map((c) => (
                        <div key={c.id} className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                            {getInitials(c.author_name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-gray-800">{c.author_name}</span>
                              <span className="text-[10px] text-gray-400">{formatDate(c.created_at)}</span>
                            </div>
                            <p className="text-sm text-gray-700 leading-relaxed">{c.comment}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                <Separator />
                <div className="px-6 py-4 space-y-3">
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
                    <Button onClick={submitComment} disabled={submitting || !commentText.trim()} size="sm" className="self-end">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
