import { Art } from "./art";
import { taskEither as TE } from "fp-ts";

export type Credentials = { readonly username: string; readonly password: string };

// todo: these are using in subsonic, maybe they should go in there?
export type AuthSuccess = {
  readonly serviceToken: string;
  readonly userId: string;
  readonly nickname: string;
};

export class AuthFailure extends Error {
  constructor(message: string) {
    super(message);
  }
};

export type ArtistSummary = {
  readonly id: string | undefined;
  readonly name: string;
  readonly image: Art | undefined;
};

export type SimilarArtist = ArtistSummary & { readonly inLibrary: boolean };

// todo: maybe is should be artist.summary rather than an artist also being a summary?
export type Artist = Pick<ArtistSummary, "id" | "name" | "image">  & {
  readonly albums: readonly AlbumSummary[];
  readonly similarArtists: readonly SimilarArtist[]
};

export type AlbumSummary = {
  readonly id: string;
  readonly name: string;
  readonly year: string | undefined;
  readonly genre: Genre | undefined;
  readonly coverArt: Art | undefined;
  // eslint-disable-next-line functional/prefer-readonly-type
  artistName: string | undefined;
  // eslint-disable-next-line functional/prefer-readonly-type
  artistId: string | undefined;
};

export type Album = Pick<AlbumSummary, "id" | "name" | "year" | "genre" | "coverArt" | "artistName" | "artistId"> & { readonly tracks: readonly Track[] };

export type Genre = {
  readonly name: string;
  readonly id: string;
}

export type Year = {
  readonly year: string;
}

export type Rating = {
  readonly love: boolean;
  readonly stars: number;
}

export type Encoding = {
  readonly player: string,
  readonly mimeType: string
}

export type TrackSummary = {
  readonly id: string;
  readonly name: string;
  readonly encoding: Encoding,
  readonly duration: number;
  readonly number: number | undefined;
  readonly genre: Genre | undefined;
  readonly coverArt: Art | undefined;
  readonly artist: ArtistSummary;
  readonly rating: Rating;
}

export type Track = TrackSummary & {
  readonly album: AlbumSummary;
};

export type RadioStation = {
  readonly id: string,
  readonly name: string,
  readonly url: string,
  readonly homePage?: string
}

export type Paging = {
  readonly _index?: number;
  readonly _count?: number;
};

export type Result<T> = {
  readonly results: readonly T[];
  readonly total: number;
};

export function slice2<T>({ _index, _count }: Partial<Paging> = {}) {
  const i = _index || 0;
  return (things: readonly T[]): readonly [readonly T[], number] => [
    _count ? things.slice(i, i + _count) : things.slice(i),
    things.length,
  ];
}

export type Sortable = {
  readonly _sortBy: string;
};

export const asResult = <T>([results, total]: readonly [readonly T[], number]) => ({
  results,
  total,
});

export const asResultx = <T>(results: readonly T[]) => ({
  results,
  total: results.length,
});

export const slice2Result = <T>(paging: Partial<Paging> = {}) => (
  things: readonly T[]
): Result<T> => asResult(slice2<T>(paging)(things));

export type ArtistQuery = Paging;

const ALBUM_SORT_VALUES = [
  'alphabeticalByArtist',
  'alphabeticalByName',
  'byGenre',
  'byYear',
] as const;
export const ALBUM_SORT_OPTION = new Set<string>(ALBUM_SORT_VALUES);

const ALBUM_COLLECTION_VALUES = [
  'recentlyPlayed',
  'mostPlayed',
  'recentlyAdded',
  'favourited',
  'starred',
] as const;
export const ALBUM_COLLECTION_OPTION = new Set<string>(ALBUM_COLLECTION_VALUES);

export type AlbumSort = typeof ALBUM_SORT_VALUES[number];
export type AlbumCollection = typeof ALBUM_COLLECTION_VALUES[number];
export type AlbumQueryType = AlbumSort | 'random' | AlbumCollection;
export type AlbumFilter = {
  readonly genre?: string;
  readonly fromYear?: string;
  readonly toYear?: string;
}

