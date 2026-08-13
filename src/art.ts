import _ from "underscore";
import { generateRandomString } from "./random";
import { pipe } from "fp-ts/lib/function";
import { either as E } from "fp-ts";

import jwsEncryption from "./encryption";

export type Art = {
  source: string;
  id: string;
};

// Tiny URN serializer/parser for the "bnb:<source>:<id>" format
// previously provided by urn-lib. Components are non-empty; id may
// contain ":" since we only split on the first two.
const ArtUtils = {
  asString: ({ source, id }: Art): string =>
    `bnb:${source}:${id}`,
  fromString: (s: string): Art | undefined => {
    const m = s.match(/^bnb:([^:]+):(.+)$/);
    return m ? { source: m[1]!, id: m[2]! } : undefined;
  },
  validate: (b: Art | undefined): string[] | undefined => {
    if (!b) return ["invalid format"];
    if (!b.source || !b.id) return ["empty component"];
    return undefined;
  },
};

const DEFAULT_FORMAT_OPTS = {
  shorthand: false,
  encrypt: false,
}

const SHORTHAND_MAPPINGS: Record<string, string> = {
  "internal" : "i",
  "external": "e",
  "subsonic": "s",
  "navidrome": "n",
  "encrypted": "c"
}
const REVERSE_SHORTHAND_MAPPINGS: Record<string, string> = Object.keys(SHORTHAND_MAPPINGS).reduce((ret, key) => {
  ret[SHORTHAND_MAPPINGS[key] as unknown as string] = key;
  return ret;
}, {} as Record<string, string>)
if(SHORTHAND_MAPPINGS.length != REVERSE_SHORTHAND_MAPPINGS.length) {
  throw `Invalid SHORTHAND_MAPPINGS, must be duplicate!`
}

export const ART_SALT = generateRandomString(5);
const encryptor = jwsEncryption(ART_SALT);

export const format = (
  art: Art,
  opts: Partial<{ shorthand: boolean; encrypt: boolean }> = {}
): string => {
  const optsToUse = { ...DEFAULT_FORMAT_OPTS, ...opts }
  let toFormat = art;
  if(optsToUse.shorthand) {
    toFormat = {
      ...toFormat,
      source: SHORTHAND_MAPPINGS[toFormat.source] || toFormat.source
    }
  }
  if(optsToUse.encrypt) {
    return format(
      { source: "encrypted", id: encryptor.encrypt(ArtUtils.asString(toFormat)) }, 
      { ...opts, encrypt: false }
    )
  } else {
    return ArtUtils.asString(toFormat);
  }
};

export const formatForURL = (art: Art) => {
  if(art.source == "external") return format(art, { shorthand: true, encrypt: true })
  else return format(art, { shorthand: true })
}

export const parse = (art: string): Art => {
  const result = ArtUtils.fromString(art)!;
  const validationErrors = ArtUtils.validate(result) || [];
  if (validationErrors.length > 0) {
    throw new Error(`Invalid art: '${art}'`);
  }
  const source = result.source as string;
  const x = {
    source: REVERSE_SHORTHAND_MAPPINGS[source] || source,
    id: result.id as string,
  };
  if(x.source == "encrypted") {
    return pipe(
      encryptor.decrypt(x.id),
      E.match(
        (err) => { throw new Error(err) },
        (z) => parse(z)
      )
    );
  } else {
    return x;
  }
}

export function assertSource(urn: Art, source: string): Art {
  if (urn.source != source) throw `Unsupported urn: '${format(urn)}'`;
  else return urn;
}
