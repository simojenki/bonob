import { option as O } from "fp-ts";
import { pipe } from "fp-ts/lib/function";
import { Album, Artist, AlbumSummary, Track, PlaylistSummary, Playlist, SimilarArtist, RadioStation } from "../src/music_service";
import { BUrn } from "../src/burn";
import { PingResponse, images } from "../src/subsonic";

export const ok = (data: string | object) => ({
  status: 200,
  data,
});

export const asSimilarArtistJson = (similarArtist: SimilarArtist) => {
  if (similarArtist.inLibrary)
    return {
      id: similarArtist.id,
      name: similarArtist.name,
      albumCount: 3,
    };
  else
    return {
      id: -1,
      name: similarArtist.name,
      albumCount: 3,
    };
};

export const getArtistInfoJson = (
  artist: Artist,
  images: images = {
    smallImageUrl: undefined,
    mediumImageUrl: undefined,
    largeImageUrl: undefined,
  }
) =>
  subsonicOK({
    artistInfo2: {
      ...images,
      similarArtist: artist.similarArtists.map(asSimilarArtistJson),
    },
  });

export const maybeIdFromCoverArtUrn = (coverArt: BUrn | undefined) => pipe(
  coverArt,
  O.fromNullable,
  O.map(it => it.resource.split(":")[1]),
  O.getOrElseW(() => "")
)

export const asAlbumJson = (
  artist: { id: string | undefined; name: string | undefined },
  album: AlbumSummary,
  tracks: Track[] = []
) => ({
  id: album.id,
  parent: artist.id,
  isDir: "true",
  title: album.name,
  name: album.name,
  album: album.name,
  artist: artist.name,
  genre: album.genre?.name,
  coverArt: maybeIdFromCoverArtUrn(album.coverArt),
  duration: "123",
  playCount: "4",
  year: album.year,
  created: "2021-01-07T08:19:55.834207205Z",
  artistId: artist.id,
  songCount: "19",
  isVideo: false,
  song: tracks.map(asSongJson),
});

export const asSongJson = (track: Track) => ({
  id: track.id,
  parent: track.album?.id,
  title: track.name,
  album: track.album?.name,
  artist: track.artist?.name,
  track: track.number,
  genre: track.genre?.name,
  isDir: "false",
  coverArt: maybeIdFromCoverArtUrn(track.coverArt),
  created: "2004-11-08T23:36:11",
  duration: track.duration,
  bitRate: 128,
  size: "5624132",
  suffix: "mp3",
  contentType: track.encoding.mimeType,
  transcodedContentType: undefined,
  isVideo: "false",
  path: "ACDC/High voltage/ACDC - The Jack.mp3",
  albumId: track.album?.id,
  artistId: track.artist?.id,
  type: "music",
  starred: track.rating.love ? "sometime" : undefined,
  userRating: track.rating.stars,
  year: track.album?.year,
});

export const getAlbumListJson = (albums: [Artist, Album][], totalCount?: number) =>
  subsonicOK({
    albumList2: {
      totalCount: totalCount ?? albums.length,
      album: albums.map(([artist, album]) => asAlbumJson(artist, album)),
    },
  });

export type ArtistExtras = { artistImageUrl: string | undefined }

export const asArtistJson = (
  artist: Artist,
  extras: ArtistExtras = { artistImageUrl: undefined }
) => ({
  id: artist.id,
  name: artist.name,
  albumCount: artist.albums.length,
  album: artist.albums.map((it) => asAlbumJson(artist, it)),
  ...extras,
});

export const getArtistJson = (artist: Artist, extras: ArtistExtras = { artistImageUrl: undefined }) =>
  subsonicOK({
    artist: asArtistJson(artist, extras),
  });

export const getRadioStationsJson = (radioStations: RadioStation[]) =>
  subsonicOK({
    internetRadioStations: {
      internetRadioStation: radioStations.map((it) => ({
        id: it.id,
        name: it.name,
        streamUrl: it.url,
        homePageUrl: it.homePage
      }))
    },
  });

export const asGenreJson = (genre: { name: string; albumCount: number }) => ({
  songCount: 1475,
  albumCount: genre.albumCount,
  value: genre.name,
});

