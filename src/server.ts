import express, { Express } from "express";
import * as Eta from "eta";
import { Sonos } from "./sonos";

function server(sonos: Sonos): Express {
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

  return app;
}

export default server;
