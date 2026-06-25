import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3400),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().min(1),

  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  // Paypack Mobile Money
  PAYPACK_CLIENT_ID: z.string().min(1),
  PAYPACK_CLIENT_SECRET: z.string().min(1),
  PAYPACK_WEBHOOK_SECRET: z.string().optional(),
  PAYPACK_API_BASE_URL: z.string().url().default('https://payments.paypack.rw'),

  FRONTEND_URL: z.string().url().default('https://afrisinc.com'),

  ENABLE_SWAGGER: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),
  API_BASE_URL: z.string().url().optional(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment variables:');
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env: z.infer<typeof envSchema> = parsed.data;
