import request from "supertest";

import { DOMParserImpl } from 'xmldom-ts';
import * as xpath from 'xpath-ts';

import makeServer from "../src/server";
import { SONOS_DISABLED, STRINGS_PATH } from "../src/sonos";

import { aService, InMemoryMusicService } from './builders';

const parseXML = (value: string) => new DOMParserImpl().parseFromString(value);
const select = xpath.useNamespaces({"sonos": "http://sonos.com/sonosapi"})

describe('strings.xml', () => {
  const server = makeServer(SONOS_DISABLED, aService(), 'http://localhost:1234', new InMemoryMusicService());

  it("should return xml for the strings", async () => {
    const res = await request(server).get(STRINGS_PATH).send();

    expect(res.status).toEqual(200);

    const xml = parseXML(res.text);
    const x = select("//sonos:string[@stringId='AppLinkMessage']/text()", xml) as Node[]
    expect(x.length).toEqual(1)
    expect(x[0]!.nodeValue).toEqual("Linking sonos with bonob")
  });
});