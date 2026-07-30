import { config } from 'dotenv';
import { env } from './env';
config();

interface RedisEnv {
  password: string;
  host: string;
  port: number;
}

interface RabbitEnv {
  protocol: string;
  hostname: string;
  port: number;
  username: string;
  password: string;
  vhost: string;
}

export const envMap: Record<string, string> = {
  development: 'DEV',
  production: 'PDN',
};

const appEnv = env.NODE_ENV;
export const envPrefix = envMap[appEnv] || 'DEV';

const createRedisConfig = (envPrefix: string, redisType: 'READ' | 'WRITE'): RedisEnv => {
  const password = process.env[`${envPrefix}_${redisType}_REDIS_PASSWORD`] ?? '';
  const host = process.env[`${envPrefix}_${redisType}_REDIS_HOST`] ?? '';
  const port = Number.parseInt(process.env[`${envPrefix}_${redisType}_REDIS_PORT`] ?? '6379', 10);
  return { password, host, port };
};

const createRabbitConfig = (envPrefix: string): RabbitEnv => {
  const protocol = process.env[`${envPrefix}_RABBIT_PROTOCOL`] ?? 'amqp';
  const hostname = process.env[`${envPrefix}_RABBIT_SERVER`] ?? 'localhost';
  const port = Number.parseInt(process.env[`${envPrefix}_RABBIT_PORT`] ?? '5672', 10);
  const username = process.env[`${envPrefix}_RABBIT_USERNAME`] ?? 'guest';
  const password = process.env[`${envPrefix}_RABBIT_PASSWORD`] ?? 'guest';
  const vhost = process.env[`${envPrefix}_RABBIT_VHOST`] ?? '/';

  return { protocol, hostname, port, username, password, vhost };
};

export const redisOptions = {
  redisWrite: createRedisConfig(envPrefix, 'WRITE'),
  redisRead: createRedisConfig(envPrefix, 'READ'),
};

export const rabbitConnOptions = createRabbitConfig(envPrefix);
