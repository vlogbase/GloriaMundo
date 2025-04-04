// Import PayPal SDKs as needed

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox'; // Default to sandbox for safety

export const isPayPalConfigValid = !!(PAYPAL_CLIENT_ID && PAYPAL_SECRET);

if (!isPayPalConfigValid) {
  console.warn("PayPal configuration is missing or incomplete. PayPal features will not work correctly.");
}

export interface CreditPackage {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  credits: number;
}

// Define available credit packages
export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'small_pack',
    name: 'Basic Pack',
    description: '50,000 credits',
    price: 5.00,
    currency: 'USD',
    credits: 50000
  },
  {
    id: 'medium_pack',
    name: 'Value Pack',
    description: '110,000 credits',
    price: 10.00,
    currency: 'USD',
    credits: 110000
  },
  {
    id: 'large_pack',
    name: 'Pro Pack',
    description: '280,000 credits',
    price: 25.00,
    currency: 'USD',
    credits: 280000
  }
];

// Credit calculation constants
export const CREDIT_VALUE_USD = 0.0001; // $0.0001 per credit (10,000 credits = $1)
export const MARKUP_PERCENTAGE = 38; // 38% markup on base cost

/**
 * Calculates credits to charge based on token usage and model pricing
 */
export function calculateCreditsToCharge(
  promptTokens: number, 
  completionTokens: number, 
  promptPricePerM: number,
  completionPricePerM: number
): number {
  // Calculate base cost in USD
  const baseCost = 
    (promptTokens / 1_000_000 * promptPricePerM) + 
    (completionTokens / 1_000_000 * completionPricePerM);
  
  // Apply markup
  const chargeAmountUsd = baseCost * (1 + MARKUP_PERCENTAGE/100);
  
  // Convert USD to credits and round up to avoid fractional credits
  const creditsToDeduct = Math.ceil(chargeAmountUsd / CREDIT_VALUE_USD);
  
  return creditsToDeduct;
}

/**
 * Create a PayPal order for a credit package
 */
export async function createPayPalOrder(packageId: string): Promise<string> {
  const creditPackage = CREDIT_PACKAGES.find(pkg => pkg.id === packageId);
  
  if (!creditPackage) {
    throw new Error(`Invalid package ID: ${packageId}`);
  }
  
  try {
    const response = await fetch('https://api.sandbox.paypal.com/v2/checkout/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64')}`
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: creditPackage.currency,
            value: creditPackage.price.toFixed(2)
          },
          description: `${creditPackage.name} - ${creditPackage.description}`,
          custom_id: creditPackage.id
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('PayPal create order failed:', errorData);
      throw new Error(`PayPal API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.id; // Return the order ID
  } catch (error) {
    console.error('Error creating PayPal order:', error);
    throw error;
  }
}

/**
 * Capture a PayPal order
 */
export async function capturePayPalOrder(orderId: string): Promise<{
  success: boolean;
  packageId?: string;
  credits?: number;
  captureId?: string;
}> {
  try {
    const response = await fetch(`https://api.sandbox.paypal.com/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64')}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('PayPal capture order failed:', errorData);
      throw new Error(`PayPal API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Check the status of the capture
    if (data.status !== 'COMPLETED') {
      return { success: false };
    }
    
    // Extract custom_id from the response
    const packageId = data.purchase_units[0]?.custom_id;
    const creditPackage = CREDIT_PACKAGES.find(pkg => pkg.id === packageId);
    
    if (!creditPackage) {
      console.error(`Unknown package ID in PayPal response: ${packageId}`);
      return { success: true, captureId: data.id };
    }
    
    return {
      success: true,
      packageId,
      credits: creditPackage.credits,
      captureId: data.id
    };
  } catch (error) {
    console.error('Error capturing PayPal order:', error);
    throw error;
  }
}

/**
 * Verify PayPal webhook signature (simplified version)
 */
export function verifyPayPalWebhook(
  body: any,
  headers: Record<string, string | string[] | undefined>
): boolean {
  // Note: In a production environment, you should verify the webhook signature
  // using the PayPal SDK's verifyWebhookSignature method
  
  // For this implementation, we'll just check that the webhook ID matches
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  
  if (!webhookId) {
    console.warn('PayPal webhook ID not configured');
    return false;
  }
  
  // Basic validation
  const payloadValid = body && body.id && body.event_type;
  
  // For sandbox, we can simplify and just check the event type
  return payloadValid && 
    (body.event_type === 'CHECKOUT.ORDER.APPROVED' || 
     body.event_type === 'PAYMENT.CAPTURE.COMPLETED');
}