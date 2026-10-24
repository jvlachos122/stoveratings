import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import meta from "./data/meta.json" with { type: "json" };
import noindex from "./data/noindex-paths.json" with { type: "json" };

const hidden = new Set(noindex);

export default defineConfig({
  site: "https://stoveratings.com",
  trailingSlash: "always",
  prefetch: {
    defaultStrategy: "hover",
  },
  integrations: [
    sitemap({
      filter(page) {
        const path = new URL(page).pathname;
        if (path.includes("/404")) return false;
        if (hidden.has(path)) return false;
        return true;
      },
      serialize(item) {
        item.lastmod = meta.snapshotDate;
        return item;
      },
    }),
  ],
});
