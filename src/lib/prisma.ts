import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

const log: Prisma.LogLevel[] = env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'];

export const prismaWrite = new PrismaClient({
  log,
  datasources: { db: { url: env.DATABASE_URL } },
});

export const prismaRead = new PrismaClient({
  log,
  datasources: { db: { url: env.DATABASE_READ_URL ?? env.DATABASE_URL } },
});
