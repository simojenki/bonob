import { option as O, taskEither as TE } from "fp-ts";
import * as A from "fp-ts/Array";
import { pipe } from "fp-ts/lib/function";
import { ordString } from "fp-ts/lib/Ord";
import { inject } from 'underscore';
import _ from "underscore";

import logger from "../logger";
import { b64Decode, b64Encode } from "../b64";
import { assertSystem, BUrn } from "../burn";

import { Album, AlbumQuery, AlbumQueryType, AlbumSummary, Artist, ArtistQuery, ArtistSummary, AuthFailure, Credentials, Genre, IdName, Rating, Result, slice2, Sortable, Track } from "../music_service";
import Subsonic, { artistSummaryFromNDArtist, DODGY_IMAGE_NAME, NDArtist, SubsonicCredentials, SubsonicMusicLibrary, SubsonicResponse, USER_AGENT } from "../subsonic";
import axios from "axios";
import { asURLSearchParams } from "../utils";


type album = {
  id: string;
  name: string;
  artist: string | undefined;
  artistId: string | undefined;
  coverArt: string | undefined;
  genre: string | undefined;
  year: string | undefined;
};

type artist = {
  id: string;
  name: string;
  albumCount: number;
  artistImageUrl: string | undefined;
};

type GetArtistsResponse = SubsonicResponse & {
  artists: {
    index: {
      artist: artist[];
      name: string;
    }[];
  };
};

type GetAlbumListResponse = SubsonicResponse & {
  albumList2: {
    album: album[];
  };
};

type genre = {
  songCount: number;
  albumCount: number;
  value: string;
};

type GetGenresResponse = SubsonicResponse & {
  genres: {
    genre: genre[];
  };
};


type GetArtistInfoResponse = SubsonicResponse & {
  artistInfo2: artistInfo;
};

type GetArtistResponse = SubsonicResponse & {
  artist: artist & {
    album: album[];
  };
};


export type images = {
  smallImageUrl: string | undefined;
  mediumImageUrl: string | undefined;
  largeImageUrl: string | undefined;
};

type artistInfo = images & {
  biography: string | undefined;
  musicBrainzId: string | undefined;
  lastFmUrl: string | undefined;
  similarArtist: artist[];
};


export type song = {
  id: string;
  parent: string | undefined;
  title: string;
  album: string | undefined;
  albumId: string | undefined;
  artist: string | undefined;
  artistId: string | undefined;
  track: number | undefined;
  year: string | undefined;
  genre: string | undefined;
  coverArt: string | undefined;
  created: string | undefined;
  duration: number | undefined;
  bitRate: number | undefined;
  suffix: string | undefined;
  contentType: string | undefined;
  type: string | undefined;
  userRating: number | undefined;
  starred: string | undefined;
};

type GetAlbumResponse = {
  album: album & {
    song: song[];
  };
};

type playlist = {
  id: string;
  name: string;
};

type GetPlaylistResponse = {
  playlist: {
    id: string;
    name: string;
    entry: song[];
  };
};

type GetPlaylistsResponse = {
  playlists: { playlist: playlist[] };
};

type GetSimilarSongsResponse = {
  similarSongs2: { song: song[] };
};

type GetTopSongsResponse = {
  topSongs: { song: song[] };
};

type GetSongResponse = {
  song: song;
};


type Search3Response = SubsonicResponse & {
  searchResult3: {
    artist: artist[];
    album: album[];
    song: song[];
  };
};

const AlbumQueryTypeToSubsonicType: Record<AlbumQueryType, string> = {
  alphabeticalByArtist: "alphabeticalByArtist",
  alphabeticalByName: "alphabeticalByName",
  byGenre: "byGenre",
  random: "random",
  recentlyPlayed: "recent",
  mostPlayed: "frequent",
  recentlyAdded: "newest",
  favourited: "starred",
  starred: "highest",
};


export const isValidImage = (url: string | undefined) =>
  url != undefined && !url.endsWith(DODGY_IMAGE_NAME);

const artistIsInLibrary = (artistId: string | undefined) =>
  artistId != undefined && artistId != "-1";


const coverArtURN = (coverArt: string | undefined): BUrn | undefined =>
  pipe(
    coverArt,
    O.fromNullable,
    O.map((it: string) => ({ system: "subsonic", resource: `art:${it}` })),
    O.getOrElseW(() => undefined)
  );


  // todo: is this the right place for this??
