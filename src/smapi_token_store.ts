import fs from "fs";
import path from "path";
import logger from "./logger";
import { SmapiToken, SmapiAuthTokens } from "./smapi_auth";
import { either as E } from "fp-ts";

export { SQLiteSmapiTokenStore } from "./sqlite_smapi_token_store";

export interface SmapiTokenStore {
  get(token: string): SmapiToken | undefined;
  set(token: string, fullSmapiToken: SmapiToken): void;
  delete(token: string): void;
  getAll(): { [tokenKey: string]: SmapiToken };
  cleanupExpired(smapiAuthTokens: SmapiAuthTokens): number;
}

export class InMemorySmapiTokenStore implements SmapiTokenStore {
  private tokens: { [tokenKey: string]: SmapiToken } = {};

  get(token: string): SmapiToken | undefined {
    return this.tokens[token];
  }

  set(token: string, fullSmapiToken: SmapiToken): void {
    this.tokens[token] = fullSmapiToken;
  }

  delete(token: string): void {
    delete this.tokens[token];
  }

  getAll(): { [tokenKey: string]: SmapiToken } {
    return this.tokens;
  }

  cleanupExpired(smapiAuthTokens: SmapiAuthTokens): number {
    const tokenKeys = Object.keys(this.tokens);
    let deletedCount = 0;

    for (const tokenKey of tokenKeys) {
      const smapiToken = this.tokens[tokenKey];
      if (smapiToken) {
        const verifyResult = smapiAuthTokens.verify(smapiToken);
        // Only delete if token verification fails with InvalidTokenError
        // Do NOT delete ExpiredTokenError as those can still be refreshed
        if (E.isLeft(verifyResult)) {
          const error = verifyResult.left;
          // Delete both invalid and expired tokens to prevent accumulation
          if (error._tag === 'InvalidTokenError' || error._tag === 'ExpiredTokenError') {
            logger.debug(`Deleting ${error._tag} token from in-memory store`);
            delete this.tokens[tokenKey];
            deletedCount++;
          }
        }
      }
    }

    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} invalid token(s) from in-memory store`);
    }

    return deletedCount;
  }
}

export class FileSmapiTokenStore implements SmapiTokenStore {
  private tokens: { [tokenKey: string]: SmapiToken } = {};
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.loadFromFile();
  }

  private loadFromFile(): void {
    try {
      // Ensure the directory exists
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created token storage directory: ${dir}`);
      }

      // Load existing tokens if file exists
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, "utf8");
        this.tokens = JSON.parse(data);
        logger.info(
          `Loaded ${Object.keys(this.tokens).length} token(s) from ${this.filePath}`
        );
      } else {
        logger.info(`No existing token file found at ${this.filePath}, starting fresh`);
        this.tokens = {};
        this.saveToFile();
      }
    } catch (error) {
      logger.error(`Failed to load tokens from ${this.filePath}`, { error });
      this.tokens = {};
    }
  }

  private saveToFile(): void {
    try {
      // Ensure the directory exists before writing
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created token storage directory: ${dir}`);
      }

      const data = JSON.stringify(this.tokens, null, 2);
      fs.writeFileSync(this.filePath, data, "utf8");
      logger.debug(`Saved ${Object.keys(this.tokens).length} token(s) to ${this.filePath}`);
    } catch (error) {
      logger.error(`Failed to save tokens to ${this.filePath}`, { error });
    }
  }

  get(token: string): SmapiToken | undefined {
    return this.tokens[token];
  }

  set(token: string, fullSmapiToken: SmapiToken): void {
    this.tokens[token] = fullSmapiToken;
    this.saveToFile();
  }

  delete(token: string): void {
    delete this.tokens[token];
    this.saveToFile();
  }

  getAll(): { [tokenKey: string]: SmapiToken } {
    return this.tokens;
  }

  cleanupExpired(smapiAuthTokens: SmapiAuthTokens): number {
    const tokenKeys = Object.keys(this.tokens);
    let deletedCount = 0;

    for (const tokenKey of tokenKeys) {
      const smapiToken = this.tokens[tokenKey];
      if (smapiToken) {
        const verifyResult = smapiAuthTokens.verify(smapiToken);
        // Only delete if token verification fails with InvalidTokenError
        // Do NOT delete ExpiredTokenError as those can still be refreshed
        if (E.isLeft(verifyResult)) {
          const error = verifyResult.left;
          // Delete both invalid and expired tokens to prevent accumulation
          if (error._tag === 'InvalidTokenError' || error._tag === 'ExpiredTokenError') {
            logger.debug(`Deleting ${error._tag} token from file store`);
            delete this.tokens[tokenKey];
            deletedCount++;
          }
        }
      }
    }

    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} invalid token(s) from file store`);
      this.saveToFile();
    }

    return deletedCount;
  }
}
