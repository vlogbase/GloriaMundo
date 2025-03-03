import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Chat from "@/pages/Chat";
import Privacy from "@/pages/Privacy";
import Contact from "@/pages/Contact";
import { ThemeProvider } from "@/hooks/use-theme";
import { Footer } from "@/components/Footer";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Chat} />
      <Route path="/conversation/:id" component={Chat} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/contact" component={Contact} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <div className="flex flex-col min-h-screen">
          <div className="flex-grow">
            <Router />
          </div>
          <Footer />
        </div>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
