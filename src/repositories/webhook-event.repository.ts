import type { WebhookEvent, Prisma } from '@prisma/client';
import { prismaWrite } from '../lib/prisma.js';

const RETENTION_DAYS = 30;

export class WebhookEventRepository {
  async create(data: Prisma.WebhookEventCreateInput): Promise<WebhookEvent> {
    return prismaWrite.webhookEvent.create({ data });
  }

  async exists(stripeEventId: string): Promise<boolean> {
    const count = await prismaWrite.webhookEvent.count({ where: { stripeEventId } });
    return count > 0;
  }

  async pruneOld(): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const { count } = await prismaWrite.webhookEvent.deleteMany({
      where: { processedAt: { lt: cutoff } },
    });
    return count;
  }
}

export const webhookEventRepository = new WebhookEventRepository();
