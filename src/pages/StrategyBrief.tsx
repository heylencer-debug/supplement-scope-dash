import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileText, Copy, Check, Printer, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useCategoryAnalysis } from "@/hooks/useCategoryAnalyses";
import { useCategoryContext } from "@/contexts/CategoryContext";
import { useCategoryByName } from "@/hooks/useCategoryByName";
import { useFormulaBriefVersions } from "@/hooks/useFormulaBriefVersions";
import { DocumentContainer } from "@/components/document/DocumentContainer";
import { VersionSelector } from "@/components/document/VersionSelector";
import { FormulaChat } from "@/components/document/FormulaChat";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface FormulaBriefContent {
  formula_brief_content?: string;
}

export default function StrategyBrief() {
  const [searchParams] = useSearchParams();
  const rawUrlCategoryName = searchParams.get("category");
  const urlCategoryName = rawUrlCategoryName ? rawUrlCategoryName.replace(/^=+/, "").trim() : null;
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  
  const { currentCategoryId, categoryName: contextCategoryName, setCategoryContext } = useCategoryContext();
  const categoryName = urlCategoryName || contextCategoryName;
  
  const { data: categoryFromName, isLoading: categoryLoading } = useCategoryByName(
    categoryName && !currentCategoryId ? categoryName : undefined
  );

  useEffect(() => {
    if (categoryFromName && !currentCategoryId) {
      setCategoryContext(categoryFromName.id, categoryFromName.name);
    } else if (urlCategoryName && !currentCategoryId && !categoryFromName) {
      setCategoryContext(null, urlCategoryName);
    }
  }, [categoryFromName, currentCategoryId, urlCategoryName, setCategoryContext]);

  const effectiveCategoryId = currentCategoryId || categoryFromName?.id;
  const { data: analysis, isLoading: analysisLoading } = useCategoryAnalysis(effectiveCategoryId);
  
  // Formula version management
  const { 
    versions, 
    activeVersion, 
    setActiveVersion,
    isLoading: versionsLoading 
  } = useFormulaBriefVersions(effectiveCategoryId);

  const isLoading = categoryLoading || analysisLoading;

  // Get formula content - prioritize active version, fallback to original
  const formulaBriefContent = useMemo(() => {
    // If there's an active version, use it
    if (activeVersion) {
      return activeVersion.formula_brief_content;
    }
    
    // Otherwise, use original from analysis
    const analysis3 = analysis?.analysis_3_formula_brief as FormulaBriefContent | null;
    return analysis3?.formula_brief_content || null;
  }, [analysis, activeVersion]);

  const handleVersionSelect = async (versionId: string) => {
    if (versionId === "original") {
      // Deactivate all versions to show original
      if (activeVersion && effectiveCategoryId) {
        // Set all versions to inactive
        await supabase
          .from("formula_brief_versions")
          .update({ is_active: false })
          .eq("category_id", effectiveCategoryId);
        
        // Refetch to update UI
        window.location.reload();
      }
    } else {
      await setActiveVersion(versionId);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!formulaBriefContent) return;
    try {
      await navigator.clipboard.writeText(formulaBriefContent);
      setCopied(true);
      toast({ title: "Copied to clipboard", description: "The document content has been copied." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Unable to copy to clipboard.", variant: "destructive" });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!categoryName && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">No category selected. Start a new analysis to see the strategy brief.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 print:bg-white print:min-h-0">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border print:static print:border-0 print:bg-transparent">
        <div className="max-w-[800px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">Formula Strategy Brief</h1>
              <p className="text-xs text-muted-foreground">
                {categoryName || "Loading..."}
                {analysis?.created_at && <> • {new Date(analysis.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <VersionSelector
              versions={versions}
              activeVersion={activeVersion}
              onSelectVersion={handleVersionSelect}
              isLoading={versionsLoading}
              hasOriginal={!!formulaBriefContent}
            />
            <Button variant="outline" size="sm" className="gap-2" onClick={handleCopyToClipboard} disabled={!formulaBriefContent || isLoading}>
              {copied ? <><Check className="w-4 h-4" />Copied</> : <><Copy className="w-4 h-4" />Copy</>}
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint} disabled={!formulaBriefContent || isLoading}>
              <Printer className="w-4 h-4" />Print
            </Button>
            <Button 
              size="sm" 
              className="gap-2" 
              onClick={() => setChatOpen(true)}
              disabled={!formulaBriefContent || isLoading}
            >
              <MessageSquare className="w-4 h-4" />
              Modify with AI
            </Button>
          </div>
        </div>
      </div>
      <div className="py-8 px-4">
        <DocumentContainer content={formulaBriefContent} isLoading={isLoading} title={`Formula Strategy Brief - ${categoryName}`} />
      </div>
      {analysis && !isLoading && (
        <div className="max-w-[800px] mx-auto px-4 pb-8">
          <div className="text-center text-xs text-muted-foreground">
            <p>
              Analysis ID: {analysis.id?.slice(0, 8)}...
              {analysis.products_analyzed && ` • ${analysis.products_analyzed} products analyzed`}
              {analysis.reviews_analyzed && ` • ${analysis.reviews_analyzed.toLocaleString()} reviews analyzed`}
              {activeVersion && ` • Version ${activeVersion.version_number}`}
            </p>
          </div>
        </div>
      )}

      {/* AI Chat Panel */}
      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent side="right" className="w-full sm:w-[50vw] sm:max-w-[50vw] p-0">
          {effectiveCategoryId && formulaBriefContent && (
            <FormulaChat
              categoryId={effectiveCategoryId}
              currentFormula={formulaBriefContent}
              onClose={() => setChatOpen(false)}
              onVersionCreated={() => {
                // Chat will remain open, version selector will update automatically
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
