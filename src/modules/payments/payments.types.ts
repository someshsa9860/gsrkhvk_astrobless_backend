export enum PaymentProviderKey {
  RAZORPAY = 'razorpay',
  PHONEPE = 'phonepe',
  GOOGLE_PAY = 'googlePay',
  APPLE_PAY = 'applePay',
  STRIPE = 'stripe',
  GOOGLE_PLAY = 'googlePlay',    // Android in-app purchase via Google Play Billing
  APPLE_IAP = 'appleIap',        // iOS in-app purchase via App Store
}

export enum PaymentProviderCapability {
  TOPUP = 'topup',
  PAYOUT = 'payout',
  REFUND = 'refund',
}

export interface CreateOrderInput {
  customerId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface CreateOrderResult {
  providerOrderId: string;
  providerKey: PaymentProviderKey;
  clientPayload: Record<string, unknown>;
  expiresAt: Date;
}

export interface ProviderWebhookEvent {
  eventType: 'paymentSucceeded' | 'paymentFailed' | 'refundProcessed' | 'payoutProcessed' | 'payoutFailed' | 'unknown';
  providerOrderId?: string;
  providerPaymentId?: string;
  amount?: number;
  raw: unknown;
}

export interface PayoutInput {
  astrologerId: string;
  amount: number;
  beneficiaryRef: string;
  idempotencyKey: string;
}

export interface PayoutResult {
  providerPayoutId: string;
  status: string;
}

export interface PaymentProvider {
  readonly key: PaymentProviderKey;
  readonly capabilities: PaymentProviderCapability[];
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  verifyWebhook(input: { headers: Record<string, string>; rawBody: Buffer }): Promise<{ isValid: boolean; event: ProviderWebhookEvent }>;
  fetchOrder(providerOrderId: string): Promise<ProviderWebhookEvent>;
  createPayout?(input: PayoutInput): Promise<PayoutResult>;
  refund?(providerPaymentId: string, amount: number, idempotencyKey: string): Promise<ProviderWebhookEvent>;
}

// ── IAP (Google Play / Apple IAP) ─────────────────────────────────────────────

export interface IapVerifyInput {
  customerId: string;
  /** Product ID configured in Google Play Console / App Store Connect */
  productId: string;
  /** The wallet credit amount this product maps to, in ₹ (e.g. 50.00 = ₹50) */
  amount: number;
  idempotencyKey: string;
  /** Google Play: purchase token from BillingClient. Apple: transactionId from StoreKit 2 */
  token: string;
  /** Google Play: packageName. Apple: not needed (inferred from shared secret) */
  packageName?: string;
  platform: 'android' | 'ios';
}

export interface IapVerifyResult {
  /** Canonical transaction ID returned by the store */
  storeTransactionId: string;
  /** The wallet credit that was applied */
  creditedAmount: number;
  walletTransactionId: string;
}
