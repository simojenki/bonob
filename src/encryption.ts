import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
} from "crypto";
import { Either, left, right } from 'fp-ts/Either'

const ALGORITHM = "aes-256-gcm";

export type Hash = {
  readonly iv: string;
  readonly encryptedData: string;
};

export type Encryption = {
  readonly encrypt: (value: string) => string;
  readonly decrypt: (value: string) => Either<string, string>;
};

export const cryptoEncryption = (secret: string): Encryption => {
  const key = createHash("sha256")
    .update(secret)
    .digest();
  const ivKey = createHash("sha256")
    .update(`iv:${secret}`)
    .digest();

  return {
    encrypt: (value: string) => {
      // Derived from the value rather than random: the same value always encrypts the same way,
      // so art URLs stay cacheable, while different values never share an IV.
      const iv = createHmac("sha256", ivKey).update(value).digest().subarray(0, 12);

      const cipher = createCipheriv(ALGORITHM, key, iv);

      const ciphertext = Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
      ]);

      const tag = cipher.getAuthTag();

      return [
        iv.toString("hex"),
        tag.toString("hex"),
        ciphertext.toString("hex"),
      ].join(".");
    },
    decrypt: (value: string) => {
      try {
        const [ivHex, tagHex, ciphertextHex] = value.split(".");

        if (!ivHex || !tagHex || !ciphertextHex) {
          return left("Invalid value to decrypt");
        }

        const iv = Buffer.from(ivHex, "hex");
        const tag = Buffer.from(tagHex, "hex");
        const ciphertext = Buffer.from(ciphertextHex, "hex");

        const decipher = createDecipheriv(
          ALGORITHM,
          key,
          iv,
        );

        decipher.setAuthTag(tag);

        const plaintext = Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]).toString("utf8");

        return right(plaintext);
      } catch {
        return left("Invalid value to decrypt");
      }
    },
  };
};
