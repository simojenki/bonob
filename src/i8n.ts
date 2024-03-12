import * as A from "fp-ts/Array";
import { pipe } from "fp-ts/lib/function";
import { option as O } from "fp-ts";
import _ from "underscore";

export type LANG = "en-US" | "da-DK" | "de-DE" | "es-ES" | "fr-FR" | "it-IT" | "ja-JP" | "nb-NO" | "nl-NL" | "pt-BR" | "sv-SE" | "zh-CN"
export type SUPPORTED_LANG = "en-US" | "da-DK" | "fr-FR" | "nl-NL";
export type KEY =
  | "AppLinkMessage"
  | "artists"
  | "albums"
  | "internetRadio"  
  | "playlists"
  | "genres"
  | "random"
  | "topRated"
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
  | "loginFailed" 
  | "noSonosDevices" 
  | "favourites"
  | "years"
  | "LOVE"
  | "LOVE_SUCCESS"
  | "STAR" 
  | "UNSTAR"
  | "STAR_SUCCESS"
  | "UNSTAR_SUCCESS";

const translations: Record<SUPPORTED_LANG, Record<KEY, string>> = {
  "en-US": {
    AppLinkMessage: "Linking sonos with $BNB_SONOS_SERVICE_NAME",
    artists: "Artists",
    albums: "Albums",
    internetRadio: "Internet Radio",
    tracks: "Tracks",
    playlists: "Playlists",
    genres: "Genres",
    random: "Random",
    topRated: "Top Rated",
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
    logInToBonob: "Log in to $BNB_SONOS_SERVICE_NAME",
    username: "Username",
    password: "Password",
    successfullyRegistered: "Successfully registered",
    registrationFailed: "Registration failed!",
    successfullyRemovedRegistration: "Successfully removed registration",
    failedToRemoveRegistration: "Failed to remove registration!",
    invalidLinkCode: "Invalid linkCode!",
    loginSuccessful: "Login successful!",
    loginFailed: "Login failed!",
    noSonosDevices: "No sonos devices",
    favourites: "Favourites",
    years: "Years",
    STAR: "Star",
    UNSTAR: "Un-star",
    STAR_SUCCESS: "Track starred",
    UNSTAR_SUCCESS: "Track un-starred",
    LOVE: "Love",
    LOVE_SUCCESS: "Track loved"
  },
  "da-DK": {
    AppLinkMessage: "Forbinder Sonos med $BNB_SONOS_SERVICE_NAME",
    artists: "Kunstnere",
    albums: "Album",
    internetRadio: "Internet Radio",
    tracks: "Numre",
    playlists: "Afspilningslister",
    genres: "Genre",
    random: "Tilfældig",
    topRated: "Højst vurderet",
    recentlyAdded: "Senest tilføjet",
    recentlyPlayed: "Senest afspillet",
    mostPlayed: "Flest afspilninger",
    success: "Succes",
    failure: "Fejl",
    expectedConfig: "Forventet konfiguration",
    existingServiceConfig: "Eksisterende tjeneste konfiguration",
    noExistingServiceRegistration: "Ingen eksisterende tjeneste registrering",
    register: "Registrer",
    removeRegistration: "Fjern registrering",
    devices: "Enheder",
    services: "Tjenester",
    login: "Log på",
    logInToBonob: "Log på $BNB_SONOS_SERVICE_NAME",
    username: "Brugernavn",
    password: "Adgangskode",
    successfullyRegistered: "Registreret med succes",
    registrationFailed: "Registrering fejlede!",
    successfullyRemovedRegistration: "Registrering fjernet med succes",
    failedToRemoveRegistration: "FJernelse af registrering fejlede!",
    invalidLinkCode: "Ugyldig linkCode!",
    loginSuccessful: "Log på succes!",
    loginFailed: "Log på fejlede!",
    noSonosDevices: "Ingen Sonos enheder",
    favourites: "Favoritter",
    years: "Flere år",
    STAR: "Tilføj stjerne",
    UNSTAR: "Fjern stjerne",
    STAR_SUCCESS: "Stjerne tilføjet",
    UNSTAR_SUCCESS: "Stjerne fjernet",
    LOVE: "Synes godt om",
    LOVE_SUCCESS: "Syntes godt om"
  },
  "fr-FR": {
    AppLinkMessage: "Associer Sonos à $BNB_SONOS_SERVICE_NAME",
    artists: "Artistes",
    albums: "Albums",
    internetRadio: "Radio Internet",
    tracks: "Pistes",
    playlists: "Playlists",
    genres: "Genres",
    random: "Aléatoire",
    topRated: "Les mieux notés",
    recentlyAdded: "Récemment ajouté",
    recentlyPlayed: "Récemment joué",
    mostPlayed: "Les plus joué",
    success: "Succès",
    failure: "Échec",
    expectedConfig: "Configuration attendue",
    existingServiceConfig: "La configuration de service existe",
    noExistingServiceRegistration: "Aucun enregistrement de service existant",
    register: "Inscription",
    removeRegistration: "Supprimer l'inscription",
    devices: "Appareils",
    services: "Services",
    login: "Se connecter",
    logInToBonob: "Se connecter à $BNB_SONOS_SERVICE_NAME",
    username: "Nom d'utilisateur",
    password: "Mot de passe",
    successfullyRegistered: "Connecté avec succès",
    registrationFailed: "Échec de la connexion !",
    successfullyRemovedRegistration: "Inscription supprimée avec succès",
    failedToRemoveRegistration: "Échec de la suppression de l'inscription !",
    invalidLinkCode: "Code non valide !",
    loginSuccessful: "Connexion réussie !",
    loginFailed: "La connexion a échoué !",
    noSonosDevices: "Aucun appareil Sonos",
    favourites: "Favoris",
    years: "Années",
    STAR: "Suivre",
    UNSTAR: "Ne plus suivre",
    STAR_SUCCESS: "Piste suivie",
    UNSTAR_SUCCESS: "Piste non suivie",
    LOVE: "Aimer",
    LOVE_SUCCESS: "Pistes aimée"
  },
  "nl-NL": {
    AppLinkMessage: "Sonos koppelen aan $BNB_SONOS_SERVICE_NAME",
    artists: "Artiesten",
    albums: "Albums",
    internetRadio: "Internet Radio",
    tracks: "Nummers",
    playlists: "Afspeellijsten",
    genres: "Genres",
    random: "Willekeurig",
    topRated: "Best beoordeeld",
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
    logInToBonob: "Login op $BNB_SONOS_SERVICE_NAME",
    username: "Gebruikersnaam",
    password: "Wachtwoord",
    successfullyRegistered: "Registratie geslaagd",
    registrationFailed: "Registratie mislukt!",
    successfullyRemovedRegistration: "Registratie succesvol verwijderd",
    failedToRemoveRegistration: "Kon registratie niet verwijderen!",
    invalidLinkCode: "Ongeldige linkcode!",
    loginSuccessful: "Inloggen gelukt!",
    loginFailed: "Inloggen mislukt!",
    noSonosDevices: "Geen Sonos-apparaten",
    favourites: "Favorieten",
    years: "Jaren",
    STAR: "Ster ",
    UNSTAR: "Een ster",
    STAR_SUCCESS: "Nummer met ster",
    UNSTAR_SUCCESS: "Track zonder ster",
    LOVE: "Liefde",
    LOVE_SUCCESS: "Volg geliefd"
  },
};

