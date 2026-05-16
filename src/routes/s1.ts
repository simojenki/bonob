import { Router, Request, Response, NextFunction } from "express";
import { Sonos, Service } from "../sonos";
import { Lang } from "../i8n";
import { URLBuilder } from "../url_builder";

export const CREATE_REGISTRATION_ROUTE = "/s1/registration/add";
export const REMOVE_REGISTRATION_ROUTE = "/s1/registration/remove";

export function makeS1Router(
  sonos: Sonos,
  service: Service,
  langFor: (req: Request) => Lang,
  bonobUrl: URLBuilder,
  version: string,
  enableS1: boolean
): Router {
  const router = Router();

  router.use((_req: Request, res: Response, next: NextFunction): void => {
    if (!enableS1) {
      res
        .status(400)
        .send("S1 routes are disabled, set BNB_SONOS_ENABLE_S1=true to enable");
      return;
    }
    next();
  });

  router.get("/", (req, res) => {
    const lang = langFor(req);
    Promise.all([sonos.devices(), sonos.services()]).then(
      ([devices, services]) => {
        const registeredBonobService = services.find(
          (it) => it.sid == service.sid
        );
        res.render("s1", {
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
          version,
        });
      }
    );
  });

  router.post("/registration/add", (req, res) => {
    const lang = langFor(req);
    sonos.register(service).then((success) => {
      if (success) {
        res.render("success", { lang, message: lang("successfullyRegistered") });
      } else {
        res.status(500).render("failure", { lang, message: lang("registrationFailed") });
      }
    });
  });

  router.post("/registration/remove", (req, res) => {
    const lang = langFor(req);
    sonos.remove(service.sid).then((success) => {
      if (success) {
        res.render("success", { lang, message: lang("successfullyRemovedRegistration") });
      } else {
        res.status(500).render("failure", { lang, message: lang("failedToRemoveRegistration") });
      }
    });
  });

  return router;
}
