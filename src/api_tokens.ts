import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export interface APITokens {
  mint(authToken: string): string;
  authTokenFor(apiToken: string): string | undefined;
}


export const sha256 = (salt: string) => (value: string) => crypto
  .createHash("sha256")
  .update(`${value}${salt}`)
  .digest("hex")


export class InMemoryAPITokens implements APITokens {
  tokens = new Map<string, string>();
  minter;

  constructor(minter: (authToken: string) => string = sha256('bonob')) {
    this.minter = minter
  }

  mint = (authToken: string): string => {
    const accessToken = this.minter(authToken);
    this.tokens.set(accessToken, authToken);
    return accessToken;
  }

  authTokenFor = (apiToken: string): string | undefined => this.tokens.get(apiToken);
}

type PersistentTokenStore = {
  get: (key:string) => Promise<string | undefined>;
  put: (key: string, value: string) => void;
  delete: (key: string) => void;
}
export { PersistentTokenStore, NoopPersistentTokenStore, FilesystemPersistentTokenStore };

class NoopPersistentTokenStore implements PersistentTokenStore {
  get(_: string) : Promise<string | undefined> {
    return Promise.resolve(undefined);
  }
  put(_key:string, _value:string) {
  }
  delete(_key:string) {
  }

}

/**
 * Converts a key to a safe filename using SHA256 hash
 * This ensures the filename is always a consistent length and contains only safe characters
 */
function keyToFilename(key: string): string {
  if (!key) {
    return 'empty_key';
  }
  // Hash the key to create a consistent, filesystem-safe filename
  // This handles long keys (like JWTs) that would exceed filename length limits
  return crypto.createHash('sha256').update(key).digest('hex');
}

class FilesystemPersistentTokenStore implements PersistentTokenStore {
  private directory: string;

  constructor(directory?: string) {
    this.directory = directory || os.tmpdir();
    // Ensure directory exists
    fs.mkdir(this.directory, { recursive: true }).catch(() => {
      // Directory may already exist, ignore error
    });
  }

  private getFilePath(key: string): string {
    const filename = keyToFilename(key);
    return path.join(this.directory, filename);
  }

  async get(key: string): Promise<string | undefined> {
    try {
      const filePath = this.getFilePath(key);
      const content = await fs.readFile(filePath, 'utf8');
      return content;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // File doesn't exist, return undefined (similar to Minio's NoSuchKey handling)
        return undefined;
      }
      // Propagate unexpected errors
      throw err;
    }
  }

  async put(key: string, value: string): Promise<void> {
    const filePath = this.getFilePath(key);
    await fs.writeFile(filePath, value, 'utf8');
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // File doesn't exist, ignore (idempotent delete)
        return;
      }
      // Propagate unexpected errors
      throw err;
    }
  }
}