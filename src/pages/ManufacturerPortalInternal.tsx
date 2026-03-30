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
  Link2, ChevronRight, MessageSquare, FileText,
  LayoutDashboard, ShieldCheck, BarChart2, FlaskConical,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  total_products: number;
  form_type?: string | null;
}

interface FormulaBrief {
  id: string;
  category_id: string;
  created_at: string;
  updated_at: string;
  ingredients: Record<string, unknown>;
  // structured columns
  positioning: string | null;
  target_customer: string | null;
  form_type: string | null;
  flavor_profile: string | null;
  servings_per_container: number | null;
  target_price: number | null;
  cogs_target: number | null;
  margin_estimate: number | null;
  moq_estimate: number | null;
  lead_time_weeks: number | null;
  manufacturing_notes: string | null;
  regulatory_notes: string | null;
  market_summary: string | null;
  opportunity_insights: string | null;
  key_differentiators: string[] | null;
  consumer_pain_points: string[] | null;
  risk_factors: string[] | null;
  testing_requirements: string[] | null;
  certifications: string[] | null;
  packaging_type: string | null;
  packaging_recommendations: string | null;
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

type TabKey = "overview" | "formula" | "qa" | "competitive" | "fda" | "comments";

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

function ing(brief: FormulaBrief): Record<string, unknown> {
  return brief.ingredients ?? {};
}

function getQAReport(brief: FormulaBrief): string {
  return (ing(brief)?.qa_report as string) ?? "";
}

function getQAVerdict(brief: FormulaBrief): string {
  const qa = getQAReport(brief);
  if (!qa) return "";
  const m = qa.match(/\*\*Overall:\*\*\s*(.+)/)
          || qa.match(/Overall:\s*(APPROVED[^.\n]*|NEEDS MAJOR REVISION[^.\n]*)/i)
          || qa.match(/(APPROVED WITH ADJUSTMENTS|APPROVED|NEEDS MAJOR REVISION)/i);
  return m?.[1]?.trim() ?? "";
}

function getQAScore(brief: FormulaBrief): string | null {
  const qa = getQAReport(brief);
  if (!qa) return null;
  const m = qa.match(/\*\*QA Score:\*\*\s*([\d.]+)/) || qa.match(/QA Score:\s*([\d.]+)/);
  return m?.[1] ?? null;
}

function getFDA(brief: FormulaBrief): Record<string, unknown> {
  return (ing(brief)?.fda_compliance as Record<string, unknown>) ?? {};
}

function getFDAScore(brief: FormulaBrief): string | null {
  const score = getFDA(brief)?.compliance_score;
  return score != null ? String(score) : null;
}

function getFDAStatus(brief: FormulaBrief): string {
  return (getFDA(brief)?.compliance_status as string) ?? "";
}

function getFDAAnalysis(brief: FormulaBrief): string {
  return (getFDA(brief)?.analysis as string) ?? "";
}

function getCompetitiveReport(brief: FormulaBrief): string {
  const raw = ing(brief)?.competitive_benchmarking;
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  try { return JSON.stringify(raw); } catch { return ""; }
}

function getCompetitiveScore(brief: FormulaBrief): string | null {
  const report = getCompetitiveReport(brief);
  if (!report) return null;
  const m = report.match(/Overall.*?competitiveness.*?([\d.]+)\s*\/\s*10/i)
           || report.match(/competitiveness.*?([\d.]+)\s*\/\s*10/i)
           || report.match(/([\d.]+)\s*\/\s*10/);
  return m?.[1] ?? null;
}

function getFormulaText(brief: FormulaBrief): string {
  const i = ing(brief);
  return (i?.adjusted_formula ?? i?.final_formula_brief ?? i?.ai_generated_brief ?? "") as string;
}

function getGrokBrief(brief: FormulaBrief): string {
  const i = ing(brief);
  return (i?.grok_brief ?? i?.grok_formula_brief ?? "") as string;
}

function getClaudeBrief(brief: FormulaBrief): string {
  const i = ing(brief);
  return (i?.claude_brief ?? i?.claude_formula_brief ?? "") as string;
}

function verdictColor(verdict: string): string {
  if (/APPROVED$/i.test(verdict)) return "bg-green-100 text-green-800 border-green-200";
  if (/ADJUSTMENTS/i.test(verdict)) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (/NON-COMPLIANT|REVISION|MAJOR/i.test(verdict)) return "bg-red-100 text-red-800 border-red-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function fdaColor(status: string): string {
  if (/compliant/i.test(status) && !/non/i.test(status)) return "bg-green-100 text-green-800 border-green-200";
  if (/minor/i.test(status)) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (/non-compliant|major/i.test(status)) return "bg-red-100 text-red-800 border-red-200";
  return "bg-gray-100 text-gray-600 border-gray-200";
}

function ScoreChip({ label, value, max }: { label: string; value: string | null; max: number }) {
  if (!value) return null;
  const num = parseFloat(value);
  const pct = Math.min(100, (num / max) * 100);
  const color = pct >= 75 ? "text-green-700" : pct >= 50 ? "text-yellow-700" : "text-red-600";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-base font-bold ${color}`}>{value}<span className="text-[10px] text-gray-400">/{max}</span></span>
      <span className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</span>
    </div>
  );
}

function SectionText({ text, fallback = "No data available." }: { text: string; fallback?: string }) {
  if (!text) return <p className="text-sm text-gray-400 py-4">{fallback}</p>;
  return <pre className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">{text}</pre>;
}

function TagList({ items, color = "bg-gray-100 text-gray-700" }: { items: string[] | null; color?: string }) {
  if (!items?.length) return <span className="text-xs text-gray-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <span key={i} className={`text-[11px] px-2 py-0.5 rounded-full ${color}`}>{t}</span>
      ))}
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

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "overview",     label: "Overview",     icon: LayoutDashboard },
  { key: "formula",      label: "Formula",      icon: FlaskConical },
  { key: "qa",           label: "QA Report",    icon: ShieldCheck },
  { key: "competitive",  label: "Competitive",  icon: BarChart2 },
  { key: "fda",          label: "FDA",          icon: ShieldCheck },
  { key: "comments",     label: "Comments",     icon: MessageSquare },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ManufacturerPortalInternal() {
  const { toast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);
  const [briefs, setBriefs] = useState<FormulaBrief[]>([]);
  const [activeVersion, setActiveVersion] = useState<FormulaBrief | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [comments, setComments] = useState<MfrComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [authorName, setAuthorName] = useState("DOVIVE Team");
  const [submitting, setSubmitting] = useState(false);
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
    setActiveTab("overview");
    (supabase.from as any)("formula_briefs")
      .select([
        "id", "category_id", "created_at", "updated_at", "ingredients",
        "positioning", "target_customer", "form_type", "flavor_profile",
        "servings_per_container", "target_price", "cogs_target", "margin_estimate",
        "moq_estimate", "lead_time_weeks", "manufacturing_notes", "regulatory_notes",
        "market_summary", "opportunity_insights", "key_differentiators",
        "consumer_pain_points", "risk_factors", "testing_requirements",
        "certifications", "packaging_type", "packaging_recommendations",
      ].join(", "))
      .eq("category_id", selectedCat.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const rows = (data ?? []) as FormulaBrief[];
        setBriefs(rows);
        if (rows.length) setActiveVersion(rows[0]);
      });
  }, [selectedCat]);

  // Load comments
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
      toast({ title: "Failed to generate link", description: error.message, variant: "destructive" });
      return;
    }
    const url = `${window.location.origin}/mfr/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link copied!", description: url });
      setMfrName("");
    });
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const vLabel = activeVersion ? getVersionLabel(briefs, activeVersion) : "";

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-gray-50">

      {/* ── Left Sidebar ─────────────────────────────────────────────────────── */}
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
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2 group ${
                  selectedCat?.id === cat.id
                    ? "bg-indigo-50 text-indigo-700 font-semibold"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  selectedCat?.id === cat.id ? "bg-indigo-500" : "bg-gray-300 group-hover:bg-gray-400"
                }`} />
                <span className="truncate text-xs">{cat.name}</span>
                <span className="ml-auto text-[10px] text-gray-400 flex-shrink-0">{cat.total_products}</span>
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
        {/* Category header */}
        <div className="px-4 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900 truncate">{selectedCat?.name ?? "—"}</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {selectedCat?.total_products ?? 0} products · {briefs.length} version{briefs.length !== 1 ? "s" : ""}
          </p>
          {/* Latest form type from first brief */}
          {briefs[0]?.form_type && (
            <Badge className="mt-2 text-[10px] bg-indigo-50 text-indigo-700 border-indigo-100 border">
              {briefs[0].form_type}
            </Badge>
          )}
        </div>
        <div className="px-4 py-2 border-b border-gray-100">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Formula Versions</p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-3 space-y-2">
            {briefs.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">No formula versions yet</p>
            )}
            {briefs.map((brief) => {
              const label = getVersionLabel(briefs, brief);
              const verdict = getQAVerdict(brief);
              const qaScore = getQAScore(brief);
              const fdaScore = getFDAScore(brief);
              const compScore = getCompetitiveScore(brief);
              const isActive = activeVersion?.id === brief.id;

              return (
                <Card
                  key={brief.id}
                  onClick={() => { setActiveVersion(brief); setActiveTab("overview"); }}
                  className={`cursor-pointer transition-all border ${
                    isActive
                      ? "border-indigo-200 shadow-sm bg-indigo-50/40"
                      : "border-gray-100 hover:border-gray-200 hover:shadow-sm bg-white"
                  }`}
                >
                  <CardContent className="p-3 space-y-2">
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-800">{label}</span>
                      <span className="text-[10px] text-gray-400">{formatDate(brief.created_at)}</span>
                    </div>

                    {/* Form type + positioning */}
                    {brief.form_type && (
                      <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">
                        {brief.form_type}
                      </span>
                    )}
                    {brief.positioning && (
                      <p className="text-[11px] text-gray-500 leading-tight line-clamp-2">{brief.positioning}</p>
                    )}

                    {/* QA verdict */}
                    {verdict && (
                      <Badge className={`text-[10px] px-2 py-0 border ${verdictColor(verdict)}`}>
                        {verdict.length > 26 ? verdict.slice(0, 26) + "…" : verdict}
                      </Badge>
                    )}

                    {/* Score row */}
                    <div className="flex gap-3 pt-1">
                      <ScoreChip label="QA" value={qaScore} max={10} />
                      <ScoreChip label="FDA" value={fdaScore} max={100} />
                      <ScoreChip label="Comp" value={compScore} max={10} />
                    </div>

                    {/* Price */}
                    {brief.target_price && (
                      <p className="text-[11px] text-gray-400">
                        Target <span className="font-semibold text-gray-600">${brief.target_price}</span>
                        {brief.cogs_target ? ` · COGS $${brief.cogs_target}` : ""}
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
        {!activeVersion ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select a formula version
          </div>
        ) : (
          <>
            {/* Tab bar */}
            <div className="border-b border-gray-100 px-4 flex items-center gap-0 overflow-x-auto">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                      isActive
                        ? "border-indigo-500 text-indigo-700"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                    {tab.key === "comments" && comments.length > 0 && (
                      <span className="ml-1 bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0 rounded-full">
                        {comments.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <ScrollArea className="flex-1">
              <div className="px-6 py-5">

                {/* ── OVERVIEW ── */}
                {activeTab === "overview" && (
                  <div className="space-y-6 max-w-2xl">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Version</h3>
                      <div className="space-y-2">
                        <MetaRow label="Version" value={vLabel} />
                        <MetaRow label="Created" value={formatDate(activeVersion.created_at)} />
                        <MetaRow label="Updated" value={formatDate(activeVersion.updated_at)} />
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Product</h3>
                      <div className="space-y-2">
                        <MetaRow label="Form type" value={activeVersion.form_type} />
                        <MetaRow label="Positioning" value={activeVersion.positioning} />
                        <MetaRow label="Target customer" value={activeVersion.target_customer} />
                        <MetaRow label="Flavor profile" value={activeVersion.flavor_profile} />
                        <MetaRow label="Servings / container" value={activeVersion.servings_per_container} />
                        <MetaRow label="Packaging" value={activeVersion.packaging_type} />
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Commercials</h3>
                      <div className="space-y-2">
                        <MetaRow label="Target price" value={activeVersion.target_price != null ? `$${activeVersion.target_price}` : null} />
                        <MetaRow label="COGS target" value={activeVersion.cogs_target != null ? `$${activeVersion.cogs_target}` : null} />
                        <MetaRow label="Margin estimate" value={activeVersion.margin_estimate != null ? `${activeVersion.margin_estimate}%` : null} />
                        <MetaRow label="MOQ estimate" value={activeVersion.moq_estimate != null ? `${activeVersion.moq_estimate.toLocaleString()} units` : null} />
                        <MetaRow label="Lead time" value={activeVersion.lead_time_weeks != null ? `${activeVersion.lead_time_weeks} weeks` : null} />
                      </div>
                    </div>

                    {(activeVersion.key_differentiators?.length || activeVersion.consumer_pain_points?.length) && (
                      <>
                        <Separator />
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Strategy</h3>
                          <div className="space-y-3">
                            {activeVersion.key_differentiators?.length ? (
                              <div>
                                <p className="text-[11px] text-gray-400 mb-1.5">Key differentiators</p>
                                <TagList items={activeVersion.key_differentiators} color="bg-indigo-50 text-indigo-700" />
                              </div>
                            ) : null}
                            {activeVersion.consumer_pain_points?.length ? (
                              <div>
                                <p className="text-[11px] text-gray-400 mb-1.5">Consumer pain points</p>
                                <TagList items={activeVersion.consumer_pain_points} color="bg-amber-50 text-amber-700" />
                              </div>
                            ) : null}
                            {activeVersion.risk_factors?.length ? (
                              <div>
                                <p className="text-[11px] text-gray-400 mb-1.5">Risk factors</p>
                                <TagList items={activeVersion.risk_factors} color="bg-red-50 text-red-700" />
                              </div>
                            ) : null}
                            {activeVersion.certifications?.length ? (
                              <div>
                                <p className="text-[11px] text-gray-400 mb-1.5">Certifications</p>
                                <TagList items={activeVersion.certifications} color="bg-green-50 text-green-700" />
                              </div>
                            ) : null}
                            {activeVersion.testing_requirements?.length ? (
                              <div>
                                <p className="text-[11px] text-gray-400 mb-1.5">Testing requirements</p>
                                <TagList items={activeVersion.testing_requirements} color="bg-gray-100 text-gray-600" />
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </>
                    )}

                    {(activeVersion.market_summary || activeVersion.opportunity_insights) && (
                      <>
                        <Separator />
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Market</h3>
                          <div className="space-y-4">
                            {activeVersion.market_summary && (
                              <div>
                                <p className="text-[11px] text-gray-400 mb-1">Market summary</p>
                                <p className="text-xs text-gray-700 leading-relaxed">{activeVersion.market_summary}</p>
                              </div>
                            )}
                            {activeVersion.opportunity_insights && (
                              <div>
                                <p className="text-[11px] text-gray-400 mb-1">Opportunity insights</p>
                                <p className="text-xs text-gray-700 leading-relaxed">{activeVersion.opportunity_insights}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {(activeVersion.manufacturing_notes || activeVersion.regulatory_notes || activeVersion.packaging_recommendations) && (
                      <>
                        <Separator />
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Manufacturing</h3>
                          <div className="space-y-4">
                            {activeVersion.manufacturing_notes && (
                              <div>
                                <p className="text-[11px] text-gray-400 mb-1">Manufacturing notes</p>
                                <p className="text-xs text-gray-700 leading-relaxed">{activeVersion.manufacturing_notes}</p>
                              </div>
                            )}
                            {activeVersion.regulatory_notes && (
                              <div>
                                <p className="text-[11px] text-gray-400 mb-1">Regulatory notes</p>
                                <p className="text-xs text-gray-700 leading-relaxed">{activeVersion.regulatory_notes}</p>
                              </div>
                            )}
                            {activeVersion.packaging_recommendations && (
                              <div>
                                <p className="text-[11px] text-gray-400 mb-1">Packaging recommendations</p>
                                <p className="text-xs text-gray-700 leading-relaxed">{activeVersion.packaging_recommendations}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* ── FORMULA ── */}
                {activeTab === "formula" && (() => {
                  const adjusted = getFormulaText(activeVersion);
                  const grok = getGrokBrief(activeVersion);
                  const claude = getClaudeBrief(activeVersion);
                  return (
                    <div className="space-y-6 max-w-3xl">
                      {adjusted ? (
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Final Formula (Post-QA)</h3>
                          <SectionText text={adjusted} />
                        </div>
                      ) : null}
                      {grok ? (
                        <>
                          {adjusted && <Separator />}
                          <div>
                            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Grok 4.2 Draft</h3>
                            <SectionText text={grok} />
                          </div>
                        </>
                      ) : null}
                      {claude ? (
                        <>
                          {(adjusted || grok) && <Separator />}
                          <div>
                            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Claude Sonnet 4.6 Draft</h3>
                            <SectionText text={claude} />
                          </div>
                        </>
                      ) : null}
                      {!adjusted && !grok && !claude && (
                        <p className="text-sm text-gray-400 py-4">No formula data available for this version.</p>
                      )}
                    </div>
                  );
                })()}

                {/* ── QA REPORT ── */}
                {activeTab === "qa" && (() => {
                  const qa = getQAReport(activeVersion);
                  const verdict = getQAVerdict(activeVersion);
                  const score = getQAScore(activeVersion);
                  return (
                    <div className="space-y-4 max-w-3xl">
                      {(verdict || score) && (
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                          {verdict && (
                            <Badge className={`text-xs px-3 py-1 border ${verdictColor(verdict)}`}>{verdict}</Badge>
                          )}
                          {score && (
                            <span className="text-sm text-gray-500">
                              QA Score: <span className="font-bold text-gray-800">{score}/10</span>
                            </span>
                          )}
                        </div>
                      )}
                      <SectionText text={qa} fallback="No QA report available for this version." />
                    </div>
                  );
                })()}

                {/* ── COMPETITIVE ── */}
                {activeTab === "competitive" && (() => {
                  const report = getCompetitiveReport(activeVersion);
                  const score = getCompetitiveScore(activeVersion);
                  return (
                    <div className="space-y-4 max-w-3xl">
                      {score && (
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                          <span className="text-sm text-gray-500">
                            Competitive Score: <span className="font-bold text-gray-800">{score}/10</span>
                          </span>
                        </div>
                      )}
                      <SectionText text={report} fallback="No competitive benchmarking report available." />
                    </div>
                  );
                })()}

                {/* ── FDA ── */}
                {activeTab === "fda" && (() => {
                  const score = getFDAScore(activeVersion);
                  const status = getFDAStatus(activeVersion);
                  const analysis = getFDAAnalysis(activeVersion);
                  const fda = getFDA(activeVersion);
                  const ingredientAnalysis = fda?.ingredient_analysis as string | undefined;
                  return (
                    <div className="space-y-4 max-w-3xl">
                      {(score || status) && (
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                          {status && (
                            <Badge className={`text-xs px-3 py-1 border ${fdaColor(status)}`}>{status}</Badge>
                          )}
                          {score && (
                            <span className="text-sm text-gray-500">
                              Compliance Score: <span className="font-bold text-gray-800">{score}/100</span>
                            </span>
                          )}
                        </div>
                      )}
                      {analysis && (
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Analysis</h3>
                          <SectionText text={analysis} />
                        </div>
                      )}
                      {ingredientAnalysis && (
                        <>
                          <Separator />
                          <div>
                            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Ingredient Analysis</h3>
                            <SectionText text={ingredientAnalysis} />
                          </div>
                        </>
                      )}
                      {!analysis && !ingredientAnalysis && !score && (
                        <p className="text-sm text-gray-400 py-4">No FDA compliance report available.</p>
                      )}
                    </div>
                  );
                })()}

                {/* ── COMMENTS ── */}
                {activeTab === "comments" && (
                  <div className="max-w-2xl space-y-0">
                    {comments.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">No comments yet.</p>
                    ) : (
                      <div className="space-y-5 mb-6">
                        {comments.map((c) => (
                          <div key={c.id} className="flex gap-3">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                              {getInitials(c.author_name)}
                            </div>
                            <div className="flex-1">
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
