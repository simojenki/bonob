import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "crypto";
import { option as O } from "fp-ts";
import { Either, left, right } from 'fp-ts/Either'
import { pipe } from "fp-ts/lib/function";
import jws from "jws";

const ALGORITHM = "aes-256-gcm";

export type Hash = {
  readonly iv: string;
  readonly encryptedData: string;
};

export type Encryption = {
  readonly encrypt: (value: string) => string;
  readonly decrypt: (value: string) => Either<string, string>;
};

export const jwsSign = (secret: string): Encryption => {
  return {
    encrypt: (value: string) => jws.sign({
      header: { alg: 'HS256' },
      payload: value,
      secret: secret,
    }),
    decrypt: (value: string) => pipe(
      jws.decode(value),
      O.fromNullable,
      O.map(it => it.payload),
      O.match(
        () => left("Failed to decrypt jws"),
        (payload) => right(payload)
      )
    )
  }
}

export const cryptoEncryption = (secret: string): Encryption => {
  const key = createHash("sha256")
    .update(secret)
    .digest();

  return {
    encrypt: (value: string) => {
      const iv = randomBytes(12);

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

export default jwsSign;
