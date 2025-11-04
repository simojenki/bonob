import { either as E, taskEither as TE } from "fp-ts";
import express, { Express, Request } from "express";
import * as Eta from "eta";
import path from "path";
import sharp from "sharp";
import { v4 as uuid } from "uuid";
import dayjs from "dayjs";

import { PassThrough, Transform, TransformCallback } from "stream";

import { Sonos, Service, SONOS_LANG } from "./sonos";
import {
  SOAP_PATH,
  STRINGS_ROUTE,
  PRESENTATION_MAP_ROUTE,
  SONOS_RECOMMENDED_IMAGE_SIZES,
  LOGIN_ROUTE,
  CREATE_REGISTRATION_ROUTE,
  REMOVE_REGISTRATION_ROUTE,
  sonosifyMimeType,
  ratingFromInt,
  ratingAsInt,
  splitId,
  shouldScrobble
} from "./smapi";
import { LinkCodes, InMemoryLinkCodes } from "./link_codes";
import { MusicService, AuthFailure, AuthSuccess } from "./music_service";
import bindSmapiSoapServiceToExpress from "./smapi";
import { APITokens, InMemoryAPITokens } from "./api_tokens";
import logger from "./logger";
import { Clock, SystemClock } from "./clock";
import { pipe } from "fp-ts/lib/function";
import { URLBuilder } from "./url_builder";
import makeI8N, { asLANGs, KEY, keys as i8nKeys, LANG } from "./i8n";
import { Icon, ICONS, festivals, features, no_festivals } from "./icon";
import { DEFAULT_LOGIN_THEME } from './config'
import _ from "underscore";
import morgan from "morgan";
import { parse } from "./burn";
import { axiosImageFetcher, ImageFetcher } from "./subsonic";
import {
  JWTSmapiLoginTokens,
  SmapiAuthTokens,
} from "./smapi_auth";

export const BONOB_ACCESS_TOKEN_HEADER = "bat";

interface RangeFilter extends Transform {
  range: (length: number) => string;
}

