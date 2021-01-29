import express from "express";
import * as Eta from "eta";

// import { Navidrome } from "./music_service";
import makeSonos from "./sonos";

const PORT = 3000;

makeSonos().then((sonos) => {
  const app = express();
  app.use(express.static("./web/public"));

  app.engine("eta", Eta.renderFile);
  app.set("view engine", "eta");
  app.set("views", "./web/views");

  app.get("/", (_, res) => {
    res.render("index", {
      devices: sonos.devices(),
    });
  });

  app.listen(PORT, () => {
    console.info(`Listening on ${PORT}`);
  });
});
