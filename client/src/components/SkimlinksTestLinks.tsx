import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { refreshSkimlinks } from "@/lib/utils";

export const SkimlinksTestLinks = () => {
  const [showLinks, setShowLinks] = useState(false);
  const [linkCount, setLinkCount] = useState(0);
  const [linksModified, setLinksModified] = useState(false);
  
  // Function to count modified links
  const countModifiedLinks = () => {
    if (typeof window === 'undefined') return 0;
    
    // Look for data-skim-creative attribute which Skimlinks adds
    const modifiedLinks = document.querySelectorAll('[data-skim-creative]');
    return modifiedLinks.length;
  };
  
  // Check if links were modified
  const checkLinksModified = () => {
    const count = countModifiedLinks();
    setLinkCount(count);
    setLinksModified(count > 0);
    return count > 0;
  };
  
  const handleRefreshSkimlinks = () => {
    refreshSkimlinks();
    // Check after a short delay
    setTimeout(() => {
      checkLinksModified();
    }, 1000);
  };
  
  // Check for modified links when component mounts or links are shown
  useEffect(() => {
    if (showLinks) {
      // Allow time for Skimlinks to process links
      const timer = setTimeout(() => {
        checkLinksModified();
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [showLinks]);
  
  return (
    <div className="my-4">
      <div className="flex items-center gap-2 mb-2">
        <Button 
          size="sm" 
          onClick={() => setShowLinks(!showLinks)}
        >
          {showLinks ? "Hide Test Links" : "Show Test Links"}
        </Button>
        
        {showLinks && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefreshSkimlinks}
          >
            Manually Refresh Skimlinks
          </Button>
        )}
      </div>
      
      {showLinks && (
        <Card className="p-4 mt-2 space-y-3">
          <div>
            <h3 className="text-lg font-medium mb-2">Test Links Status</h3>
            <div className="text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span>Links Modified by Skimlinks:</span>
                <span className={linksModified ? "text-green-600" : "text-red-600"}>
                  {linksModified ? `Yes (${linkCount} links)` : "No"}
                </span>
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <div>
              <h4 className="font-medium mb-1">Test Link (Skimlinks Official Test)</h4>
              <a 
                href="https://go.skimresources.com/?id=44501X1766367" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-primary hover:underline"
              >
                Skimlinks Test Link
              </a>
            </div>
            
            <div>
              <h4 className="font-medium mb-1">Verified Skimlinks Merchant Links</h4>
              <div className="space-y-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <a 
                  href="https://originmattress.co.uk/product/the-origin-hybrid-pro-mattress/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-primary hover:underline block"
                >
                  Origin Pro Mattress
                </a>
                
                <a 
                  href="https://www.parallels.com/products/desktop/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-primary hover:underline block"
                >
                  Parallels Desktop for Mac
                </a>
                
                <a 
                  href="https://www.swagbucks.com/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-primary hover:underline block"
                >
                  Swagbucks
                </a>
                
                <a 
                  href="https://www.deadgoodundies.com/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-primary hover:underline block"
                >
                  Dead Good Undies
                </a>
              </div>
            </div>
            
            <div>
              <h4 className="font-medium mb-1">Additional Product Examples</h4>
              <a 
                href="https://www.amazon.com/dp/B07ZPML7NP" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-primary hover:underline block mb-1"
              >
                Apple AirPods Pro
              </a>
              
              <p className="text-sm mt-2">
                Text with brand mentions: Apple iPhone, Samsung Galaxy, Nintendo Switch,
                Google Pixel, and Microsoft Surface. These should be monetized by Skimwords if working correctly.
              </p>
            </div>
          </div>
          
          <div className="text-xs text-muted-foreground mt-2">
            <p>Note: After showing these links, Skimlinks should process them automatically.</p>
            <p>If links aren't being modified, try clicking the "Manually Refresh Skimlinks" button.</p>
          </div>
        </Card>
      )}
    </div>
  );
};