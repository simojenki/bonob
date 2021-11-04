import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "crypto";
import jwt from "jsonwebtoken";

const ALGORITHM = "aes-256-cbc";
const IV = randomBytes(16);

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
        reject(`Failed to sign value: ${e}`);
      }
    });
  },
  verify: (token: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        return resolve(signer.verify(token));
      }catch(e) {
        reject(`Failed to verify value: ${e}`);
      }
    });
  }
 });

export const jwtTokenSigner = (secret: string) => ({
  sign: (value: string) => jwt.sign(value, secret),
  verify: (token: string) => {
    try {
      return jwt.verify(token, secret) as string;
    } catch (e) {
      throw `Failed to decode jwt, try re-authorising account`;
    }
  },
});

export type Hash = {
  iv: string;
  encryptedData: string;
};

export type Encryption = {
  encrypt: (value: string) => Hash;
  decrypt: (hash: Hash) => string;
};

const encryption = (secret: string): Encryption => {
  const key = createHash("sha256")
    .update(String(secret))
    .digest("base64")
    .substr(0, 32);
  return {
    encrypt: (value: string) => {
      const cipher = createCipheriv(ALGORITHM, key, IV);
      return {
        iv: IV.toString("hex"),
        encryptedData: Buffer.concat([
          cipher.update(value),
          cipher.final(),
        ]).toString("hex"),
      };
    },
    decrypt: (hash: Hash) => {
      const decipher = createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(hash.iv, "hex")
      );
      return Buffer.concat([
        decipher.update(Buffer.from(hash.encryptedData, "hex")),
        decipher.final(),
      ]).toString();
    },
  };
};

export default encryption;
