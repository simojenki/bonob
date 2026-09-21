function isURL(url: string | URL): url is URL {
  return (url as URL).href !== undefined;
}

function isURLSearchParams(
  searchParams: Record<string, string> | URLSearchParams
): searchParams is URLSearchParams {
  return (searchParams as URLSearchParams).getAll !== undefined;
}

const stripTrailingSlash = (url: string) =>
  url.endsWith("/") ? url.substring(0, url.length - 1) : url;

export class BonobUrl {
  private readonly base: string;
  private readonly _href: string;

  constructor(value: Readonly<string | URL>) {
    const url = typeof value === "string" ? new URL(value) : value;
    const full = url.origin + url.pathname;
    this.base = stripTrailingSlash(full);
    this._href = full;
  }

  public readonly path = (pathname: string) => new URL(this.base + pathname);
  public readonly asURLBuilder = () => new URLBuilder(this.base);
  public readonly href = () => this._href;
  public readonly pathname = () => new URL(this._href).pathname;
  public readonly toString = () => this._href;
}

export class URLBuilder {
  private readonly url: URL;

  constructor(url: Readonly<string | URL>) {
    this.url = isURL(url) ? url : new URL(url);
  }

  public readonly append = (
    bits: Partial<{
      readonly pathname: string | undefined;
      readonly searchParams: Record<string, string> | URLSearchParams;
    }> = { pathname: undefined, searchParams: undefined }
  ) => {
    // eslint-disable-next-line functional/no-let
    let result = new URLBuilder(this.url);
    if (bits.pathname)
      result = result.with({
        pathname: stripTrailingSlash(this.url.pathname) + bits.pathname,
      });
    if (bits.searchParams) {
      const newSearchParams = new URLSearchParams(this.url.searchParams);
      (isURLSearchParams(bits.searchParams)
        ? bits.searchParams
        : new URLSearchParams(bits.searchParams)
      ).forEach((v, k) => newSearchParams.append(k, v));
      result = result.with({ searchParams: newSearchParams });
    }
    return result;
  };

  public readonly with = (
    bits: Partial<{
      readonly pathname: string | undefined;
      readonly searchParams: Record<string, string> | URLSearchParams;
    }> = { pathname: undefined, searchParams: undefined }
  ) => {
    const result = new URL(this.url.href);
    if (bits.pathname) result.pathname = bits.pathname;
    if (bits.searchParams) {
      // eslint-disable-next-line functional/prefer-readonly-type
      const keysToDelete: string[] = [];
      result.searchParams.forEach((_, k) => keysToDelete.push(k));
      keysToDelete.forEach((k) => result.searchParams.delete(k));
      (isURLSearchParams(bits.searchParams)
        ? bits.searchParams
        : new URLSearchParams(bits.searchParams)
      ).forEach((v, k) => result.searchParams.append(k, v));
    }
    return new URLBuilder(result);
  };

  public readonly href = () => this.url.href;
  public readonly pathname = () => this.url.pathname;
  public readonly searchParams = () => this.url.searchParams;
  public readonly path = () => this.url.pathname + this.url.search;
  public readonly toString = () => this.url.href;
}

export default function url(url: Readonly<string | URL>): URLBuilder {
  return new URLBuilder(url);
}
