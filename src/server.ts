import express, { Express } from "express";
import * as Eta from "eta";
import { listen } from "soap";
import { readFileSync } from "fs";
import path from "path";

import { Sonos, Service } from "./sonos";
import logger from "./logger";

const WSDL_FILE = path.resolve(
  __dirname,
  "Sonoswsdl-1.19.4-20190411.142401-3.wsdl"
);

function server(sonos: Sonos, bonobService: Service): Express {
  const app = express();

  app.use(express.static("./web/public"));
  app.engine("eta", Eta.renderFile);

  app.set("view engine", "eta");
  app.set("views", "./web/views");

  app.get("/", (_, res) => {
    Promise.all([sonos.devices(), sonos.services()]).then(
      ([devices, services]) => {
        const registeredBonobService = services.find(
          (it) => it.sid == bonobService.sid
        );
        res.render("index", {
          devices,
          services,
          bonobService,
          registeredBonobService,
        });
      }
    );
  });

  app.post("/register", (_, res) => {
    sonos.register(bonobService).then((success) => {
      if (success) res.send("Yay");
      else res.send("boo hoo");
    });
  });

  const sonosService = {
    Sonos: {
      SonosSoap: {
        getSessionId: ({
          username
        }: {
          username: string;
          password: string;
        }) => {
          return Promise.resolve({
            username,
            sessionId: '123'
          });
        },
      },
    },
  };

  const x = listen(
    app,
    "/ws",
    sonosService,
    readFileSync(WSDL_FILE, "utf8")
  );

  x.log = (type, data) => {
    switch (type) {
      case "info":
        logger.info({ data });
        break;
      case "warn":
        logger.warn({ data });
        break;
      case "error":
        logger.error({ data });
        break;
      default:
        logger.debug({ data });
    }
  };

  return app;
}

export default server;
