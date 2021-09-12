import registrar from "./registrar";
import readConfig from "./config";
import { URLBuilder } from "./url_builder";

const params = process.argv.slice(2);

if (params.length != 1) {
  console.error("Usage: register [URL to bonob]");
  process.exit(1);
}

const bonobUrl = new URLBuilder(params[0]!);

const config = readConfig();

registrar(bonobUrl, config.sonos.discovery)()
  .then((success) => {
    if (success) {
      console.log(`Successfully registered bonob @ ${bonobUrl} with sonos`);
      process.exit(0);
    } else {
      console.error(`Failed registering bonob @ ${bonobUrl} with sonos`);
      process.exit(1);
    }
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
