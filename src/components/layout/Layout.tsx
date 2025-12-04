import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Plus, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useCategoryAnalyses } from "@/hooks/useCategoryAnalyses";

const DISMISSED_TABS_KEY = "dismissed_analysis_tabs";
const PENDING_ANALYSES_KEY = "pending_analyses";

interface PendingAnalysis {
  categoryName: string;
  startedAt: string;
}

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentCategory = searchParams.get("category");
  const isNewAnalysisActive = location.pathname === "/" && !currentCategory;

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
    const loadPending = () => {
      const stored = localStorage.getItem(PENDING_ANALYSES_KEY);
      if (stored) {
        setPendingAnalyses(JSON.parse(stored));
      }
    };
    
    loadPending();
    
    const handleStorage = (e: StorageEvent) => {
      if (e.key === PENDING_ANALYSES_KEY) {
        loadPending();
      }
    };
    
    const handleNewAnalysis = () => loadPending();
    
    window.addEventListener('storage', handleStorage);
    window.addEventListener('newAnalysisAdded', handleNewAnalysis);
    
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('newAnalysisAdded', handleNewAnalysis);
    };
  }, [location.pathname, currentCategory]);

  // Clean up pending analyses once they appear in DB or are too old
  useEffect(() => {
    if (!pendingAnalyses.length) return;

    const cleaned = pendingAnalyses.filter(p => {
      if (analyses?.find(a => a.category_name === p.categoryName)) return false;
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
  
  const handleDismissTab = (e: React.MouseEvent, categoryName: string) => {
    e.stopPropagation();
    const newDismissed = [...dismissedTabs, categoryName];
    setDismissedTabs(newDismissed);
    localStorage.setItem(DISMISSED_TABS_KEY, JSON.stringify(newDismissed));

    const newPending = pendingAnalyses.filter(p => p.categoryName !== categoryName);
    if (newPending.length !== pendingAnalyses.length) {
      setPendingAnalyses(newPending);
      localStorage.setItem(PENDING_ANALYSES_KEY, JSON.stringify(newPending));
    }
    
    if (currentCategory === categoryName) {
      navigate("/");
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="h-14 border-b border-border bg-card shadow-soft flex items-center px-4 gap-3 overflow-hidden">
            <SidebarTrigger className="flex-shrink-0" />
            
            {/* New Analysis Button */}
            <button 
              onClick={() => navigate("/")}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0",
                isNewAnalysisActive 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground hover:shadow-sm"
              )}
            >
              <Plus className="w-4 h-4" />
              New
            </button>

            {allTabs.length > 0 && (
              <>
                {/* Divider */}
                <div className="h-5 w-px bg-border flex-shrink-0" />
                
                {/* Analysis Tabs - scrollable area */}
                <div className="flex-1 overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                  <div className="flex items-center gap-2 min-w-max">
                    {allTabs.map((tab) => {
                      const isActive = currentCategory === tab.category_name;
                      const isComplete = (tab.products_analyzed ?? 0) > 0;
                      
                      return (
                        <div
                          key={tab.id}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 group flex-shrink-0",
                            isActive 
                              ? "bg-secondary text-foreground font-medium shadow-sm" 
                              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground hover:shadow-sm"
                          )}
                        >
                          <button
                            onClick={() => navigate(`/dashboard?category=${encodeURIComponent(tab.category_name)}`)}
                            className="flex items-center gap-2 whitespace-nowrap"
                          >
                            {tab.isPending ? (
                              <Loader2 className="w-3 h-3 text-chart-2 animate-spin flex-shrink-0" />
                            ) : (
                              <span 
                                className={cn(
                                  "w-2 h-2 rounded-full flex-shrink-0 transition-all",
                                  isComplete ? "bg-chart-4" : "bg-chart-2 animate-pulse"
                                )} 
                              />
                            )}
                            <span className="max-w-[140px] truncate">{tab.category_name}</span>
                          </button>
                          <button
                            onClick={(e) => handleDismissTab(e, tab.category_name)}
                            className="opacity-0 group-hover:opacity-100 hover:bg-destructive/20 rounded p-0.5 transition-all duration-200 flex-shrink-0"
                            title="Close tab"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </header>
          <div className="flex-1 bg-background overflow-y-auto overflow-x-hidden flex flex-col items-center">
            <div className="w-full max-w-[80vw] px-4 lg:px-0">
              <div className="py-8">
                {children}
              </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}