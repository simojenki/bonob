import crypto from "crypto";
import { Express } from "express";
import { listen } from "soap";
import { readFileSync } from "fs";
import path from "path";
import logger from "./logger";

import { LinkCodes } from "./link_codes";
import { Artist, MusicLibrary, MusicService } from "./music_service";

export const LOGIN_ROUTE = "/login";
export const SOAP_PATH = "/ws/sonos";
export const STRINGS_ROUTE = "/sonos/strings.xml";
export const PRESENTATION_MAP_ROUTE = "/sonos/presentationMap.xml";

const WSDL_FILE = path.resolve(
  __dirname,
  "Sonoswsdl-1.19.4-20190411.142401-3.wsdl"
);

export type Credentials = {
  loginToken: {
    token: string;
    householdId: string;
  };
  deviceId: string;
  deviceProvider: string;
};

export type GetAppLinkResult = {
  getAppLinkResult: {
    authorizeAccount: {
      appUrlStringId: string;
      deviceLink: { regUrl: string; linkCode: string; showLinkCode: boolean };
    };
  };
};

export type GetDeviceAuthTokenResult = {
  getDeviceAuthTokenResult: {
    authToken: string;
    privateKey: string;
    userInfo: {
      nickname: string;
      userIdHashCode: string;
    };
  };
};

export type MediaCollection = {
  id: string;
  itemType: "collection";
  title: string;
};

export type GetMetadataResponse = {
  getMetadataResult: {
    count: number;
    index: number;
    total: number;
    mediaCollection: MediaCollection[];
  };
};

export function getMetadataResult({
  mediaCollection,
  index,
  total,
}: {
  mediaCollection: any[] | undefined;
  index: number;
  total: number;
}): GetMetadataResponse {
  return {
    getMetadataResult: {
      count: mediaCollection?.length || 0,
      index,
      total,
      mediaCollection: mediaCollection || [],
    },
  };
}

class SonosSoap {
  linkCodes: LinkCodes;
  webAddress: string;

  constructor(webAddress: string, linkCodes: LinkCodes) {
    this.webAddress = webAddress;
    this.linkCodes = linkCodes;
  }

  getAppLink(): GetAppLinkResult {
    const linkCode = this.linkCodes.mint();
    return {
      getAppLinkResult: {
        authorizeAccount: {
          appUrlStringId: "AppLinkMessage",
          deviceLink: {
            regUrl: `${this.webAddress}${LOGIN_ROUTE}?linkCode=${linkCode}`,
            linkCode: linkCode,
            showLinkCode: false,
          },
        },
      },
    };
  }

  getDeviceAuthToken({
    linkCode,
  }: {
    linkCode: string;
  }): GetDeviceAuthTokenResult {
    const association = this.linkCodes.associationFor(linkCode);
    if (association) {
      return {
        getDeviceAuthTokenResult: {
          authToken: association.authToken,
          privateKey: "",
          userInfo: {
            nickname: association.nickname,
            userIdHashCode: crypto
              .createHash("sha256")
              .update(association.userId)
              .digest("hex"),
          },
        },
      };
    } else {
      throw {
        Fault: {
          faultcode: "Client.NOT_LINKED_RETRY",
          faultstring: "Link Code not found retry...",
          detail: {
            ExceptionInfo: "NOT_LINKED_RETRY",
            SonosError: "5",
          },
        },
      };
    }
  }
}

export type Container = {
  itemType: "container";
  id: string;
  title: string;
};

export const container = ({
  id,
  title,
}: {
  id: string;
  title: string;
}): Container => ({
  itemType: "container",
  id,
  title,
});

type SoapyHeaders = {
  credentials?: Credentials;
};

function bindSmapiSoapServiceToExpress(
  app: Express,
  soapPath: string,
  webAddress: string,
  linkCodes: LinkCodes,
  musicService: MusicService
) {
  const sonosSoap = new SonosSoap(webAddress, linkCodes);
  const soapyService = listen(
    app,
    soapPath,
    {
      Sonos: {
        SonosSoap: {
          getAppLink: () => sonosSoap.getAppLink(),
          getDeviceAuthToken: ({ linkCode }: { linkCode: string }) =>
            sonosSoap.getDeviceAuthToken({ linkCode }),
          getMetadata: async (
            {
              id,
              index,
              count,
            }: // recursive,
            { id: string; index: number; count: number; recursive: boolean },
            _,
            headers?: SoapyHeaders
          ) => {
            if (!headers?.credentials) {
              throw {
                Fault: {
                  faultcode: "Client.LoginUnsupported",
                  faultstring: "Missing credentials...",
                },
              };
            }
            const login = await musicService
              .login(headers.credentials.loginToken.token)
              .catch((_) => {
                throw {
                  Fault: {
                    faultcode: "Client.LoginUnauthorized",
                    faultstring: "Credentials not found...",
                  },
                };
              });

            const musicLibrary = login as MusicLibrary;

            const [type, typeId] = id.split(":");
            const paging = { _index: index, _count: count };
            logger.debug(`Fetching type=${type}, typeId=${typeId}`);
            switch (type) {
              case "root":
                return getMetadataResult({
                  mediaCollection: [
                    container({ id: "artists", title: "Artists" }),
                    container({ id: "albums", title: "Albums" }),
                  ],
                  index: 0,
                  total: 2,
                });
              case "artists":
                return await musicLibrary
                  .artists(paging)
                  .then(({ results, total }: { results: Artist[], total: number}) =>
                    getMetadataResult({
                      mediaCollection: results.map((it) =>
                        container({
                          id: `artist:${it.id}`,
                          title: it.name,
                        })
                      ),
                      index: paging._index,
                      total,
                    })
                  );
              case "albums":
                return await musicLibrary
                  .albums(paging)
                  .then(({ results, total }: { results: Artist[], total: number}) =>
                    getMetadataResult({
                      mediaCollection: results.map((it) =>
                        container({
                          id: `album:${it.id}`,
                          title: it.name,
                        })
                      ),
                      index: paging._index,
                      total,
                    })
                  );
              default:
                throw `Unsupported id:${id}`;
            }
          },
        },
      },
    },
    readFileSync(WSDL_FILE, "utf8")
  );

  soapyService.log = (type, data) => {
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
}

export default bindSmapiSoapServiceToExpress;
