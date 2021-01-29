import sonos from "./sonos";
import server from "./server";

const PORT = process.env["PORT"] || 3000;

const app = server(sonos(process.env["BONOB_SONOS_SEED_HOST"]));

app.listen(PORT, () => {
  console.info(`Listening on ${PORT}`);
});

export default app;
