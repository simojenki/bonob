import axios from "axios";
jest.mock("axios");

const fakeSonos = {
  register: jest.fn(),
};

import sonos, { bonobService } from "../src/sonos";
jest.mock("../src/sonos");

import registrar from "../src/registrar";
import { URLBuilder } from "../src/url_builder";

describe("registrar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe("when the bonob service can not be found", () => {
    it("should fail", async () => {
      const status = 409;

      (axios.get as jest.Mock).mockResolvedValue({
        status,
      });

      const bonobUrl = new URLBuilder("http://fail.example.com/bonob");

      return expect(registrar(bonobUrl)()).rejects.toEqual(
        `Unexpected response status ${status} from ${bonobUrl
          .append({ pathname: "/about" })
          .href()}`
      );
    });
  });

  describe("when the bonob service returns unexpected content", () => {
    it("should fail", async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        status: 200,
        // invalid response from /about as does not have name and sid
        data: {}
      });

      const bonobUrl = new URLBuilder("http://fail.example.com/bonob");

      return expect(registrar(bonobUrl)()).rejects.toEqual(
        `Unexpected response from ${bonobUrl
          .append({ pathname: "/about" })
          .href()}, expected service.name and service.sid`
      );
    });
  });

  describe("when the bonob service can be found", () => {
    const bonobUrl = new URLBuilder("http://success.example.com/bonob");

    const serviceDetails = {
      name: "bob",
      sid: 123,
    };

    const service = "service";

    beforeEach(() => {
      (axios.get as jest.Mock).mockResolvedValue({
        status: 200,
        data: {
          service: serviceDetails,
        },
      });

      (bonobService as jest.Mock).mockResolvedValue(service);
      (sonos as jest.Mock).mockReturnValue(fakeSonos);
    });

    describe("when registration succeeds", () => {
      it("should fetch the service details and register", async () => {
        fakeSonos.register.mockResolvedValue(true);
        const sonosDiscovery = { auto: true };

        expect(await registrar(bonobUrl, sonosDiscovery)()).toEqual(
          true
        );

        expect(bonobService).toHaveBeenCalledWith(
          serviceDetails.name,
          serviceDetails.sid,
          bonobUrl
        );
        expect(sonos).toHaveBeenCalledWith(sonosDiscovery);
        expect(fakeSonos.register).toHaveBeenCalledWith(service);
      });
    });

    describe("when registration fails", () => {
      it("should fetch the service details and register", async () => {
        fakeSonos.register.mockResolvedValue(false);
        const sonosDiscovery = { auto: false, seedHost: "192.168.1.163" };

        expect(await registrar(bonobUrl, sonosDiscovery)()).toEqual(
          false
        );

        expect(bonobService).toHaveBeenCalledWith(
          serviceDetails.name,
          serviceDetails.sid,
          bonobUrl
        );
        expect(sonos).toHaveBeenCalledWith(sonosDiscovery);
        expect(fakeSonos.register).toHaveBeenCalledWith(service);
      });
    });
  });
});
