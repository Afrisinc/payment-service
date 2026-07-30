import type { Fee } from '@prisma/client';
import { prismaRead } from '../lib/prisma.js';

export class FeeRepository {
  async findByPaymentId(paymentId: string): Promise<Fee | null> {
    return prismaRead.fee.findFirst({ where: { paymentId } });
  }
}

export const feeRepository = new FeeRepository();
