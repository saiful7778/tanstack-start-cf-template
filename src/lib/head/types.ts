export interface HeadMeta {
  charSet?: string;
  name?: string;
  property?: string;
  content?: string;
  title?: string;
}

export interface HeadLink {
  rel: string;
  href?: string;
  hrefLang?: string;
  type?: string;
  sizes?: string;
}

export interface HeadResult {
  meta: HeadMeta[];
  links: HeadLink[];
}

export interface BuildHeadConfig {
  appName: string;
  siteUrl: string;
  defaultTitle: string;
  titleTemplate: string;
  defaultDescription: string;
  themeColor: string;
  robots?: string;
  stylesheets?: ReadonlyArray<string>;
  ogImagePath?: string;
  social?: boolean;
}

export type HeadPageOptions = {
  pathname: string;
  description?: string;
} & (
  | { title: string; titleByTemplate?: never }
  | { titleByTemplate: string; title?: never }
);