const translationsLookup = Object.keys(translations).reduce((lookups, lang) => {
  lookups.set(lang, translations[lang as SUPPORTED_LANG]);
  lookups.set(lang.toLocaleLowerCase(), translations[lang as SUPPORTED_LANG]);
  lookups.set(lang.toLocaleLowerCase().split("-")[0]!, translations[lang as SUPPORTED_LANG]);
  return lookups;
}, new Map<string, Record<KEY, string>>())

export const randomLang = () => _.shuffle(["en-US", "nl-NL"])[0]!;

export const asLANGs = (acceptLanguageHeader: string | undefined): LANG[] =>
  pipe(
    acceptLanguageHeader,
    O.fromNullable,
    O.map((it) => it.split(";")),
    O.map((it) => it.shift() || ""),
    O.map((it) =>
      pipe(
        it.split(","),
        A.map((it) => it.trim()),
        A.filter((it) => it != ""),
        A.map(it => it as LANG)
      )
    ),
    O.getOrElseW(() => [])
  );

export type I8N = (...langs: string[]) => Lang;

export type Lang = (key: KEY) => string;

export const langs = () => Object.keys(translations);

export const keys = (lang: SUPPORTED_LANG = "en-US") => Object.keys(translations[lang]);

export default (serviceName: string): I8N =>
  (...langs: string[]): Lang => {
    const langToUse =
      langs.map((l) => translationsLookup.get(l as SUPPORTED_LANG)).find((it) => it) ||
      translations["en-US"];
    return (key: KEY) => {
      const value = langToUse[key]?.replace(
        "$BNB_SONOS_SERVICE_NAME",
        serviceName
      );
      if (value) return value;
      else throw `No translation found for ${langs}:${key}`;
    };
  };
