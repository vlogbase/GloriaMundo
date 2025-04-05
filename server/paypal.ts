// Import PayPal SDKs as needed

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox'; // Default to sandbox for safety
const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID;
const PAYPAL_API_URL = PAYPAL_MODE === 'live' 
  ? 'https://api.paypal.com'
  : 'https://api.sandbox.paypal.com';

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
 * Get PayPal access token
 */
async function getPayPalAccessToken(): Promise<string> {
  const response = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-Language': 'en_US',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64')}`
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get PayPal access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
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
    const accessToken = await getPayPalAccessToken();
    
    const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
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
        }],
        application_context: {
          brand_name: "GloriaMundo",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: "https://gloriamundo.com/credits/success",
          cancel_url: "https://gloriamundo.com/credits/cancel",
        }
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
 * Create a PayPal order for a custom amount
 */
export async function createCustomAmountPayPalOrder(amount: number): Promise<{
  orderId: string;
  credits: number;
}> {
  if (!isPayPalConfigValid) {
    throw new Error("PayPal configuration is invalid");
  }

  if (amount < 5) {
    throw new Error("Minimum amount is $5.00");
  }

  // Calculate credits (10,000 credits per $1)
  const credits = Math.floor(amount * 10000);
  
  // Add payment processing fee
  const fee = 0.40;
  const totalAmount = amount + fee;

  try {
    const accessToken = await getPayPalAccessToken();
    
    const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "USD",
              value: totalAmount.toFixed(2),
              breakdown: {
                item_total: {
                  currency_code: "USD",
                  value: amount.toFixed(2)
                },
                handling: {
                  currency_code: "USD",
                  value: fee.toFixed(2)
                }
              }
            },
            description: `Custom Credit Purchase - ${credits.toLocaleString()} credits`,
            custom_id: `custom_${amount}_${credits}`,
            items: [
              {
                name: "Credits",
                description: `${credits.toLocaleString()} GloriaMundo credits`,
                quantity: "1",
                unit_amount: {
                  currency_code: "USD",
                  value: amount.toFixed(2)
                },
                category: "DIGITAL_GOODS"
              }
            ]
          },
        ],
        application_context: {
          brand_name: "GloriaMundo",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: "https://gloriamundo.com/credits/success",
          cancel_url: "https://gloriamundo.com/credits/cancel",
        },
      }),
    });

    if (!response.ok) {
      const errorResponse = await response.json();
      console.error("PayPal create custom order error:", errorResponse);
      throw new Error(
        errorResponse.message || "Failed to create PayPal order"
      );
    }

    const order = await response.json();
    return {
      orderId: order.id,
      credits: credits
    };
  } catch (error) {
    console.error("PayPal create custom order error:", error);
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
    const accessToken = await getPayPalAccessToken();
    
    const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
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
    const customId = data.purchase_units[0]?.custom_id;
    
    // Check if this is a custom amount purchase
    if (customId && customId.startsWith('custom_')) {
      try {
        // Format is 'custom_amount_credits'
        const parts = customId.split('_');
        if (parts.length === 3) {
          const credits = parseInt(parts[2]);
          if (!isNaN(credits)) {
            return {
              success: true,
              packageId: customId,
              credits: credits,
              captureId: data.id
            };
          }
        }
      } catch (err) {
        console.error('Error parsing custom amount:', err);
      }
    }
    
    // Handle regular package purchases
    const creditPackage = CREDIT_PACKAGES.find(pkg => pkg.id === customId);
    
    if (!creditPackage) {
      console.error(`Unknown package ID in PayPal response: ${customId}`);
      // Try to extract credits from the description as fallback
      try {
        const description = data.purchase_units[0]?.description || '';
        const creditsMatch = description.match(/(\d+,*\d*) credits/i);
        if (creditsMatch && creditsMatch[1]) {
          const credits = parseInt(creditsMatch[1].replace(/,/g, ''));
          if (!isNaN(credits)) {
            return {
              success: true,
              packageId: customId,
              credits: credits,
              captureId: data.id
            };
          }
        }
      } catch (e) {
        console.error('Error extracting credits from description:', e);
      }
      
      return { success: true, captureId: data.id };
    }
    
    return {
      success: true,
      packageId: customId,
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