export const getGenresJson = (genres: { name: string; albumCount: number }[]) =>
  subsonicOK({
    genres: {
      genre: genres.map(asGenreJson),
    },
  });

export const getAlbumJson = (artist: Artist, album: Album, tracks: Track[]) =>
  subsonicOK({ album: asAlbumJson(artist, album, tracks) });

export const getSongJson = (track: Track) => subsonicOK({ song: asSongJson(track) });

export const subsonicOK = (body: any = {}) => ({
  "subsonic-response": {
    status: "ok",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
    ...body,
  },
});

export const getSimilarSongsJson = (tracks: Track[]) =>
  subsonicOK({ similarSongs2: { song: tracks.map(asSongJson) } });

export const getTopSongsJson = (tracks: Track[]) =>
  subsonicOK({ topSongs: { song: tracks.map(asSongJson) } });

export type ArtistWithAlbum = {
  artist: Artist;
  album: Album;
};

export const asPlaylistJson = (playlist: PlaylistSummary) => ({
  id: playlist.id,
  name: playlist.name,
  songCount: 1,
  duration: 190,
  public: true,
  owner: "bob",
  created: "2021-05-06T02:07:24.308007023Z",
  changed: "2021-05-06T02:08:06Z",
});

export const getPlayListsJson = (playlists: PlaylistSummary[]) =>
  subsonicOK({
    playlists: {
      playlist: playlists.map(asPlaylistJson),
    },
  });

export const createPlayListJson = (playlist: PlaylistSummary) =>
  subsonicOK({
    playlist: asPlaylistJson(playlist),
  });

export const getPlayListJson = (playlist: Playlist) =>
  subsonicOK({
    playlist: {
      id: playlist.id,
      name: playlist.name,
      songCount: playlist.entries.length,
      duration: 627,
      public: true,
      owner: "bob",
      created: "2021-05-06T02:07:30.460465988Z",
      changed: "2021-05-06T02:40:04Z",
      entry: playlist.entries.map((it) => ({
        id: it.id,
        parent: "...",
        isDir: false,
        title: it.name,
        album: it.album?.name,
        artist: it.artist?.name,
        track: it.number,
        year: it.album?.year,
        genre: it.album?.genre?.name,
        coverArt: maybeIdFromCoverArtUrn(it.coverArt),
        size: 123,
        contentType: it.encoding.mimeType,
        suffix: "mp3",
        duration: it.duration,
        bitRate: 128,
        path: "...",
        discNumber: 1,
        created: "2019-09-04T04:07:00.138169924Z",
        albumId: it.album?.id,
        artistId: it.artist?.id,
        type: "music",
        isVideo: false,
        starred: it.rating.love ? "sometime" : undefined,
        userRating: it.rating.stars,
      })),
    },
  });

export const getSearchResult3Json = ({
  artists,
  albums,
  tracks,
}: Partial<{
  artists: Artist[];
  albums: ArtistWithAlbum[];
  tracks: Track[];
}>) =>
  subsonicOK({
    searchResult3: {
      artist: (artists || []).map((it) => asArtistJson({ ...it, albums: [] })),
      album: (albums || []).map((it) => asAlbumJson(it.artist, it.album, [])),
      song: (tracks || []).map((it) => asSongJson(it)),
    },
  });

export const asArtistsJson = (artists: Artist[], totalCount?: number) => {
  const asArtistSummary = (artist: Artist) => ({
    id: artist.id,
    name: artist.name,
    albumCount: artist.albums.length,
  });

  return subsonicOK({
    artistList: {
      totalCount: totalCount ?? artists.length,
      artist: artists.map(asArtistSummary),
    },
  });
};

export const error = (code: string, message: string) => ({
  "subsonic-response": {
    status: "failed",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
    error: { code, message },
  },
});

export const EMPTY = {
  "subsonic-response": {
    status: "ok",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
  },
};

export const FAILURE = {
  "subsonic-response": {
    status: "failed",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
    error: { code: 10, message: 'Missing required parameter "v"' },
  },
};

export const pingJson = (pingResponse: Partial<PingResponse> = {}) => ({
  "subsonic-response": {
    status: "ok",
    version: "1.16.1",
    type: "subsonic",
    serverVersion: "0.45.1 (c55e6590)",
    ...pingResponse
  }
})

export const PING_OK = pingJson({ status: "ok" });
