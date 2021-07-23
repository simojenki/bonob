import { option as O } from "fp-ts";
import express, { Express } from "express";
import * as Eta from "eta";
import morgan from "morgan";

import { PassThrough, Transform, TransformCallback } from "stream";

import { Sonos, Service } from "./sonos";
import {
  SOAP_PATH,
  STRINGS_ROUTE,
  PRESENTATION_MAP_ROUTE,
  SONOS_RECOMMENDED_IMAGE_SIZES,
  LOGIN_ROUTE,
  REGISTER_ROUTE,
} from "./smapi";
import { LinkCodes, InMemoryLinkCodes } from "./link_codes";
import { MusicService, isSuccess } from "./music_service";
import bindSmapiSoapServiceToExpress from "./smapi";
import { AccessTokens, AccessTokenPerAuthToken } from "./access_tokens";
import logger from "./logger";
import { Clock, SystemClock } from "./clock";
import { pipe } from "fp-ts/lib/function";
import { URLBuilder } from "./url_builder";

export const BONOB_ACCESS_TOKEN_HEADER = "bonob-access-token";

interface RangeFilter extends Transform {
  range: (length: number) => string;
}

export function rangeFilterFor(rangeHeader: string): RangeFilter {
  // if (rangeHeader == undefined) return new PassThrough();
  const match = rangeHeader.match(/^bytes=(\d+)-$/);
  if (match) return new RangeBytesFromFilter(Number.parseInt(match[1]!));
  else throw `Unsupported range: ${rangeHeader}`;
}

export class RangeBytesFromFilter extends Transform {
  from: number;
  count: number = 0;

  constructor(f: number) {
    super();
    this.from = f;
  }

  _transform(chunk: any, _: BufferEncoding, next: TransformCallback) {
    if (this.count + chunk.length <= this.from) {
      // before start
      next();
    } else if (this.from <= this.count) {
      // off the end
      next(null, chunk);
    } else {
      // from somewhere in chunk
      next(null, chunk.slice(this.from - this.count));
    }
    this.count = this.count + chunk.length;
  }

  range = (number: number) => `${this.from}-${number - 1}/${number}`;
}

function server(
  sonos: Sonos,
  service: Service,
  bonobUrl: URLBuilder,
  musicService: MusicService,
  linkCodes: LinkCodes = new InMemoryLinkCodes(),
  accessTokens: AccessTokens = new AccessTokenPerAuthToken(),
  clock: Clock = SystemClock,
  applyContextPath = true
): Express {
  const app = express();

  app.use(morgan("combined"));
  app.use(express.urlencoded({ extended: false }));

  // todo: pass options in here?
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
          registerRoute: bonobUrl.append({ pathname: REGISTER_ROUTE }).pathname(),
        });
      }
    );
  });

  app.post(REGISTER_ROUTE, (_, res) => {
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
      loginRoute: bonobUrl.append({ pathname: LOGIN_ROUTE }).pathname(),
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
            ).join("")}
          </imageSizeMap>
        </Match>
      </PresentationMap>
      <PresentationMap type="Search">
        <Match>
          <SearchCategories>
              <Category id="artists"/>
              <Category id="albums"/>
              <Category id="tracks"/>
          </SearchCategories>
        </Match>
      </PresentationMap>
    </Presentation>`);
  });

  app.get("/stream/track/:id", async (req, res) => {
    const id = req.params["id"]!;
    logger.info(
      `-> /stream/track/${id}, headers=${JSON.stringify(req.headers)}`
    );
    const authToken = pipe(
      req.header(BONOB_ACCESS_TOKEN_HEADER),
      O.fromNullable,
      O.map((accessToken) => accessTokens.authTokenFor(accessToken)),
      O.getOrElseW(() => undefined)
    );
    if (!authToken) {
      return res.status(401).send();
    } else {
      return musicService
        .login(authToken)
        .then((it) =>
          it
            .stream({
              trackId: id,
              range: req.headers["range"] || undefined,
            })
            .then((stream) => ({ musicLibrary: it, stream }))
        )
        .then(({ musicLibrary, stream }) => {
          logger.info(
            `stream response from music service for ${id}, status=${
              stream.status
            }, headers=(${JSON.stringify(stream.headers)})`
          );

          const respondWith = ({
            status,
            filter,
            headers,
            sendStream,
            nowPlaying,
          }: {
            status: number;
            filter: Transform;
            headers: Record<string, string | undefined>;
            sendStream: boolean;
            nowPlaying: boolean;
          }) => {
            logger.info(
              `<- /stream/track/${id}, status=${status}, headers=${JSON.stringify(
                headers
              )}`
            );
            (nowPlaying
              ? musicLibrary.nowPlaying(id)
              : Promise.resolve(true)
            ).then((_) => {
              res.status(status);
              Object.entries(stream.headers)
                .filter(([_, v]) => v !== undefined)
                .forEach(([header, value]) => res.setHeader(header, value));
              if (sendStream) stream.stream.pipe(filter).pipe(res);
              else res.send();
            });
          };

          if (stream.status == 200) {
            respondWith({
              status: 200,
              filter: new PassThrough(),
              headers: {
                "content-type": stream.headers["content-type"],
                "content-length": stream.headers["content-length"],
                "accept-ranges": stream.headers["accept-ranges"],
              },
              sendStream: req.method == "GET",
              nowPlaying: req.method == "GET",
            });
          } else if (stream.status == 206) {
            respondWith({
              status: 206,
              filter: new PassThrough(),
              headers: {
                "content-type": stream.headers["content-type"],
                "content-length": stream.headers["content-length"],
                "content-range": stream.headers["content-range"],
                "accept-ranges": stream.headers["accept-ranges"],
              },
              sendStream: req.method == "GET",
              nowPlaying: req.method == "GET",
            });
          } else {
            respondWith({
              status: stream.status,
              filter: new PassThrough(),
              headers: {},
              sendStream: req.method == "GET",
              nowPlaying: false,
            });
          }
        });
    }
  });

  app.get("/:type/:id/art/size/:size", (req, res) => {
    const authToken = accessTokens.authTokenFor(
      req.query[BONOB_ACCESS_TOKEN_HEADER] as string
    );
    const type = req.params["type"]!;
    const id = req.params["id"]!;
    const size = Number.parseInt(req.params["size"]!);
    if (!authToken) {
      return res.status(401).send();
    } else if (type != "artist" && type != "album") {
      return res.status(400).send();
    } else {
      return musicService
        .login(authToken)
        .then((it) => it.coverArt(id, type, size))
        .then((coverArt) => {
          if (coverArt) {
            res.status(200);
            res.setHeader("content-type", coverArt.contentType);
            res.send(coverArt.data);
          } else {
            res.status(404).send();
          }
        })
        .catch((e: Error) => {
          logger.error(
            `Failed fetching image ${type}/${id}/size/${size}: ${e.message}`,
            e
          );
          res.status(500).send();
        });
    }
  });

  bindSmapiSoapServiceToExpress(
    app,
    SOAP_PATH,
    bonobUrl,
    linkCodes,
    musicService,
    accessTokens,
    clock
  );

  if (applyContextPath) {
    const container = express();
    container.use(bonobUrl.path(), app);
    return container;
  } else {
    return app;
  }
}

export default server;
