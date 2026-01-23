import { v4 as uuid } from 'uuid';
import { pipe } from 'fp-ts/lib/function';
import { option as O, taskEither as TE, task as T } from 'fp-ts';

import {
  Subsonic,
  t,
  asURLSearchParams,
  CustomPlayers,
  asGenre,
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
} from './builders';
import { URLBuilder } from '../src/url_builder';
import { b64Encode } from '../src/b64';

import {
  ok,
  getSearchResult3Json,
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

  describe('searchArtists', () => {
    describe('when there is 1 search results', () => {
      it('should return true', async () => {
        const artist1 = anArtist({ name: 'foo woo' });

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSearchResult3Json({ artists: [artist1] })))
          );

        const result = await login({ username, password })
          .then((it) => it.searchArtists('foo'));

        expect(result).toEqual([artistToArtistSummary(artist1)]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            artistCount: 20,
            albumCount: 0,
            songCount: 0,
            query: 'foo',
          }),
          headers,
        });
      });
    });

    describe('when there are many search results', () => {
      it('should return true', async () => {
        const artist1 = anArtist({ name: 'foo woo' });
        const artist2 = anArtist({ name: 'foo choo' });

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(
              ok(getSearchResult3Json({ artists: [artist1, artist2] }))
            )
          );

        const result = await login({ username, password })
          .then((it) => it.searchArtists('foo'));

        expect(result).toEqual([
          artistToArtistSummary(artist1),
          artistToArtistSummary(artist2),
        ]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            artistCount: 20,
            albumCount: 0,
            songCount: 0,
            query: 'foo',
          }),
          headers,
        });
      });
    });

    describe('when there are no search results', () => {
      it('should return []', async () => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSearchResult3Json({ artists: [] })))
          );

        const result = await login({ username, password })
          .then((it) => it.searchArtists('foo'));

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            artistCount: 20,
            albumCount: 0,
            songCount: 0,
            query: 'foo',
          }),
          headers,
        });
      });
    });
  });

  describe('searchAlbums', () => {
    describe('when there is 1 search results', () => {
      it('should return true', async () => {
        const album = anAlbum({
          name: 'foo woo',
          genre: { id: b64Encode('pop'), name: 'pop' },
        });
        const artist = anArtist({ name: '#1', albums: [album] });

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(
              ok(getSearchResult3Json({ albums: [{ artist, album }] }))
            )
          );

        const result = await login({ username, password })
          .then((it) => it.searchAlbums('foo'));

        expect(result).toEqual([albumToAlbumSummary(album)]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            artistCount: 0,
            albumCount: 20,
            songCount: 0,
            query: 'foo',
          }),
          headers,
        });
      });
    });

    describe('when there are many search results', () => {
      it('should return true', async () => {
        const album1 = anAlbum({
          name: 'album1',
          genre: { id: b64Encode('pop'), name: 'pop' },
        });
        const artist1 = anArtist({ name: 'artist1', albums: [album1] });

        const album2 = anAlbum({
          name: 'album2',
          genre: { id: b64Encode('pop'), name: 'pop' },
        });
        const artist2 = anArtist({ name: 'artist2', albums: [album2] });

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(
              ok(
                getSearchResult3Json({
                  albums: [
                    { artist: artist1, album: album1 },
                    { artist: artist2, album: album2 },
                  ],
                })
              )
            )
          );

        const result = await login({ username, password })
          .then((it) => it.searchAlbums('moo'));

        expect(result).toEqual([
          albumToAlbumSummary(album1),
          albumToAlbumSummary(album2),
        ]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            artistCount: 0,
            albumCount: 20,
            songCount: 0,
            query: 'moo',
          }),
          headers,
        });
      });
    });

    describe('when there are no search results', () => {
      it('should return []', async () => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSearchResult3Json({ albums: [] })))
          );

        const result = await login({ username, password })
          .then((it) => it.searchAlbums('foo'));

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            artistCount: 0,
            albumCount: 20,
            songCount: 0,
            query: 'foo',
          }),
          headers,
        });
      });
    });
  });

  describe('searchSongs', () => {
    beforeEach(() => {
      customPlayers.encodingFor.mockReturnValue(O.none);
    });

    describe('when there is 1 search results', () => {
      it('should return true', async () => {
        const pop = asGenre('Pop');

        const album = anAlbum({ id: 'album1', name: 'Burnin', genre: pop });
        const artist = anArtist({
          id: 'artist1',
          name: 'Bob Marley',
          albums: [album],
        });
        const track = aTrack({
          artist: artistToArtistSummary(artist),
          album: albumToAlbumSummary(album),
          genre: pop,
          coverArt: album.coverArt, 
        });

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSearchResult3Json({ tracks: [track] })))
          );

        const result = await login({ username, password })
          .then((it) => it.searchTracks('foo'));

        expect(result).toEqual([track]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            artistCount: 0,
            albumCount: 0,
            songCount: 20,
            query: 'foo',
          }),
          headers,
        });
      });
    });

    describe('when there are many search results', () => {
      it('should return true', async () => {
        const pop = asGenre('Pop');

        const album1 = anAlbum({ id: 'album1', name: 'Burnin', genre: pop });
        const artist1 = anArtist({
          id: 'artist1',
          name: 'Bob Marley',
          albums: [album1],
        });
        const track1 = aTrack({
          id: 'track1',
          artist: artistToArtistSummary(artist1),
          album: albumToAlbumSummary(album1),
          genre: pop,
          coverArt: album1.coverArt, 
        });

        const album2 = anAlbum({ id: 'album2', name: 'Bobbin', genre: pop });
        const artist2 = anArtist({
          id: 'artist2',
          name: 'Jane Marley',
          albums: [album2],
        });
        const track2 = aTrack({
          id: 'track2',
          artist: artistToArtistSummary(artist2),
          album: albumToAlbumSummary(album2),
          genre: pop,
          coverArt: album2.coverArt,
        });

        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(
              ok(
                getSearchResult3Json({
                  tracks: [track1, track2],
                })
              )
            )
          );

        const result = await login({ username, password })
          .then((it) => it.searchTracks('moo'));

        expect(result).toEqual([track1, track2]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            artistCount: 0,
            albumCount: 0,
            songCount: 20,
            query: 'moo',
          }),
          headers,
        });
      });
    });

    describe('when there are no search results', () => {
      it('should return []', async () => {
        mockGET
          .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
          .mockImplementationOnce(() =>
            Promise.resolve(ok(getSearchResult3Json({ tracks: [] })))
          );

        const result = await login({ username, password })
          .then((it) => it.searchTracks('foo'));

        expect(result).toEqual([]);

        expect(mockGET).toHaveBeenCalledWith(url.append({ pathname: '/rest/search3' }).href(), {
          params: asURLSearchParams({
            ...authParamsPlusJson,
            artistCount: 0,
            albumCount: 0,
            songCount: 20,
            query: 'foo',
          }),
          headers,
        });
      });
    });
  });
});