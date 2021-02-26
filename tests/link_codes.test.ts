import { InMemoryLinkCodes } from "../src/link_codes"

describe("InMemoryLinkCodes", () => {
  const linkCodes = new InMemoryLinkCodes()

  describe('minting', () => {
    it('should be able to mint unique codes', () => {
      const code1 = linkCodes.mint()
      const code2 = linkCodes.mint()
      const code3 = linkCodes.mint()

      expect(code1).not.toEqual(code2);
      expect(code1).not.toEqual(code3);
    });
  });

  describe("associating a code with a user", () => {
    describe('when token is valid', () => {
      it('should associate the token', () => {
        const linkCode = linkCodes.mint();
        const association = { authToken: "token123", nickname: "bob", userId: "1" };

        linkCodes.associate(linkCode, association);

        expect(linkCodes.associationFor(linkCode)).toEqual(association);
      }); 
    });

    describe('when token is valid', () => {
      it('should throw an error', () => {
        const invalidLinkCode = "invalidLinkCode";
        const association = { authToken: "token456", nickname: "bob", userId: "1" };

        expect(() => linkCodes.associate(invalidLinkCode, association)).toThrow(`Invalid linkCode ${invalidLinkCode}`)
      }); 
    });
  });

  describe('fetching an association for a linkCode', () => {
    describe('when the token doesnt exist', () => {
      it('should return undefined', () => {
        const missingLinkCode = 'someLinkCodeThatDoesntExist';
        expect(linkCodes.associationFor(missingLinkCode)).toBeUndefined()
      });
    })
  });
})