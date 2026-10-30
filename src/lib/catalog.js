import brands from "../../data/brands.json" with { type: "json" };
import redirects from "../../data/brand-redirects.json" with { type: "json" };
import changes from "../../data/changes.json" with { type: "json" };
import firewood from "../../data/firewood.json" with { type: "json" };
import fuelHeat from "../../data/fuel-heat.json" with { type: "json" };
import fuelPrices from "../../data/fuel-prices.json" with { type: "json" };
import meta from "../../data/meta.json" with { type: "json" };
import stats from "../../data/stats.json" with { type: "json" };
import stoves from "../../data/stoves.json" with { type: "json" };

function btuMid(stove) {
  if (stove.btuLow != null && stove.btuHigh != null) return (stove.btuLow + stove.btuHigh) / 2;
  if (stove.btuMax != null) return stove.btuMax;
  return null;
}

function nearestIds(stove, pool, metric) {
  const value = metric(stove);
  if (value == null) return [];
  return pool
    .filter((other) => other.id !== stove.id && metric(other) != null)
    .map((other) => ({ id: other.id, diff: Math.abs(metric(other) - value), model: other.model }))
    .sort((a, b) => a.diff - b.diff || a.model.localeCompare(b.model))
    .slice(0, 5)
    .map((item) => item.id);
}

const byType = new Map();
const byManufacturer = new Map();
for (const stove of stoves) {
  const typePool = byType.get(stove.type) || [];
  typePool.push(stove);
  byType.set(stove.type, typePool);
  const siblingPool = byManufacturer.get(stove.manufacturerSlug) || [];
  siblingPool.push(stove);
  byManufacturer.set(stove.manufacturerSlug, siblingPool);
}

for (const stove of stoves) {
  const pool = byType.get(stove.type) || [];
  stove.nearest = {
    emission: nearestIds(stove, pool, (item) => item.emission),
    efficiency: nearestIds(stove, pool, (item) => item.efficiency),
    btu: nearestIds(stove, pool, btuMid),
  };
  stove.siblingIds = (byManufacturer.get(stove.manufacturerSlug) || [])
    .filter((other) => other.id !== stove.id)
    .sort((a, b) => Number(b.current) - Number(a.current) || a.model.localeCompare(b.model))
    .map((other) => other.id);
}

export const stoveById = new Map(stoves.map((stove) => [stove.id, stove]));
export const brandBySlug = new Map(brands.map((brand) => [brand.slug, brand]));

export const catalog = {
  stoves,
  brands,
  redirects,
  stats,
  changes,
  meta,
  firewood,
  fuelHeat,
  fuelPrices,
  stoveById,
  brandBySlug,
};

export function stovesForBrand(slug) {
  return stoves
    .filter((stove) => stove.brandSlugs.includes(slug))
    .sort((a, b) => Number(b.current) - Number(a.current) || (a.emission ?? 999) - (b.emission ?? 999) || a.model.localeCompare(b.model));
}