export const artistImageURN = (
  spec: Partial<{
    artistId: string | undefined;
    artistImageURL: string | undefined;
  }>
): BUrn | undefined => {
  const deets = {
    artistId: undefined,
    artistImageURL: undefined,
    ...spec,
  };
  if (deets.artistImageURL && isValidImage(deets.artistImageURL)) {
    return {
      system: "external",
      resource: deets.artistImageURL,
    };
  } else if (artistIsInLibrary(deets.artistId)) {
    return {
      system: "subsonic",
      resource: `art:${deets.artistId!}`,
    };
  } else {
    return undefined;
  }
};

export const asTrack = (album: Album, song: song): Track => ({
  id: song.id,
  name: song.title,
  mimeType: song.contentType!,
  duration: song.duration || 0,
  number: song.track || 0,
  genre: maybeAsGenre(song.genre),
  coverArt: coverArtURN(song.coverArt),
  album,
  artist: {
    id: song.artistId,
    name: song.artist ? song.artist : "?",
    image: song.artistId
      ? artistImageURN({ artistId: song.artistId })
      : undefined,
  },
  rating: {
    love: song.starred != undefined,
    stars:
      song.userRating && song.userRating <= 5 && song.userRating >= 0
        ? song.userRating
        : 0,
  },
});

const asAlbum = (album: album): Album => ({
  id: album.id,
  name: album.name,
  year: album.year,
  genre: maybeAsGenre(album.genre),
  artistId: album.artistId,
  artistName: album.artist,
  coverArt: coverArtURN(album.coverArt),
});

export const asGenre = (genreName: string) => ({
  id: b64Encode(genreName),
  name: genreName,
});

const maybeAsGenre = (genreName: string | undefined): Genre | undefined =>
  pipe(
    genreName,
    O.fromNullable,
    O.map(asGenre),
    O.getOrElseW(() => undefined)
  );


export class SubsonicGenericMusicLibrary implements SubsonicMusicLibrary {
  subsonic: Subsonic;
  credentials: SubsonicCredentials;

  constructor(subsonic: Subsonic, credentials: SubsonicCredentials) {
    this.subsonic = subsonic;
    this.credentials = credentials;
  }

  flavour = () => "subsonic";

  bearerToken = (_: Credentials): TE.TaskEither<Error, string | undefined> => TE.right(undefined);

  artists = async (
    q: ArtistQuery
  ): Promise<Result<ArtistSummary & Sortable>> =>
    this.getArtists()
      .then(slice2(q))
      .then(([page, total]) => ({
        total,
        results: page.map((it) => ({
          id: it.id,
          name: it.name,
          sortName: it.name,
          image: it.image,
        })),
      }));

  artist = async (id: string): Promise<Artist> =>
    this.getArtistWithInfo(id);

  albums = async (q: AlbumQuery): Promise<Result<AlbumSummary>> =>
    this.getAlbumList2(q);

  album = (id: string): Promise<Album> => this.getAlbum(id);

  genres = () =>
    this.subsonic
      .getJSON<GetGenresResponse>(this.credentials, "/rest/getGenres")
      .then((it) =>
        pipe(
          it.genres.genre || [],
          A.filter((it) => it.albumCount > 0),
          A.map((it) => it.value),
          A.sort(ordString),
          A.map((it) => ({ id: b64Encode(it), name: it }))
        )
      );

  tracks = (albumId: string) =>
    this.subsonic
      .getJSON<GetAlbumResponse>(this.credentials, "/rest/getAlbum", {
        id: albumId,
      })
      .then((it) => it.album)
      .then((album) =>
        (album.song || []).map((song) => asTrack(asAlbum(album), song))
      );

  track = (trackId: string) => this.getTrack(trackId);

  rate = (trackId: string, rating: Rating) =>
    Promise.resolve(true)
      .then(() => {
        if (rating.stars >= 0 && rating.stars <= 5) {
          return this.getTrack(trackId);
        } else {
          throw `Invalid rating.stars value of ${rating.stars}`;
        }
      })
      .then((track) => {
        const thingsToUpdate = [];
        if (track.rating.love != rating.love) {
          thingsToUpdate.push(
            this.subsonic.getJSON(
              this.credentials,
              `/rest/${rating.love ? "star" : "unstar"}`,
              {
                id: trackId,
              }
            )
          );
        }
        if (track.rating.stars != rating.stars) {
          thingsToUpdate.push(
            this.subsonic.getJSON(this.credentials, `/rest/setRating`, {
              id: trackId,
              rating: rating.stars,
            })
          );
        }
        return Promise.all(thingsToUpdate);
      })
      .then(() => true)
      .catch(() => false);

