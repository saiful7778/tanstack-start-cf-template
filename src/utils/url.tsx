export function normalizeUrl(urlValue: string): string {
  return urlValue.replace(/\/+$/, "");
}

export function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");

  return trimmed === "" ? "/" : `/${trimmed}`;
}
