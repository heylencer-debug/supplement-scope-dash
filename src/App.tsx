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
import AddProduct from "./pages/AddProduct";
import NotFound from "./pages/NotFound";
import ManufacturerPortal from "./pages/ManufacturerPortal";
import ManufacturerPortalInternal from "./pages/ManufacturerPortalInternal";
import Packaging from "./pages/Packaging";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <CategoryProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Standalone manufacturer portal — no main app layout */}
            <Route path="/mfr/:token" element={<ManufacturerPortal />} />

            {/* Main app routes wrapped in Layout */}
            <Route
              path="*"
              element={
                <Layout>
                  <Routes>
                    <Route path="/" element={<NewAnalysis />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/products" element={<ProductExplorer />} />
                    <Route path="/products/add" element={<AddProduct />} />
                    <Route path="/manufacturer-portal" element={<ManufacturerPortalInternal />} />
                    <Route path="/packaging" element={<Packaging />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Layout>
              }
            />
          </Routes>
        </BrowserRouter>
      </CategoryProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
