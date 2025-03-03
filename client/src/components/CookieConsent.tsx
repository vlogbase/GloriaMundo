import { useState, useEffect } from 'react';
import { X, Settings, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { 
  Dialog, 
  DialogContent, 
  DialogTitle, 
  DialogDescription,
  DialogHeader,
  DialogFooter 
} from '@/components/ui/dialog';

// Add type declarations for Google Tag Manager
declare global {
  interface Window {
    dataLayer: any[];
  }
}

type CookiePreferences = {
  essential: boolean;  // Always true, cannot be toggled
  analytics: boolean;
  advertising: boolean;
  preferences: boolean;
};

export const CookieConsent = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    essential: true,     // Always true
    analytics: false,    // Default off
    advertising: false,  // Default off
    preferences: false   // Default off
  });
  
  // Load saved preferences on initial render and set up event listener
  useEffect(() => {
    const savedPreferences = localStorage.getItem('cookiePreferences');
    const consentStatus = localStorage.getItem('cookieConsentStatus');
    
    if (savedPreferences) {
      setPreferences(JSON.parse(savedPreferences));
    }
    
    // Show banner if user hasn't made a choice yet
    if (!consentStatus) {
      setIsVisible(true);
    }
    
    // Listen for the openCookieSettings event from Footer
    const handleOpenSettings = () => {
      setShowPreferences(true);
      setIsVisible(true);
    };
    
    window.addEventListener('openCookieSettings', handleOpenSettings);
    
    // Clean up event listener on component unmount
    return () => {
      window.removeEventListener('openCookieSettings', handleOpenSettings);
    };
  }, []);

  // Save preferences to localStorage and configure cookies/tracking
  const savePreferences = (status: 'accepted' | 'rejected' | 'customized') => {
    localStorage.setItem('cookiePreferences', JSON.stringify(preferences));
    localStorage.setItem('cookieConsentStatus', status);
    
    // Configure Google Tag Manager based on preferences
    if (window.dataLayer) {
      // Send consent information to GTM
      window.dataLayer.push({
        event: 'cookie_consent_update',
        cookie_consent: {
          analytics: preferences.analytics,
          advertising: preferences.advertising,
          preferences: preferences.preferences
        }
      });
      
      // Update consent settings in GTM (for GDPR compliance)
      window.dataLayer.push({
        'event': 'consent_update',
        'consent': {
          'analytics_storage': preferences.analytics ? 'granted' : 'denied',
          'ad_storage': preferences.advertising ? 'granted' : 'denied',
          'personalization_storage': preferences.preferences ? 'granted' : 'denied',
          'functionality_storage': 'granted', // Essential cookies always needed
          'security_storage': 'granted'      // Security cookies always needed
        }
      });
    }
    
    setIsVisible(false);
    setShowPreferences(false);
  };

  const handleAccept = () => {
    // Accept all cookies
    setPreferences({
      essential: true,
      analytics: true,
      advertising: true,
      preferences: true
    });
    savePreferences('accepted');
  };

  const handleReject = () => {
    // Reject all non-essential cookies
    setPreferences({
      essential: true,
      analytics: false,
      advertising: false,
      preferences: false
    });
    savePreferences('rejected');
  };

  const handleSavePreferences = () => {
    savePreferences('customized');
  };

  const handlePreferenceChange = (type: keyof Omit<CookiePreferences, 'essential'>) => {
    setPreferences(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  // Function to open cookie settings from anywhere
  // This can be exported and used in a footer component
  const openCookieSettings = () => {
    setShowPreferences(true);
    setIsVisible(true);
  };

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-3 bg-background border-t border-border shadow-lg"
          >
            <div className="container max-w-7xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-grow">
                  <h3 className="text-sm font-medium mb-1">Cookie Preferences</h3>
                  <p className="text-xs text-muted-foreground">
                    This site uses essential cookies to ensure the core functionality. Non-essential cookies are disabled by default.{' '}
                    <Link href="/privacy#cookies">
                      <span className="underline cursor-pointer">Learn more</span>
                    </Link>
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => setShowPreferences(true)}
                  >
                    <Settings className="h-3 w-3 mr-1" />
                    Cookie Settings
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="text-xs h-8"
                    onClick={handleReject}
                  >
                    Reject All
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="text-xs h-8"
                    onClick={handleAccept}
                  >
                    Accept All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-8 px-2 md:hidden"
                    onClick={() => setIsVisible(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cookie preferences dialog */}
      <Dialog open={showPreferences} onOpenChange={setShowPreferences}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cookie Preferences</DialogTitle>
            <DialogDescription>
              Customize your cookie preferences below. Essential cookies cannot be disabled as they are necessary for the website to function properly.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Essential cookies - always enabled */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Essential Cookies</h4>
                <p className="text-xs text-muted-foreground">
                  Required for the core functionality of the website. Cannot be disabled.
                </p>
              </div>
              <Switch checked={true} disabled />
            </div>
            
            <Separator />
            
            {/* Analytics cookies */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Analytics Cookies</h4>
                <p className="text-xs text-muted-foreground">
                  Help us understand how visitors interact with our website.
                </p>
              </div>
              <Switch 
                checked={preferences.analytics}
                onCheckedChange={() => handlePreferenceChange('analytics')}
              />
            </div>
            
            <Separator />
            
            {/* Advertising cookies */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Advertising Cookies</h4>
                <p className="text-xs text-muted-foreground">
                  Used to show relevant advertisements based on your interests.
                </p>
              </div>
              <Switch 
                checked={preferences.advertising}
                onCheckedChange={() => handlePreferenceChange('advertising')}
              />
            </div>
            
            <Separator />
            
            {/* Preferences cookies */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Preferences Cookies</h4>
                <p className="text-xs text-muted-foreground">
                  Remember your settings and preferences for a better experience.
                </p>
              </div>
              <Switch 
                checked={preferences.preferences}
                onCheckedChange={() => handlePreferenceChange('preferences')}
              />
            </div>
          </div>

          <DialogFooter>
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleReject}
              >
                Reject All
              </Button>
              <Button
                variant="default"
                size="sm"
                className="flex-1"
                onClick={handleSavePreferences}
              >
                Save Preferences
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* We've removed the floating cookie settings button as requested 
          to avoid conflicts with the send message button on mobile.
          Cookie settings are still accessible through the footer link. */}
    </>
  );
};