import { ArtistSummary, Sortable } from "../music_service";
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