  stream = async ({
    trackId,
    range,
  }: {
    trackId: string;
    range: string | undefined;
  }) =>
    this.getTrack(trackId).then((track) =>
      this.subsonic
        .get(
          this.credentials,
          `/rest/stream`,
          {
            id: trackId,
            c: this.subsonic.streamClientApplication(track),
          },
          {
            headers: pipe(
              range,
              O.fromNullable,
              O.map((range) => ({
                "User-Agent": USER_AGENT,
                Range: range,
              })),
              O.getOrElse(() => ({
                "User-Agent": USER_AGENT,
              }))
            ),
            responseType: "stream",
          }
        )
        .then((res) => ({
          status: res.status,
          headers: {
            "content-type": res.headers["content-type"],
            "content-length": res.headers["content-length"],
            "content-range": res.headers["content-range"],
            "accept-ranges": res.headers["accept-ranges"],
          },
          stream: res.data,
        }))
    );

  coverArt = async (coverArtURN: BUrn, size?: number) =>
    Promise.resolve(coverArtURN)
      .then((it) => assertSystem(it, "subsonic"))
      .then((it) => it.resource.split(":")[1]!)
      .then((it) => this.getCoverArt(this.credentials, it, size))
      .then((res) => ({
        contentType: res.headers["content-type"],
        data: Buffer.from(res.data, "binary"),
      }))
      .catch((e) => {
        logger.error(`Failed getting coverArt for urn:'${coverArtURN}': ${e}`);
        return undefined;
      });

  scrobble = async (id: string) =>
    this.subsonic
      .getJSON(this.credentials, `/rest/scrobble`, {
        id,
        submission: true,
      })
      .then((_) => true)
      .catch(() => false);

  nowPlaying = async (id: string) =>
    this.subsonic
      .getJSON(this.credentials, `/rest/scrobble`, {
        id,
        submission: false,
      })
      .then((_) => true)
      .catch(() => false);

  searchArtists = async (query: string) =>
    this.search3({ query, artistCount: 20 }).then(
      ({ artists }) =>
        artists.map((artist) => ({
          id: artist.id,
          name: artist.name,
          image: artistImageURN({
            artistId: artist.id,
            artistImageURL: artist.artistImageUrl,
          }),
        }))
    );

  searchAlbums = async (query: string) =>
    this.search3({ query, albumCount: 20 }).then(
      ({ albums }) => this.toAlbumSummary(albums)
    );

  searchTracks = async (query: string) =>
    this.search3({ query, songCount: 20 }).then(({ songs }) =>
      Promise.all(songs.map((it) => this.getTrack(it.id)))
    );

  playlists = async () =>
    this.subsonic
      .getJSON<GetPlaylistsResponse>(this.credentials, "/rest/getPlaylists")
      .then((it) => it.playlists.playlist || [])
      .then((playlists) =>
        playlists.map((it) => ({ id: it.id, name: it.name }))
      );

  playlist = async (id: string) =>
    this.subsonic
      .getJSON<GetPlaylistResponse>(this.credentials, "/rest/getPlaylist", {
        id,
      })
      .then((it) => it.playlist)
      .then((playlist) => {
        let trackNumber = 1;
        return {
          id: playlist.id,
          name: playlist.name,
          entries: (playlist.entry || []).map((entry) => ({
            ...asTrack(
              {
                id: entry.albumId!,
                name: entry.album!,
                year: entry.year,
                genre: maybeAsGenre(entry.genre),
                artistName: entry.artist,
                artistId: entry.artistId,
                coverArt: coverArtURN(entry.coverArt),
              },
              entry
            ),
            number: trackNumber++,
          })),
        };
      });

  createPlaylist = async (name: string) =>
    this.subsonic
      .getJSON<GetPlaylistResponse>(this.credentials, "/rest/createPlaylist", {
        name,
      })
      .then((it) => it.playlist)
      .then((it) => ({ id: it.id, name: it.name }));

