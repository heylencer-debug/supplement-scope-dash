import { AppSidebar } from "./AppSidebar";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Plus, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef, useCallback, TouchEvent } from "react";
import { useCategoryAnalyses } from "@/hooks/useCategoryAnalyses";
import { useActiveScoutJobs } from "@/hooks/useScoutJobs";

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
  // Some category_name rows carry a stray leading "=" (spreadsheet-import
  // artifact) — strip it for display only; navigation/lookup keys are left
  // untouched since the rest of the app already normalizes on read.
  const stripLabel = (name: string) => name.replace(/^=+/, "").trim();

  const [dismissedTabs, setDismissedTabs] = useState<string[]>([]);
  const [pendingAnalyses, setPendingAnalyses] = useState<PendingAnalysis[]>([]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  
  const { data: analyses } = useCategoryAnalyses();
  // Active scout job status per category chip — pulsing amber dot when the
  // matching keyword has a queued/claimed/running job (see useScoutJobs.ts).
  const { data: activeJobs } = useActiveScoutJobs();

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
    touchEndX.current = e.touches[0].clientX; // Initialize to same position
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    // Skip if no actual movement occurred (prevents ghost navigations)
    if (touchStartX.current === touchEndX.current) {
      return;
    }
    
    const swipeThreshold = 50;
    const diff = touchStartX.current - touchEndX.current;
    
    // Reset touch values
    touchStartX.current = 0;
    touchEndX.current = 0;
    
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
    <div className="h-screen flex w-full overflow-hidden">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* HEADER (.dark, h-14, flat) — carries the category-tab context; the
            6 analysis tabs (Products/Market/QA/Compliance/Manufacturer/Data
            Audit) render as their own pipeline-tab strip directly under this,
            inside Dashboard.tsx, since they're per-category-analysis state
            that only exists on that route (see takeout-design-spec.md §1). */}
        <header className="dark h-14 bg-background text-foreground border-b border-border/60 shadow-none flex items-center px-2 sm:px-4 gap-2 sm:gap-3 shrink-0">
            {/* New Analysis — the one deliberate neon accent in the app;
                native <button>, never shadcn Button (its cva always injects
                a base pearl-button/pearl-quiet class that collides with the
                `:not(.pearl-neon)` exclusions the neon tier depends on). */}
            <button
              onClick={() => navigate("/")}
              className="pearl-pill pearl-neon flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 whitespace-nowrap flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New</span>
            </button>

            {allTabs.length > 0 && (
              <>
                {/* Divider */}
                <div className="h-5 w-px bg-border/60 flex-shrink-0" />

                {/* Analysis Tabs — scrollable, CSS edge-fade mask (no
                    layout-shifting overlay divs; the mask always applies,
                    so ends fade whether or not there's more to scroll). */}
                <div className="flex-1 relative min-w-0 overflow-hidden">
                  <div
                    ref={tabsScrollRef}
                    onScroll={handleTabsScroll}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    className="overflow-x-auto scrollbar-hide touch-pan-x"
                    style={{
                      // Right-edge fade ONLY — a symmetric mask also faded the
                      // FIRST/active chip at rest, which read as a broken
                      // half-transparent pill (user: "what's with the fade?").
                      WebkitMaskImage: "linear-gradient(90deg, #000 0, #000 calc(100% - 28px), transparent 100%)",
                      maskImage: "linear-gradient(90deg, #000 0, #000 calc(100% - 28px), transparent 100%)",
                    }}
                  >
                    <div className="flex items-center gap-1.5 w-max px-1">
                      {allTabs.map((tab) => {
                        const isActive = currentCategory === tab.category_name;
                        const isComplete = (tab.products_analyzed ?? 0) > 0;
                        const normKw = (s: string) => s.replace(/^[=\s]+/, "").trim().toLowerCase();
                        const hasActiveJob = (activeJobs ?? []).some((j) => normKw(j.keyword || "") === normKw(tab.category_name));

                        return (
                          <div
                            key={tab.id}
                            className={cn(
                              "flex items-center gap-1.5 sm:gap-2 pl-2.5 pr-1.5 sm:pl-3 sm:pr-2 py-1.5 rounded-full text-xs sm:text-sm transition-colors duration-200 group flex-shrink-0",
                              isActive
                                ? "bg-white text-[hsl(var(--brand-ink))] font-bold"
                                : "bg-white/10 text-white/80 hover:bg-white/[0.15] hover:text-white"
                            )}
                          >
                            <button
                              onClick={() => navigate(`/dashboard?category=${encodeURIComponent(tab.category_name)}`)}
                              className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap min-w-[64px]"
                            >
                              {tab.isPending ? (
                                // pulsing amber dot, not a spinner — the spinner
                                // read as a broken loading state inside the chip
                                <span className="relative flex h-[7px] w-[7px] shrink-0">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-chart-2 opacity-75" />
                                  <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-chart-2" />
                                </span>
                              ) : hasActiveJob ? (
                                <span className="relative flex h-[7px] w-[7px] shrink-0">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-chart-2 opacity-75" />
                                  <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-chart-2" />
                                </span>
                              ) : isComplete ? (
                                <span className="h-[7px] w-[7px] rounded-full bg-chart-4 flex-shrink-0" />
                              ) : null}
                              <span className="min-w-[56px] max-w-[100px] sm:max-w-[160px] truncate">{stripLabel(tab.category_name)}</span>
                            </button>
                            <button
                              onClick={(e) => handleDismissTab(e, tab.category_name)}
                              className={cn(
                                "opacity-0 group-hover:opacity-100 rounded-full p-0.5 transition-all duration-200 flex-shrink-0",
                                isActive ? "hover:bg-black/10" : "hover:bg-destructive/20"
                              )}
                              title="Close tab"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
        </header>
        {/* CONTENT PANE — `.light takeout-canvas`, verbatim from the spec:
            gray reading surface with lifted muted-foreground contrast, so
            every existing white `bg-card` component (KPIs, benchmark cards,
            Data Audit, etc.) reads as a card ON the canvas instead of
            white-on-white. */}
        <div className="light takeout-canvas flex-1 overflow-y-auto overflow-x-hidden flex flex-col items-center text-foreground">
          <div className="w-full max-w-full md:max-w-[90vw] lg:max-w-[85vw] xl:max-w-[80vw] px-3 sm:px-4 md:px-6 lg:px-0">
            <div className="py-4 sm:py-6 md:py-8">
              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}