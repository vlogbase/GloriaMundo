import { Link } from "wouter";
import { Settings } from "lucide-react";

export const Footer = () => {
  // Function to open cookie settings
  const openCookieSettings = () => {
    // Create a custom event that CookieConsent component will listen for
    const event = new CustomEvent('openCookieSettings');
    window.dispatchEvent(event);
  };

  return (
    <div className="w-full text-center py-2 text-xs text-muted-foreground/50 select-none">
      <div className="flex justify-center space-x-4">
        <Link href="/privacy">
          <span className="hover:text-muted-foreground cursor-pointer transition-colors">Privacy</span>
        </Link>
        <Link href="/contact">
          <span className="hover:text-muted-foreground cursor-pointer transition-colors">Contact</span>
        </Link>
        <button 
          onClick={openCookieSettings}
          className="hover:text-muted-foreground cursor-pointer transition-colors flex items-center"
        >
          <Settings className="h-3 w-3 mr-1" />
          Cookie Settings
        </button>
      </div>
      <div className="mt-2">
        © 2025 GloriaMundo. All rights reserved.
      </div>
    </div>
  );
};