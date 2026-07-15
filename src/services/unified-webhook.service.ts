import { logger } from '../lib/logger.js';
import { MobilePaymentService } from './mobile-payment.service.js';

export type PaymentProvider = 'itec' | 'paypack' | 'pesapal';

export class UnifiedWebhookService {
  private readonly mobilePaymentService: MobilePaymentService;

  constructor() {
    this.mobilePaymentService = new MobilePaymentService();
  }

  private detectProvider(payload: Record<string, unknown>): PaymentProvider {
    if (payload.PCODE || payload.pcode) {
      logger.info('Webhook: Card Payment detected');
      return 'pesapal';
    }

    if (
      typeof payload.status === 'number' &&
      payload.data &&
      typeof payload.data === 'object' &&
      'transaction_id' in (payload.data as Record<string, unknown>)
    ) {
      logger.info('Webhook: ITEC Mobile detected');
      return 'itec';
    }

    if (payload.ref) {
      logger.info('Webhook: Paypack Mobile detected');
      return 'paypack';
    }

    throw new Error('Unknown provider');
  }

  async processWebhook(payload: unknown): Promise<void> {
    try {
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid webhook payload');
      }

      const data = payload as Record<string, unknown>;
      const provider = this.detectProvider(data);

      logger.info({ provider }, 'Processing webhook');
      await this.mobilePaymentService.processWebhook(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ err, payload }, `Unified webhook failed: ${message}`);
      throw err;
    }
  }
}

export function getUnifiedWebhookService(): UnifiedWebhookService {
  return new UnifiedWebhookService();
}
