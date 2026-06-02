/**
 * Fastify module augmentations
 * Extends Fastify types with custom properties and methods
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Merchant } from '@prisma/client';
/* eslint-enable @typescript-eslint/no-unused-vars */

declare module 'fastify' {
  interface FastifyInstance {
    /** Authenticate merchant via Bearer token */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Authenticate admin via Bearer token */
    authenticateAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    /** Authenticated merchant (set by auth plugin) */
    merchant: Merchant;
    /** Raw request body buffer (set by raw-body plugin when config.rawBody is true) */
    rawBody?: Buffer;
  }

  interface FastifyContextConfig {
    /** Enable raw body parsing for this route */
    rawBody?: boolean;
  }
}
