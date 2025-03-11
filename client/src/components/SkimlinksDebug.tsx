import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { refreshSkimlinks } from "@/lib/utils";

export const SkimlinksDebug = () => {
  const [skimlinksStatus, setSkimlinksStatus] = useState<{
    loaded: boolean;
    scriptStatus: {
      found: boolean;
      src: string | null;
      async: boolean | null;
      id: string | null;
      loadTime: string | null;
    };
    apiExists: boolean;
    reprocessExists: boolean;
    reinitializeExists: boolean;
    skimwordsEnabled: boolean | null;
    domains: string[];
    pubcode: string | null;
    settings: Record<string, any> | null;
  }>({
    loaded: false,
    scriptStatus: {
      found: false,
      src: null,
      async: null,
      id: null,
      loadTime: null,
    },
    apiExists: false,
    reprocessExists: false,
    reinitializeExists: false,
    skimwordsEnabled: null,
    domains: [],
    pubcode: null,
    settings: null,
  });

  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Check Skimlinks status on component mount
    checkSkimlinksStatus();
    
    // Periodically check status
    const intervalId = setInterval(() => {
      checkSkimlinksStatus();
    }, 15000); // Check every 15 seconds
    
    return () => clearInterval(intervalId);
  }, []);

  const checkSkimlinksStatus = () => {
    // Check if Skimlinks script is loaded and get detailed script info
    const skimlinksScript = document.querySelector('script[src*="skimresources.com"]') as HTMLScriptElement;
    const scriptLoaded = !!skimlinksScript;
    
    // Get detailed script information
    const scriptStatus = {
      found: scriptLoaded,
      src: scriptLoaded ? skimlinksScript.src : null,
      async: scriptLoaded ? skimlinksScript.async : null,
      id: scriptLoaded ? skimlinksScript.id || null : null,
      loadTime: scriptLoaded ? skimlinksScript.getAttribute('data-loaded-at') || null : null,
    };
    
    // Check if skimlinksAPI exists
    const apiExists = typeof (window as any).skimlinksAPI !== 'undefined';
    
    // Default values
    let reprocessExists = false;
    let reinitializeExists = false;
    let skimwordsEnabled = null;
    let domains: string[] = [];
    let pubcode = null;
    let settings = null;
    
    // Check specific properties if API exists
    if (apiExists) {
      const api = (window as any).skimlinksAPI;
      
      // Check if specific methods exist
      reprocessExists = typeof api.reprocess === 'function';
      reinitializeExists = typeof api.reinitialize === 'function';
      
      // Gather additional information
      try {
        skimwordsEnabled = api.settings?.skimwords_enabled || null;
        domains = api.domains || [];
        pubcode = api.publisher_id || api.pubcode || null;
        settings = api.settings || null;
        
        // Check for alternative properties
        if (settings === null && typeof api.getSettings === 'function') {
          try {
            settings = api.getSettings();
          } catch (e) {
            console.debug('Could not get settings via getSettings()');
          }
        }
        
        // Look for domains in alternative properties
        if (!domains || domains.length === 0) {
          if (api.merchant_domains) domains = api.merchant_domains;
          else if (api.config && api.config.domains) domains = api.config.domains;
        }
      } catch (error) {
        console.error('Error reading Skimlinks settings:', error);
      }
    }
    
    setSkimlinksStatus({
      loaded: scriptLoaded,
      scriptStatus,
      apiExists,
      reprocessExists,
      reinitializeExists,
      skimwordsEnabled,
      domains,
      pubcode,
      settings,
    });
    
    // Log to console for deeper debugging
    console.debug('Skimlinks Debug:', {
      scriptLoaded,
      scriptStatus,
      apiExists,
      api: apiExists ? (window as any).skimlinksAPI : undefined,
      reprocessExists,
      reinitializeExists,
      skimwordsEnabled,
      domains,
      pubcode,
      settings,
    });
  };

  const forceReprocess = () => {
    try {
      refreshSkimlinks(); // Use our utility function
      console.debug('Manually triggered Skimlinks refreshing');
    } catch (error) {
      console.error('Error while trying to refresh Skimlinks:', error);
    }
    
    // Refresh status after attempting to reprocess
    setTimeout(checkSkimlinksStatus, 1000);
  };
  
  const enableSkimwords = () => {
    try {
      if ((window as any).skimlinksAPI && (window as any).skimlinksAPI.settings) {
        (window as any).skimlinksAPI.settings.skimwords_enabled = true;
        console.debug('Manually enabled Skimwords');
        
        // Try to force reprocess after changing setting
        if (typeof (window as any).skimlinksAPI.reprocess === 'function') {
          (window as any).skimlinksAPI.reprocess();
        }
      } else {
        console.warn('Skimlinks API settings not available');
      }
    } catch (error) {
      console.error('Error while trying to enable Skimwords:', error);
    }
    
    // Refresh status after change
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
      skimlinksScript.id = 'skimlinks-script';
      
      // Add data attribute to track when script was loaded
      skimlinksScript.setAttribute('data-loaded-at', new Date().toISOString());
      
      document.body.appendChild(skimlinksScript);
      
      console.debug('Manually reloaded Skimlinks script');
      
      // Check status after a short delay to allow script to load
      setTimeout(checkSkimlinksStatus, 2000);
    } catch (error) {
      console.error('Error while trying to reload Skimlinks script:', error);
    }
  };

  return (
    <div className="p-4 border rounded-md bg-background/50 my-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium text-lg">Skimlinks Diagnostic Tool</h3>
        <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Less' : 'More'} Info
        </Button>
      </div>
      
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
          
          {skimlinksStatus.pubcode && (
            <>
              <span>Publisher Code:</span>
              <span>{skimlinksStatus.pubcode}</span>
            </>
          )}
          
          {skimlinksStatus.scriptStatus.src && (
            <>
              <span>Script Source:</span>
              <span className="truncate max-w-[200px]">{skimlinksStatus.scriptStatus.src}</span>
            </>
          )}
          
          {skimlinksStatus.scriptStatus.loadTime && (
            <>
              <span>Script Load Time:</span>
              <span>{skimlinksStatus.scriptStatus.loadTime}</span>
            </>
          )}
        </div>
      </div>
      
      {expanded && (
        <div className="mb-4">
          <h4 className="font-medium text-sm mb-1">Domains:</h4>
          <div className="text-xs bg-muted/50 p-2 rounded max-h-20 overflow-y-auto">
            {skimlinksStatus.domains.length > 0 ? (
              skimlinksStatus.domains.map((domain, index) => (
                <div key={index}>{domain}</div>
              ))
            ) : (
              <div className="text-muted-foreground">No domains found</div>
            )}
          </div>
          
          {skimlinksStatus.settings && (
            <>
              <h4 className="font-medium text-sm mt-2 mb-1">Settings:</h4>
              <div className="text-xs bg-muted/50 p-2 rounded max-h-20 overflow-y-auto">
                <pre>{JSON.stringify(skimlinksStatus.settings, null, 2)}</pre>
              </div>
            </>
          )}
        </div>
      )}
      
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={checkSkimlinksStatus}>
          Check Status
        </Button>
        <Button size="sm" onClick={forceReprocess}>
          Force Reprocess
        </Button>
        <Button size="sm" onClick={enableSkimwords} variant="outline">
          Enable Skimwords
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