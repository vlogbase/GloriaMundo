import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Check, X, AlertCircle, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface ApiResponse {
  status: 'success' | 'error';
  data?: any;
  error?: string;
}

/**
 * Test component for Skimlinks API integration
 * Uses the Skimlinks API to verify account status and test link conversion
 */
const SkimlinksApiTest = () => {
  const [accountInfo, setAccountInfo] = useState<any>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  
  const [domainInfo, setDomainInfo] = useState<any>(null);
  const [domainName, setDomainName] = useState<string>(window.location.hostname);
  const [domainLoading, setDomainLoading] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  
  const [merchants, setMerchants] = useState<any[]>([]);
  const [merchantLimit, setMerchantLimit] = useState<number>(5);
  const [merchantsLoading, setMerchantsLoading] = useState(false);
  const [merchantsError, setMerchantsError] = useState<string | null>(null);
  
  const [urlToConvert, setUrlToConvert] = useState<string>('https://www.amazon.com/dp/B09G9FPHY6');
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const [merchantInfo, setMerchantInfo] = useState<any>(null);
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  
  const { toast } = useToast();

  // Check account info on component mount
  useEffect(() => {
    fetchAccountInfo();
    fetchDomainInfo(domainName);
  }, []);

  // Fetch account information
  const fetchAccountInfo = async () => {
    setAccountLoading(true);
    setAccountError(null);
    
    try {
      const response = await fetch('/api/skimlinks/account');
      const data = await response.json();
      
      if (response.ok) {
        setAccountInfo(data);
      } else {
        setAccountError(data.error || 'Failed to fetch account information');
        toast({
          title: "Error",
          description: data.error || 'Failed to fetch account information',
          variant: "destructive"
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      setAccountError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setAccountLoading(false);
    }
  };

  // Fetch domain information
  const fetchDomainInfo = async (domain: string) => {
    if (!domain) return;
    
    setDomainLoading(true);
    setDomainError(null);
    
    try {
      const response = await fetch(`/api/skimlinks/domain?domain=${encodeURIComponent(domain)}`);
      const data = await response.json();
      
      if (response.ok) {
        setDomainInfo(data);
      } else {
        setDomainError(data.error || 'Failed to fetch domain information');
        toast({
          title: "Error",
          description: data.error || 'Failed to fetch domain information',
          variant: "destructive"
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      setDomainError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setDomainLoading(false);
    }
  };

  // Fetch top merchants
  const fetchMerchants = async (limit: number = 5) => {
    setMerchantsLoading(true);
    setMerchantsError(null);
    
    try {
      const response = await fetch(`/api/skimlinks/merchants?limit=${limit}`);
      const data = await response.json();
      
      if (response.ok && data.merchants) {
        setMerchants(data.merchants);
      } else {
        setMerchantsError(data.error || 'Failed to fetch merchant information');
        toast({
          title: "Error",
          description: data.error || 'Failed to fetch merchant information',
          variant: "destructive"
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      setMerchantsError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setMerchantsLoading(false);
    }
  };

  // Convert URL to affiliate link
  const convertUrl = async (url: string) => {
    if (!url) return;
    
    setConvertLoading(true);
    setConvertError(null);
    setConvertedUrl(null);
    setMerchantInfo(null);
    
    try {
      const response = await fetch('/api/skimlinks/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setConvertedUrl(data.convertedUrl);
        setMerchantInfo(data.merchantInfo);
        
        if (data.originalUrl === data.convertedUrl) {
          toast({
            title: "Notice",
            description: "The URL was not converted. This might mean it's not from a merchant in the Skimlinks network.",
            variant: "default"
          });
        } else {
          toast({
            title: "Success",
            description: "URL converted successfully!",
            variant: "default"
          });
        }
      } else {
        setConvertError(data.error || 'Failed to convert URL');
        toast({
          title: "Error",
          description: data.error || 'Failed to convert URL',
          variant: "destructive"
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      setConvertError(message);
      toast({
        title: "Error",
        description: message,
        variant: "destructive"
      });
    } finally {
      setConvertLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Skimlinks API Test</h1>
        <Link href="/">
          <Button variant="outline" size="sm">
            Back to Chat
          </Button>
        </Link>
      </div>
      
      <p className="text-muted-foreground mb-8">
        This page tests the Skimlinks API integration using server-side API requests.
        This is a different implementation approach from the JavaScript SDK integration.
      </p>
      
      <Tabs defaultValue="account">
        <TabsList className="mb-4">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="domain">Domain</TabsTrigger>
          <TabsTrigger value="merchants">Merchants</TabsTrigger>
          <TabsTrigger value="convert">Convert URL</TabsTrigger>
        </TabsList>
        
        {/* Account Tab */}
        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>
                Check your Skimlinks account status and configuration
              </CardDescription>
            </CardHeader>
            <CardContent>
              {accountLoading ? (
                <div className="text-center py-4">Loading account information...</div>
              ) : accountError ? (
                <div className="bg-destructive/10 p-4 rounded-md">
                  <div className="flex items-center text-destructive mb-2">
                    <AlertCircle className="h-5 w-5 mr-2" />
                    <span className="font-semibold">Error</span>
                  </div>
                  <p>{accountError}</p>
                </div>
              ) : accountInfo ? (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium mb-2">Account Details</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-muted-foreground">Account ID:</div>
                      <div>{accountInfo.id || 'N/A'}</div>
                      
                      <div className="text-muted-foreground">Name:</div>
                      <div>{accountInfo.name || 'N/A'}</div>
                      
                      <div className="text-muted-foreground">Status:</div>
                      <div className="flex items-center">
                        {accountInfo.activated ? (
                          <><Check className="h-4 w-4 text-green-500 mr-1" /> Active</>
                        ) : (
                          <><X className="h-4 w-4 text-red-500 mr-1" /> Inactive</>
                        )}
                      </div>
                      
                      <div className="text-muted-foreground">Skimlinks ID:</div>
                      <div>{accountInfo.skimlinks_id || 'N/A'}</div>
                      
                      <div className="text-muted-foreground">Created:</div>
                      <div>{new Date(accountInfo.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h3 className="font-medium mb-2">Features</h3>
                    <div className="flex flex-wrap gap-2">
                      {accountInfo.features?.map((feature: string) => (
                        <Badge key={feature} variant="outline">
                          {feature}
                        </Badge>
                      ))}
                      {(!accountInfo.features || accountInfo.features.length === 0) && (
                        <span className="text-muted-foreground text-sm">No features listed</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  No account information available
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button onClick={fetchAccountInfo} disabled={accountLoading}>
                {accountLoading ? 'Loading...' : 'Refresh Account Info'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* Domain Tab */}
        <TabsContent value="domain">
          <Card>
            <CardHeader>
              <CardTitle>Domain Status</CardTitle>
              <CardDescription>
                Check if your domain is approved in the Skimlinks network
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Domain Name</label>
                <div className="flex gap-2">
                  <Input
                    value={domainName}
                    onChange={(e) => setDomainName(e.target.value)}
                    placeholder="Enter domain name"
                    className="flex-1"
                  />
                  <Button 
                    onClick={() => fetchDomainInfo(domainName)} 
                    disabled={!domainName || domainLoading}
                  >
                    Check
                  </Button>
                </div>
              </div>
              
              {domainLoading ? (
                <div className="text-center py-4">Checking domain status...</div>
              ) : domainError ? (
                <div className="bg-destructive/10 p-4 rounded-md">
                  <div className="flex items-center text-destructive mb-2">
                    <AlertCircle className="h-5 w-5 mr-2" />
                    <span className="font-semibold">Error</span>
                  </div>
                  <p>{domainError}</p>
                </div>
              ) : domainInfo ? (
                <div className="bg-card p-4 border rounded-md">
                  <div className="flex items-center mb-3">
                    <h3 className="font-medium">Domain: {domainInfo.domain}</h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">Approval Status:</div>
                    <div className="flex items-center">
                      {domainInfo.approved ? (
                        <><Check className="h-4 w-4 text-green-500 mr-1" /> Approved</>
                      ) : (
                        <><X className="h-4 w-4 text-red-500 mr-1" /> Not Approved</>
                      )}
                    </div>
                    
                    <div className="text-muted-foreground">Status:</div>
                    <div>{domainInfo.status}</div>
                  </div>
                  
                  {!domainInfo.approved && (
                    <div className="mt-4 p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-md text-sm">
                      <div className="flex items-start">
                        <AlertCircle className="h-4 w-4 mr-2 mt-0.5" />
                        <div>
                          Your domain is not approved. You'll need to register and approve it in your Skimlinks account
                          before you can use Skimlinks features.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  Enter a domain name and click "Check" to verify its status
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Merchants Tab */}
        <TabsContent value="merchants">
          <Card>
            <CardHeader>
              <CardTitle>Top Merchants</CardTitle>
              <CardDescription>
                View the top merchants in the Skimlinks network
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Number of merchants to show</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={merchantLimit}
                    onChange={(e) => setMerchantLimit(Number(e.target.value))}
                    min={1}
                    max={50}
                    className="w-32"
                  />
                  <Button 
                    onClick={() => fetchMerchants(merchantLimit)} 
                    disabled={merchantsLoading}
                  >
                    Fetch Merchants
                  </Button>
                </div>
              </div>
              
              {merchantsLoading ? (
                <div className="text-center py-4">Loading merchant data...</div>
              ) : merchantsError ? (
                <div className="bg-destructive/10 p-4 rounded-md">
                  <div className="flex items-center text-destructive mb-2">
                    <AlertCircle className="h-5 w-5 mr-2" />
                    <span className="font-semibold">Error</span>
                  </div>
                  <p>{merchantsError}</p>
                </div>
              ) : merchants.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead>
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Domain</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Country</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Commission</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {merchants.map((merchant) => (
                        <tr key={merchant.id}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            <div className="font-medium">{merchant.name}</div>
                            <div className="text-xs text-muted-foreground">ID: {merchant.id}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            <a 
                              href={`https://${merchant.domain}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center hover:underline text-primary"
                            >
                              {merchant.domain}
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {merchant.country_code || 'N/A'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {merchant.average_commission_rate ? 
                              `${(merchant.average_commission_rate * 100).toFixed(2)}%` : 
                              'N/A'
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  No merchant data available. Click "Fetch Merchants" to load the data.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Convert URL Tab */}
        <TabsContent value="convert">
          <Card>
            <CardHeader>
              <CardTitle>Convert URL</CardTitle>
              <CardDescription>
                Convert a regular URL into an affiliate link
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">URL to Convert</label>
                <div className="flex gap-2">
                  <Input
                    value={urlToConvert}
                    onChange={(e) => setUrlToConvert(e.target.value)}
                    placeholder="Enter URL to convert"
                    className="flex-1"
                  />
                  <Button 
                    onClick={() => convertUrl(urlToConvert)} 
                    disabled={!urlToConvert || convertLoading}
                  >
                    Convert
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Example: https://www.amazon.com/dp/B09G9FPHY6
                </p>
              </div>
              
              {convertLoading ? (
                <div className="text-center py-4">Converting URL...</div>
              ) : convertError ? (
                <div className="bg-destructive/10 p-4 rounded-md">
                  <div className="flex items-center text-destructive mb-2">
                    <AlertCircle className="h-5 w-5 mr-2" />
                    <span className="font-semibold">Error</span>
                  </div>
                  <p>{convertError}</p>
                </div>
              ) : convertedUrl ? (
                <div className="space-y-4">
                  <div className="p-4 border rounded-md">
                    <h3 className="font-medium mb-2">Converted URL</h3>
                    <div className="break-all text-sm mb-3 bg-muted p-3 rounded">
                      {convertedUrl}
                    </div>
                    <a 
                      href={convertedUrl} 
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-primary text-sm hover:underline"
                    >
                      Open link <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </div>
                  
                  {merchantInfo && (
                    <div className="p-4 border rounded-md">
                      <h3 className="font-medium mb-2">Merchant Information</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-muted-foreground">Name:</div>
                        <div>{merchantInfo.name || 'N/A'}</div>
                        
                        <div className="text-muted-foreground">Domain:</div>
                        <div>{merchantInfo.domain || 'N/A'}</div>
                        
                        <div className="text-muted-foreground">Commission Rate:</div>
                        <div>
                          {merchantInfo.average_commission_rate ? 
                            `${(merchantInfo.average_commission_rate * 100).toFixed(2)}%` : 
                            'N/A'
                          }
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {urlToConvert === convertedUrl && (
                    <div className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-md text-sm">
                      <div className="flex items-start">
                        <AlertCircle className="h-4 w-4 mr-2 mt-0.5" />
                        <div>
                          The URL was not converted. This might mean it's not from a merchant in the Skimlinks network
                          or there was an issue with the conversion process.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  Enter a URL and click "Convert" to generate an affiliate link
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SkimlinksApiTest;