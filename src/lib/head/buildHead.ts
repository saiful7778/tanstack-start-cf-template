import { normalizeUrl } from "#/utils/url";

import { buildAlternateLinks, buildHeadLinks } from "./links";
import { buildHeadMeta, resolveTitle } from "./meta";
import type { BuildHeadConfig, HeadPageOptions, HeadResult } from "./types";
import { createAssetUrl, createCanonicalUrl } from "./url";

export type { BuildHeadConfig, HeadPageOptions, HeadResult } from "./types";

const GOOGLEBOT_DEFAULT =
  "index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1";

interface HeadContext {
  appName: string;
  baseUrl: string;
  defaultTitle: string;
  titleTemplate: string;
  defaultDescription: string;
  themeColor: string;
  robots: string;
  googlebot: string;
  stylesheets: ReadonlyArray<string>;
  ogImage: string;
  social: boolean;
}

function createHeadContext(config: BuildHeadConfig): HeadContext {
  const {
    appName,
    siteUrl,
    defaultTitle,
    titleTemplate,
    defaultDescription,
    themeColor,
    robots = "index, follow",
    stylesheets = [],
    ogImagePath = "/opengraph-image.jpg",
    social = true,
  } = config;

  if (!titleTemplate.includes("%s")) {
    throw new Error('buildHead: titleTemplate must contain "%s"');
  }

  const baseUrl = normalizeUrl(siteUrl);

  return {
    appName,
    baseUrl,
    defaultTitle,
    titleTemplate,
    defaultDescription,
    themeColor,
    robots,
    googlebot: robots.includes("noindex") ? robots : GOOGLEBOT_DEFAULT,
    stylesheets,
    ogImage: createAssetUrl(baseUrl, ogImagePath),
    social,
  };
}

export function buildHead(config: BuildHeadConfig) {
  const context = createHeadContext(config);

  const globalHead = (): HeadResult => ({
    meta: buildHeadMeta(context, {
      title: context.defaultTitle,
      description: context.defaultDescription,
      url: createCanonicalUrl(context.baseUrl, "/"),
    }),
    links: buildHeadLinks(context.stylesheets),
  });

  const head = (options: HeadPageOptions): HeadResult => {
    const url = createCanonicalUrl(context.baseUrl, options.pathname);

    return {
      meta: buildHeadMeta(context, {
        title: resolveTitle(context.titleTemplate, options),
        description: options.description ?? context.defaultDescription,
        url,
      }),
      links: [
        ...buildHeadLinks(context.stylesheets, url),
        ...buildAlternateLinks(url),
      ],
    };
  };

  return { globalHead, head };
}
