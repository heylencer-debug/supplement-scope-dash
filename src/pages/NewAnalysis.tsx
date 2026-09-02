import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  FlaskConical,
  Library,
  Loader2,
  Package,
  Trash2,
  XCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PearlButton } from "@/components/ui/pearl-button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useRecentCategories,
  useCategorySignoffs,
  type CategoryWithImages,
} from "@/hooks/useCategoryAnalyses";
import { useDeleteCategory } from "@/hooks/useDeleteCategory";
import { useSubmitScoutJob, useActiveScoutJobs, useRerunFromPhase } from "@/hooks/useScoutJobs";
import { useAiUsageCost } from "@/hooks/useAiUsageCost";
import { humanizeJobError, deriveRetryPhase } from "@/lib/jobErrorMessages";
import { SCOUT_PHASE_NAMES, type ScoutJobRow } from "@/types/scoutJobs";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { BrandModal } from "@/components/ui/brand-modal";
import { cn } from "@/lib/utils";

const PENDING_ANALYSES_KEY = "pending_analyses";
const LIBRARY_PAGE_SIZE = 9;

/** Curated categories not yet analyzed — one-click starting points under the hero. */
const SUGGESTED_KEYWORDS = [
  "creatine gummies",
  "collagen powder",
  "beef organs capsules",
  "prenatal gummies",
  "lion's mane capsules",
  "magnesium spray",
];

const jobStatusMeta: Record<ScoutJobRow["status"], { label: string; icon: typeof Clock; className: string }> = {
  // Flask icon (2026-09-02) — the "starting up" amber treatment, distinct
  // from the spinning "Starting"/"Running" states below, so a fresh click
  // is visibly registered even before a Cloud Run execution claims it.
  queued: { label: "Queued", icon: FlaskConical, className: "bg-chart-2/10 text-chart-2 border-chart-2/20" },
  claimed: { label: "Starting", icon: Loader2, className: "bg-chart-2/10 text-chart-2 border-chart-2/20" },
  running: { label: "Running", icon: Loader2, className: "bg-primary/10 text-primary border-primary/20" },
  complete: { label: "Complete", icon: CheckCircle2, className: "bg-chart-4/10 text-chart-4 border-chart-4/20" },
  error: { label: "Failed", icon: XCircle, className: "bg-destructive/10 text-destructive border-destructive/20" },
};

