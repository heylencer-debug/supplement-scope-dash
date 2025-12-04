import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AnalysisTabs } from "@/components/AnalysisTabs";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="h-16 border-0 bg-card shadow-soft flex items-center px-6 gap-4">
            <SidebarTrigger />
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
