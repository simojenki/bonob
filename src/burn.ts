import _ from "underscore";
import { createUrnUtil } from "urn-lib";
import randomstring from "randomstring";
import { pipe } from "fp-ts/lib/function";
import { either as E } from "fp-ts";

import jwsEncryption from "./encryption";

const BURN = createUrnUtil("bnb", {
  components: ["system", "resource"],
  separator: ":",
  allowEmpty: false,
});

export type BUrn = {
  system: string;
  resource: string;
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
  "encrypted": "x"
}
const REVERSE_SHORTHAND_MAPPINGS: Record<string, string> = Object.keys(SHORTHAND_MAPPINGS).reduce((ret, key) => {
  ret[SHORTHAND_MAPPINGS[key] as unknown as string] = key;
  return ret;
}, {} as Record<string, string>)
if(SHORTHAND_MAPPINGS.length != REVERSE_SHORTHAND_MAPPINGS.length) {
  throw `Invalid SHORTHAND_MAPPINGS, must be duplicate!`
}

export const BURN_SALT = randomstring.generate(5);
const encryptor = jwsEncryption(BURN_SALT);

export const format = (
  burn: BUrn,
  opts: Partial<{ shorthand: boolean; encrypt: boolean }> = {}
): string => {
  const o = { ...DEFAULT_FORMAT_OPTS, ...opts }
  let toBurn = burn;
  if(o.shorthand) {
    toBurn = {
      ...toBurn,
      system: SHORTHAND_MAPPINGS[toBurn.system] || toBurn.system
    }
  }
  if(o.encrypt) {
    const encryptedToBurn = {
      system: "encrypted",
      resource: encryptor.encrypt(BURN.format(toBurn))
    }
    return format(encryptedToBurn, { ...opts, encrypt: false })
  } else {
    return BURN.format(toBurn);
  }
};

export const formatForURL = (burn: BUrn) => {
  if(burn.system == "external") return format(burn, { shorthand: true, encrypt: true })
  else return format(burn, { shorthand: true })
}

export const parse = (burn: string): BUrn => {
  const result = BURN.parse(burn)!;
  const validationErrors = BURN.validate(result) || [];
  if (validationErrors.length > 0) {
    throw new Error(`Invalid burn: '${burn}'`);
  }
  const system = result.system as string;
  const x = {
    system: REVERSE_SHORTHAND_MAPPINGS[system] || system,
    resource: result.resource as string,
  };
  if(x.system == "encrypted") {
    return pipe(
      encryptor.decrypt(x.resource),
      E.match(
        (err) => { throw new Error(err) },
        (z) => parse(z)
      )
    );
  } else {
    return x;
  }
}

export function assertSystem(urn: BUrn, system: string): BUrn {
  if (urn.system != system) throw `Unsupported urn: '${format(urn)}'`;
  else return urn;
}