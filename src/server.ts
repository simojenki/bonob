import express, { Express } from "express";
import * as Eta from "eta";
import { Sonos, Service } from "./sonos";

function server(sonos: Sonos, bonobService: Service): Express {
  const app = express();

  app.use(express.static("./web/public"));
  app.engine("eta", Eta.renderFile);

  app.set("view engine", "eta");
  app.set("views", "./web/views");

  app.get("/", (_, res) => {
    Promise.all([
      sonos.devices(),
      sonos.services()
    ]).then(([devices, services]) => {
      const registeredBonobService = services.find(it => it.sid == bonobService.sid);
      res.render("index", {
        devices,
        services,
        bonobService,
        registeredBonobService
      });
    })
  });

  app.post("/register", (_, res) => {
    sonos.register(bonobService).then(success => {
      if(success) res.send("Yay")
      else res.send("boo hoo")
    })
  });

  return app;
}

export default server;
