import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProjectProvider } from "@/hooks/useProject";
import { bootstrapLibrary } from "@/templates/library";
import AppLayout from "@/components/AppShell";
import Index from "./pages/Index";
import TemplateDetail from "./pages/TemplateDetail";
import SlotFiller from "./pages/SlotFiller";
import ExportPage from "./pages/ExportPage";
import MyProjects from "./pages/MyProjects";
import Profile from "./pages/Profile";
import MyTemplates from "./pages/MyTemplates";
import TemplateBuilder from "./pages/TemplateBuilder";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

/** Loads creator templates from IndexedDB once at app start. */
const LibraryBootstrap = () => {
  useEffect(() => {
    void bootstrapLibrary();
  }, []);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ProjectProvider>
        <LibraryBootstrap />
        <BrowserRouter>
          <Routes>
            {/* desktop gets the CapCut-style sidebar shell; mobile renders the
                same routes plain (AppLayout is transparent below lg) */}
            <Route element={<AppLayout />}>
              <Route path="/" element={<Index />} />
              <Route path="/t/:id" element={<TemplateDetail />} />
              <Route path="/t/:id/fill" element={<SlotFiller />} />
              <Route path="/t/:id/export" element={<ExportPage />} />
              <Route path="/projects" element={<MyProjects />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/creator" element={<MyTemplates />} />
              <Route path="/creator/:id" element={<TemplateBuilder />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ProjectProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