  deletePlaylist = async (id: string) =>
    this.subsonic
      .getJSON<GetPlaylistResponse>(this.credentials, "/rest/deletePlaylist", {
        id,
      })
      .then((_) => true);

  addToPlaylist = async (playlistId: string, trackId: string) =>
    this.subsonic
      .getJSON<GetPlaylistResponse>(this.credentials, "/rest/updatePlaylist", {
        playlistId,
        songIdToAdd: trackId,
      })
      .then((_) => true);

  removeFromPlaylist = async (playlistId: string, indicies: number[]) =>
    this.subsonic
      .getJSON<GetPlaylistResponse>(this.credentials, "/rest/updatePlaylist", {
        playlistId,
        songIndexToRemove: indicies,
      })
      .then((_) => true);

  similarSongs = async (id: string) =>
    this.subsonic
      .getJSON<GetSimilarSongsResponse>(
        this.credentials,
        "/rest/getSimilarSongs2",
        { id, count: 50 }
      )
      .then((it) => it.similarSongs2.song || [])
      .then((songs) =>
        Promise.all(
          songs.map((song) =>
            this.getAlbum(song.albumId!).then((album) =>
              asTrack(album, song)
            )
          )
        )
      );

  topSongs = async (artistId: string) =>
    this.getArtist(artistId).then(({ name }) =>
      this.subsonic
        .getJSON<GetTopSongsResponse>(this.credentials, "/rest/getTopSongs", {
          artist: name,
          count: 50,
        })
        .then((it) => it.topSongs.song || [])
        .then((songs) =>
          Promise.all(
            songs.map((song) =>
              this.getAlbum(song.albumId!).then((album) =>
                asTrack(album, song)
              )
            )
          )
        )
    );

  private getArtists = (): Promise<(IdName & { albumCount: number; image: BUrn | undefined })[]> =>
    this.subsonic
      .getJSON<GetArtistsResponse>(this.credentials, "/rest/getArtists")
      .then((it) => (it.artists.index || []).flatMap((it) => it.artist || []))
      .then((artists) =>
        artists.map((artist) => ({
          id: `${artist.id}`,
          name: artist.name,
          albumCount: artist.albumCount,
          image: artistImageURN({
            artistId: artist.id,
            artistImageURL: artist.artistImageUrl,
          }),
        }))
      );

  private getArtistInfo = (
    id: string
  ): Promise<{
    similarArtist: (ArtistSummary & { inLibrary: boolean })[];
    images: {
      s: string | undefined;
      m: string | undefined;
      l: string | undefined;
    };
  }> =>
    this.subsonic
      .getJSON<GetArtistInfoResponse>(this.credentials, "/rest/getArtistInfo2", {
        id,
        count: 50,
        includeNotPresent: true,
      })
      .then((it) => it.artistInfo2)
      .then((it) => ({
        images: {
          s: it.smallImageUrl,
          m: it.mediumImageUrl,
          l: it.largeImageUrl,
        },
        similarArtist: (it.similarArtist || []).map((artist) => ({
          id: `${artist.id}`,
          name: artist.name,
          inLibrary: artistIsInLibrary(artist.id),
          image: artistImageURN({
            artistId: artist.id,
            artistImageURL: artist.artistImageUrl,
          }),
        })),
      }));

  private getAlbum = (id: string): Promise<Album> =>
    this.subsonic
      .getJSON<GetAlbumResponse>(this.credentials, "/rest/getAlbum", { id })
      .then((it) => it.album)
      .then((album) => ({
        id: album.id,
        name: album.name,
        year: album.year,
        genre: maybeAsGenre(album.genre),
        artistId: album.artistId,
        artistName: album.artist,
        coverArt: coverArtURN(album.coverArt),
      }));

  private getArtist = (
    id: string
  ): Promise<
    IdName & { artistImageUrl: string | undefined; albums: AlbumSummary[] }
  > =>
    this.subsonic
      .getJSON<GetArtistResponse>(this.credentials, "/rest/getArtist", {
        id,
      })
      .then((it) => it.artist)
      .then((it) => ({
        id: it.id,
        name: it.name,
        artistImageUrl: it.artistImageUrl,
        albums: this.toAlbumSummary(it.album || []),
      }));

