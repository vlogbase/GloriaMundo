import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const SkimlinksDebug = () => {
  const [skimlinksStatus, setSkimlinksStatus] = useState<{
    loaded: boolean;
    apiExists: boolean;
    reprocessExists: boolean;
    reinitializeExists: boolean;
    skimwordsEnabled: boolean | null;
  }>({
    loaded: false,
    apiExists: false,
    reprocessExists: false,
    reinitializeExists: false,
    skimwordsEnabled: null,
  });

  useEffect(() => {
    // Check Skimlinks status on component mount
    checkSkimlinksStatus();
  }, []);

  const checkSkimlinksStatus = () => {
    // Check if Skimlinks script is loaded
    const skimlinksScript = document.querySelector('script[src*="skimresources.com"]');
    const scriptLoaded = !!skimlinksScript;
    
    // Check if skimlinksAPI exists
    const apiExists = typeof (window as any).skimlinksAPI !== 'undefined';
    
    // Check if specific methods exist
    const reprocessExists = apiExists && typeof (window as any).skimlinksAPI.reprocess === 'function';
    const reinitializeExists = apiExists && typeof (window as any).skimlinksAPI.reinitialize === 'function';
    
    // Check if skimwords is enabled (this is a best guess)
    const skimwordsEnabled = apiExists ? 
      (window as any).skimlinksAPI.settings?.skimwords_enabled || null : null;
    
    setSkimlinksStatus({
      loaded: scriptLoaded,
      apiExists,
      reprocessExists,
      reinitializeExists,
      skimwordsEnabled,
    });
    
    // Log to console for deeper debugging
    console.log('Skimlinks Debug:', {
      scriptLoaded,
      apiExists,
      window: apiExists ? (window as any).skimlinksAPI : undefined,
      reprocessExists,
      reinitializeExists,
      skimwordsEnabled,
    });
  };

  const forceReprocess = () => {
    try {
      if ((window as any).skimlinksAPI && typeof (window as any).skimlinksAPI.reprocess === 'function') {
        (window as any).skimlinksAPI.reprocess();
        console.log('Manually triggered Skimlinks reprocessing');
      } else if ((window as any).skimlinksAPI && typeof (window as any).skimlinksAPI.reinitialize === 'function') {
        (window as any).skimlinksAPI.reinitialize();
        console.log('Manually triggered Skimlinks reinitialization');
      } else {
        console.warn('Skimlinks API not available for manual reprocessing');
      }
    } catch (error) {
      console.error('Error while trying to reprocess Skimlinks:', error);
    }
    
    // Refresh status after attempting to reprocess
    setTimeout(checkSkimlinksStatus, 500);
  };
  
  const reloadScript = () => {
    try {
      // Remove existing script if present
      const existingScript = document.querySelector('script[src*="skimresources.com"]');
      if (existingScript) {
        existingScript.remove();
      }
      
      // Add fresh script
      const skimlinksScript = document.createElement('script');
      skimlinksScript.type = 'text/javascript';
      skimlinksScript.src = 'https://s.skimresources.com/js/44501X1766367.skimlinks.js';
      skimlinksScript.async = true;
      document.body.appendChild(skimlinksScript);
      
      console.log('Manually reloaded Skimlinks script');
      
      // Check status after a short delay to allow script to load
      setTimeout(checkSkimlinksStatus, 1500);
    } catch (error) {
      console.error('Error while trying to reload Skimlinks script:', error);
    }
  };

  return (
    <div className="p-4 border rounded-md bg-background/50 my-4">
      <h3 className="font-medium text-lg mb-2">Skimlinks Diagnostic Tool</h3>
      
      <div className="space-y-2 mb-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span>Script Loaded:</span>
          <span className={skimlinksStatus.loaded ? "text-green-600" : "text-red-600"}>
            {skimlinksStatus.loaded ? "Yes" : "No"}
          </span>
          
          <span>API Available:</span>
          <span className={skimlinksStatus.apiExists ? "text-green-600" : "text-red-600"}>
            {skimlinksStatus.apiExists ? "Yes" : "No"}
          </span>
          
          <span>Reprocess Method:</span>
          <span className={skimlinksStatus.reprocessExists ? "text-green-600" : "text-red-600"}>
            {skimlinksStatus.reprocessExists ? "Available" : "Not Available"}
          </span>
          
          <span>Reinitialize Method:</span>
          <span className={skimlinksStatus.reinitializeExists ? "text-green-600" : "text-red-600"}>
            {skimlinksStatus.reinitializeExists ? "Available" : "Not Available"}
          </span>
          
          <span>Skimwords Enabled:</span>
          <span>
            {skimlinksStatus.skimwordsEnabled === true ? (
              <span className="text-green-600">Yes</span>
            ) : skimlinksStatus.skimwordsEnabled === false ? (
              <span className="text-red-600">No</span>
            ) : (
              <span className="text-yellow-600">Unknown</span>
            )}
          </span>
        </div>
      </div>
      
      <div className="flex space-x-2">
        <Button size="sm" onClick={checkSkimlinksStatus}>
          Check Status
        </Button>
        <Button size="sm" onClick={forceReprocess}>
          Force Reprocess
        </Button>
        <Button size="sm" onClick={reloadScript} variant="outline">
          Reload Script
        </Button>
      </div>
      
      <div className="mt-4 text-xs text-muted-foreground">
        <p>Note: You can find more detailed information in the browser console.</p>
      </div>
    </div>
  );
};