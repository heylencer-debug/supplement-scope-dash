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
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-4">
            <SidebarTrigger />
          </header>
          <div className="flex-1 bg-background overflow-y-auto overflow-x-hidden flex flex-col items-center">
            <div className="w-full max-w-[80vw]">
              <AnalysisTabs />
              <div className="py-6">
                {children}
              </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
