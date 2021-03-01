import encryption from '../src/encryption';

describe("encrypt", () => {
  const e = encryption("secret squirrel");

  it("can encrypt and decrypt", () => {
    const value = "bobs your uncle"
    const hash = e.encrypt(value)
    expect(hash.encryptedData).not.toEqual(value);
    expect(e.decrypt(hash)).toEqual(value);
  });
})