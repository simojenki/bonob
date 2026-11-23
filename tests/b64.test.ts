import { b64Encode, b64Decode } from "../src/b64";

describe("b64", () => {
    const value = "foobar100";
    const encoded = Buffer.from(value).toString("base64");

    describe("encode", () => {
        it("should encode", () => {
            expect(b64Encode(value)).toEqual(encoded);
        });
    });
    describe("decode", () => {
        it("should decode", () => {
            expect(b64Decode(encoded)).toEqual(value);
        });
    });
    describe("non-ASCII values", () => {
        const nonAscii = "Música dö ゴジラ";

        it("should round trip", () => {
            expect(b64Decode(b64Encode(nonAscii))).toEqual(nonAscii);
        });
    });
});