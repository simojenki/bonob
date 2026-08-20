import { taskEither as TE } from "fp-ts";
import { pipe } from "fp-ts/lib/function";
import {
  Credentials,
  MusicService,
  ArtistSummary,
  Sortable,
  Result,
  AlbumQuery,
  ArtistQuery,
  MusicLibrary,
  Album,
  AlbumSummary,
  Rating,
  Artist,
  AuthFailure,
  AuthSuccess,
  Paging,
  slice2Result,
  ALBUM_SORT_OPTION,
  ALBUM_COLLECTION_OPTION,
  AlbumQueryType,
} from "./music_library";
import {
  Subsonic,
  CustomPlayers,
  NO_CUSTOM_PLAYERS,
  asToken,
  parseToken,
  artistImageURN,
  asYear,
  isValidImage,
  SONOS_CLIENT_INFO,
} from "./subsonic";
import _ from "underscore";

import logger from "./logger";
import { assertSource, Art } from "./art";

export class SubsonicMusicService implements MusicService {
  subsonic: Subsonic;
  customPlayers: CustomPlayers;
  useTranscode: boolean;

  constructor(
    subsonic: Subsonic,
    customPlayers: CustomPlayers = NO_CUSTOM_PLAYERS,
    useTranscode: boolean = true
  ) {
    this.subsonic = subsonic;
    this.customPlayers = customPlayers;
    this.useTranscode = useTranscode;
  }

  generateToken = (
    credentials: Credentials
  ): TE.TaskEither<AuthFailure, AuthSuccess> => 
    pipe(
      this.subsonic.ping(credentials),
      TE.map(() => ({
        serviceToken: asToken(credentials),
        userId: credentials.username,
        nickname: credentials.username,
      }))
    );

  refreshToken = (serviceToken: string) =>
    this.generateToken(parseToken(serviceToken));

  login = async (token: string) => this.libraryFor(parseToken(token));

  private libraryFor = (
    credentials: Credentials
  ): Promise<SubsonicMusicLibrary> => {
    return Promise.resolve(new SubsonicMusicLibrary(
      this.subsonic,
      credentials,
      this.customPlayers,
      this.useTranscode
    ));
  };
}

export const slurpAllPages = async <R>(
  page: (paging: Paging) => Promise<R[]>
): Promise<R[]> => {
  const results: R[] = [];
  let pageIndex = 0;
  let done = false;

  while (!done) {
    const items = await page({
      _index: pageIndex,
      _count: 500,
    });
    results.push(...items);
    done = items.length < 500;
    pageIndex += 500;
  }

  return results;
};

export const withTotalAndPage = async <T>(
  total: () => Promise<number>,
  page: () => Promise<{ results: T[]; index: number }>
): Promise<Result<T>> => {
  const [estimatedTotal, paged] = await Promise.all([
    total(), 
    page()
  ]);

  return {
    results: paged.results,
    total: Math.max(estimatedTotal, paged.index + paged.results.length),
  };
};

export class SubsonicMusicLibrary implements MusicLibrary {
  subsonic: Subsonic;
  credentials: Credentials;
  customPlayers: CustomPlayers;
  useTranscode: boolean;

  constructor(
    subsonic: Subsonic,
    credentials: Credentials,
    customPlayers: CustomPlayers,
    useTranscode: boolean = true
  ) {
    this.subsonic = subsonic;
    this.credentials = credentials;
    this.customPlayers = customPlayers;
    this.useTranscode = useTranscode;
  }

  artists = (q: ArtistQuery): Promise<Result<ArtistSummary & Sortable>> =>
    this.subsonic
      .getArtists(this.credentials)
      .then(slice2Result(q));

  artist = async (id: string): Promise<Artist> =>
    Promise.all([
      this.subsonic.getArtist(this.credentials, id),
      this.subsonic.getArtistInfo(this.credentials, id),
    ]).then(([artist, artistInfo]) => ({
      id: artist.id,
      name: artist.name,
      image: artistImageURN({
        artistId: artist.id,
        artistImageURL: [
          artist.artistImageUrl,
          // todo: subsonic.artistInfo should just return a valid image or undefined, then the music lib just chooses first undefined
          // out of artist.image and artistInfo.image
          artistInfo.images.l,
          artistInfo.images.m,
          artistInfo.images.s,
          // todo: do we still need this isValidImage?
        ].find(isValidImage),
      }),
      albums: artist.albums,
      similarArtists: artistInfo.similarArtist,
    }));

