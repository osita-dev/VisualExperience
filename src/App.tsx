import { lazy, Suspense, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProjectProvider } from "@/hooks/useProject";
import { bootstrapLibrary } from "@/templates/library";
import AppLayout from "@/components/AppShell";

/* every page is its own chunk — the phone downloads the shell first and
   each route only when it's opened (the exporter/ffmpeg glue rides along
   with the export route, not the home page) */
const Index = lazy(() => import("./pages/Index"));
const TemplateDetail = lazy(() => import("./pages/TemplateDetail"));
const SlotFiller = lazy(() => import("./pages/SlotFiller"));
const ExportPage = lazy(() => import("./pages/ExportPage"));
const MyProjects = lazy(() => import("./pages/MyProjects"));
const Profile = lazy(() => import("./pages/Profile"));
const MyTemplates = lazy(() => import("./pages/MyTemplates"));
const TemplateBuilder = lazy(() => import("./pages/TemplateBuilder"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

/** Centered spinner while a route chunk streams in. */
const PageFallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
  </div>
);

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
          <Suspense fallback={<PageFallback />}>
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
          </Suspense>
        </BrowserRouter>
      </ProjectProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
