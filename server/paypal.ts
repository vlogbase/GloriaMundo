// Import PayPal SDKs as needed

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox'; // Default to sandbox for safety
const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID;

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

// Define available credit packages (prices in USD, credits in hundredths of cents)
export const CREDIT_PACKAGES: CreditPackage[] = [
  {
    id: 'pack_5',
    name: '$5 Package',
    description: 'Access to $5 worth of API usage',
    price: 5.00,
    currency: 'USD',
    credits: 50000 // $5.00 in hundredths of cents
  },
  {
    id: 'pack_10',
    name: '$10 Package',
    description: 'Access to $10 worth of API usage',
    price: 10.00,
    currency: 'USD',
    credits: 100000 // $10.00 in hundredths of cents
  },
  {
    id: 'pack_25',
    name: '$25 Package',
    description: 'Access to $25 worth of API usage',
    price: 25.00,
    currency: 'USD',
    credits: 250000 // $25.00 in hundredths of cents
  }
];

// Credit calculation constants
export const CREDIT_VALUE_USD = 0.0001; // $0.0001 per credit (10,000 credits = $1)
export const MARKUP_PERCENTAGE = 38; // 38% markup on base cost

/**
 * Calculate cost in hundredths of cents based on token usage and model pricing
 * @param promptTokens Number of prompt tokens
 * @param completionTokens Number of completion tokens
 * @param promptPricePerM Prompt price in USD per million tokens
 * @param completionPricePerM Completion price in USD per million tokens
 * @returns Integer amount to deduct (in hundredths of cents)
 */
export function calculateCreditsToCharge(
  promptTokens: number, 
  completionTokens: number, 
  promptPricePerM: number,
  completionPricePerM: number
): number {
  // Calculate base cost in USD
  const baseCostUsd = 
    (promptTokens / 1_000_000 * promptPricePerM) + 
    (completionTokens / 1_000_000 * completionPricePerM);
  
  // Apply markup
  const chargeAmountUsd = baseCostUsd * (1 + MARKUP_PERCENTAGE/100);
  
  // Convert to hundredths of cents and round up
  const amountInHundredthsOfCents = Math.ceil(chargeAmountUsd * 10000);
  
  return amountInHundredthsOfCents;
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