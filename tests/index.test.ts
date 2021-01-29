import request from "supertest";
import makeServer from "../src/server";
import { SONOS_DISABLED, Sonos } from "../src/sonos";

describe("index", () => {
  describe("when sonos integration is disabled", () => {
    const server = makeServer(SONOS_DISABLED);

    describe("devices list", () => {
      it("should be empty", async () => {
        const res = await request(server).get("/").send();
  
        expect(res.status).toEqual(200);
        expect(res.text).not.toMatch(/class=device/)
      });
    });
  });

  describe("when sonos integration is enabled", () => {
    const fakeSonos: Sonos = {
      devices: () => [{
        name: "device1",
        group: "group1",
        ip: "172.0.0.1",
        port: 4301
      },{
        name: "device2",
        group: "group2",
        ip: "172.0.0.2",
        port: 4302
      }]
    }

    const server = makeServer(fakeSonos);

    describe("devices list", () => {
      it("should contain the devices returned from sonos", async () => {
        const res = await request(server).get("/").send();
  
        expect(res.status).toEqual(200);
        expect(res.text).toMatch(/device1\s+\(172.0.0.1:4301\)/)
        expect(res.text).toMatch(/device2\s+\(172.0.0.2:4302\)/)
      });
    });
  });
});
