import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';

export const CookieConsent = () => {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    // Check if user has already consented
    const hasConsented = localStorage.getItem('cookieConsent') === 'true';
    if (!hasConsented) {
      // Only show banner if consent hasn't been given yet
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    // Store consent in localStorage
    localStorage.setItem('cookieConsent', 'true');
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-2 bg-background border-t border-border shadow-lg"
        >
          <div className="container max-w-7xl mx-auto flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              This site uses cookies for essential functions only. By continuing to use this site, you consent to our use of cookies.{' '}
              <Link href="/privacy">
                <span className="underline cursor-pointer">Learn more</span>
              </Link>
            </p>
            <div className="flex gap-2 ml-4 shrink-0">
              <Button 
                variant="default" 
                size="sm" 
                className="text-xs h-8"
                onClick={handleAccept}
              >
                Accept
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                className="text-xs h-8 px-2"
                onClick={handleAccept}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};