import * as A from "fp-ts/Array";
import { pipe } from "fp-ts/lib/function";
import { option as O } from "fp-ts";
import _ from "underscore";

export type LANG = "en-US" | "nl-NL";
export type KEY =
  | "AppLinkMessage"
  | "artists"
  | "albums"
  | "playlists"
  | "genres"
  | "random"
  | "starred"
  | "recentlyAdded"
  | "recentlyPlayed"
  | "mostPlayed"
  | "tracks"
  | "success"
  | "failure"
  | "expectedConfig"
  | "existingServiceConfig"
  | "noExistingServiceRegistration"
  | "register"
  | "removeRegistration"
  | "devices"
  | "services"
  | "login"
  | "logInToBonob"
  | "username"
  | "password"
  | "successfullyRegistered"
  | "registrationFailed"
  | "successfullyRemovedRegistration"
  | "failedToRemoveRegistration"
  | "invalidLinkCode"
  | "loginSuccessful"
  | "loginFailed";

const translations: Record<LANG, Record<KEY, string>> = {
  "en-US": {
    AppLinkMessage: "Linking sonos with $BONOB_SONOS_SERVICE_NAME",
    artists: "Artists",
    albums: "Albums",
    tracks: "Tracks",
    playlists: "Playlists",
    genres: "Genres",
    random: "Random",
    starred: "Starred",
    recentlyAdded: "Recently added",
    recentlyPlayed: "Recently played",
    mostPlayed: "Most played",
    success: "Success",
    failure: "Failure",
    expectedConfig: "Expected configuration",
    existingServiceConfig: "Existing service configuration",
    noExistingServiceRegistration: "No existing service registration",
    register: "Register",
    removeRegistration: "Remove registration",
    devices: "Devices",
    services: "Services",
    login: "Login",
    logInToBonob: "Log in to $BONOB_SONOS_SERVICE_NAME",
    username: "Username",
    password: "Password",
    successfullyRegistered: "Successfully registered",
    registrationFailed: "Registration failed!",
    successfullyRemovedRegistration: "Successfully removed registration",
    failedToRemoveRegistration: "Failed to remove registration!",
    invalidLinkCode: "Invalid linkCode!",
    loginSuccessful: "Login successful!",
    loginFailed: "Login failed!",
  },
  "nl-NL": {
    AppLinkMessage: "Sonos koppelen aan $BONOB_SONOS_SERVICE_NAME",
    artists: "Artiesten",
    albums: "Albums",
    tracks: "Nummers",
    playlists: "Afspeellijsten",
    genres: "Genres",
    random: "Willekeurig",
    starred: "Favorieten",
    recentlyAdded: "Onlangs toegevoegd",
    recentlyPlayed: "Onlangs afgespeeld",
    mostPlayed: "Meest afgespeeld",
    success: "Gelukt",
    failure: "Mislukt",
    expectedConfig: "Verwachte configuratie",
    existingServiceConfig: "Bestaande serviceconfiguratie",
    noExistingServiceRegistration: "Geen bestaande serviceregistratie",
    register: "Registreren",
    removeRegistration: "Verwijder registratie",
    devices: "Apparaten",
    services: "Services",
    login: "Inloggen",
    logInToBonob: "Login op $BONOB_SONOS_SERVICE_NAME",
    username: "Gebruikersnaam",
    password: "Wachtwoord",
    successfullyRegistered: "Registratie geslaagd",
    registrationFailed: "Registratie mislukt!",
    successfullyRemovedRegistration: "Registratie succesvol verwijderd",
    failedToRemoveRegistration: "Kon registratie niet verwijderen!",
    invalidLinkCode: "Ongeldige linkcode!",
    loginSuccessful: "Inloggen gelukt!",
    loginFailed: "Inloggen mislukt!",
  },
};

const translationsLookup = Object.keys(translations).reduce((lookups, lang) => {
  lookups.set(lang, translations[lang as LANG]);
  lookups.set(lang.toLocaleLowerCase(), translations[lang as LANG]);
  lookups.set(lang.toLocaleLowerCase().split("-")[0]!, translations[lang as LANG]);
  return lookups;
}, new Map<string, Record<KEY, string>>())

export const randomLang = () => _.shuffle(["en-US", "nl-NL"])[0]!;

export const asLANGs = (acceptLanguageHeader: string | undefined) =>
  pipe(
    acceptLanguageHeader,
    O.fromNullable,
    O.map((it) => it.split(";")),
    O.map((it) => it.shift() || ""),
    O.map((it) =>
      pipe(
        it.split(","),
        A.map((it) => it.trim()),
        A.filter((it) => it != "")
      )
    ),
    O.getOrElseW(() => [])
  );

export type I8N = (...langs: string[]) => Lang;

export type Lang = (key: KEY) => string;

export const langs = () => Object.keys(translations);

export const keys = (lang: LANG = "en-US") => Object.keys(translations[lang]);

export default (serviceName: string): I8N =>
  (...langs: string[]): Lang => {
    const langToUse = 
      langs.map((l) => translationsLookup.get(l as LANG)).find((it) => it) ||
      translations["en-US"];
    return (key: KEY) => {
      const value = langToUse[key]?.replace(
        "$BONOB_SONOS_SERVICE_NAME",
        serviceName
      );
      if (value) return value;
      else throw `No translation found for ${langs}:${key}`;
    };
  };
