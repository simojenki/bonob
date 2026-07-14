import { createLogger, format, transports } from 'winston';
const { combine, timestamp, printf, errors, splat } = format;

export function debugIt<T>(thing: T): T {
  logger.debug(thing);
  return thing;
}

const bonobFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${stack || message}`;
});

const logger = createLogger({
  level: process.env["BNB_LOG_LEVEL"] || 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    splat(),
    bonobFormat
  ),
  defaultMeta: { service: 'bonob' },
  transports: [
    new transports.Console()
  ]
});

export default logger;