  private albumsTotalFromArtists = () =>
    this.subsonic
      .getArtists(this.credentials)
      .then((artists) =>
        _.inject(artists, (total, artist) => total + artist.albumCount, 0)
      );

  private readAllInParallel = async (
    type: AlbumQueryType
  ): Promise<Result<AlbumSummary>> => {
    const estimatedTotal = await this.albumsTotalFromArtists();

    if (estimatedTotal === 0) {
      return { results: [], total: 0 };
    }

    const pageCount = Math.ceil(estimatedTotal / 500);
    const pagesToFetch = estimatedTotal % 500 === 0 ? pageCount + 1 : pageCount;

    const pages = await Promise.all(
      Array.from({ length: pagesToFetch }, (_, i) =>
        this.subsonic.getAlbumList2(this.credentials, {
          type,
          _index: i * 500,
          _count: 500,
        })
      )
    );

    const albums = pages.flat() as AlbumSummary[];
    return { 
      results: albums, 
      total: albums.length 
    };
  };

  private querySubsonicUseTotalFromArtists = (
    q: AlbumQuery
  ): Promise<Result<AlbumSummary>> =>
    withTotalAndPage(
      () => this.albumsTotalFromArtists(),
      () =>
        this.subsonic
          .getAlbumList2(this.credentials, q)
          .then((albums) => ({ results: albums, index: q._index ?? 0 }))
    );

  private querySubsonicWithTotalFromSlurpingAll = (
    q: AlbumQuery
  ): Promise<Result<AlbumSummary>> =>
    withTotalAndPage(
      () =>
        slurpAllPages((paging) =>
          this.subsonic.getAlbumList2(this.credentials, {
            type: q.type,
            ...paging,
          })
        ).then((albums) => albums.length),
      () =>
        this.subsonic
          .getAlbumList2(this.credentials, q)
          .then((albums) => ({ results: albums, index: q._index ?? 0 }))
    );

  private albumsReadAllAndSlice = (
    q: AlbumQuery
  ): Promise<Result<AlbumSummary>> =>
    slurpAllPages((paging) =>
      this.subsonic.getAlbumList2(this.credentials, { ...q, ...paging })
    ).then(slice2Result<AlbumSummary>(q));

  private slurpAllUseResultsLengthAsTotal = (
    q: AlbumQuery
  ): Promise<Result<AlbumSummary>> =>
    slurpAllPages((paging) =>
      this.subsonic.getAlbumList2(this.credentials, { ...q, ...paging })
    ).then((items) => ({ results: items, total: items.length }));

  albums = (q: AlbumQuery): Promise<Result<AlbumSummary>> => {
    const isSortedAlbumQuery = ALBUM_SORT_OPTION.has(q.type);
    const isCollection = ALBUM_COLLECTION_OPTION.has(q.type);
    const isFiltered = q.genre || q.fromYear || q.toYear;
    const isForAPage = q._index !== undefined || q._count !== undefined;

    if (isCollection && isFiltered) {
      return this.querySubsonicWithTotalFromSlurpingAll(q);
    } else if (isCollection && isForAPage) {
      return this.albumsReadAllAndSlice(q);
    } else if (isCollection) {
      return this.slurpAllUseResultsLengthAsTotal(q);
    } else if (q.type === "random") {
      return this.querySubsonicUseTotalFromArtists(q);
    } else if (!isFiltered && !isForAPage) {
      return this.readAllInParallel(q.type);
    } else if (isSortedAlbumQuery && !isFiltered) {
      return this.querySubsonicUseTotalFromArtists(q);
    } else {
      return this.albumsReadAllAndSlice(q);
    }
  };

  album = (id: string): Promise<Album> =>
    this.subsonic.getAlbum(this.credentials, id);

  genres = () => 
    this.subsonic.getGenres(this.credentials);

  track = (trackId: string) =>
    this.subsonic.getTrack(this.credentials, trackId);

