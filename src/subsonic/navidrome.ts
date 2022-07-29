import { option as O, taskEither as TE } from "fp-ts";
import * as A from "fp-ts/Array";
import { pipe } from "fp-ts/lib/function";
import { ordString } from "fp-ts/lib/Ord";
import { inject } from "underscore";
import _ from "underscore";
import axios from "axios";

import { SubsonicCredentials, SubsonicMusicLibrary } from ".";
import { ArtistQuery, ArtistSummary, AuthFailure, Credentials, Result, Sortable } from "../music_service";
import { artistImageURN } from "./generic";

export type NDArtist = {
  id: string;
  name: string;
  orderArtistName: string | undefined;
  largeImageUrl: string | undefined;
};

export const artistSummaryFromNDArtist = (
  artist: NDArtist
): ArtistSummary & Sortable => ({
  id: artist.id,
  name: artist.name,
  sortName: artist.orderArtistName || artist.name,
  image: artistImageURN({
    artistId: artist.id,
    artistImageURL: artist.largeImageUrl,
  }),
});


export const navidromeMusicLibrary = (
  url: string,
  subsonicLibrary: SubsonicMusicLibrary,
  subsonicCredentials: SubsonicCredentials
): SubsonicMusicLibrary => ({
  ...subsonicLibrary,
  flavour: () => "navidrome",
  bearerToken: (
    credentials: Credentials
  ): TE.TaskEither<Error, string | undefined> =>
    pipe(
      TE.tryCatch(
        () =>
          // todo: not hardcode axios in here
          axios({
            method: "post",
            baseURL: url,
            url: `/auth/login`,
            data: _.pick(credentials, "username", "password"),
          }),
        () => new AuthFailure("Failed to get bearerToken")
      ),
      TE.map((it) => it.data.token as string | undefined)
    ),
  artists: async (
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

    const x: Promise<Result<ArtistSummary & Sortable>> = axios
      .get(`${url}/api/artist`, {
        params: asURLSearchParams(params),
        headers: {
          "User-Agent": USER_AGENT,
          "x-nd-authorization": `Bearer ${subsonicCredentials.bearer}`,
        },
      })
      .catch((e) => {
        throw `Navidrome failed with: ${e}`;
      })
      .then((response) => {
        if (response.status != 200 && response.status != 206) {
          throw `Navidrome failed with a ${response.status || "no!"} status`;
        } else return response;
      })
      .then((it) => ({
        results: (it.data as NDArtist[]).map(artistSummaryFromNDArtist),
        total: Number.parseInt(it.headers["x-total-count"] || "0"),
      }));

    return x;
  },
});
