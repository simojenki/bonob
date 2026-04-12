import { randomBytes } from "crypto";

// Generate a random alphanumeric-ish string of the given length.
// Backed by crypto.randomBytes for cryptographic strength.
// Default length 32 matches the previous randomstring.generate() default.
export const generateRandomString = (length = 32): string =>
  randomBytes(Math.ceil(length * 0.75))
    .toString("base64url")
    .replace(/[-_]/g, "")
    .slice(0, length);
