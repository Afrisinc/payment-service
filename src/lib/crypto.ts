import crypto from 'node:crypto';

export function generateApiKey(): string {
  return `apk_live_${crypto.randomBytes(32).toString('hex')}`;
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}
