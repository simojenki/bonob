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
  albumToAlbumSummary,
  artistToArtistSummary,
  Credentials,
} from '../src/music_service';
import {
  anAlbum,
  anArtist,
  aTrack,
  aGenre,
} from './builders';
import { URLBuilder } from '../src/url_builder';

import {
  ok,
  getSongJson,
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


  const tokenFor = (credentials: Credentials) => pipe(
    subsonic.generateToken(credentials),
    TE.fold(e => { throw e }, T.of)
  )

  const login = (credentials: Credentials) => tokenFor(credentials)().then((it) => subsonic.login(it.serviceToken))

  describe('streaming a track', () => {
    const trackId = uuid();
    const genre = aGenre('foo');

    const album = anAlbum({ genre });
    const artist = anArtist({
      albums: [album]
    });
    const track = aTrack({
      id: trackId,
      album: albumToAlbumSummary(album),
      artist: artistToArtistSummary(artist),
      genre,
    });

    describe('when there are no custom players registered', () => {
      beforeEach(() => {
        customPlayers.encodingFor.mockReturnValue(O.none);
      });

      describe('content-range, accept-ranges or content-length', () => {
        describe('when navidrome doesnt return a content-range, accept-ranges or content-length', () => {
          it('should return undefined values', async () => {
            const stream = {
              pipe: jest.fn(),
            };
  
            const streamResponse = {
              status: 200,
              headers: {
                'content-type': 'audio/mpeg',
              },
              data: stream,
            };
  
            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getSongJson(track)))
              )
              .mockImplementationOnce(() => Promise.resolve(streamResponse));
  
            const result = await login({ username, password })
              .then((it) => it.stream({ trackId, range: undefined }));
  
            expect(result.headers).toEqual({
              'content-type': 'audio/mpeg',
              'content-length': undefined,
              'content-range': undefined,
              'accept-ranges': undefined,
            });
          });
        });
  
        describe('when navidrome returns a undefined for content-range, accept-ranges or content-length', () => {
          it('should return undefined values', async () => {
            const stream = {
              pipe: jest.fn(),
            };
  
            const streamResponse = {
              status: 200,
              headers: {
                'content-type': 'audio/mpeg',
                'content-length': undefined,
                'content-range': undefined,
                'accept-ranges': undefined,
              },
              data: stream,
            };
  
            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getSongJson(track)))
              )
              .mockImplementationOnce(() => Promise.resolve(streamResponse));
  
            const result = await login({ username, password })
              .then((it) => it.stream({ trackId, range: undefined }));
  
            expect(result.headers).toEqual({
              'content-type': 'audio/mpeg',
              'content-length': undefined,
              'content-range': undefined,
              'accept-ranges': undefined,
            });
          });
        });
  
        describe('with no range specified', () => {
          describe('navidrome returns a 200', () => {
            it('should return the content', async () => {
              const stream = {
                pipe: jest.fn(),
              };
  
              const streamResponse = {
                status: 200,
                headers: {
                  'content-type': 'audio/mpeg',
                  'content-length': '1667',
                  'content-range': '-200',
                  'accept-ranges': 'bytes',
                  'some-other-header': 'some-value',
                },
                data: stream,
              };
  
              mockGET
                .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getSongJson(track)))
                )
                .mockImplementationOnce(() => Promise.resolve(streamResponse));
  
              const result = await login({ username, password })
                .then((it) => it.stream({ trackId, range: undefined }));
  
              expect(result.headers).toEqual({
                'content-type': 'audio/mpeg',
                'content-length': '1667',
                'content-range': '-200',
                'accept-ranges': 'bytes',
              });
              expect(result.stream).toEqual(stream);
  
              expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/stream' }).href(), {
                params: asURLSearchParams({
                  ...authParams,
                  id: trackId,
                }),
                headers: {
                  'User-Agent': 'bonob',
                },
                responseType: 'stream',
              });
            });
          });
  
          describe('navidrome returns something other than a 200', () => {
            it('should fail', async () => {
              const trackId = 'track123';
  
              const streamResponse = {
                status: 400,
                headers: {
                  'content-type': 'text/html',
                  'content-length': '33'
                }
              };
  
              mockGET
                .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getSongJson(track)))
                )
                .mockImplementationOnce(() => Promise.resolve(streamResponse));
  
              const musicLibrary = await login({ username, password });
  
              return expect(
                musicLibrary.stream({ trackId, range: undefined })
              ).rejects.toEqual(`Subsonic failed with a 400 status`);
            });
          });
  
          describe('io exception occurs', () => {
            it('should fail', async () => {
              const trackId = 'track123';
  
              mockGET
                .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getSongJson(track)))
                )
                .mockImplementationOnce(() => Promise.reject('IO error occured'));
  
              const musicLibrary = await login({ username, password });
  
              return expect(
                musicLibrary.stream({ trackId, range: undefined })
              ).rejects.toEqual(`Subsonic failed with: IO error occured`);
            });
          });
        });
  
        describe('with range specified', () => {
          it('should send the range to navidrome', async () => {
            const stream = {
              pipe: jest.fn(),
            };
  
            const range = '1000-2000';
            const streamResponse = {
              status: 200,
              headers: {
                'content-type': 'audio/flac',
                'content-length': '66',
                'content-range': '100-200',
                'accept-ranges': 'none',
                'some-other-header': 'some-value',
              },
              data: stream,
            };
  
            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getSongJson(track)))
              )
              .mockImplementationOnce(() => Promise.resolve(streamResponse));
  
            const result = await login({ username, password })
              .then((it) => it.stream({ trackId, range }));
  
            expect(result.headers).toEqual({
              'content-type': 'audio/flac',
              'content-length': '66',
              'content-range': '100-200',
              'accept-ranges': 'none',
            });
            expect(result.stream).toEqual(stream);
  
            expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/stream' }).href(), {
              params: asURLSearchParams({
                ...authParams,
                id: trackId,
              }),
              headers: {
                'User-Agent': 'bonob',
                Range: range,
              },
              responseType: 'stream',
            });
          });
        });
      });
    });

    describe('when there are custom players registered', () => {
      const customEncoding = {
        player: `bonob-${uuid()}`,
        mimeType: 'transocodedMimeType'
      };
      const trackWithCustomPlayer = {
        ...track,
        encoding: customEncoding
      };

      beforeEach(() => {
        customPlayers.encodingFor.mockReturnValue(O.of(customEncoding));
      });

      describe('when no range specified', () => {
        it('should user the custom client specified by the stream client', async () => {
          const streamResponse = {
            status: 200,
            headers: {
              'content-type': 'audio/mpeg',
            },
            data: Buffer.from('the track', 'ascii'),
          };

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongJson(trackWithCustomPlayer as any)))
            )
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          await login({ username, password })
            .then((it) => it.stream({ trackId, range: undefined }));

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/stream' }).href(), {
            params: asURLSearchParams({
              ...authParams,
              id: trackId,
              c: trackWithCustomPlayer.encoding.player,
            }),
            headers: {
              'User-Agent': 'bonob',
            },
            responseType: 'stream',
          });
        });
      });

      describe('when range specified', () => {
        it('should user the custom client specified by the stream client', async () => {
          const range = '1000-2000';

          const streamResponse = {
            status: 200,
            headers: {
              'content-type': 'audio/mpeg',
            },
            data: Buffer.from('the track', 'ascii'),
          };

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getSongJson(trackWithCustomPlayer as any)))
            )
            .mockImplementationOnce(() => Promise.resolve(streamResponse));

          await login({ username, password })
            .then((it) => it.stream({ trackId, range }));

          expect(axios.get).toHaveBeenCalledWith(url.append({ pathname: '/rest/stream' }).href(), {
            params: asURLSearchParams({
              ...authParams,
              id: trackId,
              c: trackWithCustomPlayer.encoding.player,
            }),
            headers: {
              'User-Agent': 'bonob',
              Range: range,
            },
            responseType: 'stream',
          });
        });
      });
    });
  });
});