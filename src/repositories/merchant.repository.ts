import type { Merchant } from '@prisma/client';
import { prismaRead, prismaWrite } from '../lib/prisma.js';
import type { CreateMerchantData } from '../types/index.js';

export class MerchantRepository {
  async findByApiKeyHash(apiKeyHash: string): Promise<Merchant | null> {
    return prismaRead.merchant.findUnique({ where: { apiKeyHash } });
  }

  async findById(id: string): Promise<Merchant | null> {
    return prismaRead.merchant.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<Merchant | null> {
    return prismaWrite.merchant.findUnique({ where: { email } });
  }

  async create(data: CreateMerchantData): Promise<Merchant> {
    return prismaWrite.merchant.create({ data });
  }

  async rotateApiKey(id: string, apiKeyHash: string): Promise<Merchant> {
    return prismaWrite.merchant.update({ where: { id }, data: { apiKeyHash } });
  }

  async setActive(id: string, isActive: boolean): Promise<Merchant> {
    return prismaWrite.merchant.update({ where: { id }, data: { isActive } });
  }

  async updateWebhook(id: string, webhookUrl: string | null, webhookSecret: string | null): Promise<Merchant> {
    return prismaWrite.merchant.update({
      where: { id },
      data: { webhookUrl, webhookSecret },
    });
  }
}

export const merchantRepository = new MerchantRepository();
