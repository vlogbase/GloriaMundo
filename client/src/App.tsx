import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Chat from "@/pages/Chat";
import Privacy from "@/pages/Privacy";
import Contact from "@/pages/Contact";
import { CreditsPage } from "@/pages/CreditsPage";
import { ThemeProvider } from "@/hooks/use-theme";
import { ModelSelectionProvider } from "@/hooks/useModelSelection";
import { ModelPresetsProvider } from "@/hooks/useModelPresets.fixed";
import { Footer } from "@/components/Footer";
import { CookieConsent } from "@/components/CookieConsent";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Chat} />
      <Route path="/chat/:id" component={Chat} />
      <Route path="/conversation/:id" component={Chat} /> {/* Keep old route for backward compatibility */}
      <Route path="/credits" component={CreditsPage} />
      <Route path="/account-balance" component={CreditsPage} />
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
        <ModelSelectionProvider>
          <ModelPresetsProvider>
            <div className="flex flex-col min-h-screen">
              <div className="flex-grow">
                <Router />
              </div>
              <Footer />
            </div>
            <CookieConsent />
            <Toaster />
          </ModelPresetsProvider>
        </ModelSelectionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