export type AlbumQuery = Paging & { readonly type: AlbumQueryType; } & AlbumFilter;

export const artistToArtistSummary = (it: Artist): ArtistSummary => ({
  id: it.id,
  name: it.name,
  image: it.image
});

export const albumToAlbumSummary = (it: Album): AlbumSummary & Sortable => ({
  id: it.id,
  name: it.name,
  year: it.year,
  genre: it.genre,
  artistName: it.artistName,
  artistId: it.artistId,
  coverArt: it.coverArt,
  _sortBy: it.name,
});

export const trackToTrackSummary = (it: Track): TrackSummary => ({
  id: it.id,
  name: it.name,
  encoding: it.encoding,
  duration: it.duration,
  number: it.number,
  genre: it.genre,
  coverArt: it.coverArt,
  artist: it.artist,
  rating: it.rating
});

export const playlistToPlaylistSummary = (it: Playlist): PlaylistSummary => ({
  id: it.id,
  name: it.name,
  coverArt: it.coverArt
})

export type StreamingHeader = "content-type" | "content-length" | "content-range" | "accept-ranges";

export type TrackStream = {
  readonly status: number;
  readonly headers: Record<StreamingHeader, string | undefined>;
  readonly stream: any;
};

export type CoverArt = {
  readonly contentType: string;
  readonly data: Buffer;
}

export type PlaylistSummary = {
  readonly id: string,
  readonly name: string,
  readonly coverArt?: Art | undefined
}

export type Playlist = PlaylistSummary & {
  readonly entries: readonly Track[]
}

export const range = (size: number) => [...Array(size).keys()];

// eslint-disable-next-line functional/prefer-readonly-type
export const asArtistAlbumPairs = (artists: readonly Artist[]): ([Artist, Album])[] =>
  artists.flatMap((artist) =>
    // eslint-disable-next-line functional/prefer-readonly-type
    artist.albums.map((album) => [artist, album] as [Artist, Album])
  );

export interface MusicService {
  generateToken(credentials: Credentials): TE.TaskEither<AuthFailure, AuthSuccess>;
  refreshToken(serviceToken: string): TE.TaskEither<AuthFailure, AuthSuccess>;
  login(serviceToken: string): Promise<MusicLibrary>;
}

export interface MusicLibrary {
  artists(q: ArtistQuery): Promise<Result<ArtistSummary & Sortable>>;
  artist(id: string): Promise<Artist>;
  albums(q: AlbumQuery): Promise<Result<AlbumSummary & Sortable>>;
  album(id: string): Promise<Album>;
  track(trackId: string): Promise<Track>;
  genres(): Promise<readonly Genre[]>;
  years(): Promise<readonly Year[]>;
  stream({
    trackId,
    range,
  }: {
    readonly trackId: string;
    readonly range: string | undefined;
  }): Promise<TrackStream>;
  rate(trackId: string, rating: Rating): Promise<boolean>;
  coverArt(coverArtURN: Art, size?: number): Promise<CoverArt | undefined>;
  nowPlaying(id: string): Promise<boolean>
  scrobble(id: string): Promise<boolean>
  searchArtists(query: string): Promise<readonly ArtistSummary[]>;
  searchAlbums(query: string): Promise<readonly AlbumSummary[]>;
  searchTracks(query: string): Promise<readonly Track[]>;
  playlists(): Promise<readonly PlaylistSummary[]>;
  playlist(id: string): Promise<Playlist>;
  createPlaylist(name: string): Promise<PlaylistSummary>
  deletePlaylist(id: string): Promise<boolean>
  addToPlaylist(playlistId: string, trackId: string): Promise<boolean>
  removeFromPlaylist(playlistId: string, indicies: readonly number[]): Promise<boolean>
  similarSongs(id: string): Promise<readonly TrackSummary[]>;
  topSongs(artistId: string): Promise<readonly TrackSummary[]>;
  radioStation(id: string): Promise<RadioStation>
  radioStations(): Promise<readonly RadioStation[]>
}
