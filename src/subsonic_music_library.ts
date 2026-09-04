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
  AlbumList2Query,
  AlbumQueryTypeToSubsonicType,
  GetArtists,
  hasSortName,
  asAlbumSummary,
  asTrack,
  asTrackSummary,
  OpenSubsonicSong,
  coverArtToArt,
  maybeAsGenre,
} from "./subsonic";

const starredSongIds = (starred: { song: { id: string }[] }) =>
  new Set(starred.song.map((it) => it.id));

const asAlbumSummaryFromSong = (song: OpenSubsonicSong): AlbumSummary => ({
  id: song.albumId!,
  name: song.album!,
  year: song.year,
  genre: maybeAsGenre(song.genre),
  artistName: song.artist,
  artistId: song.artistId,
  coverArt: coverArtToArt(song.coverArt),
});

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
  readPage: (page: Paging) => Promise<R[]>
): Promise<R[]> => {
  const results: R[] = [];
  let pageIndex = 0;
  let done = false;

  while (!done) {
    const items = await readPage({
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

const ignoredArticlesSet = (ignoredArticles: string) =>
  new Set(
    ignoredArticles.toLowerCase().split(" ").filter(Boolean)
  );

export const asArtistSummaryWithSort = (
  artists: GetArtists
): (ArtistSummary & Sortable & { albumCount: number })[] => {
  const ignoredArticles = ignoredArticlesSet(artists.ignoredArticles || "");
  const allArtists = (artists.index || [])
    .flatMap((index) => index.artist || []);

  return allArtists
    .map((artist) => {
      const _sortBy = hasSortName(artist)
        ? artist.sortName
        : artist.name
            .split(" ")
            .filter((word) => !ignoredArticles.has(word.toLowerCase()))
            .join(" ")
            .toLowerCase();

      return {
        id: `${artist.id}`,
        name: artist.name,
        _sortBy,
        albumCount: artist.albumCount,
        image: artistImageURN({
          artistId: artist.id,
          artistImageURL: artist.artistImageUrl,
        }),
      };
    })
    .sort((a, b) => a._sortBy.localeCompare(b._sortBy));
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
      .then(asArtistSummaryWithSort)
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
        (artists.index || [])
          .flatMap((index) => index.artist || [])
          .reduce((total, artist) => total + artist.albumCount, 0)
      );

  private getAllAlbumsAndSlice = async (
    q: AlbumQuery
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
          type: q.type,
          offset: i * 500,
          size: 500,
        })
      )
    );

    const albums = pages.flat() as AlbumSummary[];
    return slice2Result<AlbumSummary>(q)(albums);
  };

  private albumQueryToAlbumList2Query = (q: AlbumQuery): AlbumList2Query => ({
      type: AlbumQueryTypeToSubsonicType[q.type],
      offset: q._index ?? 0,
      size: q._count ?? 500,
      genre: q.genre,
      fromYear: q.fromYear,
      toYear: q.toYear
    })

  private querySubsonicUseTotalFromArtists = (
    q: AlbumQuery
  ): Promise<Result<AlbumSummary>> =>
    withTotalAndPage(
      () => this.albumsTotalFromArtists(),
      () =>
        this.subsonic
          .getAlbumList2(this.credentials, this.albumQueryToAlbumList2Query(q))
          .then((albums) => ({ results: albums, index: q._index ?? 0 }))
    );

  private getAllAlbumsThatMatchQueryAndSlice = (
    q: AlbumQuery
  ): Promise<Result<AlbumSummary>> =>
    slurpAllPages((page) =>
      this.subsonic.getAlbumList2(this.credentials, {
        ...this.albumQueryToAlbumList2Query(q),
        offset: page._index,
        size: page._count,
      })
    ).then(slice2Result<AlbumSummary>(q));

  albums = (q: AlbumQuery): Promise<Result<AlbumSummary>> => {
    switch (q.type) {
      case "random":
        return this.querySubsonicUseTotalFromArtists(q);

      case "recentlyAdded":
      case "mostPlayed":
      case "recentlyPlayed":
      case "favourited":
      case "starred":
      case "byGenre":
      case "byYear":
        return this.getAllAlbumsThatMatchQueryAndSlice(q);

      default:
        return q._count !== undefined && q._count <= 500
          ? this.querySubsonicUseTotalFromArtists(q)
          : this.getAllAlbumsAndSlice(q);
    }
  };

  album = (id: string): Promise<Album> =>
    Promise.all([
      this.subsonic.getAlbum(this.credentials, id),
      this.subsonic.getStarred(this.credentials),
    ]).then(([album, starred]) => {
      const ids = starredSongIds(starred);
      const albumSummary = asAlbumSummary(album);
      return {
        ...albumSummary,
        tracks: (album.song || []).map((song) =>
          asTrack(albumSummary, song, this.customPlayers, ids)
        ),
      };
    });

  genres = () => 
    this.subsonic.getGenres(this.credentials);

  track = (trackId: string) =>
    Promise.all([
      this.subsonic.getTrack(this.credentials, trackId),
      this.subsonic.getStarred(this.credentials),
    ]).then(([song, starred]) =>
      this.subsonic
        .getAlbum(this.credentials, song.albumId!)
        .then((album) =>
          asTrack(
            asAlbumSummary(album),
            song,
            this.customPlayers,
            starredSongIds(starred)
          )
        )
    );

  rate = (trackId: string, rating: Rating) =>
    Promise.resolve(true)
      .then(() => {
        if (rating.stars >= 0 && rating.stars <= 5) {
          return Promise.all([
            this.subsonic.getTrack(this.credentials, trackId),
            this.subsonic.getStarred(this.credentials),
          ]);
        } else {
          throw `Invalid rating.stars value of ${rating.stars}`;
        }
      })
      .then(([song, starred]) => {
        const ids = starredSongIds(starred);
        const currentLove = ids.has(trackId);
        const currentStars =
          song.userRating && song.userRating <= 5 && song.userRating >= 0
            ? song.userRating
            : 0;

        const thingsToUpdate = [];
        if (currentLove != rating.love) {
          thingsToUpdate.push(
            (rating.love ? this.subsonic.star : this.subsonic.unstar)(
              this.credentials,
              { id: trackId }
            )
          );
        }
        if (currentStars != rating.stars) {
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

    const song = await this.subsonic.getTrack(this.credentials, trackId);
    const encoding = asTrackSummary(song, this.customPlayers, new Set()).encoding;
    return this.subsonic.stream(this.credentials, trackId, encoding.player, range);
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
    Promise.all([
      this.subsonic.search3(this.credentials, { query, songCount: 20 }),
      this.subsonic.getStarred(this.credentials),
    ]).then(([{ songs }, starred]) => {
      const ids = starredSongIds(starred);
      return Promise.all(
        songs.map((song) =>
          this.subsonic
            .getAlbum(this.credentials, song.albumId!)
            .then((album) =>
              asTrack(asAlbumSummary(album), song, this.customPlayers, ids)
            )
        )
      );
    });

  playlists = async () =>
    this.subsonic.playlists(this.credentials);

  // todo: I dont think ratings are needed to render this in smapi, so maybe there should be Track and Track & Rating types.
  playlist = async (id: string) =>
    Promise.all([
      this.subsonic.playlist(this.credentials, id),
      this.subsonic.getStarred(this.credentials),
    ]).then(([playlist, starred]) => {
      const ids = starredSongIds(starred);
      let trackNumber = 1;
      return {
        id: playlist.id,
        name: playlist.name,
        coverArt: coverArtToArt(playlist.coverArt),
        entries: (playlist.entry || []).map((entry) => ({
          // todo: extracting an album summary from a song is a bit dubious
          ...asTrack(asAlbumSummaryFromSong(entry), entry, this.customPlayers, ids),
          number: trackNumber++,
        })),
      };
    });

  createPlaylist = async (name: string) =>
    this.subsonic.createPlayList(this.credentials, name);

  deletePlaylist = async (id: string) =>
    this.subsonic.deletePlayList(this.credentials, id);

  addToPlaylist = async (playlistId: string, trackId: string) =>
    this.subsonic.updatePlaylist(this.credentials, playlistId, { songIdToAdd: trackId });

  removeFromPlaylist = async (playlistId: string, indicies: number[]) =>
    this.subsonic.updatePlaylist(this.credentials, playlistId, { songIndexToRemove: indicies });

  similarSongs = async (id: string) =>
    Promise.all([
      //todo: do we really need to know whether a similar song is starred or not?
      this.subsonic.getSimilarSongs2(this.credentials, id),
      this.subsonic.getStarred(this.credentials),
    ]).then(([songs, starred]) =>
      songs.map((song) =>
        asTrackSummary(song, this.customPlayers, starredSongIds(starred))
      )
    );

  topSongs = async (artistId: string) =>
    this.subsonic
      .getArtist(this.credentials, artistId)
      .then(({ name }) =>
        Promise.all([
          // todo: do we really need to know whether 'topSongs' are starred?
          this.subsonic.getTopSongs(this.credentials, name),
          this.subsonic.getStarred(this.credentials),
        ])
      )
      .then(([songs, starred]) =>
        songs.map((song) =>
          asTrackSummary(song, this.customPlayers, starredSongIds(starred))
        )
      );

  radioStations = async () =>
    this.subsonic.getInternetRadioStations(this.credentials);

  radioStation = async (id: string) =>
    this.radioStations().then((it) => it.find((station) => station.id === id)!);

  years = async () => this.albums({
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
