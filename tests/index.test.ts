import request from "supertest";
import makeServer from "../src/server";
import { SONOS_DISABLED, Sonos, Device } from "../src/sonos";

import { aDevice, aService, InMemoryMusicService } from './builders';

describe("index", () => {
  describe("when sonos integration is disabled", () => {
    const server = makeServer(SONOS_DISABLED, aService(), 'http://localhost:1234', new InMemoryMusicService());

    describe("devices list", () => {
      it("should be empty", async () => {
        const res = await request(server).get("/").send();

        expect(res.status).toEqual(200);
        expect(res.text).not.toMatch(/class=device/);
      });
    });
  });

  describe("when there are 2 devices and bonob is not registered", () => {
    const service1 = aService({
      name: "s1",
      sid: 1,
    });
    const service2 = aService({
      name: "s2",
      sid: 2,
    });
    const service3 = aService({
      name: "s3",
      sid: 3,
    });
    const service4 = aService({
      name: "s4",
      sid: 4,
    });
    const missingBonobService = aService({
      name: "bonobMissing",
      sid: 88
    })

    const device1: Device = aDevice({
      name: "device1",
      ip: "172.0.0.1",
      port: 4301,
    });

    const device2: Device = aDevice({
      name: "device2",
      ip: "172.0.0.2",
      port: 4302,
    });

    const fakeSonos: Sonos = {
      devices: () => Promise.resolve([device1, device2]),
      services: () => Promise.resolve([service1, service2, service3, service4]),
      register: () => Promise.resolve(false),
    };

    const server = makeServer(fakeSonos, missingBonobService, 'http://localhost:1234', new InMemoryMusicService());

    describe("devices list", () => {
      it("should contain the devices returned from sonos", async () => {
        const res = await request(server).get("/").send();

        expect(res.status).toEqual(200);
        expect(res.text).toMatch(/device1\s+\(172.0.0.1:4301\)/);
        expect(res.text).toMatch(/device2\s+\(172.0.0.2:4302\)/);
      });
    });

    describe("services", () => {
      it("should contain a list of services returned from sonos", async () => {
        const res = await request(server).get("/").send();

        expect(res.status).toEqual(200);
        expect(res.text).toMatch(/Services\s+4/);
        expect(res.text).toMatch(/s1\s+\(1\)/);
        expect(res.text).toMatch(/s2\s+\(2\)/);
        expect(res.text).toMatch(/s3\s+\(3\)/);
        expect(res.text).toMatch(/s4\s+\(4\)/);
      });
    });

    describe("registration status", () => {
      it("should be not-registered", async () => {
        const res = await request(server).get("/").send();
        expect(res.status).toEqual(200);
        expect(res.text).toMatch(/No existing service registration/);
      });
    });
  });

  describe("when there are 2 devices and bonob is registered", () => {
    const service1 = aService();

    const service2 = aService();

    const bonobService = aService({
      name: "bonobNotMissing",
      sid: 99
    })
    
    const fakeSonos: Sonos = {
      devices: () => Promise.resolve([]),
      services: () => Promise.resolve([service1, service2, bonobService]),
      register: () => Promise.resolve(false),
    };

    const server = makeServer(fakeSonos, bonobService, 'http://localhost:1234', new InMemoryMusicService());

    describe("registration status", () => {
      it("should be registered", async () => {
        const res = await request(server).get("/").send();
        expect(res.status).toEqual(200);
        expect(res.text).toMatch(/Existing service config/);
      });
    });
  });
});
