import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from '@/lib/queryClient';
import { useToast } from "@/hooks/use-toast";
import { 
  PayPalScriptProvider, 
  PayPalButtons,
  usePayPalScriptReducer
} from "@paypal/react-paypal-js";
import * as RechartsPrimitive from "recharts";
import { 
  ChartContainer, 
  ChartTooltip,
  ChartTooltipContent
} from "@/components/ui/chart";

interface CreditPackage {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  credits: number;
}

interface User {
  id: number;
  name: string;
  email: string;
  avatarUrl: string;
  creditBalance: number;
  createdAt: Date;
  updatedAt: Date;
}

interface PaymentTransaction {
  id: number;
  userId: number;
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  packageId: string | null;
  amount: number;
  fee: number;
  credits: number;
  status: string;
  metadata: any | null;
  createdAt: Date;
}

interface UsageLog {
  id: number;
  userId: number;
  messageId: number | null;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  imageCount: number;
  creditsUsed: number;
  metadata: any | null;
  createdAt: Date;
}

interface UsageStats {
  modelId: string;
  totalCredits: number;
  totalTokens: number;
  totalCreditsDollars: string;
}

interface UserSettings {
  id: number;
  userId: number;
  lowBalanceThreshold: number;
  emailNotificationsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const Spinner = () => (
  <div className="flex items-center justify-center p-4">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
  </div>
);

export function CreditsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('purchase');
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [paypalButtonsLoaded, setPaypalButtonsLoaded] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paypalClientId, setPaypalClientId] = useState<string>(import.meta.env.VITE_PAYPAL_CLIENT_ID || "");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [customAmountError, setCustomAmountError] = useState<string>("");
  const [isCustomAmount, setIsCustomAmount] = useState<boolean>(false);
  
  // Date range for usage statistics
  const [dateRange, setDateRange] = useState<{
    startDate: Date;
    endDate: Date;
  }>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30); // Default to last 30 days
    return { startDate: start, endDate: end };
  });
  
  // Fetch PayPal client ID from server as fallback
  const fetchPaypalClientId = async () => {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const config = await response.json();
        if (config.paypalClientId) {
          setPaypalClientId(config.paypalClientId);
        } else {
          console.error('PayPal Client ID not found in config');
        }
      } else {
        console.error('Failed to fetch config');
      }
    } catch (error) {
      console.error('Error fetching PayPal client ID:', error);
    }
  };
  
  // If environment variable is not available, fetch from server as fallback
  useEffect(() => {
    if (!paypalClientId) {
      fetchPaypalClientId();
    }
  }, [paypalClientId]);
  
  // Query for credit packages
  const { data: packages, isLoading: isLoadingPackages } = useQuery<CreditPackage[]>({
    queryKey: ['/api/credits/packages'],
    queryFn: async () => {
      const response = await fetch('/api/credits/packages');
      if (!response.ok) {
        throw new Error('Failed to fetch credit packages');
      }
      return response.json();
    },
    retry: 3
  });

  // Query for current user
  const { data: user, isLoading: isLoadingUser } = useQuery<User | null>({
    queryKey: ['/api/auth/me'],
    queryFn: async () => {
      const response = await fetch('/api/auth/me');
      if (!response.ok) {
        if (response.status === 401) {
          return null; // Not authenticated
        }
        throw new Error('Failed to fetch user data');
      }
      return response.json();
    }
  });
  
  // Query for payment transactions
  const { data: transactions, isLoading: isLoadingTransactions } = useQuery<PaymentTransaction[]>({
    queryKey: ['/api/account/transactions'],
    queryFn: async () => {
      const response = await fetch('/api/account/transactions');
      if (!response.ok) {
        throw new Error('Failed to fetch transaction history');
      }
      return response.json();
    },
    enabled: !!user && activeTab === 'history'
  });
  
  // Query for usage logs
  const { data: usageLogs, isLoading: isLoadingUsageLogs } = useQuery<UsageLog[]>({
    queryKey: ['/api/account/usage'],
    queryFn: async () => {
      const response = await fetch('/api/account/usage');
      if (!response.ok) {
        throw new Error('Failed to fetch usage logs');
      }
      return response.json();
    },
    enabled: !!user && activeTab === 'usage'
  });
  
  // Query for usage statistics by model
  const { data: usageStats, isLoading: isLoadingUsageStats } = useQuery<{
    stats: UsageStats[];
    period: { startDate: string; endDate: string };
  }>({
    queryKey: ['/api/account/usage/stats', dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    queryFn: async () => {
      const response = await fetch(`/api/account/usage/stats?startDate=${dateRange.startDate.toISOString()}&endDate=${dateRange.endDate.toISOString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch usage statistics');
      }
      return response.json();
    },
    enabled: !!user && (activeTab === 'usage' || activeTab === 'analytics')
  });
  
  // Query for user settings
  const { data: userSettings, isLoading: isLoadingUserSettings } = useQuery<UserSettings>({
    queryKey: ['/api/account/settings'],
    queryFn: async () => {
      const response = await fetch('/api/account/settings');
      if (!response.ok) {
        throw new Error('Failed to fetch user settings');
      }
      return response.json();
    },
    enabled: !!user && activeTab === 'settings'
  });

  // Mutation for creating a PayPal order
  const createOrderMutation = useMutation({
    mutationFn: async (packageId: string) => {
      const response = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      
      const data = await response.json();
      return data.orderId;
    },
    onSuccess: (orderId) => {
      setOrderId(orderId);
      renderPayPalButtons(orderId);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `Failed to create order: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  });
  
  // Mutation for creating a custom amount PayPal order
  const createCustomOrderMutation = useMutation({
    mutationFn: async (amount: number) => {
      const response = await fetch('/api/paypal/create-custom-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      
      const data = await response.json();
      return {
        orderId: data.orderId,
        credits: data.credits
      };
    },
    onSuccess: (data) => {
      setOrderId(data.orderId);
      setSelectedPackage('custom');
      renderPayPalButtons(data.orderId);
    },
    onError: (error) => {
      setIsCustomAmount(false);
      toast({
        title: 'Error',
        description: `Failed to create custom order: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  });

  // Mutation for capturing a PayPal order
  const captureOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await fetch('/api/paypal/capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Payment Successful',
        description: `Successfully added funds to your account.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      setOrderId(null);
      setSelectedPackage(null);
    },
    onError: (error) => {
      toast({
        title: 'Payment Failed',
        description: `Failed to process payment: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  });

  const handlePackageSelect = (packageId: string) => {
    setSelectedPackage(packageId);
    createOrderMutation.mutate(packageId);
  };

  // PayPal Button component that will be rendered when an order is created
const PayPalCheckoutButtons = ({ 
  orderId, 
  packageDetails,
  onApprove,
  onError,
  onCancel
}: { 
  orderId: string, 
  packageDetails: CreditPackage | undefined,
  onApprove: (data: any) => Promise<void>,
  onError: (error: any) => void,
  onCancel: () => void
}) => {
  const [{ isPending, isResolved, isRejected }] = usePayPalScriptReducer();

  if (isPending) {
    return <Spinner />;
  }

  if (isRejected) {
    return (
      <div className="text-center text-red-500">
        <p>PayPal failed to load. Please try again later.</p>
        <Button 
          variant="outline" 
          className="mt-2" 
          onClick={() => window.location.reload()}
        >
          Reload Page
        </Button>
      </div>
    );
  }

  return (
    <PayPalButtons
      style={{ 
        layout: 'vertical',
        color: 'blue',
        shape: 'rect',
        label: 'pay'
      }}
      createOrder={() => Promise.resolve(orderId)}
      onApprove={async (data, actions) => {
        return onApprove(data);
      }}
      onError={(err) => {
        onError(err);
      }}
      onCancel={() => {
        onCancel();
      }}
    />
  );
};

const renderPayPalButtons = (orderId: string) => {
  // Mark buttons as loaded
  setPaypalButtonsLoaded(true);
};

const handleCaptureOrder = (data: any = null) => {
  if (orderId) {
    captureOrderMutation.mutate(orderId);
  }
};

  if (isLoadingUser || isLoadingPackages) {
    return <div className="container mx-auto py-12"><Spinner /></div>;
  }

  if (!user) {
    return (
      <div className="container mx-auto py-12">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>
              You need to sign in to add funds to your account.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => window.location.href = '/auth/google'}>
              Sign in with Google
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-12">
      <div className="flex flex-col space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Account Balance</h1>
          <Button 
            variant="outline" 
            className="flex items-center gap-2"
            onClick={() => window.location.href = '/'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to Chat
          </Button>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Your Balance</CardTitle>
            <CardDescription>
              Your account balance for AI model usage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold tracking-tight">${(user.creditBalance / 10000).toFixed(2)}</span>
                <span className="text-muted-foreground">available balance</span>
              </div>
              <div className="mt-2 text-sm p-3 bg-primary/5 rounded-lg">
                <p>This balance is used for AI model usage across all available models. Different models have different pricing based on their capabilities and token usage.</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="purchase">Add Funds</TabsTrigger>
            <TabsTrigger value="history">Purchase History</TabsTrigger>
            <TabsTrigger value="usage">Usage Analytics</TabsTrigger>
            <TabsTrigger value="settings">Account Settings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="purchase" className="mt-6">
            <div className="grid md:grid-cols-3 gap-6">
              {packages?.map((pkg) => (
                <Card 
                  key={pkg.id} 
                  className={`cursor-pointer transition-all ${selectedPackage === pkg.id ? 'ring-2 ring-primary' : 'hover:shadow-lg'}`}
                  onClick={() => !orderId && handlePackageSelect(pkg.id)}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-xl">{pkg.name}</CardTitle>
                    <CardDescription>{pkg.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-2">
                      <div className="text-2xl font-bold">${pkg.price.toFixed(2)}</div>
                      <div className="text-sm mt-2">
                        <ul className="space-y-1">
                          <li className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            ${pkg.price.toFixed(2)} + $0.40 fee
                          </li>
                          <li className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            Total: ${(pkg.price + 0.40).toFixed(2)}
                          </li>
                          <li className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            Instant delivery
                          </li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      className="w-full" 
                      disabled={!!orderId} 
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePackageSelect(pkg.id);
                      }}
                    >
                      {selectedPackage === pkg.id && createOrderMutation.isPending 
                        ? <Spinner /> 
                        : 'Select'}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
            
            {/* Custom Amount Input Section */}
            {!orderId && (
              <Card className="mt-8">
                <CardHeader>
                  <CardTitle>Custom Amount</CardTitle>
                  <CardDescription>
                    Enter a custom USD amount to add to your account
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="custom-amount">Amount (USD)</Label>
                      <div className="flex items-center">
                        <span className="mr-2 text-muted-foreground">$</span>
                        <Input
                          id="custom-amount"
                          type="number"
                          min="5.00"
                          step="0.01"
                          placeholder="Enter amount (min $5.00)"
                          value={customAmount}
                          onChange={(e) => {
                            setCustomAmount(e.target.value);
                            // Clear error when user starts typing
                            if (customAmountError) setCustomAmountError("");
                          }}
                          className={customAmountError ? "border-red-500" : ""}
                        />
                      </div>
                      {customAmountError && (
                        <p className="text-red-500 text-sm">{customAmountError}</p>
                      )}
                      <p className="text-sm text-muted-foreground mt-2">
                        (+ $0.40 transaction fee applies)
                      </p>
                    </div>
                    
                    <div className="bg-muted/40 p-3 rounded-md">
                      <div className="flex justify-between text-sm mb-1">
                        <span>Amount:</span>
                        <span>${customAmount ? parseFloat(customAmount).toFixed(2) : "0.00"}</span>
                      </div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Fee:</span>
                        <span>$0.40</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between font-medium">
                        <span>Total:</span>
                        <span>${customAmount ? (parseFloat(customAmount) + 0.40).toFixed(2) : "0.40"}</span>
                      </div>
                      <div className="text-sm mt-3 text-muted-foreground">
                        Transaction fee applies to all purchases
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full"
                    onClick={() => {
                      // Validate amount
                      const amount = parseFloat(customAmount);
                      if (isNaN(amount) || amount < 5) {
                        setCustomAmountError("Please enter a valid amount of at least $5.00");
                        return;
                      }
                      
                      // Process custom amount
                      setIsCustomAmount(true);
                      
                      // Create a custom amount order
                      createCustomOrderMutation.mutate(amount);
                    }}
                    disabled={!customAmount || createOrderMutation.isPending || createCustomOrderMutation.isPending}
                  >
                    {createCustomOrderMutation.isPending ? <Spinner /> : 'Top Up Custom Amount'}
                  </Button>
                </CardFooter>
              </Card>
            )}
            
            {orderId && selectedPackage && (
              <Card className="mt-8">
                <CardHeader>
                  <CardTitle>Complete Your Purchase</CardTitle>
                  <CardDescription>
                    Proceed with payment to add funds to your account
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted/50 p-4 rounded-lg mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="font-medium">
                          {selectedPackage === 'custom' 
                            ? 'Custom Amount' 
                            : packages?.find(p => p.id === selectedPackage)?.name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {selectedPackage === 'custom'
                            ? isCustomAmount && customAmount 
                              ? `Custom amount payment` 
                              : ''
                            : 'Standard package'}
                        </div>
                      </div>
                      <div className="font-bold text-xl">
                        {selectedPackage === 'custom'
                          ? isCustomAmount && customAmount 
                            ? `$${parseFloat(customAmount).toFixed(2)}` 
                            : '$0.00'
                          : `$${packages?.find(p => p.id === selectedPackage)?.price.toFixed(2)}`}
                      </div>
                    </div>
                    
                    <Separator className="my-4" />
                    
                    <div className="flex justify-between text-sm">
                      <span>Subtotal</span>
                      <span>
                        {selectedPackage === 'custom'
                          ? isCustomAmount && customAmount 
                            ? `$${parseFloat(customAmount).toFixed(2)}` 
                            : '$0.00'
                          : `$${packages?.find(p => p.id === selectedPackage)?.price.toFixed(2)}`}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span>Fees</span>
                      <span>$0.40</span>
                    </div>
                    <div className="flex justify-between font-medium mt-3">
                      <span>Total</span>
                      <span>
                        {selectedPackage === 'custom'
                          ? isCustomAmount && customAmount 
                            ? `$${(parseFloat(customAmount) + 0.40).toFixed(2)}` 
                            : '$0.40'
                          : `$${((packages?.find(p => p.id === selectedPackage)?.price || 0) + 0.40).toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                  
                  <div className="py-4">
                    <div className="mb-4">
                      <h3 className="text-sm font-medium mb-2">Pay with:</h3>
                      <div id="paypal-button-container" className="py-2">
                        <PayPalScriptProvider
                          options={{
                            clientId: paypalClientId, // Using client ID fetched from server
                            currency: "USD",
                            intent: "capture",
                          }}
                        >
                          <PayPalCheckoutButtons
                            orderId={orderId}
                            packageDetails={packages?.find(p => p.id === selectedPackage)}
                            onApprove={async (data) => {
                              console.log("PayPal transaction approved", data);
                              handleCaptureOrder(data);
                              return Promise.resolve();
                            }}
                            onError={(error) => {
                              console.error("PayPal error", error);
                              toast({
                                title: 'Payment Error',
                                description: 'There was a problem processing your payment. Please try again.',
                                variant: 'destructive',
                              });
                            }}
                            onCancel={() => {
                              console.log("PayPal transaction cancelled");
                              toast({
                                title: 'Payment Cancelled',
                                description: 'You cancelled the payment process. You can try again when ready.',
                              });
                            }}
                          />
                        </PayPalScriptProvider>
                      </div>
                    </div>
                    
                    <div className="mt-6 text-sm">
                      <div className="bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300 p-3 rounded-md mb-4">
                        <div className="flex items-start gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5">
                            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path>
                            <path d="m9 12 2 2 4-4"></path>
                          </svg>
                          <div>
                            <p className="font-medium">Funds will be added instantly after payment</p>
                            <p className="text-sm mt-1 text-green-700 dark:text-green-400">No additional steps required</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-center text-muted-foreground mt-4">
                        By completing this purchase, you agree to our Terms of Service.
                        <Button 
                          variant="link" 
                          className="h-auto p-0 ml-1 text-xs"
                          onClick={() => setSelectedPackage(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          
          <TabsContent value="history" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Purchase History</CardTitle>
                <CardDescription>
                  Your payment transaction history
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingTransactions ? (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : !transactions || transactions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No purchase history available
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="rounded-md border">
                      <table className="w-full caption-bottom text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="h-12 px-4 text-left align-middle font-medium">Date</th>
                            <th className="h-12 px-4 text-left align-middle font-medium">Amount</th>
                            <th className="h-12 px-4 text-left align-middle font-medium">Credits</th>
                            <th className="h-12 px-4 text-left align-middle font-medium">Status</th>
                            <th className="h-12 px-4 text-left align-middle font-medium">Reference</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transactions.map((transaction) => (
                            <tr 
                              key={transaction.id} 
                              className="border-b transition-colors hover:bg-muted/50"
                            >
                              <td className="p-4 align-middle">
                                {new Date(transaction.createdAt).toLocaleDateString()} {new Date(transaction.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="p-4 align-middle font-medium">
                                ${(transaction.amount / 100).toFixed(2)}
                              </td>
                              <td className="p-4 align-middle">
                                {transaction.credits.toLocaleString()}
                              </td>
                              <td className="p-4 align-middle">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                  transaction.status === 'completed' 
                                    ? 'bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-400' 
                                    : transaction.status === 'pending'
                                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800/20 dark:text-yellow-400'
                                    : 'bg-red-100 text-red-800 dark:bg-red-800/20 dark:text-red-400'
                                }`}>
                                  {transaction.status}
                                </span>
                              </td>
                              <td className="p-4 align-middle text-xs text-muted-foreground">
                                {transaction.paypalOrderId || 'N/A'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="usage" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Usage Analytics</CardTitle>
                <CardDescription>
                  Track your AI model usage and spending patterns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Date Range Selector */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 border rounded-md bg-muted/20">
                    <div>
                      <h3 className="text-sm font-medium">Date Range</h3>
                      <p className="text-sm text-muted-foreground">
                        Select a time period to analyze
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          const end = new Date();
                          const start = new Date();
                          start.setDate(start.getDate() - 30);
                          setDateRange({ startDate: start, endDate: end });
                        }}
                      >
                        Last 30 Days
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          const end = new Date();
                          const start = new Date();
                          start.setDate(start.getDate() - 7);
                          setDateRange({ startDate: start, endDate: end });
                        }}
                      >
                        Last 7 Days
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          const end = new Date();
                          const start = new Date();
                          start.setDate(1); // First day of current month
                          setDateRange({ startDate: start, endDate: end });
                        }}
                      >
                        This Month
                      </Button>
                    </div>
                  </div>
                  
                  {isLoadingUsageStats ? (
                    <div className="flex justify-center py-12">
                      <Spinner />
                    </div>
                  ) : !usageStats || usageStats.stats.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      No usage data available for the selected time period
                    </div>
                  ) : (
                    <>
                      {/* Usage Summary */}
                      <div className="grid gap-6 md:grid-cols-3">
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">
                              Total Spending
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">
                              ${usageStats.stats.reduce((sum, stat) => sum + parseFloat(stat.totalCreditsDollars), 0).toFixed(2)}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(usageStats.period.startDate).toLocaleDateString()} - {new Date(usageStats.period.endDate).toLocaleDateString()}
                            </p>
                          </CardContent>
                        </Card>
                        
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">
                              Total Tokens Used
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">
                              {usageStats.stats.reduce((sum, stat) => sum + stat.totalTokens, 0).toLocaleString()}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Across all models
                            </p>
                          </CardContent>
                        </Card>
                        
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">
                              Most Used Model
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {usageStats.stats.length > 0 ? (
                              <>
                                <div className="text-xl font-bold truncate max-w-full">
                                  {usageStats.stats.sort((a, b) => b.totalTokens - a.totalTokens)[0].modelId}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {usageStats.stats.sort((a, b) => b.totalTokens - a.totalTokens)[0].totalTokens.toLocaleString()} tokens
                                </p>
                              </>
                            ) : (
                              <div className="text-sm text-muted-foreground">No data available</div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                      
                      {/* Usage By Model Chart */}
                      <Card className="mt-6">
                        <CardHeader>
                          <CardTitle>Usage By Model</CardTitle>
                          <CardDescription>
                            Credit consumption across different AI models
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-2">
                          <div className="h-80">
                            {usageStats.stats.length > 0 && (
                              <ChartContainer
                                config={{
                                  credits: {
                                    label: "Credits Used",
                                    theme: {
                                      light: "#0ea5e9",
                                      dark: "#0ea5e9",
                                    },
                                  },
                                }}
                              >
                                <RechartsPrimitive.BarChart 
                                  data={usageStats.stats.map((stat) => ({
                                    name: stat.modelId,
                                    credits: stat.totalCredits,
                                    dollars: parseFloat(stat.totalCreditsDollars)
                                  }))}
                                  margin={{ top: 20, right: 20, bottom: 70, left: 40 }}
                                >
                                  <RechartsPrimitive.CartesianGrid strokeDasharray="3 3" />
                                  <RechartsPrimitive.XAxis 
                                    dataKey="name" 
                                    angle={-45}
                                    textAnchor="end"
                                    height={70}
                                    tick={{ fontSize: 12 }}
                                  />
                                  <RechartsPrimitive.YAxis yAxisId="left" orientation="left" label={{ value: 'Credits', angle: -90, position: 'insideLeft' }} />
                                  <RechartsPrimitive.YAxis yAxisId="right" orientation="right" label={{ value: 'USD', angle: 90, position: 'insideRight' }} />
                                  <RechartsPrimitive.Tooltip
                                    content={({ active, payload }) => {
                                      if (active && payload && payload.length) {
                                        return (
                                          <div className="custom-tooltip bg-background border rounded p-3 shadow-md">
                                            <p className="font-medium text-sm">{payload[0].payload.name}</p>
                                            <p className="text-sm text-muted-foreground">
                                              Credits: <span className="font-medium">{payload[0].value?.toLocaleString()}</span>
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                              Cost: <span className="font-medium">${payload[0].payload.dollars.toFixed(4)}</span>
                                            </p>
                                          </div>
                                        );
                                      }
                                      return null;
                                    }}
                                  />
                                  <RechartsPrimitive.Bar
                                    dataKey="credits"
                                    fill="var(--color-credits)"
                                    yAxisId="left"
                                    radius={[4, 4, 0, 0]}
                                  />
                                </RechartsPrimitive.BarChart>
                              </ChartContainer>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="settings" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Account Settings</CardTitle>
                <CardDescription>
                  Manage your account preferences and notification settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingUserSettings ? (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : !userSettings ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No user settings available
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Account Information */}
                    <div>
                      <h3 className="text-lg font-medium">Account Information</h3>
                      <div className="mt-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="name">Name</Label>
                            <Input id="name" value={user?.name || ''} disabled />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" value={user?.email || ''} disabled />
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <Separator />
                    
                    {/* Notification Preferences */}
                    <div>
                      <h3 className="text-lg font-medium">Notification Preferences</h3>
                      <div className="mt-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="low-balance-notifications" className="text-base">Low Balance Notifications</Label>
                            <p className="text-sm text-muted-foreground">
                              Get notified when your balance gets low
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input 
                              id="low-balance-threshold" 
                              type="number" 
                              className="w-24"
                              min={1}
                              value={userSettings.lowBalanceThreshold / 100} // Convert from cents to dollars
                              onChange={(e) => {
                                // TODO: Add mutation to update user settings
                              }}
                              disabled
                            />
                            <span className="text-sm text-muted-foreground">USD</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <Label htmlFor="email-notifications" className="text-base">Email Notifications</Label>
                            <p className="text-sm text-muted-foreground">
                              Receive updates and notifications via email
                            </p>
                          </div>
                          <div>
                            <Label className="sr-only" htmlFor="email-notifications-toggle">
                              Toggle email notifications
                            </Label>
                            <div>
                              <input 
                                id="email-notifications-toggle"
                                type="checkbox" 
                                className="peer hidden" 
                                checked={userSettings.emailNotificationsEnabled}
                                onChange={() => {
                                  // TODO: Add mutation to update user settings
                                }}
                                disabled
                              />
                              <div className="relative w-11 h-6 flex items-center flex-shrink-0 cursor-pointer rounded-full bg-muted p-1 transition-colors duration-200 ease-in-out peer-checked:bg-primary">
                                <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out data-[state=checked]:translate-x-5" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <Separator />
                    
                    {/* Account Usage Summary */}
                    <div>
                      <h3 className="text-lg font-medium">Account Summary</h3>
                      <div className="mt-4 space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Current Balance:</span>
                          <span className="font-medium">${(user.creditBalance / 10000).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Account Created:</span>
                          <span className="font-medium">{new Date(user.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Last Updated:</span>
                          <span className="font-medium">{new Date(user.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-end mt-6">
                      <Button variant="outline" className="mr-2" disabled>
                        Cancel
                      </Button>
                      <Button disabled>
                        Save Changes
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}