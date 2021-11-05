import { cryptoEncryption, jwsEncryption } from '../src/encryption';

describe("jwsEncryption", () => {
  it("can encrypt and decrypt", () => {
    const e = jwsEncryption("secret squirrel");

    const value = "bobs your uncle"
    const hash = e.encrypt(value)
    expect(hash).not.toContain(value);
    expect(e.decrypt(hash)).toEqual(value);
  });

  it("returns different values for different secrets", () => {
    const e1 = jwsEncryption("e1");
    const e2 = jwsEncryption("e2");

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
    expect(e.decrypt(hash)).toEqual(value);
  });

  it("returns different values for different secrets", () => {
    const e1 = cryptoEncryption("e1");
    const e2 = cryptoEncryption("e2");

    const value = "bobs your uncle"
    const h1 = e1.encrypt(value)
    const h2 = e2.encrypt(value)

    expect(h1).not.toEqual(h2);
  });
})
