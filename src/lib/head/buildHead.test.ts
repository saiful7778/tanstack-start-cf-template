import { buildHead, type BuildHeadConfig } from "#/lib/head/buildHead";
import { describe, expect, it } from "vitest";

const config: BuildHeadConfig = {
  appName: "Test App",
  siteUrl: "https://example.com",
  defaultTitle: "Test App",
  titleTemplate: "%s | Test App",
  defaultDescription: "Default description",
  themeColor: "#000000",
  robots: "index, follow",
  stylesheets: ["/styles.css"],
  ogImagePath: "/og.jpg",
};

describe("buildHead", () => {
  describe("head", () => {
    it("builds a canonical URL without duplicating separators", () => {
      const { head } = buildHead(config);

      const result = head({ pathname: "/about", title: "About" });

      expect(result.links).toContainEqual({
        rel: "canonical",
        href: "https://example.com/about",
      });
    });

    it("adds a missing leading slash to the pathname", () => {
      const { head } = buildHead(config);

      const result = head({ pathname: "about", title: "About" });

      expect(result.links).toContainEqual({
        rel: "canonical",
        href: "https://example.com/about",
      });
    });

    it("removes a trailing slash from the pathname", () => {
      const { head } = buildHead(config);

      const result = head({ pathname: "/about/", title: "About" });

      expect(result.links).toContainEqual({
        rel: "canonical",
        href: "https://example.com/about",
      });
    });

    it("removes trailing slashes from the site URL", () => {
      const { head } = buildHead({
        ...config,
        siteUrl: "https://example.com///",
      });

      const result = head({ pathname: "/about", title: "About" });

      expect(result.links).toContainEqual({
        rel: "canonical",
        href: "https://example.com/about",
      });
    });

    it("uses the bare site URL as the root canonical URL", () => {
      const { head } = buildHead(config);

      const result = head({ pathname: "/", title: "Home" });

      expect(result.links).toContainEqual({
        rel: "canonical",
        href: "https://example.com",
      });
    });

    it("uses a page title as-is", () => {
      const { head } = buildHead(config);

      const result = head({ pathname: "/about", title: "About" });

      expect(result.meta).toContainEqual({ title: "About" });
    });

    it("applies the title template to a template title", () => {
      const { head } = buildHead(config);

      const result = head({ pathname: "/about", titleByTemplate: "Contact" });

      expect(result.meta).toContainEqual({ title: "Contact | Test App" });
    });

    it("uses the default description when none is provided", () => {
      const { head } = buildHead(config);

      const result = head({ pathname: "/about", title: "About" });

      expect(result.meta).toContainEqual({
        name: "description",
        content: "Default description",
      });
    });

    it("uses the page description when provided", () => {
      const { head } = buildHead(config);

      const result = head({
        pathname: "/about",
        title: "About",
        description: "About us",
      });

      expect(result.meta).toContainEqual({
        name: "description",
        content: "About us",
      });
    });

    it("keeps a noindex robots directive in the googlebot directive", () => {
      const { head } = buildHead({ ...config, robots: "noindex, nofollow" });

      const result = head({ pathname: "/about", title: "About" });

      expect(result.meta).toContainEqual({
        name: "googlebot",
        content: "noindex, nofollow",
      });
    });

    it("uses verbose googlebot directives for indexable pages", () => {
      const { head } = buildHead(config);

      const result = head({ pathname: "/about", title: "About" });

      expect(result.meta).toContainEqual({
        name: "googlebot",
        content:
          "index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1",
      });
    });

    it("adds Open Graph and Twitter tags by default", () => {
      const { head } = buildHead(config);

      const result = head({ pathname: "/about", title: "About" });

      expect(result.meta).toContainEqual({
        property: "og:title",
        content: "About",
      });
      expect(result.meta).toContainEqual({
        name: "twitter:card",
        content: "summary_large_image",
      });
    });

    it("omits social tags when social metadata is disabled", () => {
      const { head } = buildHead({ ...config, social: false });

      const result = head({ pathname: "/about", title: "About" });

      expect(
        result.meta.some(
          (meta) =>
            "property" in meta && meta.property?.startsWith("og:") === true
        )
      ).toBe(false);
      expect(
        result.meta.some(
          (meta) => "name" in meta && meta.name?.startsWith("twitter:") === true
        )
      ).toBe(false);
    });

    it("adds a missing leading slash to the OG image path", () => {
      const { head } = buildHead({ ...config, ogImagePath: "og.jpg" });

      const result = head({ pathname: "/about", title: "About" });

      expect(result.meta).toContainEqual({
        property: "og:image",
        content: "https://example.com/og.jpg",
      });
    });

    it("includes stylesheets, favicons and the web manifest", () => {
      const { head } = buildHead(config);

      const result = head({ pathname: "/about", title: "About" });

      expect(result.links).toContainEqual({
        rel: "stylesheet",
        href: "/styles.css",
      });
      expect(result.links).toContainEqual({
        rel: "manifest",
        href: "/site.webmanifest",
      });
      expect(result.links).toContainEqual({
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
      });
    });

    it("adds an x-default alternate link for the page pathname", () => {
      const { head } = buildHead(config);

      const result = head({ pathname: "/about", title: "About" });

      expect(result.links).toContainEqual({
        rel: "alternate",
        hrefLang: "x-default",
        href: "https://example.com/about",
      });
    });
  });

  describe("globalHead", () => {
    it("uses the default title and description without a canonical link", () => {
      const { globalHead } = buildHead(config);

      const result = globalHead();

      expect(result.meta).toContainEqual({ title: "Test App" });
      expect(result.meta).toContainEqual({
        name: "description",
        content: "Default description",
      });
      expect(result.links.some((link) => link.rel === "canonical")).toBe(false);
    });
  });

  describe("configuration validation", () => {
    it("rejects a title template without a placeholder", () => {
      expect(() => buildHead({ ...config, titleTemplate: "Test App" })).toThrow(
        'buildHead: titleTemplate must contain "%s"'
      );
    });
  });
});
