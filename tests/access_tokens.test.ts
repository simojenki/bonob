import { v4 as uuid } from 'uuid';
import { ExpiringAccessTokens }  from '../src/access_tokens';
import dayjs from 'dayjs';

describe("ExpiringAccessTokens", () => {
  let now = dayjs();

  const accessTokens = new ExpiringAccessTokens({ now: () => now })

  describe("tokens", () => {
    it("they should be unique", () => {
      const authToken = uuid();
      expect(accessTokens.mint(authToken)).not.toEqual(accessTokens.mint(authToken));
    });
  });

  describe("tokens that dont exist", () => {
    it("should return undefined", () => {
      expect(accessTokens.authTokenFor("doesnt exist")).toBeUndefined();
    });
  });

  describe("tokens that have not expired", () => {
    it("should be able to return them", () => {
      const authToken = uuid();

      const accessToken = accessTokens.mint(authToken);

      expect(accessTokens.authTokenFor(accessToken)).toEqual(authToken);
    });

    it("should be able to have many per authToken", () => {
      const authToken = uuid();

      const accessToken1 = accessTokens.mint(authToken);
      const accessToken2 = accessTokens.mint(authToken);


      expect(accessTokens.authTokenFor(accessToken1)).toEqual(authToken);
      expect(accessTokens.authTokenFor(accessToken2)).toEqual(authToken);
    });
  });

  describe('tokens that have expired', () => {
    describe("retrieving it", () => {
      it("should return undefined", () => {
        const authToken = uuid();

        now = dayjs();
        const accessToken = accessTokens.mint(authToken);
        
        now = now.add(12, 'hours').add(1, 'second');

        expect(accessTokens.authTokenFor(accessToken)).toBeUndefined()
      });
    });

    describe("should be cleared out", () => {
        const authToken1 = uuid();
        const authToken2 = uuid();

        now = dayjs();

        const accessToken1_1 = accessTokens.mint(authToken1);
        const accessToken2_1 = accessTokens.mint(authToken2);

        expect(accessTokens.count()).toEqual(2);
        expect(accessTokens.authTokenFor(accessToken1_1)).toEqual(authToken1);
        expect(accessTokens.authTokenFor(accessToken2_1)).toEqual(authToken2);

        now = now.add(12, 'hours').add(1, 'second');

        const accessToken1_2 = accessTokens.mint(authToken1);

        expect(accessTokens.count()).toEqual(1);
        expect(accessTokens.authTokenFor(accessToken1_1)).toBeUndefined();
        expect(accessTokens.authTokenFor(accessToken2_1)).toBeUndefined();
        expect(accessTokens.authTokenFor(accessToken1_2)).toEqual(authToken1);

        now = now.add(6, 'hours');

        const accessToken2_2 = accessTokens.mint(authToken2);

        expect(accessTokens.count()).toEqual(2);
        expect(accessTokens.authTokenFor(accessToken1_1)).toBeUndefined();
        expect(accessTokens.authTokenFor(accessToken2_1)).toBeUndefined();
        expect(accessTokens.authTokenFor(accessToken1_2)).toEqual(authToken1);
        expect(accessTokens.authTokenFor(accessToken2_2)).toEqual(authToken2);

        now = now.add(6, 'hours').add(1, 'minute');

        expect(accessTokens.authTokenFor(accessToken1_1)).toBeUndefined();
        expect(accessTokens.authTokenFor(accessToken2_1)).toBeUndefined();
        expect(accessTokens.authTokenFor(accessToken1_2)).toBeUndefined();
        expect(accessTokens.authTokenFor(accessToken2_2)).toEqual(authToken2);
        expect(accessTokens.count()).toEqual(1);
       
        now = now.add(6, 'hours').add(1, 'minute');

        expect(accessTokens.authTokenFor(accessToken1_1)).toBeUndefined();
        expect(accessTokens.authTokenFor(accessToken2_1)).toBeUndefined();
        expect(accessTokens.authTokenFor(accessToken1_2)).toBeUndefined();
        expect(accessTokens.authTokenFor(accessToken2_2)).toBeUndefined();
        expect(accessTokens.count()).toEqual(0);
    });
  })
})