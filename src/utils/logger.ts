import { createLogger, format, transports } from 'winston';
import type { TransformableInfo } from 'logform';

const { combine, timestamp, printf, colorize, errors } = format;

const logFormat = printf((info: TransformableInfo) => {
  const ts = String(info.timestamp ?? '');
  const stackOrMessage = String(info.stack ?? info.message ?? '');
  return `${ts} [${info.level}]: ${stackOrMessage}`;
});

const isTest = process.env.NODE_ENV === 'test';

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  silent: isTest,
  format: combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), logFormat),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
  ],
  exitOnError: false,
});
