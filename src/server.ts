import express, { Express } from "express";
import * as Eta from "eta";
import morgan from "morgan";

import { Sonos, Service } from "./sonos";
import {
  SOAP_PATH,
  STRINGS_ROUTE,
  PRESENTATION_MAP_ROUTE,
  LOGIN_ROUTE,
} from "./smapi";
import { LinkCodes, InMemoryLinkCodes } from "./link_codes";
import { MusicService, isSuccess } from "./music_service";
// import logger from "./logger";
import bindSmapiSoapServiceToExpress from "./smapi";

function server(
  sonos: Sonos,
  bonobService: Service,
  webAddress: string | "http://localhost:4534",
  musicService: MusicService,
  linkCodes: LinkCodes = new InMemoryLinkCodes()
): Express {
  const app = express();

  app.use(morgan("combined"));
  app.use(express.urlencoded({ extended: false }));

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
      if (success) {
        res.render("success", {
          message: `Successfully registered`,
        });
      } else {
        res.status(500).render("failure", {
          message: `Registration failed!`,
        });
      }
    });
  });

  app.get(LOGIN_ROUTE, (req, res) => {
    res.render("login", {
      bonobService,
      linkCode: req.query.linkCode,
      loginRoute: LOGIN_ROUTE,
    });
  });

  app.post(LOGIN_ROUTE, async (req, res) => {
    const { username, password, linkCode } = req.body;
    if (!linkCodes.has(linkCode)) {
      res.status(400).render("failure", {
        message: `Invalid linkCode!`,
      });
    } else {
      const authResult = await musicService.generateToken({
        username,
        password,
      });
      if (isSuccess(authResult)) {
        linkCodes.associate(linkCode, authResult);
        res.render("success", {
          message: `Login successful!`,
        });
      } else {
        res.status(403).render("failure", {
          message: `Login failed! ${authResult.message}!`,
        });
      }
    }
  });

  app.get(STRINGS_ROUTE, (_, res) => {
    res.type("application/xml").send(`<?xml version="1.0" encoding="utf-8" ?>
<stringtables xmlns="http://sonos.com/sonosapi">
    <stringtable rev="1" xml:lang="en-US">
        <string stringId="AppLinkMessage">Linking sonos with bonob</string>
        <string stringId="string2">string2</string>
    </stringtable>
    <stringtable rev="1" xml:lang="fr-FR">
        <string stringId="AppLinkMessage">Linking sonos with bonob fr</string>
        <string stringId="string2">string2 fr</string>
    </stringtable>    
</stringtables>
`);
  });

  app.get(PRESENTATION_MAP_ROUTE, (_, res) => {
    res.send("");
  });

  // app.get("/artist/:artistId/image", (req, res) => {
  //   console.log(`Trying to load image for ${req.params["artistId"]}, token ${JSON.stringify(req.cookies)}`)
  //   const authToken = req.headers["X-AuthToken"]! as string;
  //   const artistId = req.params["artistId"]!;
  //   musicService
  //     .login(authToken)
  //     .then((it) => it.artist(artistId))
  //     .then(artist => artist.image.small)
  //     .then((url) => {
  //       if (url) {
  //         console.log(`${artistId} sending 307 -> ${url}`)
  //         res.setHeader("Location", url);
  //         res.status(307).send();
  //       } else {
  //         console.log(`${artistId} sending 404`)
  //         res.status(404).send();
  //       }
  //     });
  // });

  bindSmapiSoapServiceToExpress(
    app,
    SOAP_PATH,
    webAddress,
    linkCodes,
    musicService
  );

  return app;
}

export default server;
