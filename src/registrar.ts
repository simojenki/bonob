import axios from "axios";
import _ from "underscore";
import logger from "./logger";
import sonos, { bonobService, Discovery } from "./sonos";
import { URLBuilder } from "./url_builder";

export default (
    bonobUrl: URLBuilder,
    sonosDiscovery: Discovery = {
      auto: true,
      seedHost: undefined,
    }
  ) =>
  async () => {
    const about = bonobUrl.append({ pathname: "/about" });
    logger.info(`Fetching bonob service about from ${about}`);
    return axios
      .get(about.href())
      .then((res) => {
        if (res.status == 200) return res.data;
        else throw `Unexpected response status ${res.status} from ${about}`;
      })
      .then((res) => {
        const name = _.get(res, ["service", "name"]);
        const sid = _.get(res, ["service", "sid"]);
        if (!name || !sid) {
          throw `Unexpected response from ${about.href()}, expected service.name and service.sid`;
        }
        return {
          name,
          sid: Number.parseInt(sid),
        };
      })
      .then(({ name, sid }: { name: string; sid: number }) =>
        bonobService(name, sid, bonobUrl)
      )
      .then((service) => sonos(sonosDiscovery).register(service));
  };
