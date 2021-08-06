import axios from "axios";
import logger from "./logger";
import sonos, { bonobService } from "./sonos";
import { URLBuilder } from "./url_builder";

export default (bonobUrl: URLBuilder) => async () => {
  const about = bonobUrl.append({ pathname: "/about" });
  logger.info(`Fetching bonob service about from ${about}`);
  return axios
    .get(about.href())
    .then((res) => {
      if (res.status == 200) return res.data;
      else throw `Unexpected response status ${res.status} from ${about}`;
    })
    .then((about) =>
      bonobService(about.service.name, about.service.sid, bonobUrl)
    )
    .then((bonobService) => sonos(true).register(bonobService));
};
