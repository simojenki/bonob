import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "crypto";
import jwt from "jsonwebtoken";
import jws from "jws";

const ALGORITHM = "aes-256-cbc";
const IV = randomBytes(16);

function isError(thing: any): thing is Error {
  return thing.name && thing.message
}

export type Signer = {
  sign: (value: string) => string;
  verify: (token: string) => string;
};

export const pSigner = (signer: Signer) => ({
  sign: (value: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        return resolve(signer.sign(value));
      } catch(e) {
        if(isError(e)) reject(e.message)
        else reject(`Failed to sign value: ${e}`);
      }
    });
  },
  verify: (token: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        return resolve(signer.verify(token));
      }catch(e) {
        if(isError(e)) reject(e.message)
        else reject(`Failed to verify value: ${e}`);
      }
    });
  }
 });

export const jwtSigner = (secret: string) => ({
  sign: (value: string) => jwt.sign(value, secret),
  verify: (token: string) => {
    try {
      return jwt.verify(token, secret) as string;
    } catch (e) {
      throw new Error(`Failed to verify jwt, try re-authorising account within sonos app`);
    }
  },
});

export type Hash = {
  iv: string;
  encryptedData: string;
};

export type Encryption = {
  encrypt: (value: string) => string;
  decrypt: (value: string) => string;
};

export const jwsEncryption = (secret: string): Encryption => {
  return {
    encrypt: (value: string) => jws.sign({
      header: { alg: 'HS256' },
      payload: value,
      secret: secret,
    }),
    decrypt: (value: string) => jws.decode(value).payload
  }
}

export const cryptoEncryption = (secret: string): Encryption => {
  const key = createHash("sha256")
    .update(String(secret))
    .digest("base64")
    .substr(0, 32);
  return {
    encrypt: (value: string) => {
      const cipher = createCipheriv(ALGORITHM, key, IV);
      return `${IV.toString("hex")}.${Buffer.concat([
        cipher.update(value),
        cipher.final(),
      ]).toString("hex")}`;
    },
    decrypt: (value: string) => {
      const parts = value.split(".");
      if(parts.length != 2) throw `Invalid value to decrypt`;

      const decipher = createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(parts[0]!, "hex")
      );
      return Buffer.concat([
        decipher.update(Buffer.from(parts[1]!, "hex")),
        decipher.final(),
      ]).toString();
    },
  };
};

export default jwsEncryption;
