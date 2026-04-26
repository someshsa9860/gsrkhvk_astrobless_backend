import { RazorpayProvider } from './razorpayProvider.js';
import { PhonePeProvider } from './phonepeProvider.js';
import { GooglePlayProvider } from './googlePlayProvider.js';
import { AppleIapProvider } from './appleIapProvider.js';
import type { PaymentProvider } from '../payments.types.js';
import { PaymentProviderKey, PaymentProviderCapability } from '../payments.types.js';
import { AppError } from '../../../lib/errors.js';

class ProviderRegistry {
  private readonly providers = new Map<PaymentProviderKey, PaymentProvider>();

  constructor() {
    this.register(new RazorpayProvider());
    this.register(new PhonePeProvider());
    this.register(new GooglePlayProvider());
    this.register(new AppleIapProvider());
  }

  private register(provider: PaymentProvider): void {
    this.providers.set(provider.key, provider);
  }

  get(key: PaymentProviderKey): PaymentProvider {
    const p = this.providers.get(key);
    if (!p) throw new AppError('PAYMENT_PROVIDER_ERROR', `Provider ${key} not found.`, 400);
    return p;
  }

  listByCapability(capability: PaymentProviderCapability): PaymentProvider[] {
    return Array.from(this.providers.values()).filter((p) => p.capabilities.includes(capability));
  }

  topupProviders(): PaymentProvider[] {
    return this.listByCapability(PaymentProviderCapability.TOPUP);
  }

  getGooglePlay(): GooglePlayProvider {
    return this.providers.get(PaymentProviderKey.GOOGLE_PLAY) as GooglePlayProvider;
  }

  getAppleIap(): AppleIapProvider {
    return this.providers.get(PaymentProviderKey.APPLE_IAP) as AppleIapProvider;
  }
}

export const providerRegistry = new ProviderRegistry();
