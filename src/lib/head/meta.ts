import { buildOgMeta } from "./og";
import type { HeadMeta, HeadPageOptions } from "./types";

export interface HeadMetaContext {
  appName: string;
  themeColor: string;
  robots: string;
  googlebot: string;
  social: boolean;
  ogImage: string;
}

export interface HeadPageMeta {
  title: string;
  description: string;
  url: string;
}

export function resolveTitle(
  titleTemplate: string,
  options: HeadPageOptions
): string {
  return options.titleByTemplate === undefined
    ? options.title
    : titleTemplate.replace("%s", () => options.titleByTemplate);
}

export function buildHeadMeta(
  context: HeadMetaContext,
  page: HeadPageMeta
): HeadMeta[] {
  const { appName, themeColor, robots, googlebot, social, ogImage } = context;
  const { title, description, url } = page;

  const meta: HeadMeta[] = [
    { charSet: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { name: "theme-color", content: themeColor },
    { title },
    { name: "description", content: description },
    { name: "robots", content: robots },
    { name: "googlebot", content: googlebot },
    { name: "format-detection", content: "telephone=no" },
    { name: "mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-title", content: appName },
    {
      name: "apple-mobile-web-app-status-bar-style",
      content: "black-translucent",
    },
  ];

  if (social) {
    meta.push(
      ...buildOgMeta({
        appName,
        title,
        description,
        url,
        imageUrl: ogImage,
      })
    );
  }

  return meta;
}
