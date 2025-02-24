// client/src/App.tsx

import { Router, Route } from "wouter";
import { SidebarProvider } from "@/components/ui/sidebar";

// These pages are in your code base, so import them:
import Index from "./pages/Index";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import NotFound from "./pages/not-found";

import { Toaster } from "@/components/ui/toaster";

function App() {
  return (
    <Router>
      <SidebarProvider>
        <Toaster />

        {/* Example routes. Adjust or add as needed: */}
        <Route path="/" component={Index} />
        <Route path="/home" component={Home} />
        <Route path="/chat" component={Chat} />

        {/* Catch-all route for anything else => 404 */}
        <Route path="/:rest*" component={NotFound} />
      </SidebarProvider>
    </Router>
  );
}

export default App;
