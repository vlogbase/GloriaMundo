import { useState, useEffect } from 'react';
import { X, Download, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';

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
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 h-10 w-10 bg-gradient-to-r from-primary to-secondary rounded-full flex items-center justify-center text-white">
                <Globe className="h-5 w-5" />
              </div>
              
              <div className="flex-1">
                <h3 className="font-semibold text-sm">Install GloriaMundo</h3>
                <p className="text-xs text-muted-foreground">Add to your home screen for a better experience</p>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={handleDismiss}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
                
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={handleInstallClick}
                  className="bg-primary hover:bg-primary/90 text-white"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Install
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
};