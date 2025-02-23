// src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider } from "@/components/Sidebar"; // SidebarProvider is exported from your Sidebar file
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { Toaster } from "@/components/ui/toaster"; // Optional: To display toast messages

function App() {
  return (
    <BrowserRouter>
      {/* Wrap the application with SidebarProvider so that Sidebar context is available */}
      <SidebarProvider>
        {/* Optionally include a global toaster */}
        <Toaster />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </SidebarProvider>
    </BrowserRouter>
  );
}

export default App;
