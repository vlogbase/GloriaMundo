import { useState, useEffect } from 'react';
import { X, Download, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';
import { Logo } from './Logo';

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
  const [isReminderBanner, setIsReminderBanner] = useState(false);

  useEffect(() => {
    // Only show banner if PWA is installable and if show prop is true
    if (show && isInstallable) {
      // Check if already installed or in standalone mode
      const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches 
                              || (window.navigator as any).standalone === true;
      
      const hasOptedOutCompletely = localStorage.getItem('pwaInstallBannerNeverRemind') === 'true';
      
      if (!isInStandaloneMode && !hasOptedOutCompletely) {
        // Check if this is the first time or a reminder
        const lastShownTime = localStorage.getItem('pwaInstallBannerLastShown');
        const firstInteractionComplete = localStorage.getItem('pwaInstallBannerFirstInteractionComplete') === 'true';
        
        if (!lastShownTime || !firstInteractionComplete) {
          // First time showing banner
          setIsReminderBanner(false);
          setIsVisible(true);
          localStorage.setItem('pwaInstallBannerLastShown', Date.now().toString());
          localStorage.setItem('pwaInstallBannerFirstInteractionComplete', 'true');
          localStorage.setItem('pwaInstallBannerReminderCount', '0');
        } else {
          // Check if enough time has passed for a reminder
          const timeSinceLastShown = Date.now() - parseInt(lastShownTime);
          const oneHourInMs = 60 * 60 * 1000;
          const oneDayInMs = 24 * 60 * 60 * 1000;
          
          // Get reminder count to determine timing
          const reminderCount = parseInt(localStorage.getItem('pwaInstallBannerReminderCount') || '0');
          
          // First reminder after 1 hour, then every 24 hours
          const requiredTimeToPass = reminderCount === 0 ? oneHourInMs : oneDayInMs;
          
          if (firstInteractionComplete && timeSinceLastShown >= requiredTimeToPass) {
            setIsReminderBanner(true);
            setIsVisible(true);
            
            // Update reminder count and last shown time
            localStorage.setItem('pwaInstallBannerReminderCount', (reminderCount + 1).toString());
            localStorage.setItem('pwaInstallBannerLastShown', Date.now().toString());
          }
        }
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
    // For first-time banner, we don't need to set any special flags
  };
  
  const handleNeverRemind = () => {
    setIsVisible(false);
    localStorage.setItem('pwaInstallBannerNeverRemind', 'true');
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
                {isReminderBanner 
                  ? "Don't miss out! Install GloriaMundo for a better experience on your device."
                  : "Curiosity meets clarity. GloriaMundo: the conversational agent that transforms questions into adventures."
                }
              </p>
              
              {/* Action buttons - different layout for reminder */}
              {isReminderBanner ? (
                <div className="flex justify-end items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleNeverRemind}
                    className="text-xs"
                  >
                    <BellOff className="h-3 w-3 mr-1" />
                    Don't remind me again
                  </Button>
                  <Button 
                    variant="default" 
                    onClick={handleInstallClick}
                    className="bg-primary hover:bg-primary/90 text-white"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Install App
                  </Button>
                </div>
              ) : (
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
              )}
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
};