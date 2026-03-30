import { useEffect, useState, useCallback, useRef } from "react";
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
import { Paperclip, X, FileText, Image } from "lucide-react";

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

  // Unified version model (same as internal portal)
  interface UnifiedVersion {
    id: string;
    label: string;
    created_at: string;
    formula_text: string;
    change_summary: string | null;
    qa_verdict: string | null;
    qa_score: string | null;
    fda_score: string | null;
    fda_status: string | null;
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
      const [{ data: liveVersions }, { data: briefData }, { data: pubData }] = await Promise.all([
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
      ]);

      const all: UnifiedVersion[] = [];

      // Living versions from formula_brief_versions
      for (const v of (liveVersions ?? []) as any[]) {
        all.push({
          id: v.id,
          label: `v${v.version_number}`,
          created_at: v.created_at,
          formula_text: v.formula_brief_content ?? "",
          change_summary: v.change_summary,
          qa_verdict: null, qa_score: null, fda_score: null, fda_status: null,
        });
      }

      // Pipeline versions from formula_briefs.ingredients
      if (briefData) {
        const ing = briefData.ingredients as any;
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
          all.push({ id: "grok", label: "Formula A — Grok", created_at: briefData.created_at ?? "", formula_text: ing.ai_generated_brief_grok, change_summary: "Deep scientific reasoning", qa_verdict: qaVerdict, qa_score: qaScore, fda_score: fdaScore, fda_status: fdaStatus });
        }
        if (ing?.ai_generated_brief_claude) {
          all.push({ id: "claude", label: "Formula B — Sonnet", created_at: briefData.created_at ?? "", formula_text: ing.ai_generated_brief_claude, change_summary: "1M context synthesis", qa_verdict: qaVerdict, qa_score: qaScore, fda_score: fdaScore, fda_status: fdaStatus });
        } else if (ing?.ai_generated_brief) {
          all.push({ id: "legacy", label: "AI Generated Brief", created_at: briefData.created_at ?? "", formula_text: ing.ai_generated_brief, change_summary: "Initial AI brief", qa_verdict: qaVerdict, qa_score: qaScore, fda_score: fdaScore, fda_status: fdaStatus });
        }
        const complianceContent = ing?.final_formula_brief || ing?.adjusted_formula;
        if (complianceContent) {
          all.push({ id: "compliance", label: "⚖️ Compliance", created_at: briefData.created_at ?? "", formula_text: complianceContent, change_summary: "Initial formula brief from market analysis pipeline", qa_verdict: qaVerdict, qa_score: qaScore, fda_score: fdaScore, fda_status: fdaStatus });
        }
        if (ing?.final_formula_brief) {
          all.push({ id: "qa-final", label: "✅ QA Approved Final", created_at: briefData.created_at ?? "", formula_text: ing.final_formula_brief, change_summary: `${ing?.qa_verdict?.verdict || "Reviewed"} · Score: ${ing?.qa_verdict?.score || "—"}/10`, qa_verdict: qaVerdict, qa_score: qaScore, fda_score: fdaScore, fda_status: fdaStatus });
        }
      }

      setVersions(all);
      const pub = pubData?.version_label ?? null;
      setPublishedLabel(pub);
      const found = pub ? all.find(v => v.label === pub) ?? null : null;
      setPublishedVersion(found);
      if (found) {
        setActiveCommentVersion(found.label);
        loadComments(selectedCategoryId, found.label);
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
    if (!commentText.trim() && !attachmentFile) return;
    if (!session || !selectedCategoryId || !activeCommentVersion) return;
    setSubmitting(true);
    setSubmitError(null);

    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;
    let attachmentType: string | null = null;

    if (attachmentFile) {
      const safeName = attachmentFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${selectedCategoryId}/${activeCommentVersion}/${Date.now()}-${safeName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("manufacturer-uploads")
        .upload(path, attachmentFile, { upsert: false });
      if (uploadError) {
        setSubmitError("File upload failed. Please try again.");
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
                ) : !publishedVersion ? (
                  <Card className="border border-gray-200">
                    <CardContent className="py-8 text-center text-gray-400 text-sm">
                      Loading shared formula…
                    </CardContent>
                  </Card>
                ) : (() => {
                  const v = publishedVersion;
                  const isExpanded = expandedVersionId === v.id;
                  const isCommentActive = activeCommentVersion === v.label;
                  return (
                    <div className="space-y-3">
                      <Card
                        className={[
                          "border transition-shadow",
                          isCommentActive ? "border-blue-200 shadow-sm" : "border-gray-200",
                        ].join(" ")}
                      >
                        <CardHeader className="pb-2 pt-4 px-5">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-semibold text-gray-800 text-sm">{v.label}</span>
                            <span className="text-xs text-gray-400">{formatDate(v.created_at)}</span>
                            {verdictBadge(v.qa_verdict)}
                          </div>
                          <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                            {v.qa_score && <span>QA Score: <strong className="text-gray-700">{v.qa_score}/10</strong></span>}
                            {v.fda_score && <span>FDA: <strong className="text-gray-700">{v.fda_score}/100</strong></span>}
                            {v.fda_status && <span className="text-gray-400">{v.fda_status}</span>}
                          </div>
                        </CardHeader>
                        <CardContent className="px-5 pb-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 border-gray-200 text-gray-600 hover:bg-gray-50"
                              onClick={() => setExpandedVersionId(isExpanded ? null : v.id)}
                            >
                              {isExpanded ? "Hide Formula" : "View Formula"}
                            </Button>
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
                                  className="text-xs h-7 border-gray-200 text-gray-600 hover:bg-gray-50 gap-1"
                                  disabled={pdfLoading}
                                >
                                  {pdfLoading ? "Preparing…" : "⬇ Download PDF"}
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
                                setActiveCommentVersion(v.label);
                                loadComments(selectedCategoryId!, v.label);
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

                          {isExpanded && (
                            <div className="mt-4 p-4 rounded-lg bg-gray-50 border border-gray-200">
                              <p className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-3">
                                Formula Detail
                              </p>
                              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto max-h-96 overflow-y-auto">
                                {v.formula_text}
                              </pre>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  );
                })()}
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
                            {c.comment && (
                              <p className="text-sm text-gray-600 leading-relaxed">{c.comment}</p>
                            )}
                            {c.attachment_url && (
                              <div className="mt-2">
                                {c.attachment_type?.startsWith("image/") ? (
                                  <a href={c.attachment_url} target="_blank" rel="noopener noreferrer">
                                    <img
                                      src={c.attachment_url}
                                      alt={c.attachment_name ?? "attachment"}
                                      className="max-w-xs max-h-48 rounded-lg border border-gray-200 object-cover hover:opacity-90 transition-opacity"
                                    />
                                  </a>
                                ) : (
                                  <a
                                    href={c.attachment_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-lg px-3 py-2 transition-colors"
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
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <input
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
                      <div className="px-3 py-2 bg-blue-50 border-t border-blue-100 flex items-center gap-2">
                        {attachmentFile.type.startsWith("image/") ? (
                          <Image className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        )}
                        <span className="text-xs text-blue-700 flex-1 truncate">{attachmentFile.name}</span>
                        <span className="text-xs text-blue-400">
                          {(attachmentFile.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                        <button
                          onClick={() => {
                            setAttachmentFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          className="text-blue-400 hover:text-blue-600 p-0.5 rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-200">
                      {submitError ? (
                        <span className="text-xs text-red-500">{submitError}</span>
                      ) : (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                            title="Attach a file"
                          >
                            <Paperclip className="w-4 h-4" />
                          </button>
                          <span className="text-xs text-gray-400">Cmd+Enter to send</span>
                        </div>
                      )}
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={(!commentText.trim() && !attachmentFile) || submitting}
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
