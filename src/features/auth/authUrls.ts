import { UPDATE_PASSWORD_PATH } from "#/constants";

export function secureAccountUrl(siteUrl: string) {
  return new URL(UPDATE_PASSWORD_PATH, siteUrl).toString();
}
