import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentStatus } from '@prisma/client';

vi.mock('../lib/stripe.js', () => ({
  stripe: {
    webhooks: { constructEvent: vi.fn() },
    charges: { retrieve: vi.fn() },
  },
}));

vi.mock('../repositories/index.js', () => ({
  webhookEventRepository: {
    exists: vi.fn(),
    create: vi.fn(),
  },
  paymentRepository: {
    updateStatusByStripeIntentId: vi.fn(),
    updateStatusByStripeSessionId: vi.fn(),
  },
}));

vi.mock('../services/payment.service.js', () => ({
  paymentService: { notifyPaymentSuccess: vi.fn() },
}));

import { WebhookService } from '../services/webhook.service.js';
import { stripe } from '../lib/stripe.js';
import { webhookEventRepository, paymentRepository } from '../repositories/index.js';
import { paymentService } from '../services/payment.service.js';

const mockPayload = Buffer.from('{}');
const mockSignature = 'stripe-signature';

const makeEvent = (type: string, object: Record<string, unknown>) => ({
  id: `evt_${Date.now()}`,
  type,
  data: { object },
});

const mockPayment = {
  id: 'payment-uuid',
  merchantId: 'merchant-uuid',
  orderId: 'order-123',
  amount: 1000,
  currency: 'usd',
  status: PaymentStatus.SUCCEEDED,
  metadata: { customerEmail: 'customer@test.com' },
};

describe('WebhookService', () => {
  let service: WebhookService;

  beforeEach(() => {
    service = new WebhookService();
    vi.clearAllMocks();
  });

  describe('verifyAndParseEvent', () => {
    it('returns parsed event on valid signature', () => {
      const event = makeEvent('payment_intent.succeeded', { id: 'pi_123' });
      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(event as any);

      const result = service.verifyAndParseEvent(mockPayload, mockSignature);

      expect(result).toEqual(event);
      expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(mockPayload, mockSignature, expect.any(String));
    });

    it('throws on invalid signature', () => {
      vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature for payload');
      });

      expect(() => service.verifyAndParseEvent(mockPayload, 'bad-sig')).toThrow();
    });
  });

  describe('processEvent', () => {
    it('skips already-processed events', async () => {
      vi.mocked(webhookEventRepository.exists).mockResolvedValue(true);
      const event = makeEvent('payment_intent.succeeded', { id: 'pi_123' });

      await service.processEvent(event as any);

      expect(webhookEventRepository.create).not.toHaveBeenCalled();
      expect(paymentRepository.updateStatusByStripeIntentId).not.toHaveBeenCalled();
    });

    it('handles payment_intent.succeeded and notifies', async () => {
      vi.mocked(webhookEventRepository.exists).mockResolvedValue(false);
      vi.mocked(webhookEventRepository.create).mockResolvedValue({} as any);
      vi.mocked(paymentRepository.updateStatusByStripeIntentId).mockResolvedValue(mockPayment as any);

      const event = makeEvent('payment_intent.succeeded', { id: 'pi_test_123' });
      await service.processEvent(event as any);

      expect(paymentRepository.updateStatusByStripeIntentId).toHaveBeenCalledWith(
        'pi_test_123',
        PaymentStatus.SUCCEEDED,
      );
      expect(paymentService.notifyPaymentSuccess).toHaveBeenCalledWith(mockPayment);
    });

    it('handles checkout.session.completed and notifies', async () => {
      vi.mocked(webhookEventRepository.exists).mockResolvedValue(false);
      vi.mocked(webhookEventRepository.create).mockResolvedValue({} as any);
      vi.mocked(paymentRepository.updateStatusByStripeSessionId).mockResolvedValue(mockPayment as any);

      const event = makeEvent('checkout.session.completed', { id: 'cs_test_123' });
      await service.processEvent(event as any);

      expect(paymentRepository.updateStatusByStripeSessionId).toHaveBeenCalledWith(
        'cs_test_123',
        PaymentStatus.SUCCEEDED,
      );
      expect(paymentService.notifyPaymentSuccess).toHaveBeenCalledWith(mockPayment);
    });

    it('handles payment_intent.payment_failed', async () => {
      vi.mocked(webhookEventRepository.exists).mockResolvedValue(false);
      vi.mocked(webhookEventRepository.create).mockResolvedValue({} as any);
      vi.mocked(paymentRepository.updateStatusByStripeIntentId).mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.FAILED,
      } as any);

      const event = makeEvent('payment_intent.payment_failed', { id: 'pi_failed_123' });
      await service.processEvent(event as any);

      expect(paymentRepository.updateStatusByStripeIntentId).toHaveBeenCalledWith(
        'pi_failed_123',
        PaymentStatus.FAILED,
      );
      expect(paymentService.notifyPaymentSuccess).not.toHaveBeenCalled();
    });

    it('handles unrecognised event types gracefully', async () => {
      vi.mocked(webhookEventRepository.exists).mockResolvedValue(false);
      vi.mocked(webhookEventRepository.create).mockResolvedValue({} as any);

      const event = makeEvent('customer.created', { id: 'cus_123' });
      await expect(service.processEvent(event as any)).resolves.not.toThrow();
    });
  });
});
