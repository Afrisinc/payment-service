import crypto from 'crypto';
import type { Merchant } from '@prisma/client';
import { generateApiKey, hashApiKey } from '../lib/crypto.js';
import { merchantRepository } from '../repositories/index.js';
import { logger } from '../lib/logger.js';
import type { CreateMerchantParams, CreateMerchantResult, RotateApiKeyResult } from '../types/index.js';

export interface ConfigureWebhookParams {
  webhookUrl: string;
}

export interface ConfigureWebhookResult {
  webhookUrl: string;
  webhookSecret: string;
}

function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString('hex')}`;
}

export class MerchantService {
  async createMerchant(params: CreateMerchantParams): Promise<CreateMerchantResult> {
    const existing = await merchantRepository.findByEmail(params.email);
    if (existing) {
      throw Object.assign(new Error(`Merchant with email ${params.email} already exists`), {
        statusCode: 409,
      });
    }

    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    const merchant = await merchantRepository.create({
      name: params.name,
      email: params.email,
      apiKeyHash,
      defaultFeePercent: params.defaultFeePercent,
    });

    logger.info({ merchantId: merchant.id }, 'Merchant created');

    return { merchant, apiKey };
  }

  async rotateApiKey(merchantId: string): Promise<RotateApiKeyResult> {
    const merchant = await merchantRepository.findById(merchantId);
    if (!merchant) {
      throw Object.assign(new Error('Merchant not found'), { statusCode: 404 });
    }

    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    await merchantRepository.rotateApiKey(merchantId, apiKeyHash);

    logger.info({ merchantId }, 'Merchant API key rotated');

    return { apiKey };
  }

  async setActive(merchantId: string, isActive: boolean): Promise<Merchant> {
    const merchant = await merchantRepository.findById(merchantId);
    if (!merchant) {
      throw Object.assign(new Error('Merchant not found'), { statusCode: 404 });
    }
    return merchantRepository.setActive(merchantId, isActive);
  }

  async getMerchant(merchantId: string): Promise<Merchant> {
    const merchant = await merchantRepository.findById(merchantId);
    if (!merchant) {
      throw Object.assign(new Error('Merchant not found'), { statusCode: 404 });
    }
    return merchant;
  }

  async configureWebhook(merchantId: string, params: ConfigureWebhookParams): Promise<ConfigureWebhookResult> {
    const merchant = await merchantRepository.findById(merchantId);
    if (!merchant) {
      throw Object.assign(new Error('Merchant not found'), { statusCode: 404 });
    }

    const webhookSecret = generateWebhookSecret();

    await merchantRepository.updateWebhook(merchantId, params.webhookUrl, webhookSecret);

    logger.info({ merchantId }, 'Merchant webhook configured');

    return { webhookUrl: params.webhookUrl, webhookSecret };
  }

  async removeWebhook(merchantId: string): Promise<void> {
    const merchant = await merchantRepository.findById(merchantId);
    if (!merchant) {
      throw Object.assign(new Error('Merchant not found'), { statusCode: 404 });
    }

    await merchantRepository.updateWebhook(merchantId, null, null);

    logger.info({ merchantId }, 'Merchant webhook removed');
  }

  async getWebhookConfig(merchantId: string): Promise<{ webhookUrl: string | null; hasSecret: boolean }> {
    const merchant = await merchantRepository.findById(merchantId);
    if (!merchant) {
      throw Object.assign(new Error('Merchant not found'), { statusCode: 404 });
    }

    return {
      webhookUrl: merchant.webhookUrl,
      hasSecret: !!merchant.webhookSecret,
    };
  }
}

export const merchantService = new MerchantService();
