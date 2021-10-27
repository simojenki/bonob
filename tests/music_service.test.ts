import { v4 as uuid } from "uuid";

import { anArtist } from "./builders";
import { artistToArtistSummary } from "../src/music_service";

describe("artistToArtistSummary", () => {
  it("should map fields correctly", () => {
    const artist = anArtist({
      id: uuid(),
      name: "The Artist",
      image: {
        system: "external",
        resource: "http://example.com:1234/image.jpg",
      },
    });
    expect(artistToArtistSummary(artist)).toEqual({
      id: artist.id,
      name: artist.name,
      image: artist.image,
    });
  });
});
