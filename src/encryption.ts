import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-cbc"
const IV = randomBytes(16);
const KEY = randomBytes(32);

export type Hash = {
  iv: string,
  encryptedData: string
}

export type Encryption = {
  encrypt: (value:string) => Hash
  decrypt: (hash: Hash) => string
}

const encryption = (): Encryption => {
  return {
    encrypt: (value: string) => {
      const cipher = createCipheriv(ALGORITHM, KEY, IV);
      return { 
        iv: IV.toString("hex"), 
        encryptedData: Buffer.concat([cipher.update(value), cipher.final()]).toString("hex") 
      };
    },
    decrypt: (hash: Hash) => {
      const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(hash.iv, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(hash.encryptedData, 'hex')), decipher.final()]).toString();
    }
  }
}

export default encryption;
