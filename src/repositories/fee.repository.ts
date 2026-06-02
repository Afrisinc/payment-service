import type { Fee } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export class FeeRepository {
  async findByPaymentId(paymentId: string): Promise<Fee | null> {
    return prisma.fee.findFirst({ where: { paymentId } });
  }
}

export const feeRepository = new FeeRepository();
