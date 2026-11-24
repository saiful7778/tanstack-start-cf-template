import { normalizePathname } from "#/utils/url";

export function createCanonicalUrl(baseUrl: string, pathname: string): string {
  const normalized = normalizePathname(pathname);

  return normalized === "/" ? baseUrl : `${baseUrl}${normalized}`;
}

export function createAssetUrl(baseUrl: string, path: string): string {
  return `${baseUrl}/${path.replace(/^\/+/, "")}`;
}
