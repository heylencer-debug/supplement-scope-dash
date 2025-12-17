import { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { FileText, Download, Copy, Check, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCategoryAnalysis } from "@/hooks/useCategoryAnalyses";
import { useCategoryContext } from "@/contexts/CategoryContext";
import { useCategoryByName } from "@/hooks/useCategoryByName";
import { DocumentContainer } from "@/components/document/DocumentContainer";
import { useToast } from "@/hooks/use-toast";

interface FormulaBriefContent {
  formula_brief_content?: string;
}

export default function StrategyBrief() {
  const [searchParams] = useSearchParams();
  const rawUrlCategoryName = searchParams.get("category");
  const urlCategoryName = rawUrlCategoryName ? rawUrlCategoryName.replace(/^=+/, "").trim() : null;
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const documentRef = useRef<HTMLDivElement>(null);
  
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
  const isLoading = categoryLoading || analysisLoading;

  const formulaBriefContent = useMemo(() => {
    const analysis3 = analysis?.analysis_3_formula_brief as FormulaBriefContent | null;
    return analysis3?.formula_brief_content || null;
  }, [analysis]);

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

  const handleDownloadPDF = async () => {
    if (!formulaBriefContent) {
      toast({ title: "PDF not available", description: "No document content to export.", variant: "destructive" });
      return;
    }

    setGeneratingPdf(true);
    try {
      // Dynamic import to avoid React bundling conflicts
      const [{ pdf }, { StrategyBriefPDF }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/document/StrategyBriefPDF")
      ]);
      
      // Create React element using createElement since we can't use JSX here
      const { createElement } = await import("react");
      const pdfDocument = createElement(StrategyBriefPDF, {
        content: formulaBriefContent,
        categoryName: categoryName || 'Document',
        createdAt: analysis?.created_at || undefined
      });
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = await pdf(pdfDocument as any).toBlob();
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Formula-Strategy-Brief-${categoryName || 'Document'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast({ title: "PDF downloaded", description: "Your strategy brief has been saved as PDF." });
    } catch (err) {
      console.error('PDF generation error:', err);
      toast({ title: "PDF generation failed", description: "Unable to generate PDF. Please try again.", variant: "destructive" });
    } finally {
      setGeneratingPdf(false);
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
            <Button variant="outline" size="sm" className="gap-2" onClick={handleCopyToClipboard} disabled={!formulaBriefContent || isLoading}>
              {copied ? <><Check className="w-4 h-4" />Copied</> : <><Copy className="w-4 h-4" />Copy</>}
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint} disabled={!formulaBriefContent || isLoading}>
              <Printer className="w-4 h-4" />Print
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleDownloadPDF} disabled={isLoading || generatingPdf || !formulaBriefContent}>
              {generatingPdf ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
              ) : (
                <><Download className="w-4 h-4" />Download PDF</>
              )}
            </Button>
          </div>
        </div>
      </div>
      <div className="py-8 px-4">
        <div ref={documentRef}>
          <DocumentContainer content={formulaBriefContent} isLoading={isLoading} title={`Formula Strategy Brief - ${categoryName}`} />
        </div>
      </div>
      {analysis && !isLoading && (
        <div className="max-w-[800px] mx-auto px-4 pb-8">
          <div className="text-center text-xs text-muted-foreground">
            <p>Analysis ID: {analysis.id?.slice(0, 8)}...{analysis.products_analyzed && ` • ${analysis.products_analyzed} products analyzed`}{analysis.reviews_analyzed && ` • ${analysis.reviews_analyzed.toLocaleString()} reviews analyzed`}</p>
          </div>
        </div>
      )}
    </div>
  );
}
