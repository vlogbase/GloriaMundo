import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { refreshSkimlinks } from "@/lib/utils";

/**
 * Advanced test component specifically for Skimwords functionality
 * Uses direct interaction with Skimlinks JS API
 */
export const SkimwordsTest = () => {
  const [testActive, setTestActive] = useState(false);
  const [results, setResults] = useState<{
    skimwordsEnabled: boolean | null;
    enableAttemptResult: string | null;
    linksCreated: number;
    originalSetting: boolean | null;
    hasReprocessed: boolean;
    pubId: string | null;
  }>({
    skimwordsEnabled: null,
    enableAttemptResult: null,
    linksCreated: 0,
    originalSetting: null,
    hasReprocessed: false,
    pubId: null,
  });

  // Force enable Skimwords and confirm it's working
  const forceEnableSkimwords = () => {
    setTestActive(true);
    
    try {
      // Access the Skimlinks API
      const skimAPI = (window as any).skimlinksAPI;
      
      if (!skimAPI) {
        setResults(prev => ({
          ...prev,
          enableAttemptResult: "Failed: Skimlinks API not available"
        }));
        return;
      }
      
      // Store original setting
      const originalSetting = skimAPI.settings?.skimwords_enabled || false;
      setResults(prev => ({ 
        ...prev, 
        originalSetting,
        pubId: skimAPI.publisher_id || skimAPI.pubcode || null
      }));
      
      // Try multiple ways to enable skimwords
      const enableMethods = [
        // Method 1: Direct property assignment
        () => {
          if (skimAPI.settings) {
            skimAPI.settings.skimwords_enabled = true;
            return "Method 1: Direct property assignment";
          }
          return null;
        },
        
        // Method 2: Using setOption if available
        () => {
          if (typeof skimAPI.setOption === 'function') {
            skimAPI.setOption('skimwords_enabled', true);
            return "Method 2: Using setOption API";
          }
          return null;
        },
        
        // Method 3: Try to use undocumented methods
        () => {
          if (typeof skimAPI.enableSkimwords === 'function') {
            skimAPI.enableSkimwords();
            return "Method 3: Using enableSkimwords API";
          }
          return null;
        }
      ];
      
      // Try each method until one works
      let successMethod = null;
      for (const method of enableMethods) {
        const result = method();
        if (result) {
          successMethod = result;
          break;
        }
      }
      
      // Process content after enabling
      let hasReprocessed = false;
      if (typeof skimAPI.reprocess === 'function') {
        skimAPI.reprocess();
        hasReprocessed = true;
      } else if (typeof skimAPI.reinitialize === 'function') {
        skimAPI.reinitialize();
        hasReprocessed = true;
      }
      
      // Check if setting was actually changed
      const newSetting = skimAPI.settings?.skimwords_enabled || false;
      
      // Count monetized links after processing
      setTimeout(() => {
        const monetizedElements = document.querySelectorAll('[data-skim-creative]');
        
        setResults({
          skimwordsEnabled: newSetting,
          enableAttemptResult: successMethod || "All methods failed",
          linksCreated: monetizedElements.length,
          originalSetting,
          hasReprocessed,
          pubId: skimAPI.publisher_id || skimAPI.pubcode || null
        });
      }, 1000);
      
    } catch (error) {
      console.error("Error in SkimwordsTest:", error);
      setResults(prev => ({
        ...prev,
        enableAttemptResult: `Error: ${(error as Error).message}`
      }));
    }
  };
  
  const resetTest = () => {
    setTestActive(false);
    setResults({
      skimwordsEnabled: null,
      enableAttemptResult: null,
      linksCreated: 0,
      originalSetting: null,
      hasReprocessed: false,
      pubId: null,
    });
  };

  return (
    <Card className="p-4 mt-4">
      <h3 className="text-lg font-medium mb-2">Advanced Skimwords Testing</h3>
      
      {!testActive ? (
        <div>
          <p className="text-sm mb-3">
            This tool will try to directly enable Skimwords functionality using various methods
            and measure the results.
          </p>
          <Button onClick={forceEnableSkimwords}>Start Skimwords Test</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="font-medium">Publisher ID:</span>
              <span>{results.pubId || 'Not found'}</span>
              
              <span className="font-medium">Original Skimwords Setting:</span>
              <span>{results.originalSetting === null ? 'Unknown' : results.originalSetting ? 'Enabled' : 'Disabled'}</span>
              
              <span className="font-medium">Current Skimwords Setting:</span>
              <span className={results.skimwordsEnabled ? "text-green-600" : "text-red-600"}>
                {results.skimwordsEnabled === null ? 'Unknown' : results.skimwordsEnabled ? 'Enabled' : 'Disabled'}
              </span>
              
              <span className="font-medium">Enable Method:</span>
              <span>{results.enableAttemptResult || 'Pending...'}</span>
              
              <span className="font-medium">Reprocessed Content:</span>
              <span>{results.hasReprocessed ? 'Yes' : 'No'}</span>
              
              <span className="font-medium">Monetized Links Found:</span>
              <span className={results.linksCreated > 0 ? "text-green-600 font-medium" : "text-red-600"}>
                {results.linksCreated}
              </span>
            </div>
          </div>
          
          <div className="border-t pt-3">
            <h4 className="font-medium text-sm mb-2">Test Content</h4>
            <p className="text-sm mb-2">
              These product references should be monetized if Skimwords is working properly:
            </p>
            <div className="text-sm p-3 bg-background rounded-md">
              Check out the latest Apple iPhone models, Samsung Galaxy devices, Nintendo Switch games,
              Meta Quest headsets, or Google Pixel phones. You might also be interested in
              Microsoft Surface laptops, Sony PlayStation 5, or Amazon Kindle readers.
            </div>
          </div>
          
          <div className="flex space-x-2">
            <Button size="sm" onClick={forceEnableSkimwords}>
              Try Again
            </Button>
            <Button size="sm" variant="outline" onClick={resetTest}>
              Reset Test
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};