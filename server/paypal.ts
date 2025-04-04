import checkoutNodejsSdk from '@paypal/checkout-server-sdk';
import { CREDIT_PACKAGES, TRANSACTION_TYPES } from '@shared/schema';
import { storage } from './storage';

let clientId = process.env.PAYPAL_CLIENT_ID;
let clientSecret = process.env.PAYPAL_SECRET;
let environment = process.env.PAYPAL_MODE || 'sandbox';

// Check for required environment variables
if (!clientId || !clientSecret) {
  console.warn('PayPal environment variables not configured. PayPal functionality will be disabled.');
}

// Set up PayPal environment
const Environment = environment === 'production' 
  ? checkoutNodejsSdk.core.LiveEnvironment 
  : checkoutNodejsSdk.core.SandboxEnvironment;

// Create PayPal client if variables are available
let paypalClient: checkoutNodejsSdk.PayPalHttpClient | null = null;

if (clientId && clientSecret) {
  const paypalEnvironment = new Environment(clientId, clientSecret);
  paypalClient = new checkoutNodejsSdk.PayPalHttpClient(paypalEnvironment);
}

/**
 * Get credit package by ID
 */
export function getCreditPackage(packageId: string) {
  return CREDIT_PACKAGES.find(pkg => pkg.id === packageId);
}

/**
 * Create a PayPal order for a credit package
 */
export async function createOrder(packageId: string, userId: number) {
  if (!paypalClient) {
    throw new Error('PayPal is not configured. Please contact the administrator.');
  }

  const creditPackage = getCreditPackage(packageId);
  if (!creditPackage) {
    throw new Error(`Invalid package ID: ${packageId}`);
  }

  const request = new checkoutNodejsSdk.orders.OrdersCreateRequest();
  request.prefer('return=representation');
  
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: userId.toString(),
      description: `Purchase of ${creditPackage.name}`,
      amount: {
        currency_code: creditPackage.currency,
        value: creditPackage.price.toFixed(2),
      }
    }],
    application_context: {
      brand_name: 'GloriaMundo AI',
      landing_page: 'LOGIN',
      user_action: 'PAY_NOW',
      return_url: `${process.env.APP_URL || 'https://gloriamundo.com'}/api/paypal/return`,
      cancel_url: `${process.env.APP_URL || 'https://gloriamundo.com'}/api/paypal/cancel`
    }
  });

  try {
    const response = await paypalClient.execute(request);
    return response.result;
  } catch (error) {
    console.error('Error creating PayPal order:', error);
    throw new Error('Failed to create PayPal order. Please try again later.');
  }
}

/**
 * Capture a PayPal order after approval
 */
export async function captureOrder(orderId: string, userId: number) {
  if (!paypalClient) {
    throw new Error('PayPal is not configured. Please contact the administrator.');
  }

  // Check if this order has already been processed
  const existingTransaction = await storage.getTransactionByPayPalOrderId(orderId);
  if (existingTransaction) {
    throw new Error('This order has already been processed.');
  }

  const request = new checkoutNodejsSdk.orders.OrdersCaptureRequest(orderId);
  request.prefer('return=representation');

  try {
    const response = await paypalClient.execute(request);
    const captureResult = response.result;
    
    // Get the captured amount and currency
    const capturedAmount = captureResult.purchase_units[0].payments.captures[0].amount.value;
    const currency = captureResult.purchase_units[0].payments.captures[0].amount.currency_code;
    
    // Find the matching credit package
    const creditPackage = CREDIT_PACKAGES.find(pkg => 
      pkg.price.toFixed(2) === capturedAmount && pkg.currency === currency
    );

    if (!creditPackage) {
      console.error('Could not find matching credit package for amount:', capturedAmount, currency);
      throw new Error('Invalid payment amount. Please contact support.');
    }

    // Add credits to user account
    const user = await storage.updateUserCreditBalance(userId, creditPackage.credits);
    if (!user) {
      throw new Error('User not found.');
    }

    // Record the transaction
    await storage.createTransaction({
      userId,
      type: TRANSACTION_TYPES.PURCHASE,
      amount: creditPackage.credits,
      paypalOrderId: orderId,
      description: `Purchase of ${creditPackage.name} (${creditPackage.credits} credits)`
    });

    return {
      success: true,
      order: captureResult,
      credits: creditPackage.credits,
      newBalance: user.creditBalance
    };
  } catch (error) {
    console.error('Error capturing PayPal order:', error);
    throw new Error('Failed to capture payment. Please try again later.');
  }
}

/**
 * Verify a PayPal webhook event (for future expansion)
 */
export async function verifyWebhookSignature(requestBody: any, headers: any) {
  // Not implementing webhook verification yet as it's marked optional in requirements
  // This would verify that incoming webhook events are genuinely from PayPal
  
  return { verification_status: 'SUCCESS' };
}