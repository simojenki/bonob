import express, { Express } from "express";
import * as Eta from "eta";
import { listen } from "soap";
import { readFileSync } from "fs";
import path from "path";
import morgan from "morgan";
import crypto from "crypto";

import {
  Sonos,
  Service,
  SOAP_PATH,
  STRINGS_PATH,
  PRESENTATION_MAP_PATH,
} from "./sonos";
import { LinkCodes, InMemoryLinkCodes } from "./link_codes";
import { MusicService, isSuccess } from "./music_service";
import logger from "./logger";

const WSDL_FILE = path.resolve(
  __dirname,
  "Sonoswsdl-1.19.4-20190411.142401-3.wsdl"
);

function server(
  sonos: Sonos,
  bonobService: Service,
  webAddress: string | "http://localhost:1234",
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
      if (success) res.send("Yay");
      else res.send("boo hoo");
    });
  });

  app.get("/login", (req, res) => {
    res.render("login", {
      bonobService,
      linkCode: req.query.linkCode,
    });
  });

  app.post("/login", (req, res) => {
    const { username, password, linkCode } = req.body;
    const authResult = musicService.login({
      username,
      password,
    });
    if (isSuccess(authResult)) {
      if (linkCodes.has(linkCode)) {
        linkCodes.associate(linkCode, authResult);
        res.render("loginOK");
      } else {
        res.status(400).render("failure", {
          message: `Invalid linkCode!`,
        });
      }
    } else {
      res.status(403).render("failure", {
        message: `Login failed, ${authResult.message}!`,
      });
    }
  });

  app.get(STRINGS_PATH, (_, res) => {
    res.type("application/xml").send(`<?xml version="1.0" encoding="utf-8" ?>
<stringtables xmlns="http://sonos.com/sonosapi">
    <stringtable rev="1" xml:lang="en-US">
        <string stringId="AppLinkMessage">Linking sonos with bonob</string>
    </stringtable>
</stringtables>
`);
  });

  app.get(PRESENTATION_MAP_PATH, (_, res) => {
    res.send("");
  });

  const sonosService = {
    Sonos: {
      SonosSoap: {
        getAppLink: () => {
          const linkCode = linkCodes.mint();
          return {
            getAppLinkResult: {
              authorizeAccount: {
                appUrlStringId: "AppLinkMessage",
                deviceLink: {
                  regUrl: `${webAddress}/login?linkCode=${linkCode}`,
                  linkCode: linkCode,
                  showLinkCode: false,
                },
              },
            },
          };
        },
        getDeviceAuthToken: ({ linkCode }: { linkCode: string }) => {
          const association = linkCodes.associationFor(linkCode);
          if (association) {
            return {
              getDeviceAuthTokenResult: {
                authToken: association.authToken,
                privateKey: "v1",
                userInfo: {
                  nickname: association.nickname,
                  userIdHashCode: crypto
                    .createHash("sha256")
                    .update(association.userId)
                    .digest("hex"),
                },
                }
            };
          } else {
            throw {
              Fault: {
                faultcode: "Client.NOT_LINKED_RETRY",
                faultstring: "Link Code not found retry...",
                detail: {
                  ExceptionInfo: "NOT_LINKED_RETRY",
                  SonosError: "5"
                }
              }
            }
          }
        },
        getSessionId: ({
          username,
        }: {
          username: string;
          password: string;
        }) => {
          return Promise.resolve({
            username,
            sessionId: "123",
          });
        },
      },
    },
  };

  const x = listen(
    app,
    SOAP_PATH,
    sonosService,
    readFileSync(WSDL_FILE, "utf8")
  );

  x.log = (type, data) => {
    switch (type) {
      case "info":
        logger.info({ level: "info", data });
        break;
      case "warn":
        logger.warn({ level: "warn", data });
        break;
      case "error":
        logger.error({ level: "error", data });
        break;
      default:
        logger.debug({ level: "debug", data });
    }
  };

  return app;
}

export default server;
