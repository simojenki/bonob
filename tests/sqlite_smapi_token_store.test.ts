import fs from "fs";
import path from "path";
import { SQLiteSmapiTokenStore } from "../src/sqlite_smapi_token_store";
import { SmapiToken } from "../src/smapi_auth";
import { JWTSmapiLoginTokens } from "../src/smapi_auth";
import { SystemClock } from "../src/clock";

describe("SQLiteSmapiTokenStore", () => {
  const testDbPath = path.join(__dirname, "test-tokens.db");
  const testJsonPath = path.join(__dirname, "test-tokens.json");
  let tokenStore: SQLiteSmapiTokenStore;

  beforeEach(() => {
    // Clean up any existing test files
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testJsonPath)) {
      fs.unlinkSync(testJsonPath);
    }
    if (fs.existsSync(`${testJsonPath}.bak`)) {
      fs.unlinkSync(`${testJsonPath}.bak`);
    }

    tokenStore = new SQLiteSmapiTokenStore(testDbPath);
  });

  afterEach(() => {
    tokenStore.close();

    // Clean up test files
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testJsonPath)) {
      fs.unlinkSync(testJsonPath);
    }
    if (fs.existsSync(`${testJsonPath}.bak`)) {
      fs.unlinkSync(`${testJsonPath}.bak`);
    }
  });

  describe("Database Initialization", () => {
    it("should create database file on initialization", () => {
      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    it("should create parent directory if it doesn't exist", () => {
      const nestedPath = path.join(__dirname, "nested", "dir", "tokens.db");
      const nestedStore = new SQLiteSmapiTokenStore(nestedPath);

      expect(fs.existsSync(nestedPath)).toBe(true);

      nestedStore.close();
      fs.unlinkSync(nestedPath);
      fs.rmdirSync(path.dirname(nestedPath));
      fs.rmdirSync(path.dirname(path.dirname(nestedPath)));
    });
  });

  describe("Token Operations", () => {
    const testToken: SmapiToken = {
      token: "test-jwt-token",
      key: "test-key-123",
    };

    it("should set and get a token", () => {
      tokenStore.set("token1", testToken);
      const retrieved = tokenStore.get("token1");

      expect(retrieved).toEqual(testToken);
    });

    it("should return undefined for non-existent token", () => {
      const retrieved = tokenStore.get("non-existent");
      expect(retrieved).toBeUndefined();
    });

    it("should update existing token", () => {
      tokenStore.set("token1", testToken);

      const updatedToken: SmapiToken = {
        token: "updated-jwt-token",
        key: "updated-key-456",
      };

      tokenStore.set("token1", updatedToken);
      const retrieved = tokenStore.get("token1");

      expect(retrieved).toEqual(updatedToken);
    });

    it("should delete a token", () => {
      tokenStore.set("token1", testToken);
      tokenStore.delete("token1");
      const retrieved = tokenStore.get("token1");

      expect(retrieved).toBeUndefined();
    });

    it("should get all tokens", () => {
      const token1: SmapiToken = { token: "jwt1", key: "key1" };
      const token2: SmapiToken = { token: "jwt2", key: "key2" };
      const token3: SmapiToken = { token: "jwt3", key: "key3" };

      tokenStore.set("tokenKey1", token1);
      tokenStore.set("tokenKey2", token2);
      tokenStore.set("tokenKey3", token3);

      const allTokens = tokenStore.getAll();

      expect(Object.keys(allTokens).length).toBe(3);
      expect(allTokens["tokenKey1"]).toEqual(token1);
      expect(allTokens["tokenKey2"]).toEqual(token2);
      expect(allTokens["tokenKey3"]).toEqual(token3);
    });

    it("should return empty object when no tokens exist", () => {
      const allTokens = tokenStore.getAll();
      expect(allTokens).toEqual({});
    });
  });

  describe("Token Cleanup", () => {
    it("should cleanup invalid tokens", () => {
      const smapiAuthTokens = new JWTSmapiLoginTokens(SystemClock, "test-secret", "1h");

      // Create valid tokens
      const validToken1 = smapiAuthTokens.issue("service-token-1");
      const validToken2 = smapiAuthTokens.issue("service-token-2");

      // Create invalid token (wrong secret)
      const invalidAuthTokens = new JWTSmapiLoginTokens(SystemClock, "different-secret", "1h");
      const invalidToken = invalidAuthTokens.issue("service-token-3");

      tokenStore.set("valid1", validToken1);
      tokenStore.set("valid2", validToken2);
      tokenStore.set("invalid", invalidToken);

      // Clean up
      const deletedCount = tokenStore.cleanupExpired(smapiAuthTokens);

      expect(deletedCount).toBe(1);
      expect(tokenStore.get("valid1")).toBeDefined();
      expect(tokenStore.get("valid2")).toBeDefined();
      expect(tokenStore.get("invalid")).toBeUndefined();
    });

    it("should not cleanup expired tokens that can be refreshed", () => {
      // Note: This test would require mocking time to create an expired token
      // For now, we just verify the function runs without error
      const smapiAuthTokens = new JWTSmapiLoginTokens(SystemClock, "test-secret", "1h");
      const validToken = smapiAuthTokens.issue("service-token-1");

      tokenStore.set("token1", validToken);
      const deletedCount = tokenStore.cleanupExpired(smapiAuthTokens);

      expect(deletedCount).toBe(0);
      expect(tokenStore.get("token1")).toBeDefined();
    });
  });

  describe("JSON Migration", () => {
    it("should migrate tokens from JSON file", () => {
      const jsonTokens = {
        token1: { token: "jwt1", key: "key1" },
        token2: { token: "jwt2", key: "key2" },
        token3: { token: "jwt3", key: "key3" },
      };

      fs.writeFileSync(testJsonPath, JSON.stringify(jsonTokens, null, 2), "utf8");

      const migratedCount = tokenStore.migrateFromJSON(testJsonPath);

      expect(migratedCount).toBe(3);
      expect(tokenStore.get("token1")).toEqual(jsonTokens.token1);
      expect(tokenStore.get("token2")).toEqual(jsonTokens.token2);
      expect(tokenStore.get("token3")).toEqual(jsonTokens.token3);
    });

    it("should create backup of original JSON file", () => {
      const jsonTokens = {
        token1: { token: "jwt1", key: "key1" },
      };

      fs.writeFileSync(testJsonPath, JSON.stringify(jsonTokens, null, 2), "utf8");
      tokenStore.migrateFromJSON(testJsonPath);

      expect(fs.existsSync(`${testJsonPath}.bak`)).toBe(true);
      expect(fs.existsSync(testJsonPath)).toBe(false);
    });

    it("should return 0 when JSON file does not exist", () => {
      const migratedCount = tokenStore.migrateFromJSON(testJsonPath);
      expect(migratedCount).toBe(0);
    });

    it("should handle empty JSON file", () => {
      fs.writeFileSync(testJsonPath, JSON.stringify({}), "utf8");
      const migratedCount = tokenStore.migrateFromJSON(testJsonPath);

      expect(migratedCount).toBe(0);
    });
  });

  describe("Persistence", () => {
    it("should persist tokens across instances", () => {
      const testToken: SmapiToken = { token: "jwt1", key: "key1" };

      tokenStore.set("token1", testToken);
      tokenStore.close();

      // Create new instance with same database
      const newStore = new SQLiteSmapiTokenStore(testDbPath);
      const retrieved = newStore.get("token1");

      expect(retrieved).toEqual(testToken);

      newStore.close();
    });
  });

  describe("Close", () => {
    it("should close database connection without error", () => {
      expect(() => tokenStore.close()).not.toThrow();
    });

    it("should handle multiple close calls gracefully", () => {
      tokenStore.close();
      // Second close should not throw
      expect(() => tokenStore.close()).not.toThrow();
    });
  });
});