type TimePlayed = {
  items: {
      mediaUrl: string,
      type: "update" | "final"
      durationPlayedMillis: number
  }[]
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

export type ServerOpts = {
  linkCodes: () => LinkCodes;
  apiTokens: () => APITokens;
  clock: Clock;
  iconColors: {
    foregroundColor: string | undefined;
    backgroundColor: string | undefined;
  };
  applyContextPath: boolean;
  logRequests: boolean;
  version: string;
  smapiAuthTokens: SmapiAuthTokens;
  externalImageResolver: ImageFetcher;
  loginTheme: string;
};

const DEFAULT_SERVER_OPTS: ServerOpts = {
  linkCodes: () => new InMemoryLinkCodes(),
  apiTokens: () => new InMemoryAPITokens(),
  clock: SystemClock,
  iconColors: { foregroundColor: undefined, backgroundColor: undefined },
  applyContextPath: true,
  logRequests: false,
  version: "v?",
  smapiAuthTokens: new JWTSmapiLoginTokens(
    SystemClock,
    `bonob-${uuid()}`,
    "1m"
  ),
  externalImageResolver: axiosImageFetcher,
  loginTheme: DEFAULT_LOGIN_THEME
};

function server(
  sonos: Sonos,
  service: Service,
  bonobUrl: URLBuilder,
  musicService: MusicService,
  opts: Partial<ServerOpts> = {}
): Express {
  const serverOpts = { ...DEFAULT_SERVER_OPTS, ...opts };

  const linkCodes = serverOpts.linkCodes();
  const smapiAuthTokens = serverOpts.smapiAuthTokens;
  const apiTokens = serverOpts.apiTokens();
  const clock = serverOpts.clock;
  const loginTheme = serverOpts.loginTheme || "classic"

  const startUpTime = dayjs();

  const app = express();
  const i8n = makeI8N(service.name);

  if (serverOpts.logRequests) {
    app.use(morgan("combined"));
  }
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  app.use(express.static(path.resolve(__dirname, "..", "web", "public")));
  app.engine("eta", Eta.renderFile);

  app.set("view engine", "eta");
  app.set("views", path.resolve(__dirname, "..", "web", "views"));

  app.set("query parser", "simple");

  const langFor = (req: Request) => {
    logger.debug(
      `${req.path} (req[accept-language]=${req.headers["accept-language"]})`
    );
    return i8n(...asLANGs(req.headers["accept-language"]));
  };

  app.get("/", (req, res) => {
    const lang = langFor(req);
    Promise.all([sonos.devices(), sonos.services()]).then(
      ([devices, services]) => {
        const registeredBonobService = services.find(
          (it) => it.sid == service.sid
        );
        res.render("index", {
          lang,
          devices,
          services,
          bonobService: service,
          registeredBonobService,
          createRegistrationRoute: bonobUrl
            .append({ pathname: CREATE_REGISTRATION_ROUTE })
            .pathname(),
          removeRegistrationRoute: bonobUrl
            .append({ pathname: REMOVE_REGISTRATION_ROUTE })
            .pathname(),
          version: serverOpts.version || DEFAULT_SERVER_OPTS.version,
        });
      }
    );
  });

  app.get("/about", (_, res) => {
    return res.send({
      service: {
        name: service.name,
        sid: service.sid,
      },
    });
  });

  app.post(CREATE_REGISTRATION_ROUTE, (req, res) => {
    const lang = langFor(req);
    sonos.register(service).then((success) => {
      if (success) {
        res.render("success", {
          lang,
          message: lang("successfullyRegistered"),
        });
      } else {
        res.status(500).render("failure", {
          lang,
          message: lang("registrationFailed"),
        });
      }
    });
  });

  app.post(REMOVE_REGISTRATION_ROUTE, (req, res) => {
    const lang = langFor(req);
    sonos.remove(service.sid).then((success) => {
      if (success) {
        res.render("success", {
          lang,
          message: lang("successfullyRemovedRegistration"),
        });
      } else {
        res.status(500).render("failure", {
          lang,
          message: lang("failedToRemoveRegistration"),
        });
      }
    });
  });

  app.get(LOGIN_ROUTE, (req, res) => {
    const lang = langFor(req);
    res.render(`login/${loginTheme}/login`, {
      lang,
      linkCode: req.query.linkCode,
      loginRoute: bonobUrl.append({ pathname: LOGIN_ROUTE }).pathname(),
    });
  });


  app.post(LOGIN_ROUTE, async (req, res) => {
    const lang = langFor(req);
    const { username, password, linkCode } = req.body;
    if (!linkCodes.has(linkCode)) {
      return res.status(400).render(`login/${loginTheme}/login`, {
        lang,
        status: "fail",
        message: lang("invalidLinkCode"),
        loginRoute: bonobUrl.append({ pathname: LOGIN_ROUTE }).pathname(),
      });
    } else {
      return pipe(
        musicService.generateToken({
          username,
          password,
        }),
        TE.match(
          (e: AuthFailure) => ({
            status: 403,
            template: `login/${loginTheme}/login`,
            params: {
              lang,
              status: "fail",
              message: lang("loginFailed"),
              cause: e.message,
              linkCode: linkCode,
              loginRoute: bonobUrl.append({ pathname: LOGIN_ROUTE }).pathname(),
            },
          }),
          (success: AuthSuccess) => {
            linkCodes.associate(linkCode, success);
            return {
              status: 200,
              template: `login/${loginTheme}/success`,
              params: {
                lang,
                message: lang("loginSuccessful"),
              },
            };
          }
        )
      )().then(({ status, template, params }) =>
        res.status(status).render(template, params)
      );
    }
  });

  app.get(STRINGS_ROUTE, (_, res) => {
    const stringNode = (id: string, value: string) =>
      `<string stringId="${id}"><![CDATA[${value}]]></string>`;
    const stringtableNode = (langName: string) =>
      `<stringtable rev="1" xml:lang="${langName}">${i8nKeys()
        .map((key) => stringNode(key, i8n(langName as LANG)(key as KEY)))
        .join("")}</stringtable>`;

    res.type("application/xml").send(`<?xml version="1.0" encoding="utf-8" ?>
<stringtables xmlns="http://sonos.com/sonosapi">
    ${SONOS_LANG.map(stringtableNode).join("")}
</stringtables>
`);
  });

  app.get(PRESENTATION_MAP_ROUTE, (_, res) => {
    const LastModified = startUpTime.format("HH:mm:ss D MMM YYYY");

    const nowPlayingRatingsMatch = (value: number) => {
      const rating = ratingFromInt(value);
      const nextLove = { ...rating, love: !rating.love };
      const nextStar = {
        ...rating,
        stars: rating.stars === 5 ? 0 : rating.stars + 1,
      };

      const loveRatingIcon = bonobUrl
        .append({
          pathname: rating.love ? "/love-selected.svg" : "/love-unselected.svg",
        })
        .href();
      const starsRatingIcon = bonobUrl
        .append({ pathname: `/star${rating.stars}.svg` })
        .href();

      return `<Match propname="rating" value="${value}">
        <Ratings>
          <Rating Id="${ratingAsInt(
        nextLove
      )}" AutoSkip="NEVER" OnSuccessStringId="LOVE_SUCCESS" StringId="LOVE">
            <Icon Controller="universal" LastModified="${LastModified}" Uri="${loveRatingIcon}" />
          </Rating>
          <Rating Id="${-ratingAsInt(
        nextStar
      )}" AutoSkip="NEVER" OnSuccessStringId="STAR_SUCCESS" StringId="STAR">
            <Icon Controller="universal" LastModified="${LastModified}" Uri="${starsRatingIcon}" />
          </Rating>
        </Ratings>
      </Match>`;
    };

    res.type("application/xml").send(`<?xml version="1.0" encoding="utf-8" ?>
    <Presentation>
      <BrowseOptions PageSize="30" />
      <PresentationMap type="ArtWorkSizeMap">
        <Match>
          <imageSizeMap>
            ${SONOS_RECOMMENDED_IMAGE_SIZES.map(
      (size) =>
        `<sizeEntry size="${size}" substitution="/size/${size}"/>`
    ).join("")}
          </imageSizeMap>
        </Match>
      </PresentationMap>
      <PresentationMap type="BrowseIconSizeMap">
        <Match>
          <browseIconSizeMap>
              <sizeEntry size="0" substitution="/size/legacy"/>
              ${SONOS_RECOMMENDED_IMAGE_SIZES.map(
      (size) =>
        `<sizeEntry size="${size}" substitution="/size/${size}"/>`
    ).join("")}
            </browseIconSizeMap>
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
      <PresentationMap type="NowPlayingRatings" trackEnabled="true" programEnabled="false">
        ${nowPlayingRatingsMatch(100)}
        ${nowPlayingRatingsMatch(101)}
        ${nowPlayingRatingsMatch(110)}
        ${nowPlayingRatingsMatch(111)}
        ${nowPlayingRatingsMatch(120)}
        ${nowPlayingRatingsMatch(121)}
        ${nowPlayingRatingsMatch(130)}
        ${nowPlayingRatingsMatch(131)}
        ${nowPlayingRatingsMatch(140)}
        ${nowPlayingRatingsMatch(141)}
        ${nowPlayingRatingsMatch(150)}
        ${nowPlayingRatingsMatch(151)}
      </PresentationMap>
    </Presentation>`);
  });

  app.post("/report/timePlayed", async (req, res) => {
    const serviceToken = pipe(
      E.fromNullable("Missing authorization header")(req.headers["authorization"] as string),
      E.flatMap((token) => {
        return pipe(
         smapiAuthTokens.verify({ token, key: "nonsense" }),
          E.mapLeft((_) => "Auth token failed to verify")
      )
      }),
      E.getOrElseW(() => undefined)
    );

    if (!serviceToken) {
      return res.status(401).send();
    } else {
      return musicService
        .login(serviceToken)
        .then(musicLibrary => {
          const scrobbles = (req.body as TimePlayed).items
            .filter(it => it.type == 'final')
            .map(({ mediaUrl, durationPlayedMillis }) => ({
              ...splitId(decodeURIComponent(new URL(mediaUrl).pathname).split(".")[0]!),
              durationPlayedMillis
            }))
            .map(({ type, typeId, durationPlayedMillis }) => {
              return type == "track" ? ({ trackId: typeId, durationPlayedMillis }) : null
            })
            .filter((it) => it != null)
            .map(({ trackId, durationPlayedMillis }) => 
              musicLibrary
                .track(trackId)
                .then(track => {
                  if(shouldScrobble(track, durationPlayedMillis / 1000))
                    return musicLibrary.scrobble(trackId).then(scrobbled => ({ trackId, scrobbled }))
                  else
                    return Promise.resolve({ trackId, scrobbled: false })
                })
            );
          return Promise.all(scrobbles)
        })
        .then(it => res.status(200).json({ 
          scrobbled: it.filter(scrobble => scrobble.scrobbled).length 
        }));
    }
  }),

  app.get("/stream/track/:id", async (req, res) => {
    const id = req.params["id"]!;
    const trace = uuid();
    
    logger.debug(
      `${trace} bnb<- ${req.method} ${req.path}?${JSON.stringify(
        req.query
      )}, headers=${JSON.stringify({ ...req.headers, "bnbt": "*****", "bnbk": "*****" })}`
    );

    const serviceToken = pipe(
      E.fromNullable("Missing bnbt header")(req.headers["bnbt"] as string),
      E.chain(token => pipe(
        E.fromNullable("Missing bnbk header")(req.headers["bnbk"] as string),
        E.map(key => ({ token, key }))
      )),
      E.chain((auth) =>
        pipe(
          smapiAuthTokens.verify(auth),
          E.mapLeft((_) => "Auth token failed to verify")
        )
      ),
      E.getOrElseW(() => undefined)
    )

    if (!serviceToken) {
      return res.status(401).send();
    } else {
      return musicService
        .login(serviceToken)
        .then((it) =>
          it
            .stream({
              trackId: id,
              range: req.headers["range"] || undefined,
            })
            .then((stream) => {
              res.on('close', () => {
                stream.stream.destroy()
              });
              return stream;
            })
            .then((stream) => ({ musicLibrary: it, stream }))
        )
        .then(({ musicLibrary, stream }) => {
          logger.debug(
            `${trace} bnb<- stream response from music service for ${id}, status=${stream.status}, headers=(${JSON.stringify(stream.headers)})`
          );

          const sonosisfyContentType = (contentType: string) =>
            contentType
              .split(";")
              .map((it) => it.trim())
              .map(sonosifyMimeType)
              .join("; ");

          const respondWith = ({
            status,
            filter,
            headers,
            sendStream,
            nowPlaying,
          }: {
            status: number;
            filter: Transform;
            headers: Record<string, string>;
            sendStream: boolean;
            nowPlaying: boolean;
          }) => {
            logger.debug(
              `${trace} bnb-> ${req.path}, status=${status}, headers=${JSON.stringify(headers)}`
            );
            (nowPlaying
              ? musicLibrary.nowPlaying(id)
              : Promise.resolve(true)
            ).then((_) => {
              res.status(status);
              Object.entries(headers)
                .filter(([_, v]) => v !== undefined)
                .forEach(([header, value]) => {
                  res.setHeader(header, value!);
                });
              if (sendStream) stream.stream.pipe(filter).pipe(res)
              else res.send()
            });
          };

          if (stream.status == 200) {
            respondWith({
              status: 200,
              filter: new PassThrough(),
              headers: {
                "content-type": sonosisfyContentType(
                  stream.headers["content-type"]
                ),
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
                "content-type": sonosisfyContentType(
                  stream.headers["content-type"]
                ),
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

  app.get("/icon/:type_text/size/:size", (req, res) => {
    const apply_festivals = req.query["nofest"] == null
    const match = (req.params["type_text"] || "")!.match("^([A-Za-z0-9]+)(?:\:([A-Za-z0-9]+))?$")
    if (!match)
      return res.status(400).send();
    
    const type = match[1]!
    const text = match[2]
    const size = req.params["size"]!;

    if (!Object.keys(ICONS).includes(type)) {
      return res.status(404).send();
    } else if (size != "legacy" && !SONOS_RECOMMENDED_IMAGE_SIZES.includes(size)) {
      return res.status(400).send();
    } else {
      let icon = (ICONS as any)[type]! as Icon;
      const spec =
        size == "legacy"
          ? {
            mimeType: "image/png",
            responseFormatter: (svg: string): Promise<Buffer | string> =>
              sharp(Buffer.from(svg)).resize(80).png().toBuffer(),
          }
          : {
            mimeType: "image/svg+xml",
            responseFormatter: (svg: string): Promise<Buffer | string> =>
              Promise.resolve(svg),
          };

      return Promise.resolve(
        icon
          .apply(
            features({
              ...serverOpts.iconColors,
              text: text
            })
          )
          .apply(apply_festivals ? festivals(clock) : no_festivals)
          .toString()
      )
        .then(spec.responseFormatter)
        .then((data) => res.status(200).type(spec.mimeType).send(data));
    }
  });

  app.get("/icons", (_, res) => {
    res.render("icons", {
      icons: Object.keys(ICONS).map((k) => [
        k,
        ((ICONS as any)[k] as Icon)
          .apply(
            features({
              viewPortIncreasePercent: 80,
              ...serverOpts.iconColors,
            })
          )
          .toString()
          .replace('<?xml version="1.0" encoding="UTF-8"?>', ""),
      ]),
    });
  });

  app.get("/art/:burn/size/:size", (req, res) => {
    const serviceToken = apiTokens.authTokenFor(
      req.query[BONOB_ACCESS_TOKEN_HEADER] as string
    );
    const urn = parse(req.params["burn"]!);
    const size = Number.parseInt(req.params["size"]!);

    if (!serviceToken) {
      return res.status(401).send();
    } else if (!(size > 0)) {
      return res.status(400).send();
    }

    return musicService
      .login(serviceToken)
      .then((musicLibrary) => {
        if (urn.system == "external") {
          return serverOpts.externalImageResolver(urn.resource);
        } else {
          return musicLibrary.coverArt(urn, size);
        }
      })
      .then((coverArt) => {
        if(coverArt) {
          res.status(200);
          res.setHeader("content-type", coverArt.contentType);
          return res.send(coverArt.data);
        } else {
          return res.status(404).send();
        }
    })
      .catch((e: Error) => {
        logger.error(`Failed fetching image ${urn}/size/${size}`, {
          cause: e,
        });
        return res.status(500).send();
      });
  });

  bindSmapiSoapServiceToExpress(
    app,
    SOAP_PATH,
    bonobUrl,
    linkCodes,
    musicService,
    apiTokens,
    clock,
    i8n,
    serverOpts.smapiAuthTokens
  );

  if (serverOpts.applyContextPath) {
    const container = express();
    container.use(bonobUrl.path(), app);
    return container;
  } else {
    return app;
  }
}

export default server;
