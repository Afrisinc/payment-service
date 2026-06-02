import type { Merchant } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { CreateMerchantData } from '../types/index.js';

export class MerchantRepository {
  async findByApiKeyHash(apiKeyHash: string): Promise<Merchant | null> {
    return prisma.merchant.findUnique({ where: { apiKeyHash } });
  }

  async findById(id: string): Promise<Merchant | null> {
    return prisma.merchant.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<Merchant | null> {
    return prisma.merchant.findUnique({ where: { email } });
  }

  async create(data: CreateMerchantData): Promise<Merchant> {
    return prisma.merchant.create({ data });
  }

  async rotateApiKey(id: string, apiKeyHash: string): Promise<Merchant> {
    return prisma.merchant.update({ where: { id }, data: { apiKeyHash } });
  }

  async setActive(id: string, isActive: boolean): Promise<Merchant> {
    return prisma.merchant.update({ where: { id }, data: { isActive } });
  }

  async updateWebhook(id: string, webhookUrl: string | null, webhookSecret: string | null): Promise<Merchant> {
    return prisma.merchant.update({
      where: { id },
      data: { webhookUrl, webhookSecret },
    });
  }
}

export const merchantRepository = new MerchantRepository();
