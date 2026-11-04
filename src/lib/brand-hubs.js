import { catalog, stovesForBrand } from "./catalog.js";

/** Hubs linked from the home page, ordered by listed model lines. */
export const HOME_BRAND_HUB_COUNT = 8;

export function brandHubsByModelLines() {
  return catalog.brands
    .map((brand) => {
      const lines = stovesForBrand(brand.slug);
      return {
        slug: brand.slug,
        name: brand.name,
        url: brand.url,
        lines: lines.length,
        current: lines.filter((stove) => stove.current).length,
      };
    })
    .sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name, "en"));
}

export function homeBrandHubs(limit = HOME_BRAND_HUB_COUNT) {
  return brandHubsByModelLines().slice(0, limit);
}
