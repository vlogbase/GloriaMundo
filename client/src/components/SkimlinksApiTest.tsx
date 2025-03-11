import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ArrowRight, Check, ExternalLink, AlertCircle, Link as LinkIcon } from 'lucide-react';

/**
 * Test component for Skimlinks API integration
 * Uses the Skimlinks API to verify account status and test link conversion
 */
export const SkimlinksApiTest = () => {
  // State for link testing
  const [originalUrl, setOriginalUrl] = useState('https://www.amazon.com/Apple-iPhone-13-128GB-Blue/dp/B09G9HD6PD');
  const [convertedUrl, setConvertedUrl] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [conversionError, setConversionError] = useState('');
  
  // State for account info
  const [accountInfo, setAccountInfo] = useState<any>(null);
  const [isLoadingAccount, setIsLoadingAccount] = useState(false);
  const [accountError, setAccountError] = useState('');

  // State for domain info
  const [domainInfo, setDomainInfo] = useState<any>(null);
  const [isLoadingDomain, setIsLoadingDomain] = useState(false);
  const [domainError, setDomainError] = useState('');

  // State for merchant info
  const [merchants, setMerchants] = useState<any[]>([]);
  const [isLoadingMerchants, setIsLoadingMerchants] = useState(false);
  const [merchantError, setMerchantError] = useState('');
  
  // Sample URLs for testing
  const sampleUrls = [
    'https://www.amazon.com/Apple-iPhone-13-128GB-Blue/dp/B09G9HD6PD',
    'https://www.parallels.com/products/desktop/',
    'https://www.swagbucks.com/shop/store/1585/origin-mattress-coupons',
    'https://www.originmattress.co.uk/',
    'https://www.deadgoodundies.com/mens-designer-underwear'
  ];

  // Function to get current hostname for domain checks
  const getCurrentHostname = () => {
    return window.location.hostname;
  };

  // Function to convert URL via server-side API proxy
  const convertUrl = async (url: string) => {
    setIsConverting(true);
    setConversionError('');
    setConvertedUrl('');
    
    try {
      const response = await fetch('/api/skimlinks/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      setConvertedUrl(data.convertedUrl || 'No affiliate link returned');
    } catch (error: any) {
      setConversionError(error.message || 'Error converting URL');
      console.error('Error converting URL:', error);
    } finally {
      setIsConverting(false);
    }
  };

  // Function to get account information
  const getAccountInfo = async () => {
    setIsLoadingAccount(true);
    setAccountError('');
    
    try {
      const response = await fetch('/api/skimlinks/account');
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      setAccountInfo(data);
    } catch (error: any) {
      setAccountError(error.message || 'Error loading account info');
      console.error('Error loading account info:', error);
    } finally {
      setIsLoadingAccount(false);
    }
  };

  // Function to get domain information
  const getDomainInfo = async () => {
    setIsLoadingDomain(true);
    setDomainError('');
    
    try {
      const response = await fetch(`/api/skimlinks/domain?domain=${getCurrentHostname()}`);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      setDomainInfo(data);
    } catch (error: any) {
      setDomainError(error.message || 'Error loading domain info');
      console.error('Error loading domain info:', error);
    } finally {
      setIsLoadingDomain(false);
    }
  };

  // Function to get top merchants
  const getMerchants = async () => {
    setIsLoadingMerchants(true);
    setMerchantError('');
    
    try {
      const response = await fetch('/api/skimlinks/merchants?limit=5');
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      setMerchants(data.merchants || []);
    } catch (error: any) {
      setMerchantError(error.message || 'Error loading merchants');
      console.error('Error loading merchants:', error);
    } finally {
      setIsLoadingMerchants(false);
    }
  };

  // Load all information on component mount
  useEffect(() => {
    getAccountInfo();
    getDomainInfo();
    getMerchants();
  }, []);

  return (
    <div className="space-y-6 p-4">
      <h2 className="text-2xl font-bold">Skimlinks API Testing</h2>
      <p className="text-muted-foreground">
        Test Skimlinks API functionality and your account status directly instead of relying on the JavaScript integration.
      </p>

      {/* Account Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Account Information
          </CardTitle>
          <CardDescription>
            View your Skimlinks account status and configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accountError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{accountError}</AlertDescription>
            </Alert>
          )}
          
          {isLoadingAccount ? (
            <div className="text-center py-4">Loading account information...</div>
          ) : accountInfo ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground">Publisher ID</h3>
                  <p className="font-mono text-sm">{accountInfo.publisher_id || 'Not available'}</p>
                </div>
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground">Account Status</h3>
                  <Badge variant={accountInfo.status === 'active' ? 'secondary' : 'destructive'} className={accountInfo.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : ''}>
                    {accountInfo.status || 'Unknown'}
                  </Badge>
                </div>
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground">Skimlinks Enabled</h3>
                  <Badge variant={accountInfo.skimlinks_enabled ? 'secondary' : 'destructive'} className={accountInfo.skimlinks_enabled ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : ''}>
                    {accountInfo.skimlinks_enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground">Skimwords Enabled</h3>
                  <Badge variant={accountInfo.skimwords_enabled ? 'secondary' : 'destructive'} className={accountInfo.skimwords_enabled ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : ''}>
                    {accountInfo.skimwords_enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              </div>
              
              <Separator />
              
              <div>
                <h3 className="font-medium mb-2">Configuration</h3>
                <pre className="bg-muted p-4 rounded-md text-xs overflow-auto">
                  {JSON.stringify(accountInfo.config || {}, null, 2)}
                </pre>
              </div>
              
              <Button onClick={getAccountInfo} size="sm" variant="outline">
                Refresh Account Info
              </Button>
            </div>
          ) : (
            <div className="text-center py-4">No account information available</div>
          )}
        </CardContent>
      </Card>

      {/* Domain Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            Domain Status
          </CardTitle>
          <CardDescription>
            Verify if this domain is approved for monetization
          </CardDescription>
        </CardHeader>
        <CardContent>
          {domainError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{domainError}</AlertDescription>
            </Alert>
          )}
          
          {isLoadingDomain ? (
            <div className="text-center py-4">Loading domain information...</div>
          ) : domainInfo ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground">Domain</h3>
                  <p className="font-mono text-sm">{domainInfo.domain || getCurrentHostname()}</p>
                </div>
                <div>
                  <h3 className="font-medium text-sm text-muted-foreground">Approval Status</h3>
                  <Badge variant={domainInfo.approved ? 'secondary' : 'destructive'} className={domainInfo.approved ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : ''}>
                    {domainInfo.approved ? 'Approved' : 'Not Approved'}
                  </Badge>
                </div>
              </div>
              
              <Button onClick={getDomainInfo} size="sm" variant="outline">
                Refresh Domain Info
              </Button>
            </div>
          ) : (
            <div className="text-center py-4">No domain information available</div>
          )}
        </CardContent>
      </Card>

      {/* URL Conversion Testing */}
      <Card>
        <CardHeader>
          <CardTitle>URL Conversion Test</CardTitle>
          <CardDescription>
            Test converting a regular URL to an affiliate link using the Skimlinks API
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url-input">URL to Convert</Label>
              <div className="flex gap-2">
                <Input
                  id="url-input"
                  value={originalUrl}
                  onChange={(e) => setOriginalUrl(e.target.value)}
                  placeholder="Enter URL to convert"
                  className="flex-1"
                />
                <Button 
                  onClick={() => convertUrl(originalUrl)} 
                  disabled={isConverting || !originalUrl}
                >
                  {isConverting ? 'Converting...' : 'Convert'}
                </Button>
              </div>

              <div className="space-y-1 mt-1">
                <Label className="text-xs text-muted-foreground">Sample URLs</Label>
                <div className="flex flex-wrap gap-1">
                  {sampleUrls.map((url, idx) => (
                    <Badge 
                      key={idx} 
                      variant="outline" 
                      className="cursor-pointer hover:bg-secondary/50"
                      onClick={() => setOriginalUrl(url)}
                    >
                      Sample {idx + 1}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {conversionError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Conversion Error</AlertTitle>
                <AlertDescription>{conversionError}</AlertDescription>
              </Alert>
            )}

            {convertedUrl && (
              <div className="space-y-2">
                <Label htmlFor="converted-url">Converted Affiliate URL</Label>
                <Textarea
                  id="converted-url"
                  value={convertedUrl}
                  readOnly
                  className="font-mono text-xs h-24"
                />
                <div className="flex justify-between items-center">
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    <Check className="h-3 w-3 mr-1" /> Conversion Successful
                  </Badge>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => window.open(convertedUrl, '_blank')}
                  >
                    Test Link <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Merchant Information */}
      <Card>
        <CardHeader>
          <CardTitle>Top Merchants</CardTitle>
          <CardDescription>
            View some of the top merchants available through Skimlinks
          </CardDescription>
        </CardHeader>
        <CardContent>
          {merchantError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{merchantError}</AlertDescription>
            </Alert>
          )}
          
          {isLoadingMerchants ? (
            <div className="text-center py-4">Loading merchant information...</div>
          ) : merchants.length > 0 ? (
            <div className="space-y-4">
              <div className="grid gap-2">
                {merchants.map((merchant, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 border rounded-md">
                    <div>
                      <h3 className="font-medium">{merchant.name}</h3>
                      <p className="text-xs text-muted-foreground">{merchant.domain}</p>
                    </div>
                    <Badge variant="outline">
                      {merchant.commission_rate || 'Variable'}
                    </Badge>
                  </div>
                ))}
              </div>
              
              <Button onClick={getMerchants} size="sm" variant="outline">
                Refresh Merchants
              </Button>
            </div>
          ) : (
            <div className="text-center py-4">No merchant information available</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SkimlinksApiTest;