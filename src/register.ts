import registrar from "./registrar";
import { URLBuilder } from "./url_builder";

const params = process.argv.slice(2);

if (params.length != 1) {
  console.error("Usage: register [URL to bonob]");
  process.exit(1);
}

const bonobUrl = new URLBuilder(params[0]!);
registrar(bonobUrl)().then((success) => {
  if (success) console.log(`Successfully registered bonob @ ${bonobUrl} with sonos`);
  else console.error(`Failed registering bonob @ ${bonobUrl} with sonos`);
});
