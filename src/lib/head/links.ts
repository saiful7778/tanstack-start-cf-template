import type { HeadLink } from "./types";

function buildFaviconLinks(): HeadLink[] {
  return [
    {
      rel: "icon",
      type: "image/png",
      href: "/favicon-96x96.png",
      sizes: "96x96",
    },
    { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    { rel: "shortcut icon", href: "/favicon.ico" },
    {
      rel: "apple-touch-icon",
      href: "/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    },
  ];
}

function buildWebmanifest(): HeadLink[] {
  return [
    {
      rel: "manifest",
      href: "/site.webmanifest",
    },
  ];
}

export function buildHeadLinks(
  stylesheets: ReadonlyArray<string>,
  canonicalUrl?: string
): HeadLink[] {
  return [
    ...stylesheets.map((href) => ({ rel: "stylesheet", href })),
    ...buildFaviconLinks(),
    ...buildWebmanifest(),
    ...(canonicalUrl ? [{ rel: "canonical", href: canonicalUrl }] : []),
  ];
}

export function buildAlternateLinks(url: string): HeadLink[] {
  return [{ rel: "alternate", hrefLang: "x-default", href: url }];
}
