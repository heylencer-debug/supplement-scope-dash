import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Plus, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef, useCallback, TouchEvent } from "react";
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
  const rawCurrentCategory = searchParams.get("category");
  const currentCategory = rawCurrentCategory ? rawCurrentCategory.replace(/^=+/, "").trim() : null;
  const isNewAnalysisActive = location.pathname === "/" && !currentCategory;

  const [dismissedTabs, setDismissedTabs] = useState<string[]>([]);
  const [pendingAnalyses, setPendingAnalyses] = useState<PendingAnalysis[]>([]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  
  const { data: analyses } = useCategoryAnalyses();

  // Check scroll state
  const handleTabsScroll = useCallback(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);
  
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

  // Update scroll indicators when tabs change
  useEffect(() => {
    handleTabsScroll();
  }, [allTabs.length, handleTabsScroll]);
  
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

  // Swipe gesture handlers for mobile tab navigation
  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const swipeThreshold = 50;
    const diff = touchStartX.current - touchEndX.current;
    
    if (Math.abs(diff) < swipeThreshold) return;
    
    // Find current tab index
    const currentIndex = allTabs.findIndex(tab => tab.category_name === currentCategory);
    
    if (diff > 0) {
      // Swiped left - go to next tab
      if (currentIndex < allTabs.length - 1) {
        const nextTab = allTabs[currentIndex + 1];
        navigate(`/dashboard?category=${encodeURIComponent(nextTab.category_name)}`);
      }
    } else {
      // Swiped right - go to previous tab
      if (currentIndex > 0) {
        const prevTab = allTabs[currentIndex - 1];
        navigate(`/dashboard?category=${encodeURIComponent(prevTab.category_name)}`);
      } else if (currentIndex === 0) {
        // Swipe right on first tab goes to New Analysis
        navigate("/");
      }
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="h-14 border-b border-border bg-card shadow-soft flex items-center px-2 sm:px-4 gap-2 sm:gap-3 overflow-hidden">
            <SidebarTrigger className="flex-shrink-0" />
            
            {/* New Analysis Button */}
            <button 
              onClick={() => navigate("/")}
              className={cn(
                "flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0",
                isNewAnalysisActive 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground hover:shadow-sm"
              )}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New</span>
            </button>

            {allTabs.length > 0 && (
              <>
                {/* Divider */}
                <div className="h-5 w-px bg-border flex-shrink-0" />
                
                {/* Analysis Tabs - scrollable area with scroll indicators */}
                <div className="flex-1 relative min-w-0">
                  {/* Left scroll indicator */}
                  <div 
                    className={cn(
                      "absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-card to-transparent z-10 pointer-events-none transition-opacity duration-200",
                      canScrollLeft ? "opacity-100" : "opacity-0"
                    )}
                  />
                  
                  {/* Scrollable tabs */}
                  <div 
                    ref={tabsScrollRef}
                    onScroll={handleTabsScroll}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className="overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent touch-pan-x"
                  >
                    <div className="flex items-center gap-2 min-w-max px-1">
                      {allTabs.map((tab) => {
                        const isActive = currentCategory === tab.category_name;
                        const isComplete = (tab.products_analyzed ?? 0) > 0;
                        
                                        return (
                                          <div
                                            key={tab.id}
                                            className={cn(
                                              "flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-all duration-200 group flex-shrink-0",
                                              isActive 
                                                ? "bg-secondary text-foreground font-medium shadow-sm" 
                                                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground hover:shadow-sm"
                                            )}
                                          >
                                            <button
                                              onClick={() => navigate(`/dashboard?category=${encodeURIComponent(tab.category_name)}`)}
                                              className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap"
                                            >
                                              {tab.isPending ? (
                                                <Loader2 className="w-3 h-3 text-chart-2 animate-spin flex-shrink-0" />
                                              ) : (
                                                <span 
                                                  className={cn(
                                                    "w-2 h-2 rounded-full flex-shrink-0 transition-all",
                                                    isComplete ? "bg-chart-4" : "bg-chart-2 animate-pulse [animation-duration:2.5s]"
                                                  )} 
                                                />
                                              )}
                                              <span className="max-w-[100px] sm:max-w-[140px] truncate">{tab.category_name}</span>
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
                  
                  {/* Right scroll indicator */}
                  <div 
                    className={cn(
                      "absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-card to-transparent z-10 pointer-events-none transition-opacity duration-200",
                      canScrollRight ? "opacity-100" : "opacity-0"
                    )}
                  />
                </div>
              </>
            )}
          </header>
          <div className="flex-1 bg-background overflow-y-auto overflow-x-hidden flex flex-col items-center">
            <div className="w-full max-w-full md:max-w-[90vw] lg:max-w-[85vw] xl:max-w-[80vw] px-3 sm:px-4 md:px-6 lg:px-0">
              <div className="py-4 sm:py-6 md:py-8">
                {children}
              </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}