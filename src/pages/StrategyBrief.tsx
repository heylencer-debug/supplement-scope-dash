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
import { ManufacturerFeedback } from "@/components/document/ManufacturerFeedback";
import { FloatingChatButton } from "@/components/ui/floating-chat-button";
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

  const {
    versions,
    activeVersion,
    setActiveVersion,
    isLoading: versionsLoading
  } = useFormulaBriefVersions(effectiveCategoryId);

  const isLoading = categoryLoading || analysisLoading;

  const formulaBriefContent = useMemo(() => {
    if (activeVersion) {
      return activeVersion.formula_brief_content;
    }
    const ingredients = (analysis as any)?.ingredients;
    return ingredients?.final_formula_brief
      || ingredients?.adjusted_formula
      || null;
  }, [analysis, activeVersion]);

  const handleVersionSelect = async (versionId: string | null) => {
    await setActiveVersion(versionId);
  };

  const handleCopyToClipboard = async () => {
    if (!formulaBriefContent) return;
    await navigator.clipboard.writeText(formulaBriefContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => window.print();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading formula brief...</div>
      </div>
    );
  }

  if (!categoryName) {
    return (
      <div className="max-w-2xl mx-auto py-20 flex flex-col items-center justify-center space-y-6 text-center">
        <div className="p-4 rounded-full bg-primary/10">
          <FileText className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground">Strategy Brief</h1>
        <p className="text-muted-foreground text-lg">Select a category to view its formula brief.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 print:hidden">
        <div className="max-w-[800px] mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="font-semibold text-sm truncate">{categoryName}</h1>
              <p className="text-xs text-muted-foreground">Formula Strategy Brief</p>
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
        <div className="max-w-[800px] mx-auto px-4 pb-4">
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

      {effectiveCategoryId && categoryName && !isLoading && (
        <div className="max-w-[800px] mx-auto px-4 pb-8">
          <ManufacturerFeedback
            categoryId={effectiveCategoryId}
            keyword={categoryName}
          />
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
              onVersionCreated={() => {}}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Floating Chat Button */}
      <FloatingChatButton
        onClick={() => setChatOpen(true)}
        show={!!formulaBriefContent && !isLoading}
        icon={<MessageSquare className="h-6 w-6" />}
      />
    </div>
  );
}
