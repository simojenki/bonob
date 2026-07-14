import { EventEmitter } from 'events';
import { onPOST, peekRequestResponse, loggingPeeker, validateSmapiMessagePeeker } from '../src/http_utils';
import { SonosWSDL, SmapiValidationHandler } from '../src/sonos_wsdl';

function makeReq() {
  return new EventEmitter() as any;
}

function makeRes() {
  return {
    write: jest.fn((..._args: any[]) => true),
    end: jest.fn((..._args: any[]) => ({} as any)),
  };
}

describe('onPOST', () => {
  it('calls the wrapped handler for POST requests', () => {
    const handler = jest.fn();
    const req = { method: 'POST' } as any;
    const res = makeRes() as any;
    const next = jest.fn();

    onPOST(handler)(req, res, next);

    expect(handler).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['GET', 'HEAD', 'PUT', 'DELETE'])('calls next instead of the wrapped handler for %s requests', (method) => {
    const handler = jest.fn();
    const req = { method } as any;
    const res = makeRes() as any;
    const next = jest.fn();

    onPOST(handler)(req, res, next);

    expect(handler).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('peekRequestResponse', () => {
  describe('next()', () => {
    it('calls next', () => {
      const next = jest.fn();
      peekRequestResponse()(makeReq(), makeRes() as any, next);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('request peeking', () => {
    it('calls request peeker with the body when stream ends', (done) => {
      const peeker = { request: jest.fn() };
      const req = makeReq();
      peekRequestResponse(peeker)(req, makeRes() as any, jest.fn());

      req.emit('data', Buffer.from('<soap>hello</soap>'));
      req.emit('end');

      setImmediate(() => {
        expect(peeker.request).toHaveBeenCalledWith('<soap>hello</soap>');
        done();
      });
    });

    it('concatenates multiple data chunks before calling peeker', (done) => {
      const peeker = { request: jest.fn() };
      const req = makeReq();
      peekRequestResponse(peeker)(req, makeRes() as any, jest.fn());

      req.emit('data', Buffer.from('<soap>'));
      req.emit('data', Buffer.from('hello'));
      req.emit('data', Buffer.from('</soap>'));
      req.emit('end');

      setImmediate(() => {
        expect(peeker.request).toHaveBeenCalledWith('<soap>hello</soap>');
        done();
      });
    });

    it('calls request peeker with empty string when no data is emitted', (done) => {
      const peeker = { request: jest.fn() };
      const req = makeReq();
      peekRequestResponse(peeker)(req, makeRes() as any, jest.fn());

      req.emit('end');

      setImmediate(() => {
        expect(peeker.request).toHaveBeenCalledWith('');
        done();
      });
    });

    it('calls all registered peekers', (done) => {
      const peeker1 = { request: jest.fn() };
      const peeker2 = { request: jest.fn() };
      const req = makeReq();
      peekRequestResponse(peeker1, peeker2)(req, makeRes() as any, jest.fn());

      req.emit('data', Buffer.from('body'));
      req.emit('end');

      setImmediate(() => {
        expect(peeker1.request).toHaveBeenCalledWith('body');
        expect(peeker2.request).toHaveBeenCalledWith('body');
        done();
      });
    });

    it('does not consume the stream — a second listener receives the same chunks', (done) => {
      const req = makeReq();
      peekRequestResponse({ request: jest.fn() })(req, makeRes() as any, jest.fn());

      // Simulate the soap library attaching its own listener after next()
      const soapChunks: string[] = [];
      req.on('data', (chunk: Buffer) => soapChunks.push(chunk.toString()));

      req.emit('data', Buffer.from('<soap>hello</soap>'));
      req.emit('end');

      setImmediate(() => {
        expect(soapChunks).toEqual(['<soap>hello</soap>']);
        done();
      });
    });

    it('does not call request peeker if peeker has no request handler', (done) => {
      const peeker = { response: jest.fn() };
      const req = makeReq();
      peekRequestResponse(peeker)(req, makeRes() as any, jest.fn());

      req.emit('data', Buffer.from('body'));
      req.emit('end');

      setImmediate(() => {
        expect(peeker.response).not.toHaveBeenCalled();
        done();
      });
    });
  });

  describe('response peeking', () => {
    it('calls response peeker with body written via res.end', async () => {
      const peeker = { response: jest.fn() };
      const res = makeRes();
      peekRequestResponse(peeker)(makeReq(), res as any, jest.fn());

      await (res as any).end('<response>ok</response>');

      expect(peeker.response).toHaveBeenCalledWith('<response>ok</response>');
    });

    it('calls response peeker with body written via res.write then res.end', async () => {
      const peeker = { response: jest.fn() };
      const res = makeRes();
      peekRequestResponse(peeker)(makeReq(), res as any, jest.fn());

      (res as any).write('<response>');
      (res as any).write('ok');
      await (res as any).end('</response>');

      expect(peeker.response).toHaveBeenCalledWith('<response>ok</response>');
    });

    it('calls response peeker with empty string when res.end has no chunk', async () => {
      const peeker = { response: jest.fn() };
      const res = makeRes();
      peekRequestResponse(peeker)(makeReq(), res as any, jest.fn());

      await (res as any).end();

      expect(peeker.response).toHaveBeenCalledWith('');
    });

    it('calls all registered peekers', async () => {
      const peeker1 = { response: jest.fn() };
      const peeker2 = { response: jest.fn() };
      const res = makeRes();
      peekRequestResponse(peeker1, peeker2)(makeReq(), res as any, jest.fn());

      await (res as any).end('body');

      expect(peeker1.response).toHaveBeenCalledWith('body');
      expect(peeker2.response).toHaveBeenCalledWith('body');
    });

    it('still calls the original res.write', () => {
      const res = makeRes();
      const origWrite = res.write;
      peekRequestResponse()(makeReq(), res as any, jest.fn());

      (res as any).write('data');

      expect(origWrite).toHaveBeenCalledWith('data');
    });

    it('still calls the original res.end', async () => {
      const res = makeRes();
      const origEnd = res.end;
      peekRequestResponse()(makeReq(), res as any, jest.fn());

      await (res as any).end('data');

      expect(origEnd).toHaveBeenCalledWith('data');
    });
  });
});

describe('loggingPeeker', () => {
  it('logs the request body as a message', () => {
    const log = { info: jest.fn() } as any;
    const peeker = loggingPeeker(log);

    peeker.request!('<soap>hello</soap>');

    expect(log.info).toHaveBeenCalledWith('request:\n<soap>hello</soap>');
  });

  it('logs the response body as a message', () => {
    const log = { info: jest.fn() } as any;
    const peeker = loggingPeeker(log);

    peeker.response!('<response>ok</response>');

    expect(log.info).toHaveBeenCalledWith('response:\n<response>ok</response>');
  });
});

describe('validateSmapiMessagePeeker', () => {
  const handler: SmapiValidationHandler = jest.fn();

  it('delegates request bodies to validateSmapiMessage', async () => {
    const wsdl = { validateSmapiMessage: jest.fn() } as unknown as SonosWSDL;
    const peeker = validateSmapiMessagePeeker(wsdl, handler);
    await peeker.request!('<soap/>');
    expect(wsdl.validateSmapiMessage).toHaveBeenCalledWith('<soap/>', handler);
  });

  it('delegates response bodies to validateSmapiMessage', async () => {
    const wsdl = { validateSmapiMessage: jest.fn() } as unknown as SonosWSDL;
    const peeker = validateSmapiMessagePeeker(wsdl, handler);
    await peeker.response!('<soap/>');
    expect(wsdl.validateSmapiMessage).toHaveBeenCalledWith('<soap/>', handler);
  });
});
