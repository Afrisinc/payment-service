import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentStatus, PaymentType } from '@prisma/client';

vi.mock('../lib/stripe.js', () => ({
  stripe: {
    checkout: {
      sessions: { create: vi.fn(), retrieve: vi.fn() },
    },
    paymentIntents: { create: vi.fn(), retrieve: vi.fn() },
    refunds: { create: vi.fn() },
  },
}));

vi.mock('../repositories/index.js', () => ({
  paymentRepository: {
    findByMerchantAndOrder: vi.fn(),
    createWithFee: vi.fn(),
    findByIdAndMerchant: vi.fn(),
    updateStatus: vi.fn(),
    listByMerchant: vi.fn(),
  },
}));

vi.mock('../lib/notify.js', () => ({
  notifyClient: { sendPaymentNotification: vi.fn() },
}));

import { PaymentService } from '../services/payment.service.js';
import { stripe } from '../lib/stripe.js';
import { paymentRepository } from '../repositories/index.js';

const mockMerchant = {
  id: 'merchant-uuid',
  name: 'Test Merchant',
  email: 'merchant@test.com',
  apiKeyHash: 'hash',
  defaultFeePercent: 2.5,
  isActive: true,
  stripeAccountId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockCheckoutPayment = {
  id: 'payment-uuid',
  merchantId: 'merchant-uuid',
  orderId: 'order-123',
  stripeSessionId: 'cs_test_123',
  stripeIntentId: null,
  amount: 1000,
  currency: 'usd',
  status: PaymentStatus.PENDING,
  type: PaymentType.CHECKOUT,
  metadata: { customerEmail: 'customer@test.com' },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockIntentPayment = {
  ...mockCheckoutPayment,
  type: PaymentType.INTENT,
  stripeSessionId: null,
  stripeIntentId: 'pi_test_123',
};

describe('PaymentService', () => {
  let service: PaymentService;

  beforeEach(() => {
    service = new PaymentService();
    vi.clearAllMocks();
  });

  describe('createCheckoutSession', () => {
    it('creates a new checkout session', async () => {
      vi.mocked(paymentRepository.findByMerchantAndOrder).mockResolvedValue(null);
      vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/pay/cs_test_123',
      } as any);
      vi.mocked(paymentRepository.createWithFee).mockResolvedValue(mockCheckoutPayment);

      const result = await service.createCheckoutSession({
        merchant: mockMerchant as any,
        amount: 1000,
        currency: 'usd',
        orderId: 'order-123',
        customerEmail: 'customer@test.com',
      });

      expect(result.sessionId).toBe('cs_test_123');
      expect(result.idempotent).toBe(false);
      expect(paymentRepository.createWithFee).toHaveBeenCalledWith(
        expect.objectContaining({ feeAmount: 25, feePercent: 2.5 }),
      );
    });

    it('returns existing session for duplicate orderId', async () => {
      vi.mocked(paymentRepository.findByMerchantAndOrder).mockResolvedValue(mockCheckoutPayment);
      vi.mocked(stripe.checkout.sessions.retrieve).mockResolvedValue({
        url: 'https://checkout.stripe.com/pay/cs_test_123',
      } as any);

      const result = await service.createCheckoutSession({
        merchant: mockMerchant as any,
        amount: 1000,
        currency: 'usd',
        orderId: 'order-123',
        customerEmail: 'customer@test.com',
      });

      expect(result.idempotent).toBe(true);
      expect(result.paymentId).toBe('payment-uuid');
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
      expect(paymentRepository.createWithFee).not.toHaveBeenCalled();
    });

    it('calculates fee correctly', async () => {
      vi.mocked(paymentRepository.findByMerchantAndOrder).mockResolvedValue(null);
      vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
        id: 'cs_test_456',
        url: 'https://checkout.stripe.com/cs_test_456',
      } as any);
      vi.mocked(paymentRepository.createWithFee).mockResolvedValue(mockCheckoutPayment);

      await service.createCheckoutSession({
        merchant: { ...mockMerchant, defaultFeePercent: 5 } as any,
        amount: 2000,
        currency: 'usd',
        orderId: 'order-456',
        customerEmail: 'customer@test.com',
      });

      expect(paymentRepository.createWithFee).toHaveBeenCalledWith(
        expect.objectContaining({ feeAmount: 100, feePercent: 5 }),
      );
    });
  });

  describe('createPaymentIntent', () => {
    it('creates a new payment intent', async () => {
      vi.mocked(paymentRepository.findByMerchantAndOrder).mockResolvedValue(null);
      vi.mocked(stripe.paymentIntents.create).mockResolvedValue({
        id: 'pi_test_123',
        client_secret: 'pi_test_123_secret',
      } as any);
      vi.mocked(paymentRepository.createWithFee).mockResolvedValue(mockIntentPayment);

      const result = await service.createPaymentIntent({
        merchant: mockMerchant as any,
        amount: 1000,
        currency: 'usd',
        orderId: 'order-789',
        customerEmail: 'customer@test.com',
      });

      expect(result.intentId).toBe('pi_test_123');
      expect(result.idempotent).toBe(false);
    });

    it('returns existing intent for duplicate orderId', async () => {
      vi.mocked(paymentRepository.findByMerchantAndOrder).mockResolvedValue(mockIntentPayment);
      vi.mocked(stripe.paymentIntents.retrieve).mockResolvedValue({
        client_secret: 'pi_test_123_secret',
      } as any);

      const result = await service.createPaymentIntent({
        merchant: mockMerchant as any,
        amount: 1000,
        currency: 'usd',
        orderId: 'order-789',
        customerEmail: 'customer@test.com',
      });

      expect(result.idempotent).toBe(true);
      expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
    });
  });

  describe('refundPayment', () => {
    const succeededPayment = {
      ...mockIntentPayment,
      status: PaymentStatus.SUCCEEDED,
    };

    it('refunds a succeeded payment', async () => {
      vi.mocked(stripe.refunds.create).mockResolvedValue({
        id: 'ref_test_123',
        status: 'succeeded',
      } as any);
      vi.mocked(paymentRepository.updateStatus).mockResolvedValue({
        ...succeededPayment,
        status: PaymentStatus.REFUNDED,
      } as any);

      const result = await service.refundPayment({ payment: succeededPayment as any });

      expect(result.refundId).toBe('ref_test_123');
      expect(result.amount).toBe(1000);
      expect(paymentRepository.updateStatus).toHaveBeenCalledWith('payment-uuid', PaymentStatus.REFUNDED);
    });

    it('throws 422 for non-succeeded payment', async () => {
      const pending = { ...succeededPayment, status: PaymentStatus.PENDING };
      await expect(service.refundPayment({ payment: pending as any })).rejects.toMatchObject({
        statusCode: 422,
      });
    });

    it('throws 422 when refund amount exceeds payment amount', async () => {
      await expect(service.refundPayment({ payment: succeededPayment as any, amount: 9999 })).rejects.toMatchObject({
        statusCode: 422,
      });
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('allows a valid partial refund', async () => {
      vi.mocked(stripe.refunds.create).mockResolvedValue({
        id: 'ref_partial',
        status: 'succeeded',
      } as any);
      vi.mocked(paymentRepository.updateStatus).mockResolvedValue(succeededPayment as any);

      const result = await service.refundPayment({
        payment: succeededPayment as any,
        amount: 500,
      });

      expect(result.amount).toBe(500);
      expect(stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 500 }));
    });
  });
});
