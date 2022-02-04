import { v4 as uuid } from "uuid";
import { DODGY_IMAGE_NAME } from "../../src/subsonic";
import { artistImageURN } from "../../src/subsonic/generic";
import { artistSummaryFromNDArtist } from "../../src/subsonic/navidrome";


describe("artistSummaryFromNDArtist", () => {
  describe("when the orderArtistName is undefined", () => {
    it("should use name", () => {
      const artist = {
        id: uuid(),
        name: `name ${uuid()}`,
        orderArtistName: undefined,
        largeImageUrl: 'http://example.com/something.jpg'
      }
      expect(artistSummaryFromNDArtist(artist)).toEqual({
        id: artist.id,
        name: artist.name,
        sortName: artist.name,
        image: artistImageURN({ artistId: artist.id, artistImageURL: artist.largeImageUrl })
      })
    });
  });

  describe("when the artist image is valid", () => {
    it("should create an ArtistSummary with Sortable", () => {
      const artist = {
        id: uuid(),
        name: `name ${uuid()}`,
        orderArtistName: `orderArtistName ${uuid()}`,
        largeImageUrl: 'http://example.com/something.jpg'
      }
      expect(artistSummaryFromNDArtist(artist)).toEqual({
        id: artist.id,
        name: artist.name,
        sortName: artist.orderArtistName,
        image: artistImageURN({ artistId: artist.id, artistImageURL: artist.largeImageUrl })
      })
    });
  });

  describe("when the artist image is not valid", () => {
    it("should create an ArtistSummary with Sortable", () => {
      const artist = {
        id: uuid(),
        name: `name ${uuid()}`,
        orderArtistName: `orderArtistName ${uuid()}`,
        largeImageUrl: `http://example.com/${DODGY_IMAGE_NAME}`
      }

      expect(artistSummaryFromNDArtist(artist)).toEqual({
        id: artist.id,
        name: artist.name,
        sortName: artist.orderArtistName,
        image: artistImageURN({ artistId: artist.id, artistImageURL: artist.largeImageUrl })
      });
    });
  });

  describe("when the artist image is missing", () => {
    it("should create an ArtistSummary with Sortable", () => {
      const artist = {
        id: uuid(),
        name: `name ${uuid()}`,
        orderArtistName: `orderArtistName ${uuid()}`,
        largeImageUrl: undefined
      }

      expect(artistSummaryFromNDArtist(artist)).toEqual({
        id: artist.id,
        name: artist.name,
        sortName: artist.orderArtistName,
        image: artistImageURN({ artistId: artist.id, artistImageURL: artist.largeImageUrl })
      });
    });
  });
});

