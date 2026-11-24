import { APP_DESCRIPTION, APP_NAME, THEME_COLOR } from "#/constants";

import appCss from "../../styles.css?url";
import { env } from "../env";
import { buildHead } from "./buildHead";

export const { globalHead, head } = buildHead({
  appName: APP_NAME,
  siteUrl: env.VITE_SITE_URL,
  themeColor: THEME_COLOR,
  robots: "index, follow",
  social: true,
  stylesheets: [appCss],
  titleTemplate: `%s | ${APP_NAME}`,
  defaultTitle: APP_NAME,
  defaultDescription: APP_DESCRIPTION,
});
