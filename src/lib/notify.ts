import crypto from 'node:crypto';
import { logger } from './logger.js';
import type { PaymentNotification } from '../types/index.js';

export interface WebhookDeliveryParams {
  webhookUrl: string;
  webhookSecret: string;
  payload: PaymentNotification;
}

function sign(secret: string, body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function deliverWebhook({ webhookUrl, webhookSecret, payload }: WebhookDeliveryParams): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = sign(webhookSecret, body);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-signature': signature,
      },
      body,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.warn({ status: response.status, paymentId: payload.paymentId }, 'Webhook delivery returned non-OK status');
    }
  } catch (err) {
    logger.warn({ err, paymentId: payload.paymentId }, 'Webhook delivery failed');
  }
}

export const notifyClient = { deliverWebhook };