  rate = (trackId: string, rating: Rating) => 
    // todo: this is a bit odd
    Promise.resolve(true)
      .then(() => {
        if (rating.stars >= 0 && rating.stars <= 5) {
          return this.subsonic.getTrack(this.credentials, trackId);
        } else {
          throw `Invalid rating.stars value of ${rating.stars}`;
        }
      })
      .then((track) => {
        const thingsToUpdate = [];
        if (track.rating.love != rating.love) {
          thingsToUpdate.push(
            (rating.love ? this.subsonic.star : this.subsonic.unstar)(this.credentials,{ id: trackId })
          );
        }
        if (track.rating.stars != rating.stars) {
          thingsToUpdate.push(
            this.subsonic.setRating(this.credentials, trackId, rating.stars)
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
  }) => {
    if (this.useTranscode) {
      const extensions = await this.subsonic.getOpenSubsonicExtensions(this.credentials);
      const hasTranscoding = extensions.some((ext) => ext.name === "transcoding");

      if (hasTranscoding) {
        const decision = await this.subsonic.getTranscodeDecision(
          this.credentials,
          trackId,
          SONOS_CLIENT_INFO
        );
        logger.debug(`Transcoding decision is: ${JSON.stringify(decision)}`)
        if (decision && !decision.canDirectPlay && decision.canTranscode && decision.transcodeParams) {
          return this.subsonic.getTranscodeStream(
            this.credentials,
            trackId,
            decision.transcodeParams,
            range
          );
        }
      }
    }

    const track = await this.subsonic.getTrack(this.credentials, trackId);
    return this.subsonic.stream(this.credentials, trackId, track.encoding.player, range);
  };

  coverArt = async (coverArtURN: Art, size?: number) =>
    Promise.resolve(coverArtURN)
      .then((it) => assertSource(it, "subsonic"))
      .then((it) =>
        this.subsonic.getCoverArt(
          this.credentials,
          it.id,
          size
        )
      )
      .then((res) => ({
        contentType: String(res.headers["content-type"] ?? ""),
        data: Buffer.from(res.data, "binary"),
      }))
      .catch((e) => {
        logger.error(`Failed getting coverArt for urn:'${coverArtURN}': ${e}`);
        return undefined;
      });

  // todo: unit test the difference between scrobble and nowPlaying
  scrobble = async (id: string) =>
    this.subsonic.scrobble(this.credentials, id, true);

  nowPlaying = async (id: string) =>
    this.subsonic.scrobble(this.credentials, id, false);

  searchArtists = async (query: string) =>
    this.subsonic
      .search3(this.credentials, { query, artistCount: 20 })
      .then(({ artists }) =>
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
    this.subsonic
      .search3(this.credentials, { query, albumCount: 20 })
      .then(({ albums }) => this.subsonic.toAlbumSummary(albums));

  searchTracks = async (query: string) =>
    this.subsonic
      .search3(this.credentials, { query, songCount: 20 })
      .then(({ songs }) =>
        Promise.all(
          songs.map((it) => this.subsonic.getTrack(this.credentials, it.id))
        )
      );

  playlists = async () =>
    this.subsonic.playlists(this.credentials);

  playlist = async (id: string) =>
    this.subsonic.playlist(this.credentials, id);

  createPlaylist = async (name: string) =>
    this.subsonic.createPlayList(this.credentials, name);

  deletePlaylist = async (id: string) =>
    this.subsonic.deletePlayList(this.credentials, id);

  addToPlaylist = async (playlistId: string, trackId: string) =>
    this.subsonic.updatePlaylist(this.credentials, playlistId, { songIdToAdd: trackId });

  removeFromPlaylist = async (playlistId: string, indicies: number[]) =>
    this.subsonic.updatePlaylist(this.credentials, playlistId, { songIndexToRemove: indicies });

  similarSongs = async (id: string) => 
    this.subsonic.getSimilarSongs2(this.credentials, id)

  topSongs = async (artistId: string) =>
    this.subsonic.getArtist(this.credentials, artistId)
      .then(({ name }) =>
        this.subsonic.getTopSongs(this.credentials, name)
      );

  radioStations = async () =>
    this.subsonic.getInternetRadioStations(this.credentials);

  radioStation = async (id: string) =>
    this.radioStations().then((it) => it.find((station) => station.id === id)!);

  years = async () => this.albums({
    _index: 0,
    _count: undefined,
    type: "alphabeticalByArtist",
  }).then(({ results }) =>
    results
    // todo: need to filter out albums without years and cannot get them back from subsonic anyway
      .map((album) => album.year || "?")
      .filter((item, i, ar) => ar.indexOf(item) === i)
      .sort()
      .map((year) => ({
        ...asYear(year),
      }))
      .reverse()
  );
}
