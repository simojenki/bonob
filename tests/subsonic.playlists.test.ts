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
  aPlaylist,
  aPlaylistSummary,
  POP,
  ROCK,
} from './builders';
import { URLBuilder } from '../src/url_builder';

import {
  ok,
  getPlayListsJson,
  getPlayListJson,
  createPlayListJson,
  EMPTY,
  error,
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

  describe('playlists', () => {
    beforeEach(() => {
      customPlayers.encodingFor.mockReturnValue(O.none);
    });

    describe('getting playlists', () => {
      describe('when there is 1 playlist results', () => {
        it('should return it', async () => {
          const playlist = aPlaylistSummary();

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getPlayListsJson([playlist])))
            );

          const result = await login({ username, password })
            .then((it) => it.playlists());

          expect(result).toEqual([playlist]);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getPlaylists' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
        });
      });

      describe('when there are many playlists', () => {
        it('should return them', async () => {
          const playlist1 = aPlaylistSummary();
          const playlist2 = aPlaylistSummary();
          const playlist3 = aPlaylistSummary();
          const playlists = [playlist1, playlist2, playlist3];

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getPlayListsJson(playlists)))
            );

          const result = await login({ username, password })
            .then((it) => it.playlists());

          expect(result).toEqual(playlists);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getPlaylists' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
        });
      });

      describe('when there are no playlists', () => {
        it('should return []', async () => {
          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(getPlayListsJson([])))
            );

          const result = await login({ username, password })
            .then((it) => it.playlists());

          expect(result).toEqual([]);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getPlaylists' }).href(), {
            params: asURLSearchParams(authParamsPlusJson),
            headers,
          });
        });
      });
    });

    describe('getting a single playlist', () => {
      describe('when there is no playlist with the id', () => {
        it('should raise error', async () => {
          const id = 'id404';

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() =>
              Promise.resolve(ok(error('70', 'data not found')))
            );

          return expect(
            login({ username, password })
              .then((it) => it.playlist(id))
          ).rejects.toEqual('Subsonic error:data not found');
        });
      });

      describe('when there is a playlist with the id', () => {
        describe('and it has tracks', () => {
          it('should return the playlist with entries', async () => {
            const id = uuid();
            const name = 'Great Playlist';
            const artist1 = anArtist();
            const album1 = anAlbum({
              artistId: artist1.id,
              artistName: artist1.name,
              genre: POP,
            });
            const track1 = aTrack({
              genre: POP,
              number: 66,
              coverArt: album1.coverArt,
              artist: artistToArtistSummary(artist1),
              album: albumToAlbumSummary(album1),
            });

            const artist2 = anArtist();
            const album2 = anAlbum({
              artistId: artist2.id,
              artistName: artist2.name,
              genre: ROCK,
            });
            const track2 = aTrack({
              genre: ROCK,
              number: 77,
              coverArt: album2.coverArt,
              artist: artistToArtistSummary(artist2),
              album: albumToAlbumSummary(album2),
            });

            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(
                  ok(
                    getPlayListJson({
                      id,
                      name,
                      entries: [track1, track2],
                    })
                  )
                )
              );

            const result = await login({ username, password })
              .then((it) => it.playlist(id));

            expect(result).toEqual({
              id,
              name,
              entries: [
                { ...track1, number: 1 },
                { ...track2, number: 2 },
              ],
            });

            expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getPlaylist' }).href(), {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id,
              }),
              headers,
            });
          });
        });

        describe('and it has no tracks', () => {
          it('should return the playlist with empty entries', async () => {
            const playlist = aPlaylist({
              entries: [],
            });

            mockGET
              .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
              .mockImplementationOnce(() =>
                Promise.resolve(ok(getPlayListJson(playlist)))
              );

            const result = await login({ username, password })
              .then((it) => it.playlist(playlist.id));

            expect(result).toEqual(playlist);

            expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/getPlaylist' }).href(), {
              params: asURLSearchParams({
                ...authParamsPlusJson,
                id: playlist.id,
              }),
              headers,
            });
          });
        });
      });
    });

    describe('creating a playlist', () => {
      it('should create a playlist with the given name', async () => {
        const name = 'ThePlaylist';
        const id = uuid();

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(createPlayListJson({ id, name })))
          );

        const result = await login({ username, password })
          .then((it) => it.createPlaylist(name));

        expect(result).toEqual({ id, name });

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/createPlaylist' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            f: 'json',
            name,
          }),
          headers,
        });
      });
    });

    describe('deleting a playlist', () => {
      it('should delete the playlist by id', async () => {
        const id = 'id-to-delete';

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

          const result = await login({ username, password })
          .then((it) => it.deletePlaylist(id));

        expect(result).toEqual(true);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/deletePlaylist' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            id,
          }),
          headers,
        });
      });
    });

    describe('editing playlists', () => {
      describe('adding a track to a playlist', () => {
        it('should add it', async () => {
          const playlistId = uuid();
          const trackId = uuid();

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

            const result = await login({ username, password })
              .then((it) => it.addToPlaylist(playlistId, trackId));

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/updatePlaylist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              playlistId,
              songIdToAdd: trackId,
            }),
            headers,
          });
        });
      });

      describe('removing a track from a playlist', () => {
        it('should remove it', async () => {
          const playlistId = uuid();
          const indicies = [6, 100, 33];

          mockGET
            .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
            .mockImplementationOnce(() => Promise.resolve(ok(EMPTY)));

            const result = await login({ username, password })
              .then((it) => it.removeFromPlaylist(playlistId, indicies));

          expect(result).toEqual(true);

          expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/updatePlaylist' }).href(), {
            params: asURLSearchParams({
              ...authParamsPlusJson,
              playlistId,
              songIndexToRemove: indicies,
            }),
            headers,
          });
        });
      });
    });
  });
});