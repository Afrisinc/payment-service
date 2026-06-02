import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import type { Payment, WebhookDeliveryStatus } from '@prisma/client';

export type WebhookEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.cancelled'
  | 'payment.refunded'
  | 'payment.disputed'
  | 'payment.expired';

interface MerchantWebhookInfo {
  id: string;
  webhookUrl: string | null;
  webhookSecret: string | null;
}

export interface PaymentWithWebhookMerchant extends Payment {
  merchant: MerchantWebhookInfo;
}

interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: {
    paymentId: string;
    orderId: string;
    amount: number;
    currency: string;
    status: string;
    customerEmail?: string;
    metadata?: Record<string, unknown>;
  };
}

interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
}

const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [
  0, // Immediate
  60_000, // 1 minute
  300_000, // 5 minutes
  1_800_000, // 30 minutes
  7_200_000, // 2 hours
];

function generateSignature(payload: string, secret: string, timestamp: number): string {
  const signedPayload = `${timestamp}.${payload}`;
  return crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
}

function buildSignatureHeader(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = generateSignature(payload, secret, timestamp);
  return `t=${timestamp},v1=${signature}`;
}

function calculateNextRetry(attempts: number): Date | null {
  if (attempts >= MAX_RETRY_ATTEMPTS) {
    return null;
  }
  const delayMs = RETRY_DELAYS_MS[attempts] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] ?? 60_000;
  return new Date(Date.now() + delayMs);
}

class MerchantWebhookService {
  async notifyPaymentEvent(payment: PaymentWithWebhookMerchant, eventType: WebhookEventType): Promise<void> {
    const { merchant } = payment;

    if (!merchant.webhookUrl || !merchant.webhookSecret) {
      logger.debug({ merchantId: merchant.id }, 'Merchant has no webhook configured, skipping notification');
      return;
    }

    const metadata = payment.metadata as Record<string, unknown> | null;
    const payload: WebhookPayload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: {
        paymentId: payment.id,
        orderId: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        customerEmail: metadata?.customerEmail as string | undefined,
        metadata: metadata ?? undefined,
      },
    };

    const delivery = await prisma.webhookDelivery.create({
      data: {
        merchantId: merchant.id,
        paymentId: payment.id,
        eventType,
        payload: payload as object,
        status: 'PENDING',
        attempts: 0,
        nextRetry: new Date(),
      },
    });

    await this.attemptDelivery(delivery.id);
  }

  async attemptDelivery(deliveryId: string): Promise<void> {
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { merchant: true },
    });

    if (!delivery || delivery.status === 'DELIVERED') {
      return;
    }

    const { merchant } = delivery;
    if (!merchant.webhookUrl || !merchant.webhookSecret) {
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'FAILED',
          errorMessage: 'Merchant webhook not configured',
        },
      });
      return;
    }

    const payloadString = JSON.stringify(delivery.payload);
    const signatureHeader = buildSignatureHeader(payloadString, merchant.webhookSecret);

    const result = await this.sendWebhook(merchant.webhookUrl, payloadString, signatureHeader);

    const newAttempts = delivery.attempts + 1;

    if (result.success) {
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'DELIVERED',
          attempts: newAttempts,
          lastAttempt: new Date(),
          responseCode: result.statusCode,
          deliveredAt: new Date(),
          nextRetry: null,
        },
      });

      logger.info(
        { deliveryId, merchantId: merchant.id, eventType: delivery.eventType },
        'Webhook delivered successfully',
      );
    } else {
      const nextRetry = calculateNextRetry(newAttempts);
      const status: WebhookDeliveryStatus = nextRetry ? 'PENDING' : 'FAILED';

      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status,
          attempts: newAttempts,
          lastAttempt: new Date(),
          responseCode: result.statusCode,
          errorMessage: result.error,
          nextRetry,
        },
      });

      if (nextRetry) {
        logger.warn(
          { deliveryId, merchantId: merchant.id, attempts: newAttempts, nextRetry },
          'Webhook delivery failed, will retry',
        );
        this.scheduleRetry(deliveryId, nextRetry.getTime() - Date.now());
      } else {
        logger.error(
          { deliveryId, merchantId: merchant.id, attempts: newAttempts },
          'Webhook delivery failed permanently',
        );
      }
    }
  }

  private async sendWebhook(url: string, payload: string, signature: string): Promise<DeliveryResult> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Afrisinc-Signature': signature,
          'User-Agent': 'Afrisinc-Pay-Webhook/1.0',
        },
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { success: true, statusCode: response.status };
      }

      return {
        success: false,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  private scheduleRetry(deliveryId: string, delayMs: number): void {
    setTimeout(() => {
      this.attemptDelivery(deliveryId).catch((err: unknown) => {
        const errPayload = err instanceof Error ? err : { message: String(err) };
        logger.error({ err: errPayload, deliveryId }, 'Failed to retry webhook delivery');
      });
    }, delayMs);
  }

  async processRetries(): Promise<number> {
    const pendingDeliveries = await prisma.webhookDelivery.findMany({
      where: {
        status: 'PENDING',
        nextRetry: { lte: new Date() },
      },
      take: 100,
    });

    for (const delivery of pendingDeliveries) {
      await this.attemptDelivery(delivery.id);
    }

    return pendingDeliveries.length;
  }

  async getDeliveryStatus(paymentId: string): Promise<{
    deliveries: Array<{
      id: string;
      eventType: string;
      status: string;
      attempts: number;
      createdAt: Date;
      deliveredAt: Date | null;
    }>;
  }> {
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { paymentId },
      select: {
        id: true,
        eventType: true,
        status: true,
        attempts: true,
        createdAt: true,
        deliveredAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { deliveries };
  }
}

export const merchantWebhookService = new MerchantWebhookService();
