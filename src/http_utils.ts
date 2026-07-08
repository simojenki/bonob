import { Express, RequestHandler } from 'express';
import { SonosWSDL, SmapiValidationHandler } from './sonos_wsdl';

export type Peeker = {
  request?: (body: string) => void | Promise<void>;
  response?: (body: string) => void | Promise<void>;
};

export function onPOST(handler: RequestHandler): RequestHandler {
  return (req, res, next) => req.method === 'POST' ? handler(req, res, next) : next();
}

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

import { Logger } from 'winston';
import logger from './logger';

export function loggingPeeker(log: Logger = logger): Peeker {
  return {
    request: (body) => { log.info(`request:\n${body}`) },
    response: (body) => { log.info(`response:\n${body}`) },
  };
}

export function validateSmapiMessagePeeker(wsdl: SonosWSDL, handler: SmapiValidationHandler): Peeker {
  return {
    request:  (body) => wsdl.validateSmapiMessage(body, handler),
    response: (body) => wsdl.validateSmapiMessage(body, handler),
  };
}

export class Peekers {
  private readonly peekers: Peeker[] = [];

  maybeAdd(condition: boolean, peeker: () => Peeker): this {
    if (condition) this.peekers.push(peeker());
    return this;
  }

  applyTo(app: Express, path: string): void {
    if (this.peekers.length > 0) {
      // SMAPI calls are always POST (per the WSDL binding); GET is only ever used for
      // ?wsdl document retrieval, which isn't a SMAPI message and shouldn't be peeked at.
      app.use(path, onPOST(peekRequestResponse(...this.peekers)));
    }
  }
}
