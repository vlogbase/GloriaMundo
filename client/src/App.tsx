
import { Router, Route } from "wouter";
import { SidebarProvider } from "@/components/Sidebar";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { Toaster } from "@/components/ui/toaster";

function App() {
  return (
    <Router>
      <SidebarProvider>
        <Toaster />
        <Route path="/" component={Index} />
        <Route component={NotFound} />
      </SidebarProvider>
    </Router>
  );
}

export default App;
