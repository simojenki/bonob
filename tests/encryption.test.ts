import { left, right } from 'fp-ts/Either'

import { cryptoEncryption, jwsSign } from '../src/encryption';

describe("jwsSign", () => {
  it("can encode and decode", () => {
    const e = jwsSign("secret squirrel");

    const value = "bobs your uncle"
    const hash = e.encrypt(value)
    expect(hash).not.toContain(value);
    expect(e.decrypt(hash)).toEqual(right(value));
  });

  it("returns different values for different secrets", () => {
    const e1 = jwsSign("e1");
    const e2 = jwsSign("e2");

    const value = "bobs your uncle"
    const h1 = e1.encrypt(value)
    const h2 = e2.encrypt(value)

    expect(h1).not.toEqual(h2);
  });
})

describe("cryptoEncryption", () => {
  it("can encrypt and decrypt", () => {
    const e = cryptoEncryption("secret squirrel");

    const value = "bobs your uncle"
    const hash = e.encrypt(value)
    expect(hash).not.toContain(value);
    expect(e.decrypt(hash)).toEqual(right(value));
  });

  it("returns different values for different secrets", () => {
    const e1 = cryptoEncryption("e1");
    const e2 = cryptoEncryption("e2");

    const value = "bobs your uncle"
    const h1 = e1.encrypt(value)
    const h2 = e2.encrypt(value)

    expect(h1).not.toEqual(h2);
  });
  
  it("should return left on invalid value", () => {
    const e = cryptoEncryption("secret squirrel");

    expect(e.decrypt("not-valid")).toEqual(left("Invalid value to decrypt"));
  });
})
