import { v4 as uuid } from 'uuid';
import { pipe } from 'fp-ts/lib/function';
import { taskEither as TE, task as T } from 'fp-ts';

import {
  Subsonic,
  t,
  asURLSearchParams,
  CustomPlayers,
} from '../src/subsonic';

import axios from 'axios';
jest.mock('axios');

import randomstring from 'randomstring';
jest.mock('randomstring');

import {
  Credentials,
} from '../src/music_service';
import { URLBuilder } from '../src/url_builder';

import {
  ok,
  PING_OK,
} from './subsonic.test.helpers';

describe('Subsonic', () => {
  const url = new URLBuilder('http://127.0.0.22:4567/some-context-path');
  const username = `user1-${uuid()}`;
  const password = `pass1-${uuid()}`;
  const salt = 'saltysalty';

  const customPlayers = {
    encodingFor: jest.fn()
  };
  
  const subsonic = new Subsonic(
    url,
    customPlayers as unknown as CustomPlayers
  );

  const mockRandomstring = jest.fn();
  const mockGET = jest.fn();
  const mockPOST = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    randomstring.generate = mockRandomstring;
    axios.get = mockGET;
    axios.post = mockPOST;

    mockRandomstring.mockReturnValue(salt);
  });

  const authParams = {
    u: username,
    v: '1.16.1',
    c: 'bonob',
    t: t(password, salt),
    s: salt,
  };

  const headers = {
    'User-Agent': 'bonob',
  };

  const tokenFor = (credentials: Credentials) => pipe(
    subsonic.generateToken(credentials),
    TE.fold(e => { throw e }, T.of)
  )

  const login = (credentials: Credentials) => tokenFor(credentials)().then((it) => subsonic.login(it.serviceToken))

  describe('fetching cover art', () => {
    describe('fetching album art', () => {
      describe('when no size is specified', () => {
        it('should fetch the image', async () => {
          const streamResponse = {
            status: 200,
            headers: {
              'content-type': 'image/jpeg',
            },
            data: Buffer.from('the image', 'ascii'),
          };
          const coverArtId = 'someCoverArt';
          const coverArtURN = { system: 'subsonic', resource: `art:${coverArtId}` };

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          const result = await login({ username, password })
            .then((it) => it.coverArt(coverArtURN as any));

          expect(result).toEqual({
            contentType: streamResponse.headers['content-type'],
            data: streamResponse.data,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getCoverArt' }).href(), {
            params: asURLSearchParams({
              ...authParams,
              id: coverArtId,
            }),
            headers,
            responseType: 'arraybuffer',
          });
        });
      });

      describe('when size is specified', () => {
        it('should fetch the image', async () => {
          const streamResponse = {
            status: 200,
            headers: {
              'content-type': 'image/jpeg',
            },
            data: Buffer.from('the image', 'ascii'),
          };
          const coverArtId = uuid();
          const coverArtURN = { system: 'subsonic', resource: `art:${coverArtId}` }
          const size = 1879;

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          const result = await login({ username, password })
            .then((it) => it.coverArt(coverArtURN as any, size));

          expect(result).toEqual({
            contentType: streamResponse.headers['content-type'],
            data: streamResponse.data,
          });

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/getCoverArt' }).href(), {
            params: asURLSearchParams({
              ...authParams,
              id: coverArtId,
              size,
            }),
            headers,
            responseType: 'arraybuffer',
          });
        });
      });

      describe('when an unexpected error occurs', () => {
        it('should return undefined', async () => {
          const size = 1879;

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() => Promise.reject('BOOOM'));

          const result = await login({ username, password })
            .then((it) => it.coverArt({ system: 'external', resource: 'http://localhost:404' } as any, size));

          expect(result).toBeUndefined();
        });
      });
    });

    describe('fetching cover art', () => {
      describe('when urn.resource is not subsonic', () => {
        it('should be undefined', async () => {
          const covertArtURN = { system: 'notSubsonic', resource: `art:${uuid()}` };

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)));

          const result = await login({ username, password })
            .then((it) => it.coverArt(covertArtURN as any, 190));

          expect(result).toBeUndefined();
        });
      });

      describe('when no size is specified', () => {
        it('should fetch the image', async () => {
          const coverArtId = uuid()
          const covertArtURN = { system: 'subsonic', resource: `art:${coverArtId}` };

          const streamResponse = {
            status: 200,
            headers: {
              'content-type': 'image/jpeg',
            },
            data: Buffer.from('the image', 'ascii'),
          };

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          const result = await login({ username, password })
            .then((it) => it.coverArt(covertArtURN as any));

          expect(result).toEqual({
            contentType: streamResponse.headers['content-type'],
            data: streamResponse.data,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: '/rest/getCoverArt' }).href(),
            {
              params: asURLSearchParams({
                ...authParams,
                id: coverArtId,
              }),
              headers,
              responseType: 'arraybuffer',
            }
          );
        });

        describe('and an error occurs fetching the uri', () => {
          it('should return undefined', async () => {
            const coverArtId = uuid()
            const covertArtURN = { system:'subsonic', resource: `art:${coverArtId}` };

            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() => Promise.reject('BOOOM'));

            const result = await login({ username, password })
              .then((it) => it.coverArt(covertArtURN as any));

            expect(result).toBeUndefined();
          });
        });
      });

      describe('when size is specified', () => {
        const size = 189;

        it('should fetch the image', async () => {
          const coverArtId = uuid()
          const covertArtURN = { system: 'subsonic', resource: `art:${coverArtId}` };

          const streamResponse = {
            status: 200,
            headers: {
              'content-type': 'image/jpeg',
            },
            data: Buffer.from('the image', 'ascii'),
          };

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          const result = await login({ username, password })
            .then((it) => it.coverArt(covertArtURN as any, size));

          expect(result).toEqual({
            contentType: streamResponse.headers['content-type'],
            data: streamResponse.data,
          });

          expect(axios.get).toHaveBeenCalledWith(
            url.append({ pathname: '/rest/getCoverArt' }).href(),
            {
              params: asURLSearchParams({
                ...authParams,
                id: coverArtId,
                size
              }),
              headers,
              responseType: 'arraybuffer',
            }
          );
        });

        describe('and an error occurs fetching the uri', () => {
          it('should return undefined', async () => {
            const coverArtId = uuid()
            const covertArtURN = { system: 'subsonic', resource: `art:${coverArtId}` };

            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() => Promise.reject('BOOOM'));

            const result = await login({ username, password })
              .then((it) => it.coverArt(covertArtURN as any, size));

            expect(result).toBeUndefined();
          });
        });
      });
    });
  });
});