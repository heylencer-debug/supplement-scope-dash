import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AnalysisTabs } from "@/components/AnalysisTabs";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const currentCategory = searchParams.get("category");
  const isNewAnalysisActive = location.pathname === "/" && !currentCategory;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="h-16 border-0 bg-card shadow-soft flex items-center px-6 gap-4">
            <SidebarTrigger />
            <button 
              onClick={() => navigate("/")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap",
                isNewAnalysisActive 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground hover:shadow-sm"
              )}
            >
              <Plus className="w-4 h-4" />
              New
            </button>
          </header>
          <div className="flex-1 bg-background overflow-y-auto overflow-x-hidden flex flex-col items-center">
            <div className="w-full max-w-[80vw] px-4 lg:px-0">
              <AnalysisTabs />
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
