import request from "supertest";
import makeServer from "../src/server";
import { SONOS_DISABLED, Sonos, Device, Service } from "../src/sonos";

describe("index", () => {
  const BONOB_FOR_TEST: Service = {
    name: "test bonob",
    id: 999
  }

  describe("when sonos integration is disabled", () => {
    const server = makeServer(SONOS_DISABLED, BONOB_FOR_TEST);

    describe("devices list", () => {
      it("should be empty", async () => {
        const res = await request(server).get("/").send();

        expect(res.status).toEqual(200);
        expect(res.text).not.toMatch(/class=device/);
      });
    });
  });

  describe("when there are 2 devices and bonob is not registered", () => {
    const device1 : Device = {
      name: "device1",
      group: "group1",
      ip: "172.0.0.1",
      port: 4301,
      services: [
        {
          name: "s1",
          id: 1,
        },
        {
          name: "s2",
          id: 2,
        },
      ],
    };
  
    const device2: Device = {
      name: "device2",
      group: "group2",
      ip: "172.0.0.2",
      port: 4302,
      services: [
        {
          name: "s3",
          id: 3,
        },
        {
          name: "s4",
          id: 4,
        },
      ],
    }

    const fakeSonos: Sonos = {
      devices: () =>Promise.resolve([device1, device2]),
    };

    const server = makeServer(fakeSonos, BONOB_FOR_TEST);

    describe("devices list", () => {
      it("should contain the devices returned from sonos", async () => {
        const res = await request(server).get("/").send();
  
        expect(res.status).toEqual(200);
        expect(res.text).toMatch(
          /device1\s+\(172.0.0.1:4301\)/
        );
        expect(res.text).toMatch(
          /device2\s+\(172.0.0.2:4302\)/
        );
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
        expect(res.text).toMatch(
          /test bonob\s+\(999\) is not-registered/
        );
      })
    });
  });

  describe("when there are 2 devices and bonob is registered", () => {
    const device1 : Device = {
      name: "device1",
      group: "group1",
      ip: "172.0.0.1",
      port: 4301,
      services: [
        {
          name: "s1",
          id: 1,
        },
        {
          name: "s2",
          id: 2,
        },
        BONOB_FOR_TEST
      ],
    };
  
    const device2: Device = {
      name: "device2",
      group: "group2",
      ip: "172.0.0.2",
      port: 4302,
      services: [
        {
          name: "s1",
          id: 1,
        },
        {
          name: "s4",
          id: 4,
        },
        BONOB_FOR_TEST
      ],
    }

    const fakeSonos: Sonos = {
      devices: () =>Promise.resolve([device1, device2]),
    };

    const server = makeServer(fakeSonos, BONOB_FOR_TEST);

    describe("registration status", () => {
      it("should be registered", async () => {
        const res = await request(server).get("/").send();
        expect(res.status).toEqual(200);
        expect(res.text).toMatch(
          /test bonob\s+\(999\) is registered/
        );
      })
    });
  });
});
