import { useState, useEffect } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useCategoryAnalyses } from "@/hooks/useCategoryAnalyses";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const DISMISSED_TABS_KEY = "dismissed_analysis_tabs";
const PENDING_ANALYSES_KEY = "pending_analyses";

interface PendingAnalysis {
  categoryName: string;
  startedAt: string;
}

export function AnalysisTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentCategory = searchParams.get("category");
  const [dismissedTabs, setDismissedTabs] = useState<string[]>([]);
  const [pendingAnalyses, setPendingAnalyses] = useState<PendingAnalysis[]>([]);
  
  const { data: analyses } = useCategoryAnalyses();
  
  // Load dismissed tabs from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(DISMISSED_TABS_KEY);
    if (stored) {
      setDismissedTabs(JSON.parse(stored));
    }
  }, []);

  // Load and sync pending analyses from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(PENDING_ANALYSES_KEY);
    if (stored) {
      setPendingAnalyses(JSON.parse(stored));
    }
  }, []);

  // Clean up pending analyses once they appear in DB or are too old
  useEffect(() => {
    if (!pendingAnalyses.length) return;

    const cleaned = pendingAnalyses.filter(p => {
      // Remove if now exists in DB
      if (analyses?.find(a => a.category_name === p.categoryName)) return false;
      // Remove if older than 30 minutes
      const age = Date.now() - new Date(p.startedAt).getTime();
      if (age > 30 * 60 * 1000) return false;
      return true;
    });

    if (cleaned.length !== pendingAnalyses.length) {
      setPendingAnalyses(cleaned);
      localStorage.setItem(PENDING_ANALYSES_KEY, JSON.stringify(cleaned));
    }
  }, [analyses, pendingAnalyses]);
  
  // Get unique analyses (most recent per category), limited to 10, excluding dismissed
  const uniqueAnalyses = analyses?.reduce((acc: typeof analyses, analysis) => {
    if (!acc.find(a => a.category_name === analysis.category_name) && 
        !dismissedTabs.includes(analysis.category_name)) {
      acc.push(analysis);
    }
    return acc;
  }, []).slice(0, 10) ?? [];

  // Get pending analyses that aren't yet in DB and not dismissed
  const pendingNotInDb = pendingAnalyses.filter(
    p => !analyses?.find(a => a.category_name === p.categoryName) && 
         !dismissedTabs.includes(p.categoryName)
  );

  // Combined tabs: real analyses + pending ones
  const allTabs = [
    ...uniqueAnalyses.map(a => ({
      id: a.id,
      category_name: a.category_name,
      products_analyzed: a.products_analyzed,
      isPending: false as const,
    })),
    ...pendingNotInDb.map(p => ({
      id: `pending-${p.categoryName}`,
      category_name: p.categoryName,
      products_analyzed: 0,
      isPending: true as const,
    }))
  ];
  
  const isNewAnalysisActive = location.pathname === "/" && !currentCategory;
  
  const handleDismissTab = (e: React.MouseEvent, categoryName: string) => {
    e.stopPropagation();
    const newDismissed = [...dismissedTabs, categoryName];
    setDismissedTabs(newDismissed);
    localStorage.setItem(DISMISSED_TABS_KEY, JSON.stringify(newDismissed));

    // Also remove from pending if it's there
    const newPending = pendingAnalyses.filter(p => p.categoryName !== categoryName);
    if (newPending.length !== pendingAnalyses.length) {
      setPendingAnalyses(newPending);
      localStorage.setItem(PENDING_ANALYSES_KEY, JSON.stringify(newPending));
    }
    
    // If dismissing the current tab, navigate to New Analysis
    if (currentCategory === categoryName) {
      navigate("/");
    }
  };
  
  return (
    <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10 overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        <div className="flex items-center gap-1 px-4 py-2 min-w-max">
          {/* New Analysis Tab */}
          <button 
            onClick={() => navigate("/")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0",
              isNewAnalysisActive 
                ? "bg-accent text-accent-foreground" 
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
          
          {allTabs.length > 0 && (
            <>
              {/* Divider */}
              <div className="h-4 w-px bg-border mx-1 flex-shrink-0" />
              
              {/* Analysis Tabs */}
              {allTabs.map((tab) => {
                const isActive = currentCategory === tab.category_name;
                const isComplete = (tab.products_analyzed ?? 0) > 0;
                
                return (
                  <div
                    key={tab.id}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors group flex-shrink-0",
                      isActive 
                        ? "bg-secondary text-foreground font-medium" 
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    )}
                  >
                    <button
                      onClick={() => navigate(`/dashboard?category=${encodeURIComponent(tab.category_name)}`)}
                      className="flex items-center gap-2 whitespace-nowrap"
                    >
                      <span 
                        className={cn(
                          "w-2 h-2 rounded-full flex-shrink-0",
                          isComplete ? "bg-green-500" : "bg-amber-500 animate-pulse"
                        )} 
                      />
                      <span className="max-w-[150px] truncate">{tab.category_name}</span>
                    </button>
                    <button
                      onClick={(e) => handleDismissTab(e, tab.category_name)}
                      className="opacity-0 group-hover:opacity-100 hover:bg-destructive/20 rounded p-0.5 transition-opacity flex-shrink-0"
                      title="Close tab"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