  private getArtistWithInfo = (id: string) =>
    Promise.all([
      this.getArtist(id),
      this.getArtistInfo(id),
    ]).then(([artist, artistInfo]) => ({
      id: artist.id,
      name: artist.name,
      image: artistImageURN({
        artistId: artist.id,
        artistImageURL: [
          artist.artistImageUrl,
          artistInfo.images.l,
          artistInfo.images.m,
          artistInfo.images.s,
        ].find(isValidImage),
      }),
      albums: artist.albums,
      similarArtists: artistInfo.similarArtist,
    }));

  private getCoverArt = (credentials: Credentials, id: string, size?: number) =>
    this.subsonic.get(
      credentials,
      "/rest/getCoverArt",
      size ? { id, size } : { id },
      {
        headers: { "User-Agent": "bonob" },
        responseType: "arraybuffer",
      }
    );

  private getTrack = (id: string) =>
    this.subsonic
      .getJSON<GetSongResponse>(this.credentials, "/rest/getSong", {
        id,
      })
      .then((it) => it.song)
      .then((song) =>
        this.getAlbum(song.albumId!).then((album) =>
          asTrack(album, song)
        )
      );

  private toAlbumSummary = (albumList: album[]): AlbumSummary[] =>
    albumList.map((album) => ({
      id: album.id,
      name: album.name,
      year: album.year,
      genre: maybeAsGenre(album.genre),
      artistId: album.artistId,
      artistName: album.artist,
      coverArt: coverArtURN(album.coverArt),
    }));

  private search3 = (q: any) =>
    this.subsonic
      .getJSON<Search3Response>(this.credentials, "/rest/search3", {
        artistCount: 0,
        albumCount: 0,
        songCount: 0,
        ...q,
      })
      .then((it) => ({
        artists: it.searchResult3.artist || [],
        albums: it.searchResult3.album || [],
        songs: it.searchResult3.song || [],
      }));

  private getAlbumList2 = (q: AlbumQuery) =>
    Promise.all([
      this.getArtists().then((it) =>
        inject(it, (total, artist) => total + artist.albumCount, 0)
      ),
      this.subsonic
        .getJSON<GetAlbumListResponse>(this.credentials, "/rest/getAlbumList2", {
          type: AlbumQueryTypeToSubsonicType[q.type],
          ...(q.genre ? { genre: b64Decode(q.genre) } : {}),
          size: 500,
          offset: q._index,
        })
        .then((response) => response.albumList2.album || [])
        .then(this.toAlbumSummary),
    ]).then(([total, albums]) => ({
      results: albums.slice(0, q._count),
      total: albums.length == 500 ? total : (q._index || 0) + albums.length,
    }));
};

export class NaivdromeMusicLibrary extends SubsonicGenericMusicLibrary {

  constructor(subsonic: Subsonic, credentials: SubsonicCredentials) {
    super(subsonic, credentials);
  }

  flavour = () => "navidrome";

  bearerToken = (credentials: Credentials): TE.TaskEither<Error, string | undefined> =>
    pipe(
      TE.tryCatch(
        () =>
          axios.post(
            `${this.subsonic.url}/auth/login`,
            _.pick(credentials, "username", "password")
          ),
        () => new AuthFailure("Failed to get bearerToken")
      ),
      TE.map((it) => it.data.token as string | undefined)
    );

  artists = async (
    q: ArtistQuery
  ): Promise<Result<ArtistSummary & Sortable>> => {
    let params: any = {
      _sort: "name",
      _order: "ASC",
      _start: q._index || "0",
    };
    if (q._count) {
      params = {
        ...params,
        _end: (q._index || 0) + q._count,
      };
    }

    const x: Promise<Result<ArtistSummary & Sortable>> =  axios
      .get(`${this.subsonic.url}/api/artist`, {
        params: asURLSearchParams(params),
        headers: {
          "User-Agent": USER_AGENT,
          "x-nd-authorization": `Bearer ${this.credentials.bearer}`,
        },
      })
      .catch((e) => {
        throw `Navidrome failed with: ${e}`;
      })
      .then((response) => {
        if (response.status != 200 && response.status != 206) {
          throw `Navidrome failed with a ${
            response.status || "no!"
          } status`;
        } else return response;
      })
      .then((it) => ({
        results: (it.data as NDArtist[]).map(artistSummaryFromNDArtist),
        total: Number.parseInt(it.headers["x-total-count"] || "0"),
      }));

      return x;
    }
}