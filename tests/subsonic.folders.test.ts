import { v4 as uuid } from "uuid";
import { pipe } from "fp-ts/lib/function";
import { option as O, taskEither as TE, task as T } from "fp-ts";

import { Subsonic, t, asURLSearchParams, CustomPlayers } from "../src/subsonic";

import axios from "axios";
jest.mock("axios");

import randomstring from "randomstring";
jest.mock("randomstring");

import { Credentials } from "../src/music_service";
import { aTrack } from "./builders";
import { URLBuilder } from "../src/url_builder";

import {
  ok,
  getMusicFoldersJson,
  getMusicDirectoryJson,
  asDirectoryFolderJson,
  asDirectoryFileJson,
  asUnsyncedDirectoryFileJson,
  PING_OK,
} from "./subsonic.test.helpers";

describe("Subsonic storage browsing", () => {
  const url = new URLBuilder("http://127.0.0.22:4567/some-context-path");
  const username = `user1-${uuid()}`;
  const password = `pass1-${uuid()}`;
  const salt = "saltysalty";

  const customPlayers = {
    encodingFor: jest.fn(),
  };

  const subsonic = new Subsonic(
    url,
    customPlayers as unknown as CustomPlayers
  );

  const mockRandomstring = jest.fn();
  const mockGET = jest.fn();
  const mockPOST = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    randomstring.generate = mockRandomstring;
    axios.get = mockGET;
    axios.post = mockPOST;

    mockRandomstring.mockReturnValue(salt);
    customPlayers.encodingFor.mockReturnValue(O.none);
  });

  const authParamsPlusJson = {
    u: username,
    v: "1.16.1",
    c: "bonob",
    t: t(password, salt),
    s: salt,
    f: "json",
  };

  const headers = { "User-Agent": "bonob" };

  const tokenFor = (credentials: Credentials) =>
    pipe(
      subsonic.generateToken(credentials),
      TE.fold((e) => {
        throw e;
      }, T.of)
    );

  const login = (credentials: Credentials) =>
    tokenFor(credentials)().then((it) => subsonic.login(it.serviceToken));

  describe("musicFolders (storage accounts)", () => {
    it("should map each storage account to { id, name } with stringified id", async () => {
      mockGET
        .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
        .mockImplementationOnce(() =>
          Promise.resolve(
            ok(
              getMusicFoldersJson([
                { id: 12, name: "Dropbox" },
                { id: 34, name: "Google Drive" },
              ])
            )
          )
        );

      const result = await login({ username, password }).then((it) =>
        it.musicFolders()
      );

      expect(result).toEqual([
        { id: "12", name: "Dropbox" },
        { id: "34", name: "Google Drive" },
      ]);

      expect(mockGET).toHaveBeenCalledWith(
        url.append({ pathname: "/rest/getMusicFolders" }).href(),
        {
          params: asURLSearchParams(authParamsPlusJson),
          headers,
        }
      );
    });

    it("should return [] when there are no storage accounts", async () => {
      mockGET
        .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
        .mockImplementationOnce(() =>
          Promise.resolve(ok(getMusicFoldersJson([])))
        );

      const result = await login({ username, password }).then((it) =>
        it.musicFolders()
      );

      expect(result).toEqual([]);
    });
  });

  describe("folder (getMusicDirectory)", () => {
    it("should split children into folders and files", async () => {
      const syncedFile = aTrack();
      const folderCoverArt = { system: "subsonic", resource: `art:${uuid()}` };

      mockGET
        .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
        .mockImplementationOnce(() =>
          Promise.resolve(
            ok(
              getMusicDirectoryJson({
                id: "rootId",
                name: "Dropbox",
                child: [
                  asDirectoryFolderJson({
                    id: "sub1",
                    title: "Rock",
                    coverArt: folderCoverArt,
                  }),
                  asDirectoryFolderJson({ id: "sub2", title: "Jazz" }),
                  asDirectoryFileJson(syncedFile),
                ],
              })
            )
          )
        );

      const result = await login({ username, password }).then((it) =>
        it.folder("rootId")
      );

      expect(result.id).toEqual("rootId");
      expect(result.name).toEqual("Dropbox");
      expect(result.coverArt).toBeUndefined();

      expect(result.folders).toEqual([
        { id: "sub1", name: "Rock", coverArt: folderCoverArt },
        { id: "sub2", name: "Jazz", coverArt: undefined },
      ]);

      expect(result.files).toHaveLength(1);
      expect(result.files[0]!.id).toEqual(syncedFile.id);
      expect(result.files[0]!.name).toEqual(syncedFile.name);

      expect(mockGET).toHaveBeenCalledWith(
        url.append({ pathname: "/rest/getMusicDirectory" }).href(),
        {
          params: asURLSearchParams({ ...authParamsPlusJson, id: "rootId" }),
          headers,
        }
      );
    });

    it("should carry albumId onto album-tagged folder children", async () => {
      mockGET
        .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
        .mockImplementationOnce(() =>
          Promise.resolve(
            ok(
              getMusicDirectoryJson({
                id: "rootId",
                name: "Dropbox",
                child: [
                  asDirectoryFolderJson({
                    id: "sub1",
                    title: "Some Album",
                    albumId: "album123",
                  }),
                  asDirectoryFolderJson({ id: "sub2", title: "A Branch" }),
                ],
              })
            )
          )
        );

      const result = await login({ username, password }).then((it) =>
        it.folder("rootId")
      );

      expect(result.folders).toEqual([
        { id: "sub1", name: "Some Album", coverArt: undefined, albumId: "album123" },
        { id: "sub2", name: "A Branch", coverArt: undefined, albumId: undefined },
      ]);
    });

    it("should tolerate unsynced files with minimal metadata", async () => {
      const fileId = uuid();

      mockGET
        .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
        .mockImplementationOnce(() =>
          Promise.resolve(
            ok(
              getMusicDirectoryJson({
                id: "rootId",
                name: "Dropbox",
                child: [
                  asUnsyncedDirectoryFileJson({
                    id: fileId,
                    title: "mystery.mp3",
                    suffix: "mp3",
                    contentType: "audio/mpeg",
                  }),
                ],
              })
            )
          )
        );

      const result = await login({ username, password }).then((it) =>
        it.folder("rootId")
      );

      expect(result.id).toEqual("rootId");
      expect(result.name).toEqual("Dropbox");
      expect(result.coverArt).toBeUndefined();

      expect(result.folders).toEqual([]);
      expect(result.files).toHaveLength(1);

      const file = result.files[0]!;
      expect(file.id).toEqual(fileId);
      expect(file.name).toEqual("mystery.mp3");
      expect(file.duration).toEqual(0);
      expect(file.number).toEqual(0);
      expect(file.album).toBeUndefined();
      expect(file.artist).toBeUndefined();
      expect(file.encoding.mimeType).toEqual("audio/mpeg");
    });

    it("should return empty folders and files for an empty directory", async () => {
      mockGET
        .mockImplementationOnce(() => Promise.resolve(ok(PING_OK)))
        .mockImplementationOnce(() =>
          Promise.resolve(
            ok(
              getMusicDirectoryJson({ id: "rootId", name: "Dropbox", child: [] })
            )
          )
        );

      const result = await login({ username, password }).then((it) =>
        it.folder("rootId")
      );

      expect(result.id).toEqual("rootId");
      expect(result.name).toEqual("Dropbox");
      expect(result.coverArt).toBeUndefined();

      expect(result.folders).toEqual([]);
      expect(result.files).toEqual([]);
    });
  });
});
