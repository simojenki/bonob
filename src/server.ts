import express, { Express } from "express";
import * as Eta from "eta";
import morgan from "morgan";

import { Sonos, Service } from "./sonos";
import {
  SOAP_PATH,
  STRINGS_ROUTE,
  PRESENTATION_MAP_ROUTE,
  SONOS_RECOMMENDED_IMAGE_SIZES,
  LOGIN_ROUTE,
} from "./smapi";
import { LinkCodes, InMemoryLinkCodes } from "./link_codes";
import { MusicService, isSuccess } from "./music_service";
import bindSmapiSoapServiceToExpress from "./smapi";
import { AccessTokens, ExpiringAccessTokens } from "./access_tokens";

export const BONOB_ACCESS_TOKEN_HEADER = "bonob-access-token";

function server(
  sonos: Sonos,
  service: Service,
  webAddress: string | "http://localhost:4534",
  musicService: MusicService,
  linkCodes: LinkCodes = new InMemoryLinkCodes(),
  accessTokens: AccessTokens = new ExpiringAccessTokens()
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
          (it) => it.sid == service.sid
        );
        res.render("index", {
          devices,
          services,
          bonobService: service,
          registeredBonobService,
        });
      }
    );
  });

  app.post("/register", (_, res) => {
    sonos.register(service).then((success) => {
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
      bonobService: service,
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
        <string stringId="AppLinkMessage">Linking sonos with ${service.name}</string>
    </stringtable>
    <stringtable rev="1" xml:lang="fr-FR">
        <string stringId="AppLinkMessage">Lier les sonos à la ${service.name}</string>
    </stringtable>    
</stringtables>
`);
  });

  app.get(PRESENTATION_MAP_ROUTE, (_, res) => {
    res.type("application/xml").send(`<?xml version="1.0" encoding="utf-8" ?>
    <Presentation>
      <PresentationMap type="ArtWorkSizeMap">
        <Match>
          <imageSizeMap>
            ${SONOS_RECOMMENDED_IMAGE_SIZES.map(
              (size) =>
                `<sizeEntry size="${size}" substitution="/art/size/${size}"/>`
            )}
          </imageSizeMap>
        </Match>
      </PresentationMap>
    </Presentation>`);
  });

  app.get("/stream/track/:id", async (req, res) => {
    const id = req.params["id"]!;
    const accessToken = req.headers[BONOB_ACCESS_TOKEN_HEADER] as string;
    const authToken = accessTokens.authTokenFor(accessToken);
    if (!authToken) {
      return res.status(401).send();
    } else {
      return musicService
        .login(authToken)
        .then((it) =>
          it.stream({ trackId: id, range: req.headers["range"] || undefined })
        )
        .then((stream) => {
          res.status(stream.status);
          Object.entries(stream.headers).forEach(([header, value]) =>
            res.setHeader(header, value)
          );
          res.send(stream.data);
        });
    }
  });

  app.get("/album/:albumId/art/size/:size", (req, res) => {
    const authToken = accessTokens.authTokenFor(
      req.query[BONOB_ACCESS_TOKEN_HEADER] as string
    );
    if (!authToken) {
      return res.status(401).send();
    } else {
      return musicService
        .login(authToken)
        .then((it) =>
          it.coverArt(
            req.params["albumId"]!,
            Number.parseInt(req.params["size"]!)
          )
        )
        .then((coverArt) => {
          res.status(200);
          res.setHeader("content-type", coverArt.contentType);
          res.send(coverArt.data);
        });
    }
  });

  bindSmapiSoapServiceToExpress(
    app,
    SOAP_PATH,
    webAddress,
    linkCodes,
    musicService,
    accessTokens
  );

  return app;
}

export default server;
