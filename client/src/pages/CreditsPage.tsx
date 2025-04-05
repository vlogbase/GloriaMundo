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
        <h1 className="text-3xl font-bold">Account Balance</h1>
        
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
                <span className="text-2xl font-bold">${(user.creditBalance / 10000).toFixed(2)}</span>
                <span className="text-muted-foreground">available balance</span>
              </div>
              <div className="mt-2 text-sm p-2 bg-primary/5 rounded-md">
                <p>This balance is used for AI model usage. Different models have different pricing based on their capabilities.</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-2 w-full max-w-md">
            <TabsTrigger value="purchase">Add Funds</TabsTrigger>
            <TabsTrigger value="history">Purchase History</TabsTrigger>
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
                  Your recent payments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  No purchase history available
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}