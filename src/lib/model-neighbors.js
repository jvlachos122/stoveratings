// Links among currently certified model lines, from the committed catalog.
// This module does not fetch EPA and does not add URLs.
import { heatText } from "./format.js";

export const NEIGHBOR_CAP = 6;
const BRAND_SLOTS = 3;

const TYPE_PLURAL = {
  "Wood Stove": "wood stoves",
  "Pellet Stove": "pellet stoves",
  "Hydronic Heater": "hydronic heaters",
  "Forced Air Furnace": "forced-air furnaces",
};

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function typePlural(type) {
  if (TYPE_PLURAL[type]) return TYPE_PLURAL[type];
  const text = clean(type);
  return text ? text.toLowerCase() : "model lines";
}

// Hub name, then the EPA model line. A model line that already starts with
// the hub name is left as EPA wrote it.
export function brandModelLabel(brandName, model) {
  const brand = clean(brandName);
  const line = clean(model);
  if (!line) return brand;
  if (!brand) return line;
  const brandNorm = normalize(brand);
  const lineNorm = normalize(line);
  if (brandNorm && (lineNorm === brandNorm || lineNorm.startsWith(`${brandNorm} `))) return line;
  return `${brand} ${line}`;
}

export function heatMidpoint(stove) {
  if (stove?.btuLow != null && stove?.btuHigh != null) return (stove.btuLow + stove.btuHigh) / 2;
  if (stove?.btuMax != null) return stove.btuMax;
  return null;
}

export function isLinkableCurrent(stove) {
  return Boolean(stove && stove.current === true && stove.indexable !== false && stove.url);
}

function byName(left, right) {
  const name = String(left.model || "").localeCompare(String(right.model || ""), "en");
  if (name) return name;
  return String(left.id || "").localeCompare(String(right.id || ""), "en");
}

function startOffset(id, length) {
  if (!length) return 0;
  let hash = 0;
  for (const char of String(id || "")) hash = (Math.imul(hash, 33) + char.charCodeAt(0)) >>> 0;
  return hash % length;
}

function takeRing(items, start, count) {
  const out = [];
  const size = items.length;
  const limit = Math.min(count, size);
  for (let index = 0; index < limit; index += 1) out.push(items[(start + index) % size]);
  return out;
}

function rowFor(stove, brandBySlug) {
  const brand = brandBySlug?.get?.(stove.primarySlug);
  return {
    href: stove.url,
    label: brandModelLabel(brand?.name || stove.manufacturer, stove.model),
    heat: heatText(stove),
    id: stove.id,
  };
}

let indexed = null;

function indexCurrent(stoves) {
  if (indexed && indexed.stoves === stoves) return indexed;
  const byBrandType = new Map();
  const byType = new Map();
  for (const stove of stoves || []) {
    if (!isLinkableCurrent(stove)) continue;
    const typeKey = stove.type || "";
    const typePool = byType.get(typeKey) || [];
    typePool.push(stove);
    byType.set(typeKey, typePool);
    const key = `${stove.primarySlug || ""}\0${typeKey}`;
    const pool = byBrandType.get(key) || [];
    pool.push(stove);
    byBrandType.set(key, pool);
  }
  for (const pool of byBrandType.values()) pool.sort(byName);
  for (const pool of byType.values()) pool.sort(byName);
  indexed = { stoves, byBrandType, byType };
  return indexed;
}

/**
 * Up to six currently certified model lines: other lines of this EPA type on
 * the same brand hub, then lines of this type with a close heat-output midpoint.
 * Both lists are omitted when they would be empty.
 */
export function neighborSections(stove, stoves, brandBySlug, snapshotDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(snapshotDate || ""))) {
    throw new Error("neighbor list needs the EPA snapshot date");
  }
  if (!stove) return [];
  const { byBrandType, byType } = indexCurrent(stoves);
  const typeKey = stove.type || "";
  const plural = typePlural(stove.type);
  const brand = brandBySlug?.get?.(stove.primarySlug);
  const group = brand?.name ? (byBrandType.get(`${stove.primarySlug || ""}\0${typeKey}`) || []) : [];
  const selfIndex = group.findIndex((item) => item.id === stove.id);
  const peers = selfIndex >= 0 ? group.length - 1 : group.length;
  const typePool = byType.get(typeKey) || [];
  const origin = heatMidpoint(stove);
  const heatAvailable = origin != null && typePool.some((item) => item.id !== stove.id && heatMidpoint(item) != null);

  let brandCount = 0;
  if (peers > 0) brandCount = heatAvailable ? Math.min(BRAND_SLOTS, peers) : Math.min(NEIGHBOR_CAP, peers);
  const heatCount = Math.min(NEIGHBOR_CAP - brandCount, heatAvailable ? NEIGHBOR_CAP : 0);

  const sections = [];
  const used = new Set();
  if (brandCount > 0) {
    const start = selfIndex >= 0 ? selfIndex + 1 : startOffset(stove.id, group.length);
    const picked = takeRing(group, start, brandCount).filter((item) => item.id !== stove.id);
    for (const item of picked) used.add(item.id);
    sections.push({
      id: "current-brand",
      heading: `Other current EPA-certified ${plural} from ${brand.name}`,
      caption: `Currently certified ${plural} on the ${brand.name} hub in the EPA snapshot dated ${snapshotDate}. The list follows model name.`,
      rows: picked.map((item) => rowFor(item, brandBySlug)),
    });
  }

  if (heatCount > 0) {
    const picked = typePool
      .filter((item) => item.id !== stove.id && !used.has(item.id) && heatMidpoint(item) != null)
      .map((item) => ({ item, diff: Math.abs(heatMidpoint(item) - origin) }))
      .sort((left, right) => left.diff - right.diff || byName(left.item, right.item))
      .slice(0, heatCount)
      .map((entry) => entry.item);
    if (picked.length) {
      sections.push({
        id: "similar-heat",
        heading: "Similar heat output",
        caption: `Other current EPA-certified ${plural} whose listed heat-output midpoint is close to this model line. The midpoint is the average of the low and high BTU/hr EPA listed, or the maximum when that is the only heat figure. Snapshot ${snapshotDate}.`,
        rows: picked.map((item) => rowFor(item, brandBySlug)),
      });
    }
  }

  return sections;
}
