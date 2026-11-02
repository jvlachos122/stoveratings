import { btuRange, efficiencyText, emissionText, emissionUnitShort, formatBtu, formatNumber, kindLabel, shortModel } from "./format.js";

export const NOT_LISTED_BY_EPA = "not listed by EPA";

// Example comparisons, not a popularity list. This repository has no sales data.
//
// Rule, applied only to the committed EPA snapshot:
// 1. Pool: currently listed room heaters whose EPA type is Wood Stove or Pellet
//    Stove and whose primary row lists both a low and a high heat output.
// 2. Brand-hub size is the count of pool model lines on primarySlug. Rank hubs
//    by that count descending, then by slug ascending. Keep the first 8.
// 3. A candidate joins two pool lines from two different kept hubs when the EPA
//    type and subtype match and the heat-output midpoints differ by at most
//    15 percent of the higher midpoint. Midpoint is (btuLow + btuHigh) / 2.
// 4. Sort candidates by absolute midpoint difference, then left id, then right
//    id. Left is the id that sorts first.
// 5. Take a candidate only when neither model line is already used. Stop at 20.
export const COMPARE_BRAND_LIMIT = 8;
export const COMPARE_PAIR_LIMIT = 20;
export const COMPARE_HEAT_RELATIVE_MAX = 0.15;

