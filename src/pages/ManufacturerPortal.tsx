import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { FormulaPDF } from "@/components/FormulaPDF";

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

function versionLabel(brief: FormulaBrief, index: number, total: number): string {
  return `v${total - index}`;
}

function getQAVerdict(ing: Record<string, unknown>): string | null {
  if (typeof ing.qa_verdict === "string") return ing.qa_verdict;
  if (typeof ing.qa_report === "string") {
    const m = ing.qa_report.match(/VERDICT[:\s]+([A-Z ]+)/i);
    if (m) return m[1].trim();
  }
  return null;
}

function getQAScore(ing: Record<string, unknown>): string | null {
  if (typeof ing.qa_report === "string") {
    const m = ing.qa_report.match(/Score[:\s]+([\d.]+)\s*\/\s*10/i);
    if (m) return m[1];
  }
  return null;
}

function getFDAScore(ing: Record<string, unknown>): string | null {
  if (typeof ing.fda_compliance_score === "number")
    return String(ing.fda_compliance_score);
  if (typeof ing.fda_compliance === "object" && ing.fda_compliance !== null) {
    const fc = ing.fda_compliance as Record<string, unknown>;
    if (typeof fc.score === "number") return String(fc.score);
  }
  return null;
}

function getFDAStatus(ing: Record<string, unknown>): string | null {
  if (typeof ing.fda_status === "string") return ing.fda_status;
  if (typeof ing.fda_compliance === "object" && ing.fda_compliance !== null) {
    const fc = ing.fda_compliance as Record<string, unknown>;
    if (typeof fc.status === "string") return fc.status;
  }
  return null;
}

function getFormulaText(ing: Record<string, unknown>): string {
  if (typeof ing.adjusted_formula === "string" && ing.adjusted_formula.trim())
    return ing.adjusted_formula.trim();
  if (typeof ing.final_formula_brief === "string" && ing.final_formula_brief.trim())
    return ing.final_formula_brief.trim();
  if (typeof ing.ai_generated_brief_claude === "string" && ing.ai_generated_brief_claude.trim())
    return ing.ai_generated_brief_claude.slice(0, 3000).trim() + "\n\n[truncated]";
  if (typeof ing.qa_report === "string" && ing.qa_report.trim())
    return ing.qa_report.slice(0, 3000).trim() + "\n\n[truncated]";
  return "No formula detail available.";
}

type VerdictKey = "APPROVED" | "ADJUSTMENTS" | "NON-COMPLIANT" | "COMPLIANT" | "UNKNOWN";

function verdictBadge(verdict: string | null) {
  if (!verdict)
    return <Badge className="text-xs bg-gray-100 text-gray-600 border-gray-200">No QA</Badge>;
  const upper = verdict.toUpperCase();
  if (upper.includes("APPROVED") && !upper.includes("ADJUST"))
    return <Badge className="text-xs bg-green-50 text-green-700 border-green-200">APPROVED</Badge>;
  if (upper.includes("ADJUST"))
    return (
      <Badge className="text-xs bg-amber-50 text-amber-700 border-amber-200">
        APPROVED WITH ADJUSTMENTS
      </Badge>
    );
  if (upper.includes("NON") || upper.includes("FAIL"))
    return <Badge className="text-xs bg-red-50 text-red-700 border-red-200">NON-COMPLIANT</Badge>;
  if (upper.includes("COMPLIANT"))
    return <Badge className="text-xs bg-green-50 text-green-700 border-green-200">COMPLIANT</Badge>;
  return <Badge className="text-xs bg-gray-100 text-gray-600 border-gray-200">{verdict}</Badge>;
}

// ─── Access Denied Screen ────────────────────────────────────────────────────

function AccessDenied() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-gray-500 text-sm">
          This link is invalid or has expired. Please contact the team for a new link.
        </p>
      </div>
    </div>
  );
}

