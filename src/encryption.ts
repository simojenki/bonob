import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "crypto";

import jws from "jws";

const ALGORITHM = "aes-256-cbc";
const IV = randomBytes(16);


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
    decrypt: (value: string) => jws.decode(value)!.payload
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
