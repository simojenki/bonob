import { v4 as uuid } from 'uuid';
import { pipe } from 'fp-ts/lib/function';
import { option as O, taskEither as TE, task as T } from 'fp-ts';

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
import {
  aRadioStation,
} from './builders';
import { URLBuilder } from '../src/url_builder';

import {
  ok,
  getRadioStationsJson,
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

  describe('radioStations', () => {
    beforeEach(() => {
      customPlayers.encodingFor.mockReturnValue(O.none);
    });

    describe('when there some radio stations', () => {
      const station1 = aRadioStation();
      const station2 = aRadioStation();
      const station3 = aRadioStation();

      beforeEach(() => {
        mockGET
        .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
        .mockImplementationOnce(() =>
          Promise.resolve(ok(getRadioStationsJson([
            station1,
            station2,
            station3,
          ])))
        );
      });

      describe('asking for all of them', () => {
        it('should return them all', async () => {
          const result = await login({ username, password })
            .then((it) => it.radioStations());
  
          expect(result).toEqual([station1, station2, station3]);
  
          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getInternetRadioStations' }).href(), {
            params: asURLSearchParams({
              ...authParams,
              f: 'json'
            }),
            headers,
          });
        });
      });

      describe('asking for one of them', () => {
        it('should return it', async () => {
          const result = await login({ username, password })
            .then((it) => it.radioStation(station2.id));
  
          expect(result).toEqual(station2);
  
          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getInternetRadioStations' }).href(), {
            params: asURLSearchParams({
              ...authParams,
              f: 'json'
            }),
            headers,
          });
        });
      });
    });

    describe('when there are no radio stations', () => {
      it('should return []', async () => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getRadioStationsJson([])))
          );

          const result = await login({ username, password })
              .then((it) => it.radioStations());

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getInternetRadioStations' }).href(), {
          params: asURLSearchParams({
            ...authParams,
            f: 'json'
          }),
          headers,
        });
      });
    });
  });
});