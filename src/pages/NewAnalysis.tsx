import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, ClipboardCopy, FileText, Loader2, Package, Trash2, Send, AlertCircle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useRecentCategories, CategoryWithImages } from "@/hooks/useCategoryAnalyses";
import { useDeleteCategory } from "@/hooks/useDeleteCategory";
import { useSubmitScoutJob, useScoutJobs } from "@/hooks/useScoutJobs";
import { SCOUT_PHASE_NAMES, type ScoutJobRow } from "@/types/scoutJobs";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { BrandModal } from "@/components/ui/brand-modal";

const PENDING_ANALYSES_KEY = "pending_analyses";

export default function NewAnalysis() {
  const { toast } = useToast();
  const navigate = useNavigate();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Delete dialog state
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryWithImages | null>(null);
  const deleteCategory = useDeleteCategory();

  const { data: recentCategories, isLoading: categoriesLoading } = useRecentCategories();

  // New keyword submission -> scout_jobs cloud queue
  const [keywordInput, setKeywordInput] = useState("");
  const submitScoutJob = useSubmitScoutJob();
  const { data: scoutJobs } = useScoutJobs();

  const handleSubmitKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = keywordInput.trim();
    if (!keyword || submitScoutJob.isPending) return;
    await submitScoutJob.mutateAsync({ keyword });
    setKeywordInput("");
  };

  const jobStatusMeta: Record<ScoutJobRow["status"], { label: string; icon: typeof Clock; className: string }> = {
    queued: { label: "Queued", icon: Clock, className: "bg-chart-2/10 text-chart-2 border-chart-2/20" },
    claimed: { label: "Starting", icon: Loader2, className: "bg-chart-2/10 text-chart-2 border-chart-2/20" },
    running: { label: "Running", icon: Loader2, className: "bg-primary/10 text-primary border-primary/20" },
    complete: { label: "Complete", icon: CheckCircle2, className: "bg-chart-4/10 text-chart-4 border-chart-4/20" },
    error: { label: "Failed", icon: XCircle, className: "bg-destructive/10 text-destructive border-destructive/20" },
  };

  const activeOrRecentJobs = (scoutJobs ?? []).slice(0, 5);

  // useRecentCategories already dedupes case-insensitively (junk-stripped
  // name, keeping the richest sibling) and sorts by real recency — no
  // further client-side reduce needed here.
  const uniqueCategories = recentCategories ?? [];

  // Pagination calculations
  const totalPages = Math.ceil(uniqueCategories.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCategories = uniqueCategories.slice(startIndex, startIndex + itemsPerPage);

  const handleAnalysisClick = (categoryName: string) => {
    const pending = JSON.parse(localStorage.getItem(PENDING_ANALYSES_KEY) || '[]');
    const alreadyPending = pending.some((p: { categoryName: string }) => p.categoryName === categoryName);

    if (!alreadyPending) {
      pending.push({
        categoryName,
        startedAt: new Date().toISOString()
      });
      localStorage.setItem(PENDING_ANALYSES_KEY, JSON.stringify(pending));
      window.dispatchEvent(new Event('newAnalysisAdded'));
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
      if (paginatedCategories.length === 1 && currentPage > 1) {
        setCurrentPage(currentPage - 1);
      }
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
        .map(p => p.asin)
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
        description: `${asins.length} ASIN${asins.length !== 1 ? 's' : ''} copied to clipboard.`,
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
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="space-y-1 pb-3 border-b border-border/60">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Market Analysis</h1>
        <p className="text-[13px] text-muted-foreground">
          View and navigate your analyzed supplement categories
        </p>
      </div>

      {/* New Keyword Submission -> Scout cloud queue */}
      <Panel>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-foreground mb-0.5">New Keyword Research via Scout</p>
              <p className="text-[13px] text-muted-foreground">
                Submit a keyword to queue a full Scout pipeline run (Amazon scrape → Keepa → reviews → OCR →
                deep research → formula brief → QA → benchmarking → FDA compliance).
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmitKeyword} className="flex gap-2">
            <Input
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              placeholder="e.g. Ashwagandha Gummies"
              disabled={submitScoutJob.isPending}
              className="bg-background"
            />
            <Button type="submit" disabled={!keywordInput.trim() || submitScoutJob.isPending} className="shrink-0">
              {submitScoutJob.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Queue Analysis
            </Button>
          </form>

          {/* Recent/active queue status */}
          {activeOrRecentJobs.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-primary/10">
              {activeOrRecentJobs.map((job) => {
                const meta = jobStatusMeta[job.status] ?? jobStatusMeta.queued;
                const StatusIcon = meta.icon;
                // Guard against stale/bogus scout_jobs.total_phases values
                // (seen live as literally 2 while current_phase was 9) —
                // fall back to the real 12-phase pipeline whenever the
                // stored value is missing or smaller than the current phase.
                const totalPhases =
                  job.total_phases && job.total_phases >= (job.current_phase ?? 0)
                    ? job.total_phases
                    : 12;
                const phaseLabel =
                  job.current_phase_name ??
                  (job.current_phase ? SCOUT_PHASE_NAMES[job.current_phase] : null);
                const inFlight = job.status === "queued" || job.status === "claimed" || job.status === "running";

                return (
                  <div
                    key={job.id}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-background/60 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{job.keyword}</span>
                        <Badge variant="outline" className={`text-xs shrink-0 gap-1 ${meta.className}`}>
                          <StatusIcon className={`w-3 h-3 ${job.status === "running" || job.status === "claimed" ? "animate-spin" : ""}`} />
                          {meta.label}
                        </Badge>
                      </div>
                      {job.status === "running" && job.current_phase != null && (
                        <div className="mt-1 space-y-1">
                          <p className="text-xs text-muted-foreground">
                            Phase {job.current_phase}/{totalPhases}
                            {phaseLabel ? ` — ${phaseLabel}` : ""}
                          </p>
                          <Progress value={(job.current_phase / totalPhases) * 100} className="h-1.5" />
                        </div>
                      )}
                      {job.status === "error" && job.error && (
                        <p className="mt-1 text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          {job.error}
                        </p>
                      )}
                      {!inFlight && job.status !== "error" && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(job.updated_at), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Panel>

      {/* Recently Analyzed Categories */}
      <Panel>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[13px] font-semibold">
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
            Recently Analyzed Categories
          </CardTitle>
          <CardDescription>
            Click to view the full analysis dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {categoriesLoading && !recentCategories ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48 w-full rounded-xl" />
              ))}
            </div>
          ) : uniqueCategories.length === 0 ? (
            <p className="text-muted-foreground text-center py-10">
              No categories yet. Contact your research agent to start a new analysis.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {paginatedCategories.map((cat) => (
                  <div
                    key={cat.id}
                    onClick={() => handleAnalysisClick(cat.name)}
                    className="group relative overflow-hidden rounded-xl border bg-card hover:border-primary/50 cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
                  >
                    {/* Action Buttons */}
                    <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 backdrop-blur-sm"
                        onClick={(e) => handleCopyAsins(e, cat.id)}
                        title="Copy ASINs"
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 backdrop-blur-sm hover:text-destructive"
                        onClick={(e) => handleDeleteClick(e, cat)}
                        disabled={deleteCategory.isPending}
                        title="Delete category"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Product Images Grid */}
                    <div className="grid grid-cols-2 gap-0.5 h-32 bg-muted/50">
                      {cat.product_images && cat.product_images.length > 0 ? (
                        cat.product_images.slice(0, 4).map((img, idx) => (
                          <div key={idx} className="relative overflow-hidden bg-background">
                            <img
                              src={img}
                              alt=""
                              className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                        ))
                      ) : (
                        <div className="col-span-2 flex items-center justify-center text-muted-foreground">
                          <Package className="w-8 h-8" />
                        </div>
                      )}
                      {cat.product_images && cat.product_images.length > 0 && cat.product_images.length < 4 && (
                        Array.from({ length: 4 - cat.product_images.length }).map((_, idx) => (
                          <div key={`empty-${idx}`} className="bg-muted/30" />
                        ))
                      )}
                    </div>

                    {/* Card Content */}
                    <div className="p-5 space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                          {cat.name}
                        </h3>
                        {(() => {
                          // Prefer the real latest scout_jobs status for this
                          // category's keyword over a hardcoded/heuristic badge.
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

                          // Legacy fallback for categories with no matching
                          // scout_jobs row (pre-dates the cloud job queue).
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
                          } else if (isCancelled) {
                            return (
                              <Badge variant="outline" className="text-xs shrink-0 bg-destructive/10 text-destructive border-destructive/20">
                                Cancelled
                              </Badge>
                            );
                          } else {
                            return (
                              <Badge variant="outline" className="text-xs shrink-0 bg-chart-2/10 text-chart-2 border-chart-2/20">
                                Processing
                              </Badge>
                            );
                          }
                        })()}
                      </div>

                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Package className="w-3.5 h-3.5" />
                          <span>{cat.total_products || 0} products</span>
                        </div>
                        {cat.updated_at && (
                          <span className="text-xs">
                            {formatDistanceToNow(new Date(cat.updated_at), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-foreground/[0.03] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, uniqueCategories.length)} of {uniqueCategories.length} categories
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "ghost"}
                          size="icon"
                          className="w-8 h-8"
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </Button>
                      ))}
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Panel>

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