// ─── Loading Screen ──────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex items-center gap-3 text-gray-500">
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

  const [briefs, setBriefs] = useState<FormulaBrief[]>([]);
  const [brifsLoading, setBriefsLoading] = useState(false);
  const [publishedLabel, setPublishedLabel] = useState<string | null | undefined>(undefined);

  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);

  const [comments, setComments] = useState<MfrComment[]>([]);
  const [activeCommentVersion, setActiveCommentVersion] = useState<string | null>(null);

  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Validate token ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setDenied(true);
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await (supabase.from as any)("manufacturer_sessions")
        .select("id,token,manufacturer_name,expires_at")
        .eq("token", token)
        .single();

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

  // ── Load categories ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data } = await supabase
        .from("categories")
        .select("id,name,total_products")
        .gt("total_products", 0)
        .order("total_products", { ascending: false });
      if (data && data.length > 0) {
        setCategories(data as Category[]);
        setSelectedCategoryId(data[0].id);
      }
    })();
  }, [session]);

  // ── Load formula briefs for selected category ──────────────────────────────
  useEffect(() => {
    if (!selectedCategoryId) return;
    setBriefsLoading(true);
    setExpandedVersionId(null);
    setActiveCommentVersion(null);
    setComments([]);
    setPublishedLabel(undefined);
    (async () => {
      const [{ data }, { data: pubData }] = await Promise.all([
        (supabase.from as any)("formula_briefs")
          .select("id,category_id,created_at,ingredients")
          .eq("category_id", selectedCategoryId)
          .order("created_at", { ascending: false }),
        supabase
          .from("manufacturer_published_versions")
          .select("version_label")
          .eq("category_id", selectedCategoryId)
          .maybeSingle(),
      ]);
      const rows = (data ?? []) as FormulaBrief[];
      setBriefs(rows);
      const pub = pubData?.version_label ?? null;
      setPublishedLabel(pub);
      if (rows.length > 0) {
        // If a published version exists, auto-select it; otherwise use first
        const total = rows.length;
        let defaultLabel = versionLabel(rows[0], 0, total);
        if (pub) {
          const pubIdx = rows.findIndex((_, i) => versionLabel(rows[i], i, total) === pub);
          if (pubIdx !== -1) defaultLabel = pub;
        }
        setActiveCommentVersion(defaultLabel);
        loadComments(selectedCategoryId, defaultLabel);
      }
      setBriefsLoading(false);
    })();
  }, [selectedCategoryId]);

  // ── Load comments ──────────────────────────────────────────────────────────
  const loadComments = useCallback(
    async (categoryId: string, vLabel: string) => {
      const { data } = await (supabase.from as any)("manufacturer_comments")
        .select("*")
        .eq("category_id", categoryId)
        .eq("version_label", vLabel)
        .order("created_at", { ascending: true });
      setComments((data ?? []) as MfrComment[]);
    },
    []
  );

  // Polling every 10 seconds
  useEffect(() => {
    if (!selectedCategoryId || !activeCommentVersion) return;
    const id = setInterval(() => {
      loadComments(selectedCategoryId, activeCommentVersion);
    }, 10000);
    return () => clearInterval(id);
  }, [selectedCategoryId, activeCommentVersion, loadComments]);

  // ── Submit comment ─────────────────────────────────────────────────────────
  async function handleSubmitComment() {
    if (!commentText.trim() || !session || !selectedCategoryId || !activeCommentVersion) return;
    setSubmitting(true);
    setSubmitError(null);
    const { error } = await (supabase.from as any)("manufacturer_comments").insert({
      session_token: session.token,
      category_id: selectedCategoryId,
      version_label: activeCommentVersion,
      author_name: session.manufacturer_name,
      comment: commentText.trim(),
    });
    if (error) {
      setSubmitError("Failed to send comment. Please try again.");
    } else {
      setCommentText("");
      await loadComments(selectedCategoryId, activeCommentVersion);
    }
    setSubmitting(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <LoadingScreen />;
  if (denied) return <AccessDenied />;

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  return (
    <div className="min-h-screen bg-white flex flex-col" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Top bar */}
      <header className="h-12 border-b border-gray-200 flex items-center px-5 gap-4 shrink-0 bg-white z-10">
        <span className="font-semibold text-gray-900 text-sm tracking-tight">DOVIVE</span>
        <span className="text-gray-300 text-sm">|</span>
        <span className="text-gray-500 text-sm">Manufacturer Portal</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
            {getInitials(session?.manufacturer_name ?? "M")}
          </div>
          <span className="text-sm text-gray-700">{session?.manufacturer_name}</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 border-r border-gray-200 bg-[#F8F9FA] shrink-0 flex flex-col">
          <div className="px-4 pt-5 pb-2">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-3">
              Projects
            </p>
          </div>
          <ScrollArea className="flex-1 px-2">
            <div className="space-y-0.5 pb-4">
              {categories.map((cat) => {
                const active = cat.id === selectedCategoryId;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={[
                      "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                      active
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-600 hover:bg-gray-200",
                    ].join(" ")}
                  >
                    <span className="mr-1.5 text-xs">{active ? "●" : "○"}</span>
                    {cat.name.length > 22 ? cat.name.slice(0, 22) + "…" : cat.name}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {!selectedCategory ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Select a project from the sidebar.
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
              {/* Category header */}
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">{selectedCategory.name}</h1>
                <p className="text-sm text-gray-400 mt-1">{selectedCategory.total_products} products analyzed</p>
              </div>

              {/* Formula versions */}
              <section>
                <h2 className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-3">
                  Formula Versions
                </h2>

                {brifsLoading || publishedLabel === undefined ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-20 rounded-lg bg-gray-100 animate-pulse" />
                    ))}
                  </div>
                ) : publishedLabel === null ? (
                  <Card className="border border-gray-200">
                    <CardContent className="py-8 text-center text-gray-400 text-sm">
                      No formula version has been shared yet. Check back soon.
                    </CardContent>
                  </Card>
                ) : briefs.length === 0 ? (
                  <Card className="border border-gray-200">
                    <CardContent className="py-8 text-center text-gray-400 text-sm">
                      No formula versions generated yet for this category.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {briefs.filter((_, idx) => versionLabel(briefs[idx], idx, briefs.length) === publishedLabel).map((brief) => {
                      const realIdx = briefs.indexOf(brief);
                      const label = versionLabel(brief, realIdx, briefs.length);
                      const ing = (brief.ingredients ?? {}) as Record<string, unknown>;
                      const verdict = getQAVerdict(ing);
                      const qaScore = getQAScore(ing);
                      const fdaScore = getFDAScore(ing);
                      const isExpanded = expandedVersionId === brief.id;
                      const isCommentActive = activeCommentVersion === label;

                      return (
                        <Card
                          key={brief.id}
                          className={[
                            "border transition-shadow",
                            isCommentActive ? "border-blue-200 shadow-sm" : "border-gray-200",
                          ].join(" ")}
                        >
                          <CardHeader className="pb-2 pt-4 px-5">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="font-semibold text-gray-800 text-sm">{label}</span>
                              <span className="text-xs text-gray-400">{formatDate(brief.created_at)}</span>
                              {verdictBadge(verdict)}
                            </div>
                            <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                              {qaScore && <span>QA Score: <strong className="text-gray-700">{qaScore}/10</strong></span>}
                              {fdaScore && <span>FDA: <strong className="text-gray-700">{fdaScore}/100</strong></span>}
                              {getFDAStatus(ing) && (
                                <span className="text-gray-400">{getFDAStatus(ing)}</span>
                              )}
                            </div>
                          </CardHeader>
                          <CardContent className="px-5 pb-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7 border-gray-200 text-gray-600 hover:bg-gray-50"
                                onClick={() =>
                                  setExpandedVersionId(isExpanded ? null : brief.id)
                                }
                              >
                                {isExpanded ? "Hide Formula" : "View Formula"}
                              </Button>
                              <PDFDownloadLink
                                document={
                                  <FormulaPDF
                                    categoryName={selectedCategory?.name ?? ""}
                                    versionLabel={label}
                                    formulaText={getFormulaText(ing)}
                                    date={formatDate(brief.created_at)}
                                    qaScore={getQAScore(ing)}
                                    fdaScore={getFDAScore(ing)}
                                    qaVerdict={getQAVerdict(ing)}
                                    manufacturerName={session?.manufacturer_name}
                                  />
                                }
                                fileName={`DOVIVE-${(selectedCategory?.name ?? "Formula").replace(/\s+/g, "-")}-${label}.pdf`}
                              >
                                {({ loading }) => (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-7 border-gray-200 text-gray-600 hover:bg-gray-50 gap-1"
                                    disabled={loading}
                                  >
                                    {loading ? "Preparing…" : "⬇ Download PDF"}
                                  </Button>
                                )}
                              </PDFDownloadLink>
                              <Button
                                variant={isCommentActive ? "default" : "ghost"}
                                size="sm"
                                className={[
                                  "text-xs h-7",
                                  isCommentActive
                                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                                    : "text-gray-500 hover:bg-gray-100",
                                ].join(" ")}
                                onClick={() => {
                                  setActiveCommentVersion(label);
                                  loadComments(selectedCategoryId!, label);
                                }}
                              >
                                Comments
                                {isCommentActive && comments.length > 0 && (
                                  <span className="ml-1.5 bg-blue-500 text-white rounded-full px-1.5 py-0 text-[10px]">
                                    {comments.length}
                                  </span>
                                )}
                              </Button>
                            </div>

                            {/* Expanded formula panel */}
                            {isExpanded && (
                              <div className="mt-4 p-4 rounded-lg bg-gray-50 border border-gray-200">
                                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-3">
                                  Formula Detail
                                </p>
                                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto max-h-96 overflow-y-auto">
                                  {getFormulaText(ing)}
                                </pre>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Comment thread */}
              {activeCommentVersion && (
                <section>
                  <Separator className="mb-6" />
                  <h2 className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-4">
                    Comments on {activeCommentVersion}
                  </h2>

                  {/* Comment list */}
                  <div className="space-y-4 mb-6">
                    {comments.length === 0 ? (
                      <p className="text-sm text-gray-400">No comments yet. Be the first to leave a note.</p>
                    ) : (
                      comments.map((c) => (
                        <div key={c.id} className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0 mt-0.5">
                            {getInitials(c.author_name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span className="text-sm font-medium text-gray-800">{c.author_name}</span>
                              <span className="text-xs text-gray-400">{formatTime(c.created_at)}</span>
                            </div>
                            <p className="text-sm text-gray-600 leading-relaxed">{c.comment}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Comment input */}
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <Textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Add a comment…"
                      className="border-0 resize-none text-sm focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none min-h-[80px]"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          handleSubmitComment();
                        }
                      }}
                    />
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-200">
                      {submitError ? (
                        <span className="text-xs text-red-500">{submitError}</span>
                      ) : (
                        <span className="text-xs text-gray-400">Cmd+Enter to send</span>
                      )}
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={!commentText.trim() || submitting}
                        onClick={handleSubmitComment}
                      >
                        {submitting ? "Sending…" : "Send"}
                      </Button>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
