import { createLogger, format, transports } from 'winston';
import { inspect } from 'util';
const { combine, timestamp, printf, errors, splat } = format;

export function debugIt<T>(thing: T): T {
  logger.debug(thing);
  return thing;
}

// Any extra metadata passed to logger.error/warn/etc (eg. logger.error("oops", { error: e }))
// ends up here as additional properties on the info object alongside level/message/timestamp/stack.
// Without printing it, callers that attach the actual error/cause as metadata (rather than as
// the logged message itself) have that detail silently swallowed - print it so nothing is lost.
const bonobFormat = printf(({ level, message, timestamp, stack, service: _service, ...meta }) => {
  // rest destructuring also picks up winston's internal Symbol(level)/Symbol(splat) keys,
  // so drop back to string keys only before deciding whether there's anything worth printing.
  const extraMeta = Object.fromEntries(Object.entries(meta));
  const extra = Object.keys(extraMeta).length
    ? ` ${inspect(extraMeta, { depth: 4, breakLength: Infinity })}`
    : "";
  return `${timestamp} [${level.toUpperCase()}]: ${stack || message}${extra}`;
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