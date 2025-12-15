import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { FileText, Download, Copy, Check } from "lucide-react";
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

  // Parse analysis_3_formula_brief for the Markdown content
  const formulaBriefContent = useMemo(() => {
    const analysis3 = analysis?.analysis_3_formula_brief as FormulaBriefContent | null;
    return analysis3?.formula_brief_content || null;
  }, [analysis]);

  const handleCopyToClipboard = async () => {
    if (!formulaBriefContent) return;
    
    try {
      await navigator.clipboard.writeText(formulaBriefContent);
      setCopied(true);
      toast({
        title: "Copied to clipboard",
        description: "The document content has been copied.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Copy failed",
        description: "Unable to copy to clipboard. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadPDF = useCallback(() => {
    if (!documentRef.current || !formulaBriefContent) {
      toast({
        title: "PDF not available",
        description: "No document content to export.",
        variant: "destructive",
      });
      return;
    }

    // Create a new window with just the document content for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: "Popup blocked",
        description: "Please allow popups to download the PDF.",
        variant: "destructive",
      });
      return;
    }

    const content = documentRef.current.innerHTML;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Formula Strategy Brief - ${categoryName || 'Document'}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
              padding: 40px;
              color: #1a1a2e;
              line-height: 1.6;
            }
            h1 { 
              font-size: 28px; 
              font-weight: bold; 
              color: #4318FF; 
              border-bottom: 2px solid #4318FF20;
              padding-bottom: 16px;
              margin-bottom: 24px;
            }
            h2 { 
              font-size: 20px; 
              font-weight: 600; 
              margin-top: 32px;
              margin-bottom: 12px;
              padding-bottom: 8px;
              border-bottom: 1px solid #e5e7eb;
            }
            h3 { 
              font-size: 18px; 
              font-weight: 500; 
              margin-top: 24px;
              margin-bottom: 8px;
            }
            p { 
              margin-bottom: 12px; 
              color: #64748b;
            }
            ul, ol { 
              margin-left: 24px; 
              margin-bottom: 12px;
              color: #64748b;
            }
            li { margin-bottom: 4px; }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin: 16px 0;
              font-size: 14px;
            }
            th { 
              background: #4318FF10; 
              padding: 12px; 
              text-align: left;
              font-weight: 600;
              border: 1px solid #e5e7eb;
            }
            td { 
              padding: 12px; 
              border: 1px solid #e5e7eb;
              color: #64748b;
            }
            tr:nth-child(even) { background: #f9fafb; }
            strong { color: #1a1a2e; }
            blockquote {
              border-left: 4px solid #4318FF;
              padding-left: 16px;
              margin: 16px 0;
              background: #4318FF08;
              padding: 12px 16px;
            }
            code { 
              background: #f1f5f9; 
              padding: 2px 6px; 
              border-radius: 4px;
              font-family: monospace;
            }
            @media print {
              body { padding: 20px; }
              @page { margin: 15mm; }
            }
          </style>
        </head>
        <body>
          ${content}
        </body>
      </html>
    `);
    
    printWindow.document.close();
    
    // Wait for content to load then trigger print
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);

    toast({
      title: "Print dialog opened",
      description: "Select 'Save as PDF' in the print dialog to download.",
    });
  }, [formulaBriefContent, categoryName, toast]);

  if (!categoryName && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">No category selected. Start a new analysis to see the strategy brief.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Sticky Header Bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="max-w-[800px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">Formula Strategy Brief</h1>
              <p className="text-xs text-muted-foreground">
                {categoryName || "Loading..."}
                {analysis?.created_at && (
                  <> • {new Date(analysis.created_at).toLocaleDateString("en-US", { 
                    month: "short", 
                    day: "numeric",
                    year: "numeric"
                  })}</>
                )}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2"
              onClick={handleCopyToClipboard}
              disabled={!formulaBriefContent || isLoading}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy
                </>
              )}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2"
              onClick={handleDownloadPDF}
              disabled={isLoading || !formulaBriefContent}
            >
              <Download className="w-4 h-4" />
              Download PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Document Content */}
      <div className="py-8 px-4">
        <div ref={documentRef}>
          <DocumentContainer 
            content={formulaBriefContent} 
            isLoading={isLoading}
            title={`Formula Strategy Brief - ${categoryName}`}
          />
        </div>
      </div>

      {/* Footer info */}
      {analysis && !isLoading && (
        <div className="max-w-[800px] mx-auto px-4 pb-8">
          <div className="text-center text-xs text-muted-foreground">
            <p>
              Analysis ID: {analysis.id?.slice(0, 8)}... • 
              {analysis.products_analyzed && ` ${analysis.products_analyzed} products analyzed`}
              {analysis.reviews_analyzed && ` • ${analysis.reviews_analyzed.toLocaleString()} reviews analyzed`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