function textCompare(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function idCompare(a, b) {
  return textCompare(a.id, b.id);
}

export function orderPair(left, right) {
  return idCompare(left, right) <= 0 ? [left, right] : [right, left];
}

export function heatMidpoint(stove) {
  if (typeof stove?.btuLow !== "number" || typeof stove?.btuHigh !== "number") return null;
  return (stove.btuLow + stove.btuHigh) / 2;
}

export function heatRelativeGap(left, right) {
  const a = heatMidpoint(left);
  const b = heatMidpoint(right);
  if (a == null || b == null) return null;
  const higher = Math.max(a, b);
  if (!(higher > 0)) return null;
  return Math.abs(a - b) / higher;
}

function inPool(stove) {
  return Boolean(
    stove
    && stove.current === true
    && stove.category === "room"
    && (stove.type === "Wood Stove" || stove.type === "Pellet Stove")
    && stove.primarySlug
    && heatMidpoint(stove) != null,
  );
}

export function largestCompareBrands(stoves, limit = COMPARE_BRAND_LIMIT) {
  const counts = new Map();
  for (const stove of stoves) {
    if (!inPool(stove)) continue;
    counts.set(stove.primarySlug, (counts.get(stove.primarySlug) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || textCompare(a[0], b[0]))
    .slice(0, limit)
    .map(([slug, count]) => ({ slug, count }));
}

export function pairSlug(left, right) {
  const [a, b] = orderPair(left, right);
  const leftPart = `${a.manufacturerSlug || "manufacturer"}-${a.modelSlug || a.id}`;
  const rightPart = `${b.manufacturerSlug || "manufacturer"}-${b.modelSlug || b.id}`;
  return `${leftPart}-vs-${rightPart}`;
}

export function selectComparePairs(stoves, options = {}) {
  const brandLimit = options.brandLimit ?? COMPARE_BRAND_LIMIT;
  const pairLimit = options.pairLimit ?? COMPARE_PAIR_LIMIT;
  const relativeMax = options.relativeMax ?? COMPARE_HEAT_RELATIVE_MAX;
  const kept = new Set(largestCompareBrands(stoves, brandLimit).map((brand) => brand.slug));
  const models = stoves.filter((stove) => inPool(stove) && kept.has(stove.primarySlug));
  const candidates = [];
  for (let i = 0; i < models.length; i += 1) {
    for (let j = i + 1; j < models.length; j += 1) {
      const a = models[i];
      const b = models[j];
      if (a.primarySlug === b.primarySlug || a.id === b.id) continue;
      if (a.type !== b.type || (a.subtype || "") !== (b.subtype || "")) continue;
      const gap = heatRelativeGap(a, b);
      if (gap == null || gap > relativeMax) continue;
      const [left, right] = orderPair(a, b);
      candidates.push({
        left,
        right,
        diff: Math.abs(heatMidpoint(left) - heatMidpoint(right)),
        gap,
      });
    }
  }
  candidates.sort((a, b) => a.diff - b.diff || idCompare(a.left, b.left) || idCompare(a.right, b.right));
  const used = new Set();
  const pairs = [];
  for (const candidate of candidates) {
    if (used.has(candidate.left.id) || used.has(candidate.right.id)) continue;
    used.add(candidate.left.id);
    used.add(candidate.right.id);
    const slug = pairSlug(candidate.left, candidate.right);
    pairs.push({
      left: candidate.left,
      right: candidate.right,
      heatDiff: candidate.diff,
      heatGap: candidate.gap,
      slug,
      url: `/compare/${slug}/`,
    });
    if (pairs.length === pairLimit) break;
  }
  return pairs;
}

export function woodOrPelletLabel(type) {
  if (type === "Wood Stove") return "Wood stove";
  if (type === "Pellet Stove") return "Pellet stove";
  if (type == null || type === "") return NOT_LISTED_BY_EPA;
  return String(type);
}

export function technologyLabel(subtype) {
  if (subtype === "Catalytic Stove") return "Catalytic";
  if (subtype === "Non-Catalytic Stove") return "Non-catalytic";
  if (subtype === "Hybrid") return "Hybrid";
  if (subtype == null || subtype === "") return NOT_LISTED_BY_EPA;
  return String(subtype);
}

export function emissionCell(stove) {
  if (stove.emission == null || Number.isNaN(Number(stove.emission))) return NOT_LISTED_BY_EPA;
  const number = formatNumber(stove.emission, 3);
  if (number == null) return NOT_LISTED_BY_EPA;
  const unit = emissionUnitShort(stove.emissionUnit);
  return unit ? `${number} ${unit}` : number;
}

export function efficiencyCell(stove) {
  if (stove.efficiency == null) return NOT_LISTED_BY_EPA;
  return efficiencyText(stove.efficiency) || NOT_LISTED_BY_EPA;
}

export function heatCell(stove) {
  const range = btuRange(stove.btuLow, stove.btuHigh);
  if (range) return range;
  if (stove.btuMax != null) return `${formatBtu(stove.btuMax)} BTU/hr maximum`;
  return NOT_LISTED_BY_EPA;
}

export function statusCell(stove, snapshotDate) {
  if (stove.current) return `Listed as currently certified on ${snapshotDate}`;
  return `Previously listed as of ${snapshotDate}`;
}

function brandRecord(stove, brandBySlug) {
  const brand = brandBySlug?.get?.(stove.primarySlug) || null;
  if (brand?.name) return { name: brand.name, url: brand.url || null };
  if (stove.manufacturer) return { name: stove.manufacturer, url: null };
  return { name: NOT_LISTED_BY_EPA, url: null };
}

export function compareCells(stove, brandBySlug, snapshotDate) {
  const brand = brandRecord(stove, brandBySlug);
  return {
    brand: brand.name,
    brandUrl: brand.url,
    model: stove.model || NOT_LISTED_BY_EPA,
    modelUrl: stove.url || null,
    manufacturer: stove.manufacturer ? stove.manufacturer : NOT_LISTED_BY_EPA,
    fuel: woodOrPelletLabel(stove.type),
    technology: technologyLabel(stove.subtype),
    emission: emissionCell(stove),
    efficiency: efficiencyCell(stove),
    heat: heatCell(stove),
    status: statusCell(stove, snapshotDate),
  };
}

const TABLE_FIELDS = [
  ["Brand", "brand", "brandUrl"],
  ["Model line", "model", "modelUrl"],
  ["EPA manufacturer", "manufacturer", null],
  ["Wood or pellet", "fuel", null],
  ["Catalytic, non-catalytic, or hybrid", "technology", null],
  ["Emission rate", "emission", null],
  ["HHV efficiency", "efficiency", null],
  ["Heat output", "heat", null],
  ["Listing status", "status", null],
];

export function compareTableRows(left, right, brandBySlug, snapshotDate) {
  const a = compareCells(left, brandBySlug, snapshotDate);
  const b = compareCells(right, brandBySlug, snapshotDate);
  return TABLE_FIELDS.map(([label, key, hrefKey]) => ({
    label,
    left: a[key],
    right: b[key],
    leftHref: hrefKey ? a[hrefKey] : null,
    rightHref: hrefKey ? b[hrefKey] : null,
    numeric: key === "emission" || key === "efficiency" || key === "heat",
  }));
}

function pluralKind(stove) {
  const one = kindLabel(stove);
  return one.endsWith("s") ? one : `${one}s`;
}

function factPhrase(stove) {
  const emission = stove.emission == null
    ? "an emission rate not listed by EPA"
    : emissionText(stove.emission, stove.emissionUnit);
  const efficiency = stove.efficiency == null
    ? "an HHV efficiency not listed by EPA"
    : `${efficiencyText(stove.efficiency)} HHV efficiency`;
  const heat = heatCell(stove) === NOT_LISTED_BY_EPA
    ? "heat output not listed by EPA"
    : `heat output of ${heatCell(stove)}`;
  return `${emission}, ${efficiency}, and ${heat}`;
}

export function compareSentences(left, right, snapshotDate, brandBySlug) {
  const [a, b] = orderPair(left, right);
  const nameA = shortModel(a.model, 80);
  const nameB = shortModel(b.model, 80);
  const brandA = brandRecord(a, brandBySlug).name;
  const brandB = brandRecord(b, brandBySlug).name;
  const sameKind = a.type === b.type && (a.subtype || "") === (b.subtype || "");
  const intro = a.current && b.current && sameKind
    ? `EPA lists ${nameA} (${brandA}) and ${nameB} (${brandB}) as currently certified ${pluralKind(a)} as of ${snapshotDate}.`
    : `EPA lists ${nameA} (${brandA}) and ${nameB} (${brandB}) as of ${snapshotDate}.`;
  return [
    intro,
    `EPA lists ${factPhrase(a)} for ${nameA}, and ${factPhrase(b)} for ${nameB}.`,
    `Source: EPA Certified Wood Heater Database, snapshot ${snapshotDate}.`,
  ];
}

export function compareIndexSentences(snapshotDate, count) {
  const percent = Math.round(COMPARE_HEAT_RELATIVE_MAX * 100);
  return [
    `EPA lists ${count} example comparisons of currently certified model lines as of ${snapshotDate}.`,
    `Each pair is two model lines from different brand hubs among the ${COMPARE_BRAND_LIMIT} hubs with the most currently listed wood-stove and pellet-stove model lines, with the same EPA type and subtype and heat-output midpoints within ${percent} percent of the higher midpoint.`,
    `This site has no sales figures for these model lines. Source: EPA Certified Wood Heater Database, snapshot ${snapshotDate}.`,
  ];
}

export function pairHeading(left, right) {
  const [a, b] = orderPair(left, right);
  return `${shortModel(a.model, 70)} and ${shortModel(b.model, 70)}`;
}

export function compareNotes(left, right) {
  const notes = [
    "Figures are the primary EPA row for each model line. When a line has more than one row, the model page lists every row.",
    "A blank emission, efficiency, or heat-output cell is not listed by EPA. It is not zero.",
    "Listed as currently certified means the row was in EPA's in-production result on the snapshot date. The export has no certification date.",
    "Example comparisons are chosen by brand-hub size, EPA type, subtype, and heat-output midpoint. They are not a ranking.",
  ];
  const sameNumbers = left.emission === right.emission
    && left.efficiency === right.efficiency
    && left.btuLow === right.btuLow
    && left.btuHigh === right.btuHigh
    && left.emissionUnit === right.emissionUnit;
  if (sameNumbers) {
    notes.push("The two primary rows list the same emission rate, HHV efficiency, and heat-output range.");
  }
  return notes;
}

export function compareCaption(snapshotDate) {
  return `Primary EPA row for each model line, snapshot ${snapshotDate}`;
}
