import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/hooks/use-theme";
import { ModelSelectionProvider } from "@/hooks/useModelSelection";
import { ModelPresetsProvider } from "@/hooks/useModelPresets.fixed";
import { Footer } from "@/components/Footer";
import { CookieConsent } from "@/components/CookieConsent";
import { useState, useEffect, lazy, Suspense } from "react";

// Lazy-loaded components for code splitting
const Chat = lazy(() => import("@/pages/Chat"));
const NotFound = lazy(() => import("@/pages/not-found"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Contact = lazy(() => import("@/pages/Contact"));
const CreditsPage = lazy(() => import("@/pages/CreditsPage").then(module => ({ default: module.CreditsPage })));

// Loading component for lazy-loaded routes
const RouteLoadingFallback = () => (
  <div className="w-full h-[50vh] flex items-center justify-center">
    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
  </div>
);

function Router() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
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
    </Suspense>
  );
}

function App() {
  const [appReady, setAppReady] = useState(false);
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  // Set a timer to indicate if initial loading is taking too long
  useEffect(() => {
    // Check if the app is already loaded from a previous visit
    const isAppPreviouslyLoaded = sessionStorage.getItem('appLoaded');
    
    if (isAppPreviouslyLoaded) {
      // If app was loaded before in this session, mark as ready immediately
      setAppReady(true);
      return;
    }
    
    // Set a timeout to show a special message if loading takes too long
    const timeoutId = setTimeout(() => {
      setLoadingTimeout(true);
    }, 8000); // Show timeout message after 8 seconds
    
    // Mark app as ready after critical resources are loaded
    window.addEventListener('load', () => {
      clearTimeout(timeoutId);
      setAppReady(true);
      sessionStorage.setItem('appLoaded', 'true');
    });
    
    // Fallback timer - if load event doesn't fire, still show the app after 15 seconds
    const fallbackTimer = setTimeout(() => {
      clearTimeout(timeoutId);
      setAppReady(true);
      sessionStorage.setItem('appLoaded', 'true');
    }, 15000);
    
    return () => {
      clearTimeout(timeoutId);
      clearTimeout(fallbackTimer);
    };
  }, []);

  if (!appReady) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <h1 className="text-2xl font-bold mb-2">GloriaMundo</h1>
        <p className="text-center mb-4">Loading application...</p>
        
        {loadingTimeout && (
          <div className="max-w-md bg-card p-4 rounded-lg border border-border mt-4">
            <p className="font-semibold mb-2">Taking longer than expected?</p>
            <ul className="text-sm space-y-2">
              <li>• Check your internet connection</li>
              <li>• The server may be busy, please be patient</li>
              <li>• If problems persist, try refreshing the page</li>
            </ul>
          </div>
        )}
      </div>
    );
  }

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
