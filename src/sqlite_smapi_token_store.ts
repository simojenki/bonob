import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import logger from "./logger";
import { SmapiToken, SmapiAuthTokens } from "./smapi_auth";
import { either as E } from "fp-ts";
import { SmapiTokenStore } from "./smapi_token_store";

export class SQLiteSmapiTokenStore implements SmapiTokenStore {
  private db!: Database.Database;
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    try {
      // Ensure the directory exists
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created token storage directory: ${dir}`);
      }

      // Open database connection
      this.db = new Database(this.dbPath);

      // Create table if it doesn't exist
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS smapi_tokens (
          token_key TEXT PRIMARY KEY,
          token TEXT NOT NULL,
          key TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )
      `);

      // Create index for faster lookups
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_created_at ON smapi_tokens(created_at)
      `);

      const count = this.db.prepare("SELECT COUNT(*) as count FROM smapi_tokens").get() as { count: number };
      logger.info(`SQLite token store initialized at ${this.dbPath} with ${count.count} token(s)`);
    } catch (error) {
      logger.error(`Failed to initialize SQLite token store at ${this.dbPath}`, { error });
      throw error;
    }
  }

  get(tokenKey: string): SmapiToken | undefined {
    try {
      const stmt = this.db.prepare("SELECT token, key FROM smapi_tokens WHERE token_key = ?");
      const row = stmt.get(tokenKey) as { token: string; key: string } | undefined;

      if (!row) {
        return undefined;
      }

      return {
        token: row.token,
        key: row.key,
      };
    } catch (error) {
      logger.error(`Failed to get token from SQLite store`, { error });
      return undefined;
    }
  }

  set(tokenKey: string, fullSmapiToken: SmapiToken): void {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO smapi_tokens (token_key, token, key)
        VALUES (?, ?, ?)
      `);
      stmt.run(tokenKey, fullSmapiToken.token, fullSmapiToken.key);
      logger.debug(`Saved token to SQLite store`);
    } catch (error) {
      logger.error(`Failed to save token to SQLite store`, { error });
    }
  }

  delete(tokenKey: string): void {
    try {
      const stmt = this.db.prepare("DELETE FROM smapi_tokens WHERE token_key = ?");
      stmt.run(tokenKey);
      logger.debug(`Deleted token from SQLite store`);
    } catch (error) {
      logger.error(`Failed to delete token from SQLite store`, { error });
    }
  }

  getAll(): { [tokenKey: string]: SmapiToken } {
    try {
      const stmt = this.db.prepare("SELECT token_key, token, key FROM smapi_tokens");
      const rows = stmt.all() as Array<{ token_key: string; token: string; key: string }>;

      const tokens: { [tokenKey: string]: SmapiToken } = {};
      for (const row of rows) {
        tokens[row.token_key] = {
          token: row.token,
          key: row.key,
        };
      }

      return tokens;
    } catch (error) {
      logger.error(`Failed to get all tokens from SQLite store`, { error });
      return {};
    }
  }

  cleanupExpired(smapiAuthTokens: SmapiAuthTokens): number {
    try {
      const tokens = this.getAll();
      const tokenKeys = Object.keys(tokens);
      let deletedCount = 0;

      for (const tokenKey of tokenKeys) {
        const smapiToken = tokens[tokenKey];
        if (smapiToken) {
          const verifyResult = smapiAuthTokens.verify(smapiToken);
          if (E.isLeft(verifyResult)) {
            const error = verifyResult.left;
            // Delete both invalid and expired tokens to prevent accumulation
            if (error._tag === 'InvalidTokenError' || error._tag === 'ExpiredTokenError') {
              logger.debug(`Deleting ${error._tag} token from SQLite store`);
              this.delete(tokenKey);
              deletedCount++;
            }
          }
        }
      }

      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} token(s) from SQLite store`);
      }

      return deletedCount;
    } catch (error) {
      logger.error(`Failed to cleanup expired tokens from SQLite store`, { error });
      return 0;
    }
  }

  /**
   * Migrate tokens from a JSON file to the SQLite database
   * @param jsonFilePath Path to the JSON file containing tokens
   * @returns Number of tokens migrated
   */
  migrateFromJSON(jsonFilePath: string): number {
    try {
      if (!fs.existsSync(jsonFilePath)) {
        logger.info(`No JSON token file found at ${jsonFilePath}, skipping migration`);
        return 0;
      }

      const data = fs.readFileSync(jsonFilePath, "utf8");
      const tokens: { [tokenKey: string]: SmapiToken } = JSON.parse(data);
      const tokenKeys = Object.keys(tokens);

      let migratedCount = 0;
      for (const tokenKey of tokenKeys) {
        const token = tokens[tokenKey];
        if (token) {
          this.set(tokenKey, token);
          migratedCount++;
        }
      }

      logger.info(`Migrated ${migratedCount} token(s) from ${jsonFilePath} to SQLite`);

      // Optionally rename the old JSON file to .bak
      const backupPath = `${jsonFilePath}.bak`;
      fs.renameSync(jsonFilePath, backupPath);
      logger.info(`Backed up original JSON file to ${backupPath}`);

      return migratedCount;
    } catch (error) {
      logger.error(`Failed to migrate tokens from JSON file ${jsonFilePath}`, { error });
      return 0;
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    try {
      this.db.close();
      logger.info("SQLite token store connection closed");
    } catch (error) {
      logger.error("Failed to close SQLite token store connection", { error });
    }
  }
}
