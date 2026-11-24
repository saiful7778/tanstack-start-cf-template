import type { BreadcrumbRouteType } from "#/types";

export const APP_NAME = "Tanstack Start CF Template";
export const APP_DESCRIPTION = "This is tanstack start cloudflare template";

export const THEME_COLOR = "#008236";
export const BACKGROUND_COLOR = "#ffffff";

export const DEFAULT_UNAUTH_PATH = "/sign-in";
export const DEFAULT_AUTH_PATH = "/dashboard";
export const RESET_PASSWORD_PATH = "/reset-password";
export const UPDATE_PASSWORD_PATH = "/dashboard/settings/update-password";
export const AUTH_ERROR_PAGE = "/auth-error";

export const SUPPORTED_OAUTH_PROVIDERS = ["google"] as const;

export const breadcrumbRoutes: Array<BreadcrumbRouteType> = [
  {
    title: "Dashboard",
    path: "/dashboard",
  },
];
