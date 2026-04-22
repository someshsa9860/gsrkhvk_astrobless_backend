import { RazorpayProvider } from './razorpayProvider.js';
import { PhonePeProvider } from './phonepeProvider.js';
import type { PaymentProvider } from '../payments.types.js';
import { PaymentProviderKey, PaymentProviderCapability } from '../payments.types.js';
import { AppError } from '../../../lib/errors.js';

class ProviderRegistry {
  private readonly providers = new Map<PaymentProviderKey, PaymentProvider>();

  constructor() {
    this.register(new RazorpayProvider());
    this.register(new PhonePeProvider());
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
}

export const providerRegistry = new ProviderRegistry();
