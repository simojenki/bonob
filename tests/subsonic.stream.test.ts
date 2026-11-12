import { v4 as uuid } from 'uuid';
import { pipe } from 'fp-ts/lib/function';
import { option as O, taskEither as TE, task as T } from 'fp-ts';

import { Readable } from 'stream';

import {
  Subsonic,
  t,
  asURLSearchParams,
  CustomPlayers,
  SubsonicStreamError,
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
                  f: 'json',
                }),
                headers: {
                  'User-Agent': 'bonob',
                },
                responseType: 'stream',
                validateStatus: expect.any(Function),
              });
            });
          });
  
          describe('play answers a failure instead of audio (#1550)', () => {
            const subsonicError = (error: { code: number; message: string; helpUrl?: string }) =>
              JSON.stringify({
                'subsonic-response': {
                  status: 'failed',
                  version: '1.16.1',
                  error,
                },
              });

            const streamFailure = async (streamResponse: any) => {
              mockGET
                .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getSongJson(track)))
                )
                .mockImplementationOnce(() => Promise.resolve(streamResponse));

              const musicLibrary = await login({ username, password });

              return musicLibrary
                .stream({ trackId, range: 'bytes=0-' })
                .then(
                  (it) => `Expected a SubsonicStreamError, got status ${it.status}`,
                  (e) => e
                );
            };

            it('should reject a 200 Subsonic error with its code and message', async () => {
              const message = "File not found in storage 'OneDrive': /Music/track.mp3. Resync your library in the Astiga web app.";

              const failure = await streamFailure({
                status: 200,
                headers: { 'content-type': 'application/json' },
                data: Readable.from([subsonicError({ code: 70, message })]),
              });

              expect(failure).toBeInstanceOf(SubsonicStreamError);
              expect(failure).toMatchObject({
                status: 200,
                code: 70,
                message,
                helpUrl: undefined,
                username,
                durationMs: expect.any(Number),
              });
            });

            it('should reject a 206 Subsonic error, as Apache sends for a Range request, with its helpUrl', async () => {
              const helpUrl = 'https://play.asti.ga/settings/edit-storage/OneDrive';
              const message = `Storage 'OneDrive' needs to be reconnected to Astiga. Click "Update token" in the Astiga web app under Storage accounts: ${helpUrl}`;

              const failure = await streamFailure({
                status: 206,
                headers: { 'content-type': 'application/json; charset=utf-8', 'content-range': 'bytes 0-200/201' },
                data: Readable.from([subsonicError({ code: 0, message, helpUrl })]),
              });

              expect(failure).toBeInstanceOf(SubsonicStreamError);
              expect(failure).toMatchObject({ status: 206, code: 0, message, helpUrl, username });
            });

            it('should reject an HTTP error status with its X-Error as the message', async () => {
              const message = 'File not found: /Music/track.mp3';

              const failure = await streamFailure({
                status: 404,
                headers: { 'content-type': 'text/html', 'x-error': JSON.stringify(message) },
                data: Readable.from(['']),
              });

              expect(failure).toBeInstanceOf(SubsonicStreamError);
              expect(failure).toMatchObject({ status: 404, code: undefined, message, username });
            });

            // #1550 review — with validateStatus accepting every status, an error body that is
            // never read holds play's connection open until it times out.
            it('should release the body of an HTTP error status', async () => {
              const data = Readable.from(['<html>Not Found</html>']);

              await streamFailure({
                status: 404,
                headers: { 'content-type': 'text/html', 'x-error': JSON.stringify('File not found') },
                data,
              });

              expect(data.destroyed).toBe(true);
            });

            it('should reject an HTTP error status without an X-Error', async () => {
              const failure = await streamFailure({
                status: 502,
                headers: { 'content-type': 'text/html' },
                data: Readable.from(['<html>Bad Gateway</html>']),
              });

              expect(failure).toBeInstanceOf(SubsonicStreamError);
              expect(failure).toMatchObject({ status: 502, code: undefined });
            });

            it('should ask play for a JSON error body and read an error status rather than letting axios throw', async () => {
              await streamFailure({
                status: 404,
                headers: { 'x-error': JSON.stringify('File not found') },
                data: Readable.from(['']),
              });

              const config = mockGET.mock.calls[2][1];
              expect(config.params.get('f')).toEqual('json');
              expect(config.validateStatus?.(404)).toBe(true);
              expect(config.validateStatus?.(502)).toBe(true);
            });
          });

          describe('play answers a 206 with audio', () => {
            it('should return the content', async () => {
              const stream = { pipe: jest.fn() };

              mockGET
                .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
                .mockImplementationOnce(() =>
                  Promise.resolve(ok(getSongJson(track)))
                )
                .mockImplementationOnce(() =>
                  Promise.resolve({
                    status: 206,
                    headers: {
                      'content-type': 'audio/mpeg',
                      'content-length': '201',
                      'content-range': 'bytes 0-200/1667',
                      'accept-ranges': 'bytes',
                    },
                    data: stream,
                  })
                );

              const result = await login({ username, password })
                .then((it) => it.stream({ trackId, range: 'bytes=0-200' }));

              expect(result.status).toEqual(206);
              expect(result.headers).toEqual({
                'content-type': 'audio/mpeg',
                'content-length': '201',
                'content-range': 'bytes 0-200/1667',
                'accept-ranges': 'bytes',
              });
              expect(result.stream).toEqual(stream);
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
                f: 'json',
              }),
              headers: {
                'User-Agent': 'bonob',
                Range: range,
              },
              responseType: 'stream',
              validateStatus: expect.any(Function),
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
              f: 'json',
              c: trackWithCustomPlayer.encoding.player,
            }),
            headers: {
              'User-Agent': 'bonob',
            },
            responseType: 'stream',
            validateStatus: expect.any(Function),
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
              f: 'json',
              c: trackWithCustomPlayer.encoding.player,
            }),
            headers: {
              'User-Agent': 'bonob',
              Range: range,
            },
            responseType: 'stream',
            validateStatus: expect.any(Function),
          });
        });
      });
    });
  });
});