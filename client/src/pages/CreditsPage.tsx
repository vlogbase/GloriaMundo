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
import { Spinner } from "@/components/Spinner"; // You may need to create this component
import { apiRequest } from '@/lib/queryClient';
import { useToast } from "@/hooks/use-toast";

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
  
  // Query for credit packages
  const { data: packages, isLoading: isLoadingPackages } = useQuery<CreditPackage[]>({
    queryKey: ['/api/credits/packages'],
    retry: 3
  });

  // Query for current user
  const { data: user, isLoading: isLoadingUser } = useQuery<User | null>({
    queryKey: ['/api/auth/me']
  });

  // Mutation for creating a PayPal order
  const createOrderMutation = useMutation({
    mutationFn: async (packageId: string) => {
      const response = await apiRequest('/api/credits/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      });
      return response.orderId;
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

  // Mutation for capturing a PayPal order
  const captureOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await apiRequest('/api/credits/capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      return response;
    },
    onSuccess: (data) => {
      toast({
        title: 'Payment Successful',
        description: `Successfully added ${data.credits.toLocaleString()} credits to your account.`,
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

  const renderPayPalButtons = (orderId: string) => {
    // This function will be implemented to render PayPal buttons
    // For now, we'll just simulate it with a button
    setPaypalButtonsLoaded(true);
  };

  const handleCaptureOrder = () => {
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
              You need to sign in to purchase credits.
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
        <h1 className="text-3xl font-bold">Credits</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>Your Balance</CardTitle>
            <CardDescription>
              Credits are used to access AI models
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{user.creditBalance.toLocaleString()}</span>
              <span className="text-muted-foreground">credits available</span>
            </div>
          </CardContent>
        </Card>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-2 w-full max-w-md">
            <TabsTrigger value="purchase">Purchase Credits</TabsTrigger>
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
                  <CardHeader>
                    <CardTitle>{pkg.name}</CardTitle>
                    <CardDescription>{pkg.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">${pkg.price.toFixed(2)}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {(pkg.credits / 10000).toFixed(1)} million tokens approximately
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
            
            {orderId && selectedPackage && (
              <Card className="mt-8">
                <CardHeader>
                  <CardTitle>Complete Your Purchase</CardTitle>
                  <CardDescription>
                    Proceed with payment to add credits to your account
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="font-medium">
                        {packages?.find(p => p.id === selectedPackage)?.name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {packages?.find(p => p.id === selectedPackage)?.description}
                      </div>
                    </div>
                    <div className="font-bold">
                      ${packages?.find(p => p.id === selectedPackage)?.price.toFixed(2)}
                    </div>
                  </div>
                  
                  <Separator className="my-4" />
                  
                  <div className="py-4">
                    {/* In a real implementation, this would be replaced with the PayPal SDK buttons */}
                    <div id="paypal-button-container" className="py-2">
                      {paypalButtonsLoaded ? (
                        <Button 
                          className="w-full" 
                          onClick={handleCaptureOrder}
                          disabled={captureOrderMutation.isPending}
                        >
                          {captureOrderMutation.isPending ? <Spinner /> : 'Simulate PayPal Payment'}
                        </Button>
                      ) : (
                        <Spinner />
                      )}
                    </div>
                    <div className="text-xs text-center text-muted-foreground mt-2">
                      By completing this purchase, you agree to our Terms of Service
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
                  Your recent credit purchases
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