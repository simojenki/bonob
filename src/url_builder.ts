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

export class URLBuilder {
  private url: URL;

  constructor(url: string | URL) {
    this.url = isURL(url) ? url : new URL(url);
  }

  public append = (
    bits: Partial<{
      pathname: string | undefined;
      searchParams: Record<string, string> | URLSearchParams;
    }> = { pathname: undefined, searchParams: undefined }
  ) => {
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

  public with = (
    bits: Partial<{
      pathname: string | undefined;
      searchParams: Record<string, string> | URLSearchParams;
    }> = { pathname: undefined, searchParams: undefined }
  ) => {
    const result = new URL(this.url.href);
    if (bits.pathname) result.pathname = bits.pathname;
    if (bits.searchParams) {
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

  public href = () => this.url.href;
  public pathname = () => this.url.pathname;
  public searchParams = () => this.url.searchParams;
  public path = () => this.url.pathname + this.url.search;
  public toString = () => this.url.href;
}

export default function url(url: string | URL): URLBuilder {
  return new URLBuilder(url);
}
