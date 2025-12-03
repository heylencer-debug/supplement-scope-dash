import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useCategoryAnalyses } from "@/hooks/useCategoryAnalyses";
import { Plus } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function AnalysisTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentCategory = searchParams.get("category");
  
  const { data: analyses } = useCategoryAnalyses();
  
  // Get unique analyses (most recent per category), limited to 10
  const uniqueAnalyses = analyses?.reduce((acc: typeof analyses, analysis) => {
    if (!acc.find(a => a.category_name === analysis.category_name)) {
      acc.push(analysis);
    }
    return acc;
  }, []).slice(0, 10) ?? [];
  
  const isNewAnalysisActive = location.pathname === "/" && !currentCategory;
  
  return (
    <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <ScrollArea className="w-full">
        <div className="flex items-center gap-1 px-4 py-2">
          {/* New Analysis Tab */}
          <button 
            onClick={() => navigate("/")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              isNewAnalysisActive 
                ? "bg-accent text-accent-foreground" 
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
          
          {uniqueAnalyses.length > 0 && (
            <>
              {/* Divider */}
              <div className="h-4 w-px bg-border mx-1" />
              
              {/* Analysis Tabs */}
              {uniqueAnalyses.map((analysis) => {
                const isActive = currentCategory === analysis.category_name;
                const isComplete = (analysis.products_analyzed ?? 0) > 0;
                
                return (
                  <button
                    key={analysis.id}
                    onClick={() => navigate(`/dashboard?category=${encodeURIComponent(analysis.category_name)}`)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors max-w-[180px]",
                      isActive 
                        ? "bg-secondary text-foreground font-medium" 
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    )}
                  >
                    <span 
                      className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        isComplete ? "bg-green-500" : "bg-amber-500 animate-pulse"
                      )} 
                    />
                    <span className="truncate">{analysis.category_name}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
