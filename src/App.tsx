import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { CategoryProvider } from "@/contexts/CategoryContext";
import NewAnalysis from "./pages/NewAnalysis";
import Dashboard from "./pages/Dashboard";
import ProductExplorer from "./pages/ProductExplorer";
import StrategyBrief from "./pages/StrategyBrief";
import Competitors from "./pages/Competitors";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <CategoryProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<NewAnalysis />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/products" element={<ProductExplorer />} />
              <Route path="/competitors" element={<Competitors />} />
              <Route path="/strategy" element={<StrategyBrief />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </CategoryProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
