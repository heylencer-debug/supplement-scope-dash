import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, ClipboardCopy, FileText, Loader2, Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useRecentCategories, CategoryWithImages } from "@/hooks/useCategoryAnalyses";
import { useDeleteCategory } from "@/hooks/useDeleteCategory";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

  // Get unique categories by name (most recent first)
  const uniqueCategories = recentCategories?.reduce((acc, cat) => {
    if (!acc.find(a => a.name === cat.name)) {
      acc.push(cat);
    }
    return acc;
  }, [] as CategoryWithImages[]) ?? [];

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
    <div className="max-w-4xl mx-auto space-y-10">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold text-foreground">Market Analysis</h1>
        <p className="text-muted-foreground">
          View and navigate your analyzed supplement categories
        </p>
      </div>

      {/* Scout Notice */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-full bg-primary/10 shrink-0">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">New Keyword Research via Scout</p>
              <p className="text-sm text-muted-foreground">
                New keyword research is powered by Scout. Contact your research agent to analyze a new keyword.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recently Analyzed Categories */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-4 h-4 text-primary" />
            Recently Analyzed Categories
          </CardTitle>
          <CardDescription>
            Click to view the full analysis dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {categoriesLoading && !recentCategories ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedCategories.map((cat) => (
                  <div
                    key={cat.id}
                    onClick={() => handleAnalysisClick(cat.name)}
                    className="group relative overflow-hidden rounded-xl border bg-card hover:border-primary/50 cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
                  >
                    {/* Action Buttons */}
                    <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-background/80 backdrop-blur-sm hover:bg-primary hover:text-primary-foreground"
                        onClick={(e) => handleCopyAsins(e, cat.id)}
                        title="Copy ASINs"
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7 bg-background/80 backdrop-blur-sm hover:bg-destructive hover:text-destructive-foreground"
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
                          const isComplete = cat.total_products && cat.total_products > 0;
                          const createdAt = cat.created_at ? new Date(cat.created_at) : null;
                          const hoursSinceCreation = createdAt ? (Date.now() - createdAt.getTime()) / (1000 * 60 * 60) : 0;
                          const isCancelled = !isComplete && hoursSinceCreation > 12;

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
                        {cat.created_at && (
                          <span className="text-xs">
                            {formatDistanceToNow(new Date(cat.created_at), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
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
                      variant="outline"
                      size="sm"
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
                          size="sm"
                          className="w-8 h-8 p-0"
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </Button>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
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
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <span className="font-semibold">"{categoryToDelete?.name}"</span>?
              <br /><br />
              This will permanently remove:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>All products ({categoryToDelete?.total_products || 0})</li>
                <li>All reviews and analysis data</li>
                <li>Formula briefs and recommendations</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCategory.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteCategory.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCategory.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
