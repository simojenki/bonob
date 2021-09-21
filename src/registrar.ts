import axios from "axios";
import _ from "underscore";
import logger from "./logger";
import sonos, { bonobService } from "./sonos";
import { URLBuilder } from "./url_builder";

export default (
    bonobUrl: URLBuilder,
    seedHost?: string
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
      .then((service) => sonos({ enabled: true, seedHost }).register(service));
  };
