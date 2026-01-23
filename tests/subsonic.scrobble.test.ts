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
  EMPTY,
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

  const authParamsPlusJson = {
    u: username,
    v: '1.16.1',
    c: 'bonob',
    t: t(password, salt),
    s: salt,
    f: 'json',
  };

  const headers = {
    'User-Agent': 'bonob',
  };

  const tokenFor = (credentials: Credentials) => pipe(
    subsonic.generateToken(credentials),
    TE.fold(e => { throw e }, T.of)
  )

  const login = (credentials: Credentials) => tokenFor(credentials)().then((it) => subsonic.login(it.serviceToken))

  describe('scrobble', () => {
    describe('when succeeds', () => {
      it('should return true', async () => {
        const id = uuid();

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

        const result = await login({ username, password })
          .then((it) => it.scrobble(id));

        expect(result).toEqual(true);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/scrobble' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            id,
            submission: true,
          }),
          headers,
        });
      });
    });

    describe('when fails', () => {
      it('should return false', async () => {
        const id = uuid();

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve({
              status: 500,
              data: {},
            })
          );

        const result = await login({ username, password })
          .then((it) => it.scrobble(id));

        expect(result).toEqual(false);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/scrobble' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            id,
            submission: true,
          }),
          headers,
        });
      });
    });
  });

  describe('nowPlaying', () => {
    describe('when succeeds', () => {
      it('should return true', async () => {
        const id = uuid();

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

        const result = await login({ username, password })
          .then((it) => it.nowPlaying(id));

        expect(result).toEqual(true);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/scrobble' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            id,
            submission: false,
          }),
          headers,
        });
      });
    });

    describe('when fails', () => {
      it('should return false', async () => {
        const id = uuid();

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve({
              status: 500,
              data: {},
            })
          );

        const result = await login({ username, password })
          .then((it) => it.nowPlaying(id));

        expect(result).toEqual(false);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/scrobble' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            id,
            submission: false,
          }),
          headers,
        });
      });
    });
  });
});