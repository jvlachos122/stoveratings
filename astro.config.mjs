import { fileURLToPath } from "node:url";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import noindex from "./data/noindex-paths.json" with { type: "json" };
import { buildSitemapLastmods, rewriteSitemapLastmods } from "./src/lib/sitemap-lastmod.js";

const hidden = new Set(noindex);
const lastmods = buildSitemapLastmods();

export default defineConfig({
  site: "https://stoveratings.com",
  trailingSlash: "always",
  prefetch: {
    defaultStrategy: "hover",
  },
  integrations: [
    sitemap({
      // The default news, image, video, and xhtml namespaces are unused.
      namespaces: {
        news: false,
        xhtml: false,
        image: false,
        video: false,
      },
      filter(page) {
        const path = new URL(page).pathname;
        if (path.includes("/404")) return false;
        if (hidden.has(path)) return false;
        return true;
      },
      serialize(item) {
        const lastmod = lastmods.get(new URL(item.url).pathname);
        if (!lastmod) throw new Error(`No content lastmod for ${item.url}`);
        item.lastmod = lastmod;
        return item;
      },
    }),
    {
      name: "sitemap-lastmod",
      hooks: {
        "astro:build:done": ({ dir }) => {
          rewriteSitemapLastmods(fileURLToPath(dir), lastmods);
        },
      },
    },
  ],
});
