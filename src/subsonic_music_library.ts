import { taskEither as TE } from "fp-ts";
import { pipe } from "fp-ts/lib/function";
import {
  Credentials,
  MusicService,
  ArtistSummary,
  Result,
  slice2,
  AlbumQuery,
  ArtistQuery,
  MusicLibrary,
  Album,
  AlbumSummary,
  Rating,
  Artist,
  AuthFailure,
  AuthSuccess,
  albumToAlbumSummary,
} from "./music_library";
import {
  Subsonic,
  CustomPlayers,
  asTrack,
  PingResponse,
  NO_CUSTOM_PLAYERS,
  asToken,
  parseToken,
  artistImageURN,
  GetPlaylistsResponse,
  GetPlaylistResponse,
  asPlayListSummary,
  coverArtURN,
  maybeAsGenre,
  GetSimilarSongsResponse,
  GetTopSongsResponse,
  GetInternetRadioStationsResponse,
  asYear,
  isValidImage
} from "./subsonic";
import _ from "underscore";

import axios from "axios";
import logger from "./logger";
import { assertSystem, BUrn } from "./burn";

export class SubsonicMusicService implements MusicService {
  subsonic: Subsonic;
  customPlayers: CustomPlayers;

  constructor(
    subsonic: Subsonic,
    customPlayers: CustomPlayers = NO_CUSTOM_PLAYERS
  ) {
    this.subsonic = subsonic;
    this.customPlayers = customPlayers;
  }

  generateToken = (
    credentials: Credentials
  ): TE.TaskEither<AuthFailure, AuthSuccess> => {
    const x: TE.TaskEither<AuthFailure, PingResponse> = TE.tryCatch(
      () =>
        this.subsonic.getJSON<PingResponse>(
          _.pick(credentials, "username", "password"),
          "/rest/ping.view"
        ),
      (e) => new AuthFailure(e as string)
    );
    return pipe(
      x,
      TE.flatMap(({ type }) =>
        pipe(
          TE.tryCatch(
            () => this.libraryFor({ ...credentials, type }),
            () => new AuthFailure("Failed to get library")
          ),
          TE.map((library) => ({ type, library }))
        )
      ),
      TE.flatMap(({ library, type }) =>
        pipe(
          library.bearerToken(credentials),
          TE.map((bearer) => ({ bearer, type }))
        )
      ),
      TE.map(({ bearer, type }) => ({
        serviceToken: asToken({ ...credentials, bearer, type }),
        userId: credentials.username,
        nickname: credentials.username,
      }))
    );
  };

  refreshToken = (serviceToken: string) =>
    this.generateToken(parseToken(serviceToken));

  login = async (token: string) => this.libraryFor(parseToken(token));

  private libraryFor = (
    credentials: Credentials & { type: string }
  ): Promise<SubsonicMusicLibrary> => {
    const genericSubsonic = new SubsonicMusicLibrary(
      this.subsonic,
      credentials,
      this.customPlayers
    );
    // return Promise.resolve(genericSubsonic);

    if (credentials.type == "navidrome") {
      // todo: there does not seem to be a test for this??
      const nd: SubsonicMusicLibrary = {
        ...genericSubsonic,
        flavour: () => "navidrome",
        bearerToken: (credentials: Credentials) =>
          pipe(
            TE.tryCatch(
              () =>
                axios.post(
                  this.subsonic.url.append({ pathname: "/auth/login" }).href(),
                  _.pick(credentials, "username", "password")
                ),
              () => new AuthFailure("Failed to get bearerToken")
            ),
            TE.map((it) => it.data.token as string | undefined)
          ),
      };
      return Promise.resolve(nd);
    } else {
      return Promise.resolve(genericSubsonic);
    }
  };
}

export class SubsonicMusicLibrary implements MusicLibrary {
  subsonic: Subsonic;
  credentials: Credentials;
  customPlayers: CustomPlayers;

  constructor(
    subsonic: Subsonic,
    credentials: Credentials,
    customPlayers: CustomPlayers
  ) {
    this.subsonic = subsonic;
    this.credentials = credentials;
    this.customPlayers = customPlayers;
  }

