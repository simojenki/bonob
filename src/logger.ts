import { createLogger, format, transports } from 'winston';

export function debugIt<T>(thing: T): T {
  logger.debug(thing);
  return thing;
}

/**
 * Safely extracts loggable details from an unknown error value.
 * Handles Error instances, Axios errors (avoiding circular refs),
 * and arbitrary thrown values.
 */
export function extractErrorDetails(error: unknown): { message: string; stack?: string; code?: string } {
  if (error instanceof Error) {
    const details: { message: string; stack?: string; code?: string } = {
      message: error.message,
      stack: error.stack,
    };
    if ('code' in error && typeof (error as any).code === 'string') {
      details.code = (error as any).code;
    }
    return details;
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

const logger = createLogger({
    level: process.env["BNB_LOG_LEVEL"] || 'info',
    format: format.combine(
      format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      format.errors({ stack: true }),
      format.splat(),
      format.json()
    ),
    defaultMeta: { service: 'bonob' },
    transports: [
      new transports.Console()
    ]
  });

  export default logger;