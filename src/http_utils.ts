import { RequestHandler } from 'express';
import { Logger } from 'winston';
import logger from './logger';
import { SonosWSDL } from './sonos_wsdl';

export type Peeker = {
  request?: (body: string) => void | Promise<void>;
  response?: (body: string) => void | Promise<void>;
};

export function peekRequestResponse(...peekers: Peeker[]): RequestHandler {
  return (req, res, next) => {
    const reqChunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => reqChunks.push(chunk));
    req.on('end', async () => {
      const body = Buffer.concat(reqChunks).toString();
      for (const p of peekers) await p.request?.(body);
    });

    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    const resChunks: Buffer[] = [];

    (res as any).write = (...args: Parameters<typeof res.write>) => {
      const chunk = args[0];
      if (chunk)
        resChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      return origWrite(...(args as unknown as [any]));
    };

    (res as any).end = async (...args: Parameters<typeof res.end>) => {
      const chunk = args[0];
      if (chunk && typeof chunk !== 'function')
        resChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      const body = Buffer.concat(resChunks).toString();
      for (const p of peekers) await p.response?.(body);
      return origEnd(...(args as unknown as [any]));
    };

    next();
  };
}

export function loggingPeeker(log: Logger = logger): Peeker {
  return {
    request: (body) => { log.info(`request:\n${body}`) },
    response: (body) => { log.info(`response:\n${body}`) },
  };
}

export function validateSmapiMessagePeeker(wsdl: SonosWSDL, log: Logger = logger): Peeker {
  return {
    request:  (body) => wsdl.validateSmapiMessage(body, log),
    response: (body) => wsdl.validateSmapiMessage(body, log),
  };
}