  flavour = () => "subsonic";

  bearerToken = (_: Credentials) =>
    TE.right<AuthFailure, string | undefined>(undefined);

  artists = (q: ArtistQuery): Promise<Result<ArtistSummary>> =>
    this.subsonic
      .getArtists(this.credentials)
      .then(slice2(q))
      .then(([page, total]) => ({
        total,
        results: page.map((it) => ({
          id: it.id,
          name: it.name,
          image: it.image,
        })),
      }));

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
          artistInfo.images.l,
          artistInfo.images.m,
          artistInfo.images.s,
          // todo: do we still need this isValidImage?
        ].find(isValidImage),
      }),
      albums: artist.albums,
      similarArtists: artistInfo.similarArtist,
    }));

  albums = async (q: AlbumQuery): Promise<Result<AlbumSummary>> =>
    this.subsonic.getAlbumList2(this.credentials, q);

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
  }) =>
    this.subsonic
      .getTrack(this.credentials, trackId)
      .then((track) =>
        this.subsonic.stream(this.credentials, trackId, track.encoding.player, range)
      );

  coverArt = async (coverArtURN: BUrn, size?: number) =>
    Promise.resolve(coverArtURN)
      .then((it) => assertSystem(it, "subsonic"))
      .then((it) =>
        this.subsonic.getCoverArt(
          this.credentials,
          it.resource.split(":")[1]!,
          size
        )
      )
      .then((res) => ({
        contentType: res.headers["content-type"],
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
    this.subsonic
      .getJSON<GetPlaylistsResponse>(this.credentials, "/rest/getPlaylists")
      .then(({ playlists }) =>
        (playlists.playlist || []).map(asPlayListSummary)
      );

  playlist = async (id: string) =>
    this.subsonic
      .getJSON<GetPlaylistResponse>(this.credentials, "/rest/getPlaylist", {
        id,
      })
      .then(({ playlist }) => {
        let trackNumber = 1;
        return {
          id: playlist.id,
          name: playlist.name,
          coverArt: coverArtURN(playlist.coverArt),
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
              entry,
              this.customPlayers
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
      .then(({ playlist }) => ({
        id: playlist.id,
        name: playlist.name,
        coverArt: coverArtURN(playlist.coverArt),
      }));

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
            this.subsonic
              .getAlbum(this.credentials, song.albumId!)
              .then((album) => asTrack(albumToAlbumSummary(album), song, this.customPlayers))
          )
        )
      );

  topSongs = async (artistId: string) =>
    this.subsonic.getArtist(this.credentials, artistId).then(({ name }) =>
      this.subsonic
        .getJSON<GetTopSongsResponse>(this.credentials, "/rest/getTopSongs", {
          artist: name,
          count: 50,
        })
        .then((it) => it.topSongs.song || [])
        .then((songs) =>
          Promise.all(
            songs.map((song) =>
              this.subsonic
                .getAlbum(this.credentials, song.albumId!)
                .then((album) => asTrack(albumToAlbumSummary(album), song, this.customPlayers))
            )
          )
        )
    );

  radioStations = async () =>
    this.subsonic
      .getJSON<GetInternetRadioStationsResponse>(
        this.credentials,
        "/rest/getInternetRadioStations"
      )
      .then((it) => it.internetRadioStations.internetRadioStation || [])
      .then((stations) =>
        stations.map((it) => ({
          id: it.id,
          name: it.name,
          url: it.streamUrl,
          homePage: it.homePageUrl,
        }))
      );

  radioStation = async (id: string) =>
    this.radioStations().then((it) => it.find((station) => station.id === id)!);

  years = async () => {
    const q: AlbumQuery = {
      _index: 0,
      _count: 100000, // FIXME: better than this, probably doesnt work anyway as max _count is 500 or something
      type: "alphabeticalByArtist",
    };
    const years = this.subsonic
      .getAlbumList2(this.credentials, q)
      .then(({ results }) =>
        results
          .map((album) => album.year || "?")
          .filter((item, i, ar) => ar.indexOf(item) === i)
          .sort()
          .map((year) => ({
            ...asYear(year),
          }))
          .reverse()
      );
    return years;
  };
}
