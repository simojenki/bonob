import { createLogger, format, transports } from 'winston';

export function debugIt<T>(thing: T): T {
  logger.debug(thing);
  return thing;
}

const logger = createLogger({
    level: 'debug',
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