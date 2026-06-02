import { PaymentStatus, PaymentType } from '@prisma/client';
import type { Payment } from '@prisma/client';
import { stripe } from '../lib/stripe.js';
import { notifyClient } from '../lib/notify.js';
import { paymentRepository, merchantRepository } from '../repositories/index.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import type {
  CreateCheckoutParams,
  CreateIntentParams,
  RefundParams,
  CheckoutResult,
  IntentResult,
  RefundResult,
  PaymentMetadata,
} from '../types/index.js';

function calculateFee(amount: number, feePercent: number): number {
  return Math.round(amount * (feePercent / 100));
}

export class PaymentService {
  async createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const { merchant, amount, currency, orderId, customerEmail, successUrl, cancelUrl } = params;

    const existing = await paymentRepository.findByMerchantAndOrder(merchant.id, orderId);
    if (existing?.stripeSessionId) {
      const session = await stripe.checkout.sessions.retrieve(existing.stripeSessionId);
      return {
        paymentId: existing.id,
        checkoutUrl: session.url ?? '',
        sessionId: existing.stripeSessionId,
        status: existing.status,
        idempotent: true,
      };
    }

    const feePercent = Number(merchant.defaultFeePercent);
    const feeAmount = calculateFee(amount, feePercent);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: customerEmail,
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: { name: `Order ${orderId}` },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl ?? `${env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl ?? `${env.FRONTEND_URL}/payment/cancel`,
      metadata: { orderId, merchantId: merchant.id },
    });

    const payment = await paymentRepository.createWithFee({
      merchantId: merchant.id,
      orderId,
      amount,
      currency: currency.toLowerCase(),
      type: PaymentType.CHECKOUT,
      feeAmount,
      feePercent,
      stripeSessionId: session.id,
      metadata: { customerEmail },
    });

    logger.info({ paymentId: payment.id, sessionId: session.id }, 'Checkout session created');

    return {
      paymentId: payment.id,
      checkoutUrl: session.url!,
      sessionId: session.id,
      status: payment.status,
      idempotent: false,
    };
  }

  async createPaymentIntent(params: CreateIntentParams): Promise<IntentResult> {
    const { merchant, amount, currency, orderId, customerEmail, metadata: callerMetadata } = params;

    const existing = await paymentRepository.findByMerchantAndOrder(merchant.id, orderId);
    if (existing?.stripeIntentId) {
      const intent = await stripe.paymentIntents.retrieve(existing.stripeIntentId);
      return {
        paymentId: existing.id,
        clientSecret: intent.client_secret!,
        intentId: existing.stripeIntentId,
        status: existing.status,
        idempotent: true,
      };
    }

    const feePercent = Number(merchant.defaultFeePercent);
    const feeAmount = calculateFee(amount, feePercent);

    const intent = await stripe.paymentIntents.create({
      amount,
      currency: currency.toLowerCase(),
      receipt_email: customerEmail,
      metadata: { orderId, merchantId: merchant.id },
    });

    const payment = await paymentRepository.createWithFee({
      merchantId: merchant.id,
      orderId,
      amount,
      currency: currency.toLowerCase(),
      type: PaymentType.INTENT,
      feeAmount,
      feePercent,
      stripeIntentId: intent.id,
      metadata: { customerEmail, ...callerMetadata },
    });

    logger.info({ paymentId: payment.id, intentId: intent.id }, 'Payment intent created');

    return {
      paymentId: payment.id,
      clientSecret: intent.client_secret!,
      intentId: intent.id,
      status: payment.status,
      idempotent: false,
    };
  }

  async getPayment(id: string, merchantId: string): Promise<Payment | null> {
    return paymentRepository.findByIdAndMerchant(id, merchantId);
  }

  async listPayments(merchantId: string, page: number, limit: number, status?: PaymentStatus) {
    return paymentRepository.listByMerchant(merchantId, page, limit, status);
  }

  async refundPayment(params: RefundParams): Promise<RefundResult> {
    const { payment, amount, reason } = params;

    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw Object.assign(new Error('Only succeeded payments can be refunded'), {
        statusCode: 422,
      });
    }

    const refundAmount = amount ?? payment.amount;

    if (refundAmount > payment.amount) {
      throw Object.assign(new Error(`Refund amount ${refundAmount} exceeds payment amount ${payment.amount}`), {
        statusCode: 422,
      });
    }

    const stripeReason =
      reason === 'duplicate' ? 'duplicate' : reason === 'fraudulent' ? 'fraudulent' : 'requested_by_customer';

    let refund;

    if (payment.type === PaymentType.INTENT) {
      refund = await stripe.refunds.create({
        payment_intent: payment.stripeIntentId!,
        amount: refundAmount,
        reason: stripeReason,
      });
    } else {
      const session = await stripe.checkout.sessions.retrieve(payment.stripeSessionId!);
      if (!session.payment_intent) {
        throw Object.assign(new Error('No payment intent found for checkout session'), {
          statusCode: 500,
        });
      }
      refund = await stripe.refunds.create({
        payment_intent: session.payment_intent as string,
        amount: refundAmount,
        reason: stripeReason,
      });
    }

    await paymentRepository.updateStatus(payment.id, PaymentStatus.REFUNDED);

    logger.info({ paymentId: payment.id, refundId: refund.id }, 'Payment refunded');

    return {
      refundId: refund.id,
      status: refund.status ?? 'succeeded',
      amount: refundAmount,
    };
  }

  async notifyPaymentSuccess(payment: Payment): Promise<void> {
    const merchant = await merchantRepository.findById(payment.merchantId);
    if (!merchant?.webhookUrl || !merchant?.webhookSecret) return;

    const metadata = payment.metadata as PaymentMetadata;
    const customerEmail = metadata?.['customerEmail'];
    if (!customerEmail) return;

    await notifyClient.deliverWebhook({
      webhookUrl: merchant.webhookUrl,
      webhookSecret: merchant.webhookSecret,
      payload: {
        merchantId: payment.merchantId,
        paymentId: payment.id,
        orderId: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        customerEmail,
        status: payment.status,
        metadata: metadata as Record<string, unknown>,
      },
    });
  }
}

export const paymentService = new PaymentService();
