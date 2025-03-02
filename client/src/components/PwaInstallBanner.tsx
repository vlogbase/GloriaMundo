import { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from './Logo';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PwaInstallBannerProps {
  show: boolean;
}

export const PwaInstallBanner = ({ show }: PwaInstallBannerProps) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    // Only show banner if PWA is installable and if show prop is true
    if (show && isInstallable) {
      // Check if already installed or in standalone mode
      const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches 
                              || (window.navigator as any).standalone === true;
      
      if (!isInStandaloneMode && localStorage.getItem('pwaInstallBannerDismissed') !== 'true') {
        setIsVisible(true);
      }
    }
  }, [show, isInstallable]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const choiceResult = await deferredPrompt.userChoice;
    
    if (choiceResult.outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    
    // Clear the saved prompt as it can't be used again
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('pwaInstallBannerDismissed', 'true');
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-4 left-4 right-4 z-50"
        >
          <Card className="p-4 bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/20 shadow-lg">
            <div className="flex flex-col gap-3">
              {/* Header with logo and close button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Logo size={36} />
                  <h3 className="font-semibold">GloriaMundo</h3>
                </div>
                
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={handleDismiss}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              {/* Tagline */}
              <p className="text-sm text-muted-foreground">
                Curiosity meets clarity. GloriaMundo: the conversational agent that transforms questions into adventures.
              </p>
              
              {/* Install button */}
              <div className="flex justify-end">
                <Button 
                  variant="default" 
                  onClick={handleInstallClick}
                  className="bg-primary hover:bg-primary/90 text-white"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Install App
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
};