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
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  total_products: number | null;
}

interface FormulaBrief {
  id: string;
  category_id: string;
  created_at: string;
  updated_at: string;
  ingredients: Record<string, unknown>;
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

interface FormulaVersion {
  id: string;
  category_id: string;
  created_at: string;
  version_number: number;
  is_active: boolean;
  formula_brief_content: string;
  change_summary: string | null;
}

// Unified version item shown in the list
type VersionItem =
  | { kind: "pipeline"; brief: FormulaBrief; label: string }
  | { kind: "living";   ver: FormulaVersion; label: string };

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

function ing(brief: FormulaBrief): Record<string, unknown> {
  return brief.ingredients ?? {};
}

function getQAVerdict(brief: FormulaBrief): string {
  const qa = (ing(brief)?.qa_report as string) ?? "";
  if (!qa) return "";
  const m = qa.match(/\*\*Overall:\*\*\s*(.+)/)
          || qa.match(/Overall:\s*(APPROVED[^.\n]*|NEEDS MAJOR REVISION[^.\n]*)/i)
          || qa.match(/(APPROVED WITH ADJUSTMENTS|APPROVED|NEEDS MAJOR REVISION)/i);
  return m?.[1]?.trim() ?? "";
}

function getQAScore(brief: FormulaBrief): string | null {
  const qa = (ing(brief)?.qa_report as string) ?? "";
  const m = qa.match(/\*\*QA Score:\*\*\s*([\d.]+)/) || qa.match(/QA Score:\s*([\d.]+)/);
  return m?.[1] ?? null;
}

function getFDAScore(brief: FormulaBrief): string | null {
  const fda = (ing(brief)?.fda_compliance as Record<string, unknown>) ?? {};
  return fda.compliance_score != null ? String(fda.compliance_score) : null;
}

function getFDAStatus(brief: FormulaBrief): string {
  const fda = (ing(brief)?.fda_compliance as Record<string, unknown>) ?? {};
  return (fda.compliance_status as string) ?? "";
}

function getCompetitiveScore(brief: FormulaBrief): string | null {
  const report = (ing(brief)?.competitive_benchmarking as string) ?? "";
  if (!report) return null;
  const m = report.match(/Overall.*?competitiveness.*?([\d.]+)\s*\/\s*10/i)
           || report.match(/competitiveness.*?([\d.]+)\s*\/\s*10/i)
           || report.match(/([\d.]+)\s*\/\s*10/);
  return m?.[1] ?? null;
}

function getFormulaText(brief: FormulaBrief): { adjusted: string; grok: string; claude: string } {
  const i = ing(brief);
  return {
    adjusted: (i?.adjusted_formula ?? i?.final_formula_brief ?? "") as string,
    grok: (i?.grok_brief ?? i?.grok_formula_brief ?? "") as string,
    claude: (i?.claude_brief ?? i?.claude_formula_brief ?? i?.ai_generated_brief ?? "") as string,
  };
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

function TagList({ items, color }: { items: string[] | null; color: string }) {
  if (!items?.length) return <span className="text-xs text-gray-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <span key={i} className={`text-[11px] px-2 py-0.5 rounded-full ${color}`}>{t}</span>
      ))}
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
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [activeItem, setActiveItem] = useState<VersionItem | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [comments, setComments] = useState<MfrComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [authorName, setAuthorName] = useState("DOVIVE Team");
  const [submitting, setSubmitting] = useState(false);
  const [mfrName, setMfrName] = useState("");
  const [generatingLink, setGeneratingLink] = useState(false);

  // Load all categories (no product count filter)
  useEffect(() => {
    supabase
      .from("categories")
      .select("id, name, total_products")
      .order("total_products", { ascending: false })
      .then(({ data }) => {
        if (data?.length) {
          setCategories(data as Category[]);
          setSelectedCat(data[0] as Category);
        }
      });
  }, []);

  // Load versions for selected category — merge formula_briefs + formula_brief_versions
  useEffect(() => {
    if (!selectedCat) return;
    setActiveItem(null);
    setActiveTab("overview");

    const briefsQ = supabase
      .from("formula_briefs")
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
      .order("created_at", { ascending: true });

    const liveQ = supabase
      .from("formula_brief_versions")
      .select("id, category_id, created_at, version_number, is_active, formula_brief_content, change_summary")
      .eq("category_id", selectedCat.id)
      .order("version_number", { ascending: true });

    Promise.all([briefsQ, liveQ]).then(([{ data: briefs }, { data: live }]) => {
      const pipelineItems: VersionItem[] = ((briefs ?? []) as FormulaBrief[]).map((b, i) => ({
        kind: "pipeline",
        brief: b,
        label: `v${i + 1}`,
      }));

      const livingItems: VersionItem[] = ((live ?? []) as FormulaVersion[]).map((v) => ({
        kind: "living",
        ver: v,
        label: `mfr-v${v.version_number}`,
      }));

      const all: VersionItem[] = [...pipelineItems, ...livingItems];
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

  const activeBrief = activeItem?.kind === "pipeline" ? activeItem.brief : null;
  const activeLiving = activeItem?.kind === "living" ? activeItem.ver : null;

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
              const isActive = activeItem?.label === item.label;
              const baseCard = `cursor-pointer transition-all border rounded-lg ${
                isActive
                  ? "border-indigo-200 shadow-sm bg-indigo-50/40"
                  : "border-gray-100 hover:border-gray-200 hover:shadow-sm bg-white"
              }`;

              if (item.kind === "pipeline") {
                const b = item.brief;
                const verdict = getQAVerdict(b);
                const qaScore = getQAScore(b);
                const fdaScore = getFDAScore(b);
                const compScore = getCompetitiveScore(b);
                const fdaStatus = getFDAStatus(b);

                return (
                  <Card key={item.label} onClick={() => { setActiveItem(item); setActiveTab("overview"); }} className={baseCard}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-gray-800">{item.label}</span>
                        <span className="text-[10px] text-gray-400">{formatDate(b.created_at)}</span>
                      </div>
                      {b.form_type && (
                        <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">
                          {b.form_type}
                        </span>
                      )}
                      {b.positioning && (
                        <p className="text-[11px] text-gray-500 leading-tight line-clamp-2">{b.positioning}</p>
                      )}
                      {verdict && (
                        <Badge className={`text-[10px] px-2 py-0 border ${verdictColor(verdict)}`}>
                          {verdict.length > 26 ? verdict.slice(0, 26) + "…" : verdict}
                        </Badge>
                      )}
                      {fdaStatus && !verdict && (
                        <p className="text-[11px] text-gray-400 truncate">{fdaStatus}</p>
                      )}
                      <div className="flex gap-3 pt-1">
                        <ScoreChip label="QA" value={qaScore} max={10} />
                        <ScoreChip label="FDA" value={fdaScore} max={100} />
                        <ScoreChip label="Comp" value={compScore} max={10} />
                      </div>
                      {b.target_price != null && (
                        <p className="text-[11px] text-gray-400">
                          Target <span className="font-semibold text-gray-600">${b.target_price}</span>
                          {b.cogs_target != null ? ` · COGS $${b.cogs_target}` : ""}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              }

              // Living brief version
              const v = item.ver;
              return (
                <Card key={item.label} onClick={() => { setActiveItem(item); setActiveTab("formula"); }} className={baseCard}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <GitBranch className="w-3 h-3 text-purple-500" />
                        <span className="text-sm font-bold text-gray-800">{item.label}</span>
                        {v.is_active && (
                          <span className="text-[9px] px-1.5 py-0 bg-purple-100 text-purple-700 rounded-full font-semibold">active</span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-400">{formatDate(v.created_at)}</span>
                    </div>
                    {v.change_summary && (
                      <p className="text-[11px] text-gray-500 leading-tight line-clamp-2">{v.change_summary}</p>
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
                {activeItem.kind === "living" && activeItem.ver.is_active && (
                  <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">MFR active</span>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="px-6 py-5">

                {/* ── OVERVIEW ── */}
                {activeTab === "overview" && (
                  <>
                    {activeLiving ? (
                      <div className="max-w-xl space-y-3">
                        <MetaRow label="Version" value={activeLiving.version_number} />
                        <MetaRow label="Created" value={formatDate(activeLiving.created_at)} />
                        <MetaRow label="Change summary" value={activeLiving.change_summary} />
                        <MetaRow label="Status" value={activeLiving.is_active ? "Active" : "Archived"} />
                        <p className="text-xs text-gray-400 pt-2">
                          This is a manufacturer feedback version. View the Formula tab for content.
                        </p>
                      </div>
                    ) : activeBrief ? (
                      <div className="space-y-6 max-w-2xl">
                        <div className="space-y-2">
                          <MetaRow label="Version" value={activeItem.label} />
                          <MetaRow label="Created" value={formatDate(activeBrief.created_at)} />
                          <MetaRow label="Updated" value={formatDate(activeBrief.updated_at)} />
                        </div>
                        <Separator />
                        <div>
                          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Product</h3>
                          <div className="space-y-2">
                            <MetaRow label="Form type" value={activeBrief.form_type} />
                            <MetaRow label="Positioning" value={activeBrief.positioning} />
                            <MetaRow label="Target customer" value={activeBrief.target_customer} />
                            <MetaRow label="Flavor profile" value={activeBrief.flavor_profile} />
                            <MetaRow label="Servings / container" value={activeBrief.servings_per_container} />
                            <MetaRow label="Packaging" value={activeBrief.packaging_type} />
                          </div>
                        </div>
                        <Separator />
                        <div>
                          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Commercials</h3>
                          <div className="space-y-2">
                            <MetaRow label="Target price" value={activeBrief.target_price != null ? `$${activeBrief.target_price}` : null} />
                            <MetaRow label="COGS target" value={activeBrief.cogs_target != null ? `$${activeBrief.cogs_target}` : null} />
                            <MetaRow label="Margin estimate" value={activeBrief.margin_estimate != null ? `${activeBrief.margin_estimate}%` : null} />
                            <MetaRow label="MOQ estimate" value={activeBrief.moq_estimate != null ? `${activeBrief.moq_estimate.toLocaleString()} units` : null} />
                            <MetaRow label="Lead time" value={activeBrief.lead_time_weeks != null ? `${activeBrief.lead_time_weeks} weeks` : null} />
                          </div>
                        </div>
                        {(activeBrief.key_differentiators?.length || activeBrief.consumer_pain_points?.length || activeBrief.risk_factors?.length) && (
                          <>
                            <Separator />
                            <div>
                              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Strategy</h3>
                              <div className="space-y-3">
                                {activeBrief.key_differentiators?.length ? (
                                  <div>
                                    <p className="text-[11px] text-gray-400 mb-1.5">Key differentiators</p>
                                    <TagList items={activeBrief.key_differentiators} color="bg-indigo-50 text-indigo-700" />
                                  </div>
                                ) : null}
                                {activeBrief.consumer_pain_points?.length ? (
                                  <div>
                                    <p className="text-[11px] text-gray-400 mb-1.5">Consumer pain points</p>
                                    <TagList items={activeBrief.consumer_pain_points} color="bg-amber-50 text-amber-700" />
                                  </div>
                                ) : null}
                                {activeBrief.risk_factors?.length ? (
                                  <div>
                                    <p className="text-[11px] text-gray-400 mb-1.5">Risk factors</p>
                                    <TagList items={activeBrief.risk_factors} color="bg-red-50 text-red-700" />
                                  </div>
                                ) : null}
                                {activeBrief.certifications?.length ? (
                                  <div>
                                    <p className="text-[11px] text-gray-400 mb-1.5">Certifications</p>
                                    <TagList items={activeBrief.certifications} color="bg-green-50 text-green-700" />
                                  </div>
                                ) : null}
                                {activeBrief.testing_requirements?.length ? (
                                  <div>
                                    <p className="text-[11px] text-gray-400 mb-1.5">Testing requirements</p>
                                    <TagList items={activeBrief.testing_requirements} color="bg-gray-100 text-gray-600" />
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </>
                        )}
                        {(activeBrief.market_summary || activeBrief.opportunity_insights) && (
                          <>
                            <Separator />
                            <div>
                              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Market</h3>
                              <div className="space-y-4">
                                {activeBrief.market_summary && (
                                  <div>
                                    <p className="text-[11px] text-gray-400 mb-1">Market summary</p>
                                    <p className="text-xs text-gray-700 leading-relaxed">{activeBrief.market_summary}</p>
                                  </div>
                                )}
                                {activeBrief.opportunity_insights && (
                                  <div>
                                    <p className="text-[11px] text-gray-400 mb-1">Opportunity insights</p>
                                    <p className="text-xs text-gray-700 leading-relaxed">{activeBrief.opportunity_insights}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                        {(activeBrief.manufacturing_notes || activeBrief.regulatory_notes || activeBrief.packaging_recommendations) && (
                          <>
                            <Separator />
                            <div>
                              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Manufacturing</h3>
                              <div className="space-y-4">
                                {activeBrief.manufacturing_notes && (
                                  <div>
                                    <p className="text-[11px] text-gray-400 mb-1">Manufacturing notes</p>
                                    <p className="text-xs text-gray-700 leading-relaxed">{activeBrief.manufacturing_notes}</p>
                                  </div>
                                )}
                                {activeBrief.regulatory_notes && (
                                  <div>
                                    <p className="text-[11px] text-gray-400 mb-1">Regulatory notes</p>
                                    <p className="text-xs text-gray-700 leading-relaxed">{activeBrief.regulatory_notes}</p>
                                  </div>
                                )}
                                {activeBrief.packaging_recommendations && (
                                  <div>
                                    <p className="text-[11px] text-gray-400 mb-1">Packaging recommendations</p>
                                    <p className="text-xs text-gray-700 leading-relaxed">{activeBrief.packaging_recommendations}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ) : null}
                  </>
                )}

                {/* ── FORMULA ── */}
                {activeTab === "formula" && (
                  <div className="space-y-6 max-w-3xl">
                    {activeLiving ? (
                      <div>
                        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">
                          Formula — {activeLiving.change_summary ?? `MFR v${activeLiving.version_number}`}
                        </h3>
                        <SectionText text={activeLiving.formula_brief_content} fallback="No formula content." />
                      </div>
                    ) : activeBrief ? (() => {
                      const { adjusted, grok, claude } = getFormulaText(activeBrief);
                      return (
                        <>
                          {adjusted ? (
                            <div>
                              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Final Formula (Post-QA)</h3>
                              <SectionText text={adjusted} />
                            </div>
                          ) : null}
                          {grok ? (
                            <>
                              {adjusted && <Separator />}
                              <div>
                                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Grok 4.2 Draft</h3>
                                <SectionText text={grok} />
                              </div>
                            </>
                          ) : null}
                          {claude ? (
                            <>
                              {(adjusted || grok) && <Separator />}
                              <div>
                                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Claude Sonnet 4.6 Draft</h3>
                                <SectionText text={claude} />
                              </div>
                            </>
                          ) : null}
                          {!adjusted && !grok && !claude && (
                            <p className="text-sm text-gray-400 py-4">No formula data available.</p>
                          )}
                        </>
                      );
                    })() : null}
                  </div>
                )}

                {/* ── COMMENTS ── */}
                {activeTab === "comments" && (
                  <div className="max-w-2xl">
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