/** Strips the same spreadsheet-import junk prefix the hooks already normalize on write. */
function stripLabel(name: string | null | undefined): string {
  return (name || "").replace(/^[=+\-'"\s]+/, "").trim();
}

/** Small muted cost badge text — "$0.02"/"$12.40". Null/undefined (pre-ledger runs, or the
 * migration not applied yet) renders nothing — never a fabricated "$0.00". */
function formatCost(cost: number | null | undefined): string | null {
  if (cost == null) return null;
  return cost < 0.01 && cost > 0 ? `<$0.01` : `$${cost.toFixed(2)}`;
}

/** Mid-phase sub-progress text — "37/140". Null/undefined (older runs from
 * before scout/migrations/008, or a phase that doesn't report sub-progress)
 * renders nothing — graceful, never a fabricated count. */
function formatSubProgress(progress: { done: number; total: number } | null | undefined): string | null {
  if (!progress || !progress.total) return null;
  return `${progress.done}/${progress.total}`;
}

/** Subtle "last activity Xs ago" affordance for the live strip — cheap
 * reassurance that a long-running phase (P1/P4/P6, 20-40min with no phase
 * transition) is still alive, not frozen. Seconds precision under a minute
 * (the strip refetches every 5s), falls back to date-fns' relative format
 * beyond that. Null when updated_at is missing. */
function formatLastActivity(updatedAt: string | null | undefined): string | null {
  if (!updatedAt) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(updatedAt).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return formatDistanceToNow(new Date(updatedAt), { addSuffix: true });
}

function StatusChip({ cat, isSignedOff }: { cat: CategoryWithImages; isSignedOff: boolean }) {
  if (isSignedOff) {
    return (
      <Badge variant="outline" className="text-xs shrink-0 gap-1 bg-chart-4/10 text-chart-4 border-chart-4/20">
        <Check className="h-3 w-3" strokeWidth={3} />
        Signed off ✓
      </Badge>
    );
  }

  // Fall back to the real latest scout_jobs status for this category's keyword.
  if (cat.job_status && jobStatusMeta[cat.job_status]) {
    const meta = jobStatusMeta[cat.job_status];
    const StatusIcon = meta.icon;
    return (
      <Badge variant="outline" className={`text-xs shrink-0 gap-1 ${meta.className}`}>
        <StatusIcon className={`h-3 w-3 ${cat.job_status === "running" || cat.job_status === "claimed" ? "animate-spin" : ""}`} />
        {meta.label}
      </Badge>
    );
  }

  // Legacy fallback for categories with no matching scout_jobs row.
  const isComplete = cat.total_products && cat.total_products > 0;
  const recencyAt = cat.updated_at ? new Date(cat.updated_at) : null;
  const hoursSinceActivity = recencyAt ? (Date.now() - recencyAt.getTime()) / (1000 * 60 * 60) : 0;
  const isCancelled = !isComplete && hoursSinceActivity > 12;

  if (isComplete) {
    return (
      <Badge variant="outline" className="text-xs shrink-0 bg-chart-4/10 text-chart-4 border-chart-4/20">
        Complete
      </Badge>
    );
  }
  if (isCancelled) {
    return (
      <Badge variant="outline" className="text-xs shrink-0 bg-destructive/10 text-destructive border-destructive/20">
        Cancelled
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs shrink-0 bg-chart-2/10 text-chart-2 border-chart-2/20">
      Processing
    </Badge>
  );
}

/**
 * RetryFromFailureButton — the Library card's one-click recovery action
 * (2026-09-02 UX pass), so a failed run can be retried without navigating
 * into the category dashboard and finding the right per-phase icon. Only
 * ever mounted for cards whose latest job actually errored (see
 * CategoryCard below), so the extra useAiUsageCost query this needs for the
 * cost estimate stays scoped to just the failed handful, not every card in
 * the grid. Reuses the SAME useRerunFromPhase mutation (and therefore the
 * SAME keyword-resolution + base-run scope-inheritance fixes) the dashboard
 * button uses — no parallel implementation to drift out of sync.
 */
function RetryFromFailureButton({
  cat,
  onQueued,
}: {
  cat: CategoryWithImages;
  onQueued: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const rerun = useRerunFromPhase();
  const { data: aiCost } = useAiUsageCost(cat.id);
  const retryPhase = deriveRetryPhase({
    error: cat.job_error,
    current_phase: cat.job_current_phase,
    from_phase: cat.job_from_phase,
  });
  const estimatedCost = (aiCost?.breakdown ?? [])
    .filter((r) => {
      const n = parseInt(r.phase.replace(/^P/i, ""), 10);
      return Number.isFinite(n) && n >= retryPhase;
    })
    .reduce((sum, r) => sum + (r.cost_usd || 0), 0);

  return (
    <>
      <PearlButton
        className="!text-[11px] !px-2.5 !py-1"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmOpen(true);
        }}
      >
        Retry from P{retryPhase}
      </PearlButton>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Retry from P{retryPhase} — {SCOUT_PHASE_NAMES[retryPhase] ?? `Phase ${retryPhase}`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>
                  Picks up at P{retryPhase} for "{stripLabel(cat.name)}" — earlier phases are left
                  untouched. If there still isn't enough data to continue, we'll automatically stop
                  early again instead of spending on a run that can't finish.
                </p>
                <p className="font-medium text-foreground">
                  {estimatedCost > 0
                    ? `Estimated cost: ~$${estimatedCost.toFixed(2)} (based on what this category has cost before for this step onward)`
                    : "No cost history for this range yet — this step may not use paid AI calls, or this category hasn't run before."}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={rerun.isPending}
              onClick={(e) => {
                e.stopPropagation();
                rerun.mutate({ categoryId: cat.id, fromPhase: retryPhase });
                setConfirmOpen(false);
                onQueued();
              }}
            >
              {rerun.isPending ? "Queuing…" : "Retry"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface CategoryCardProps {
  cat: CategoryWithImages;
  isSignedOff: boolean;
  onOpen: (categoryName: string) => void;
  onDelete: (e: React.MouseEvent, cat: CategoryWithImages) => void;
  onCopyAsins: (e: React.MouseEvent, categoryId: string) => void;
  onRetryQueued: () => void;
  deletePending: boolean;
}

function CategoryCard({ cat, isSignedOff, onOpen, onDelete, onCopyAsins, onRetryQueued, deletePending }: CategoryCardProps) {
  const images = cat.product_images ?? [];
  const overflowCount = Math.max(0, (cat.total_products ?? 0) - images.length);
  const scoreLabel = cat.opportunity_score != null ? `${cat.opportunity_score.toFixed(1)}/10` : "—";
  const isFailed = cat.job_status === "error";
  const humanizedError = isFailed ? humanizeJobError(cat.job_error) : null;

  return (
    <div
      onClick={() => onOpen(cat.name)}
      className="group relative rounded-xl border border-border/60 bg-card p-4 cursor-pointer transition-colors hover:border-primary/40"
    >
      {/* Action buttons */}
      <div className="absolute top-2.5 right-2.5 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => onCopyAsins(e, cat.id)}
          title="Copy ASINs"
        >
          <ClipboardCopy className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 hover:text-destructive"
          onClick={(e) => onDelete(e, cat)}
          disabled={deletePending}
          title="Delete category"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      <div className="flex items-start justify-between gap-2 pr-12">
        <h3 className="font-semibold text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors">
          {cat.name}
        </h3>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <StatusChip cat={cat} isSignedOff={isSignedOff} />
        {cat.job_is_test && (
          <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wide px-1 py-0 shrink-0 bg-chart-2/10 text-chart-2 border-chart-2/20">
            Test
          </Badge>
        )}
      </div>

      {/* Friendly failure line + one-click retry (2026-09-02) — plain-language
          title only here (space is tight); the full explanation + technical
          details live on the dashboard's PipelineStatus banner. */}
      {isFailed && humanizedError && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] text-destructive/90 line-clamp-1">{humanizedError.title}</p>
          <div onClick={(e) => e.stopPropagation()} className="shrink-0">
            <RetryFromFailureButton cat={cat} onQueued={onRetryQueued} />
          </div>
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
        {(cat.total_products || 0).toLocaleString()} products · {scoreLabel}
        {cat.updated_at && ` · ${formatDistanceToNow(new Date(cat.updated_at), { addSuffix: true })}`}
        {formatCost(cat.job_cost_usd) && ` · ${formatCost(cat.job_cost_usd)}`}
      </p>

      {images.length > 0 ? (
        <div className="mt-3 flex -space-x-2">
          {images.slice(0, 4).map((img, idx) => (
            <div
              key={idx}
              className="h-7 w-7 rounded-md ring-2 ring-card bg-muted overflow-hidden shrink-0"
            >
              <img src={img} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
          {overflowCount > 0 && (
            <div className="h-7 w-7 rounded-md ring-2 ring-card bg-muted shrink-0 flex items-center justify-center text-[10px] font-bold text-muted-foreground">
              +{overflowCount}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 text-muted-foreground/60">
          <Package className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

export default function NewAnalysis() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Command bar submission -> scout_jobs cloud queue (unchanged flow).
  const [keywordInput, setKeywordInput] = useState("");
  // 2026-09-01: default submit = research scope only (P1-P8); the formula
  // chain (brief/QA/benchmarking/compliance/sign-off) runs on-demand via
  // "Generate formula brief" on the category dashboard. This toggle opts
  // back into the old "everything in one go" behavior. Default OFF.
  const [fullAnalysis, setFullAnalysis] = useState(false);
  const submitScoutJob = useSubmitScoutJob();
  const { data: activeJobs } = useActiveScoutJobs();

  // Scroll-to/flash the Live Strip on a successful queue click (2026-09-02
  // UX fix) — a toast alone was too easy to miss ("that's not very UX
  // friendly" feedback after the user's first real "Rerun from P3" click).
  // Used by RetryFromFailureButton on Library cards below; PipelineStatus's
  // own dashboard-page rerun doesn't need this — it renders its own inline
  // "Queued — starting up…" banner instead, since there's no strip on that page.
  const stripRef = useRef<HTMLDivElement>(null);
  const [stripFlash, setStripFlash] = useState(false);
  const scrollToStripAndFlash = () => {
    stripRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setStripFlash(true);
    window.setTimeout(() => setStripFlash(false), 1600);
  };

  // Library: "Load more" instead of numbered pagination, same underlying
  // useRecentCategories hook — bumping its limit re-queries for more rows.
  const [visibleCount, setVisibleCount] = useState(LIBRARY_PAGE_SIZE);
  const { data: recentCategories, isLoading: categoriesLoading } = useRecentCategories(visibleCount);
  const { data: signedOffIds } = useCategorySignoffs();

  const { data: totalCategoryCount } = useQuery({
    queryKey: ["categories_total_count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("categories").select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  // Delete dialog state
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryWithImages | null>(null);
  const deleteCategory = useDeleteCategory();

  // useRecentCategories already dedupes case-insensitively (junk-stripped
  // name, keeping the richest sibling) and sorts by real recency.
  const uniqueCategories = recentCategories ?? [];
  const hasMore = uniqueCategories.length >= visibleCount;

  // Ref-based lock: isPending updates async, so two rapid Enters could both
  // pass the check and double-queue (observed live: two identical jobs).
  const submittingRef = useRef(false);
  const handleSubmitKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = keywordInput.trim();
    if (!keyword || submitScoutJob.isPending || submittingRef.current) return;
    submittingRef.current = true;
    try {
      await submitScoutJob.mutateAsync({ keyword, fullAnalysis });
      setKeywordInput("");
    } catch {
      /* toast shown by the hook */
    } finally {
      submittingRef.current = false;
    }
  };

  const handleSuggestionClick = (keyword: string) => {
    setKeywordInput(keyword);
    inputRef.current?.focus();
  };

  const handleAnalysisClick = (categoryName: string) => {
    const pending = JSON.parse(localStorage.getItem(PENDING_ANALYSES_KEY) || "[]");
    const alreadyPending = pending.some((p: { categoryName: string }) => p.categoryName === categoryName);

    if (!alreadyPending) {
      pending.push({
        categoryName,
        startedAt: new Date().toISOString(),
      });
      localStorage.setItem(PENDING_ANALYSES_KEY, JSON.stringify(pending));
      window.dispatchEvent(new Event("newAnalysisAdded"));
    }

    navigate(`/dashboard?category=${encodeURIComponent(categoryName)}`);
  };

  const handleDeleteClick = (e: React.MouseEvent, cat: CategoryWithImages) => {
    e.stopPropagation();
    setCategoryToDelete(cat);
  };

  const confirmDelete = async () => {
    if (categoryToDelete) {
      await deleteCategory.mutateAsync(categoryToDelete.id);
      setCategoryToDelete(null);
    }
  };

  const handleCopyAsins = async (e: React.MouseEvent, categoryId: string) => {
    e.stopPropagation();

    try {
      const { data, error } = await supabase
        .from("products")
        .select("asin")
        .eq("category_id", categoryId);

      if (error) throw error;

      const asins = data
        .map((p) => p.asin)
        .filter((asin): asin is string => !!asin);

      if (asins.length === 0) {
        toast({
          title: "No ASINs found",
          description: "This category has no products with ASINs.",
          variant: "destructive",
        });
        return;
      }

      await navigator.clipboard.writeText(asins.join(", "));

      toast({
        title: "ASINs copied!",
        description: `${asins.length} ASIN${asins.length !== 1 ? "s" : ""} copied to clipboard.`,
      });
    } catch (error) {
      console.error("Failed to copy ASINs:", error);
      toast({
        title: "Error",
        description: "Failed to copy ASINs.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* HERO — command-bar */}
      <section className="pt-4 pb-2 sm:pt-8 text-center">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground text-balance">
            Analyze any supplement category
          </h1>
          <p className="mt-2 text-[13px] sm:text-sm text-muted-foreground">
            Research scope by default (8 phases: scraping + market intelligence) · flip on Full analysis for formulation, QA, compliance & sign-off too
          </p>

          <form
            onSubmit={handleSubmitKeyword}
            // Click anywhere on the pill → focus the input; focus state is a
            // calm border-tint + soft glow (the old ring-2 + ring-offset-2
            // drew a jumpy double-halo around the pill on every click).
            onClick={() => inputRef.current?.focus()}
            className="mt-6 flex items-center gap-1.5 rounded-full border border-border bg-card pl-5 pr-1.5 py-1.5 shadow-sm cursor-text transition-[border-color,box-shadow] duration-150 focus-within:border-primary/40 focus-within:shadow-[0_4px_20px_-4px_hsl(var(--primary)/0.25)]"
          >
            <Input
              ref={inputRef}
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="e.g. creatine gummies, beef liver capsules, magnesium spray…"
              disabled={submitScoutJob.isPending}
              className="h-9 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            {/* The one deliberate neon accent on this page — native <button>,
                never shadcn Button (its cva always injects a base
                pearl-button/pearl-quiet class that collides with the
                `:not(.pearl-neon)` exclusions the neon tier depends on). */}
            {/* Pearl CTA PRIMARY (user directive) — the real glossy
                .pearl-button via the PearlButton component. */}
            <PearlButton
              type="submit"
              disabled={!keywordInput.trim() || submitScoutJob.isPending}
              className="shrink-0 whitespace-nowrap"
            >
              {submitScoutJob.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  Analyze
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </>
              )}
            </PearlButton>
          </form>

          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
            {SUGGESTED_KEYWORDS.map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => handleSuggestionClick(kw)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/30"
              >
                {kw}
              </button>
            ))}
          </div>

          {/* 2026-09-01: research-scope-by-default toggle. Default run is P1-P8
              (scraping through Packaging Intelligence) — the formula chain
              (brief/QA/benchmarking/compliance/sign-off) is queued separately
              via "Generate formula brief" on the category dashboard once
              research is in. Flip this ON for the old one-shot behavior. */}
          <div className="mt-3 flex items-center justify-center gap-2">
            <Switch
              id="full-analysis-toggle"
              checked={fullAnalysis}
              onCheckedChange={setFullAnalysis}
              className="scale-90"
            />
            <label htmlFor="full-analysis-toggle" className="text-xs text-muted-foreground cursor-pointer select-none">
              Full analysis (includes formula brief, QA, benchmarking, compliance & sign-off)
            </label>
          </div>
        </div>
      </section>

      {/* LIVE STRIP — ref + flash ring so a retry click elsewhere on this page
          (a failed Library card's "Retry from P<n>") can scroll here and
          draw the eye, in case the toast alone is too quick to notice
          (2026-09-02 UX fix, direct user feedback). */}
      <div
        ref={stripRef}
        className={cn(
          "w-full rounded-xl border border-border/60 bg-card px-4 py-2.5 overflow-x-auto scrollbar-hide transition-shadow duration-300",
          stripFlash && "ring-2 ring-chart-2 ring-offset-2 ring-offset-background"
        )}
      >
        {activeJobs && activeJobs.length > 0 ? (
          <div className="flex items-center gap-4 text-[13px] w-max">
            {activeJobs.map((job) => {
              // Guard against stale/bogus scout_jobs.total_phases values —
              // fall back to the real 12-phase pipeline whenever the stored
              // value is missing or smaller than the current phase.
              const totalPhases =
                job.total_phases && job.total_phases >= (job.current_phase ?? 0) ? job.total_phases : 12;
              const phaseLabel =
                job.current_phase_name ?? (job.current_phase ? SCOUT_PHASE_NAMES[job.current_phase] : null);
              // Queued-but-unclaimed gets its own amber/flask treatment,
              // distinct from the green "in progress" pulse — a fresh click
              // must look visibly different from "nothing changed" the
              // instant it lands, not just once a Cloud Run execution claims
              // it a minute or two later.
              const isQueued = job.status === "queued";

              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => handleAnalysisClick(job.keyword)}
                  className="flex items-center gap-2 shrink-0 rounded-full px-1.5 py-0.5 transition-colors hover:bg-muted/60"
                >
                  {isQueued ? (
                    <FlaskConical className="h-3.5 w-3.5 shrink-0 text-chart-2 animate-pulse" />
                  ) : (
                    <span className="relative flex h-[7px] w-[7px] shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-chart-2 opacity-75" />
                      <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-chart-2" />
                    </span>
                  )}
                  <span className="font-semibold text-foreground">{stripLabel(job.keyword)}</span>
                  {job.cheap_mode && (
                    <span className="rounded border border-chart-2/30 bg-chart-2/10 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-chart-2">
                      Test
                    </span>
                  )}
                  {isQueued ? (
                    <span className="text-chart-2 font-medium">Queued — starting up…</span>
                  ) : (
                    <>
                      {phaseLabel && <span className="text-muted-foreground">· {phaseLabel}</span>}
                      {job.current_phase != null && (
                        <span className="text-muted-foreground tabular-nums">
                          ({job.current_phase}/{totalPhases})
                        </span>
                      )}
                    </>
                  )}
                  {formatSubProgress(job.phase_progress) && (
                    <span className="text-muted-foreground/80 tabular-nums text-[11px]">
                      {formatSubProgress(job.phase_progress)}
                    </span>
                  )}
                  {formatCost(job.total_cost_usd) && (
                    <span className="text-muted-foreground/70 tabular-nums text-[11px]">{formatCost(job.total_cost_usd)}</span>
                  )}
                  {formatLastActivity(job.updated_at) && (
                    <span className="text-muted-foreground/50 text-[10px]">{formatLastActivity(job.updated_at)}</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Nothing running · {(totalCategoryCount ?? uniqueCategories.length).toLocaleString()} categories analyzed
          </p>
        )}
      </div>

      {/* LIBRARY */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Library className="w-4 h-4 text-muted-foreground" />
          Library
          <span className="font-normal text-muted-foreground tabular-nums">
            {(totalCategoryCount ?? uniqueCategories.length).toLocaleString()}
          </span>
        </h2>

        {categoriesLoading && !recentCategories ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        ) : uniqueCategories.length === 0 ? (
          <p className="text-muted-foreground text-center py-10 text-sm">
            No categories yet. Analyze one above to get started.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {uniqueCategories.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  cat={cat}
                  isSignedOff={!!signedOffIds?.has(cat.id)}
                  onOpen={handleAnalysisClick}
                  onDelete={handleDeleteClick}
                  onCopyAsins={handleCopyAsins}
                  onRetryQueued={scrollToStripAndFlash}
                  deletePending={deleteCategory.isPending}
                />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center pt-1">
                <Button variant="secondary" onClick={() => setVisibleCount((v) => v + LIBRARY_PAGE_SIZE)}>
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Delete Confirmation Dialog */}
      <BrandModal
        open={!!categoryToDelete}
        onOpenChange={(open) => !open && setCategoryToDelete(null)}
        size="sm"
        icon={<Trash2 className="h-5 w-5" />}
        title="Delete Category"
        description={`Are you sure you want to delete "${categoryToDelete?.name ?? ""}"?`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setCategoryToDelete(null)}
              disabled={deleteCategory.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              className="text-destructive"
              onClick={confirmDelete}
              disabled={deleteCategory.isPending}
            >
              {deleteCategory.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">This will permanently remove:</p>
        <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-muted-foreground">
          <li>All products ({categoryToDelete?.total_products || 0})</li>
          <li>All reviews and analysis data</li>
          <li>Formula briefs and recommendations</li>
        </ul>
      </BrandModal>
    </div>
  );
}
