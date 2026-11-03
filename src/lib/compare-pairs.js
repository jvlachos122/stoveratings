import { TRAILING_SUFFIXES } from "./brand-names.js";
import { btuRange, efficiencyText, emissionText, emissionUnitShort, formatBtu, formatNumber, kindLabel } from "./format.js";

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
//
// Short slug and title (compareBrandForms, compareModelForms, shortenCompareLabels):
// brand hub name + primary model name, joined as "{brand} {model} vs {brand} {model}".
// The document title adds ": EPA emissions and efficiency" and is the rendered <title>
// (no site-name suffix). Cap: 65 characters for that title, 80 for the slug.
// If either cap is missed, shorten the longer model (skip a bare number), then the
// longer two-word brand to initials, then allow a bare number. Left wins a tie.
// A repeated slug gets -2, -3, in selection order. The full EPA model line stays
// on the page. legacyPairSlug is the previous long URL, which redirects here.
export const COMPARE_BRAND_LIMIT = 8;
export const COMPARE_PAIR_LIMIT = 20;
export const COMPARE_HEAT_RELATIVE_MAX = 0.15;
// New pair slugs stay at or under this. The rendered <title> is the comparison
// title alone (no " · StoveRatings" suffix) and stays at or under COMPARE_TITLE_MAX.
export const COMPARE_SLUG_MAX = 80;
export const COMPARE_TITLE_MAX = 65;
export const COMPARE_TITLE_SUFFIX = ": EPA emissions and efficiency";

// Short brand label, from the hub name (the name this site publishes for the
// EPA manufacturer string). Same trailing legal suffixes as normalizeHubName.
// "group" and "industries" are extra trailing org words, so Enerco Group → Enerco
// and Travis Industries → Travis. "international" and "technologies" stay, so a
// three-word name can become initials: Stove Builder International → SBI,
// Hearth and Home Technologies → HHT. "company" is already a legal suffix, so
// United States Stove Company → USS.
const COMPARE_BRAND_EXTRA = new Set(["group", "industries"]);
const COMPARE_BRAND_STOP = new Set(["and", "of", "the", "for", "by"]);
const ROMAN_NUMERAL = new Set([
  "ii", "iii", "iv", "vi", "vii", "viii", "ix",
  "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix",
  "xx", "xxv", "xxx",
]);

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

function normToken(word) {
  return String(word || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function slugify(value) {
  let text = String(value || "").normalize("NFKD").replace(/\p{M}/gu, "");
  text = text.toLowerCase().replaceAll("&", " and ");
  text = text.replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return text || "model";
}

function hubName(stove, brandBySlug) {
  const brand = brandBySlug?.get?.(stove?.primarySlug);
  if (brand?.name) return brand.name;
  if (stove?.manufacturer) return stove.manufacturer;
  return "Brand";
}

// Spelled label, then initials when the spelled label is two content words.
// Three or more content words are initials only.
export function compareBrandForms(name) {
  const original = String(name || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const words = original.split(/\s+/).filter(Boolean);
  const norms = words.map(normToken);
  let end = words.length;
  while (end > 0 && TRAILING_SUFFIXES.has(norms[end - 1])) end -= 1;
  while (end > 0 && COMPARE_BRAND_EXTRA.has(norms[end - 1])) end -= 1;
  const kept = [];
  for (let i = 0; i < end; i += 1) {
    if (!norms[i]) continue;
    const raw = words[i].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!raw) continue;
    kept.push({ raw, norm: norms[i] });
  }
  const content = kept.filter((word) => !COMPARE_BRAND_STOP.has(word.norm));
  const spelled = kept.map((word) => word.raw).join(" ");
  const initials = content.map((word) => word.norm[0].toUpperCase()).join("");
  if (content.length >= 3 && initials) return [initials];
  const forms = [];
  if (spelled) forms.push(spelled);
  if (initials && initials !== spelled && content.length >= 2) forms.push(initials);
  return forms.length ? forms : ["Brand"];
}

function isRomanToken(token) {
  const parts = String(token || "").split(/[-/]/).filter(Boolean);
  if (!parts.length) return false;
  return parts.every((part) => ROMAN_NUMERAL.has(part.toLowerCase()));
}

function isAnchor(token) {
  if (/\d/.test(token)) return true;
  return String(token || "").split(/[-/]/).some((part) => ROMAN_NUMERAL.has(part.toLowerCase()));
}

function isBareNumber(token) {
  return /^\d+(\.\d+)?$/.test(token);
}

function isNumberish(token) {
  return /^\d+(\.\d+)?(-[A-Za-z]{1,4})?$/.test(token);
}

function splitList(text) {
  return String(text || "").split(/\s*(?:,|;|\band\b)\s*/i).map((part) => part.trim()).filter(Boolean);
}

function trimmedAnchor(token) {
  if (!token.includes("-") || token.length <= 12) return token;
  const parts = token.split("-");
  let acc = parts[0];
  for (let i = 1; i < parts.length; i += 1) {
    const next = `${acc}-${parts[i]}`;
    if (next.length > 12) break;
    acc = next;
  }
  return acc.length < token.length ? acc : token;
}

// Primary model name, then shorter forms used only when the title or slug is over the cap.
//
// The EPA model field is a model line. The lead name is:
// 1. The text after the first colon, when there is one. The text before the colon
//    is a line label ("PS60W Model Line", "1.7R Series").
// 2. Otherwise the first model inside `{label} Series ( ... )`. The series label
//    is not the model. "2.5R Series (Solution 2.5 ZC II, ...)" starts at Solution 2.5.
// 3. Otherwise the first comma, semicolon, or "and" item.
// Parenthetical asides are removed. A trailing roman numeral or 1–4 letter
// all-caps code that follows a token containing a digit is removed
// ("Solution 2.5 ZC II" → "Solution 2.5"). A trailing "Series" plus a series
// letter is removed when that still leaves a name ("True North TN20 Series B").
export function compareModelForms(model) {
  let text = String(model || "").replace(/\s+/g, " ").trim();
  const colon = text.indexOf(":");
  if (colon !== -1) text = text.slice(colon + 1).trim();
  else {
    const series = text.match(/^(.*?)\bSeries\s*\((.*)\)\s*$/i);
    if (series) text = series[2];
  }
  let first = splitList(text)[0] || text;
  first = first.replace(/\([^)]*\)/g, " ");
  first = first.replace(/\b(?:wood heater\s+)?model lines?\b/gi, " ");
  first = first.replace(/\bmodels\b/gi, " ");
  first = first.replace(/\s+/g, " ").replace(/^[-–—\s]+|[-–—\s]+$/g, "").trim();
  let tokens = first.split(/\s+/).filter(Boolean);
  let lastDigit = -1;
  tokens.forEach((token, index) => {
    if (/\d/.test(token)) lastDigit = index;
  });
  if (lastDigit >= 0) {
    const rest = tokens.slice(lastDigit + 1);
    if (rest.length && rest.every((token) => isRomanToken(token) || /^[A-Z]{1,4}$/.test(token))) {
      tokens = tokens.slice(0, lastDigit + 1);
    }
  }
  if (tokens.length > 2 && tokens[tokens.length - 2].toLowerCase() === "series") {
    tokens = tokens.slice(0, -2);
  }
  if (!tokens.length) return ["model"];
  const forms = [];
  const add = (value) => {
    const next = String(value || "").trim();
    if (!next || forms.includes(next)) return;
    forms.push(next);
  };
  add(tokens.join(" "));
  const anchor = tokens.findIndex(isAnchor);
  if (anchor >= 0) {
    const token = tokens[anchor];
    if (anchor > 0 && (isBareNumber(token) || isNumberish(token) || isRomanToken(token))) {
      let start = anchor - 1;
      if (start > 0 && /^[A-Z]{1,3}$/.test(tokens[start])) start -= 1;
      const previous = tokens[start];
      if (previous && previous !== "&" && !COMPARE_BRAND_STOP.has(previous.toLowerCase())) {
        add(tokens.slice(start, anchor + 1).join(" "));
      }
    } else if (anchor === 0 && tokens[1] && !isAnchor(tokens[1]) && !/^[A-Z]{1,3}$/.test(tokens[1])) {
      add(`${tokens[0]} ${tokens[1]}`);
    }
    add(token);
    add(trimmedAnchor(token));
  } else if (tokens.length > 2) {
    add(tokens.slice(-2).join(" "));
    add(tokens[tokens.length - 1]);
  }
  return forms;
}

export function compareSlug(leftBrand, leftModel, rightBrand, rightModel) {
  return `${slugify(leftBrand)}-${slugify(leftModel)}-vs-${slugify(rightBrand)}-${slugify(rightModel)}`;
}

function shortenCompareLabels(leftBrandForms, rightBrandForms, leftModelForms, rightModelForms) {
  let bi = 0;
  let bj = 0;
  let mi = 0;
  let mj = 0;
  const current = () => ({
    leftBrand: leftBrandForms[bi],
    rightBrand: rightBrandForms[bj],
    leftModel: leftModelForms[mi],
    rightModel: rightModelForms[mj],
  });
  const over = () => {
    const labels = current();
    const heading = `${labels.leftBrand} ${labels.leftModel} vs ${labels.rightBrand} ${labels.rightModel}`;
    const title = `${heading}${COMPARE_TITLE_SUFFIX}`;
    const slug = compareSlug(labels.leftBrand, labels.leftModel, labels.rightBrand, labels.rightModel);
    return title.length > COMPARE_TITLE_MAX || slug.length > COMPARE_SLUG_MAX;
  };
  const stepModel = (allowBare) => {
    const leftNext = mi < leftModelForms.length - 1;
    const rightNext = mj < rightModelForms.length - 1;
    const leftOk = leftNext && (allowBare || !isBareNumber(leftModelForms[mi + 1]));
    const rightOk = rightNext && (allowBare || !isBareNumber(rightModelForms[mj + 1]));
    if (!leftOk && !rightOk) return false;
    if (leftOk && (!rightOk || leftModelForms[mi].length >= rightModelForms[mj].length)) mi += 1;
    else mj += 1;
    return true;
  };
  const stepBrand = () => {
    const leftOk = bi < leftBrandForms.length - 1;
    const rightOk = bj < rightBrandForms.length - 1;
    if (!leftOk && !rightOk) return false;
    if (leftOk && (!rightOk || leftBrandForms[bi].length >= rightBrandForms[bj].length)) bi += 1;
    else bj += 1;
    return true;
  };
  // 1. Shorten the longer model, but do not drop to a bare number yet.
  // 2. Switch the longer two-word brand to its initials.
  // 3. Allow a bare number, longer model first. Left wins every tie.
  for (let guard = 0; guard < 16 && over(); guard += 1) {
    if (stepModel(false)) continue;
    if (stepBrand()) continue;
    if (stepModel(true)) continue;
    break;
  }
  return current();
}

function uniqueCompareSlug(base, blocked) {
  if (!blocked.has(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const suffix = `-${n}`;
    let body = base;
    if (body.length + suffix.length > COMPARE_SLUG_MAX) {
      body = body.slice(0, COMPARE_SLUG_MAX - suffix.length).replace(/-+$/g, "");
    }
    const candidate = `${body}${suffix}`;
    if (!blocked.has(candidate)) return candidate;
  }
  return base;
}

// Previous public slug: manufacturer slug + full model slug. Kept so the
// one-day-old long URLs can redirect. Do not shorten this.
export function legacyPairSlug(left, right) {
  const [a, b] = orderPair(left, right);
  const leftPart = `${a.manufacturerSlug || "manufacturer"}-${a.modelSlug || a.id}`;
  const rightPart = `${b.manufacturerSlug || "manufacturer"}-${b.modelSlug || b.id}`;
  return `${leftPart}-vs-${rightPart}`;
}

export function describeComparePair(left, right, brandBySlug) {
  const [a, b] = orderPair(left, right);
  const labels = shortenCompareLabels(
    compareBrandForms(hubName(a, brandBySlug)),
    compareBrandForms(hubName(b, brandBySlug)),
    compareModelForms(a.model),
    compareModelForms(b.model),
  );
  const heading = `${labels.leftBrand} ${labels.leftModel} vs ${labels.rightBrand} ${labels.rightModel}`;
  return {
    left: a,
    right: b,
    ...labels,
    leftLabel: `${labels.leftBrand} ${labels.leftModel}`,
    rightLabel: `${labels.rightBrand} ${labels.rightModel}`,
    heading,
    title: `${heading}${COMPARE_TITLE_SUFFIX}`,
    baseSlug: compareSlug(labels.leftBrand, labels.leftModel, labels.rightBrand, labels.rightModel),
    legacySlug: legacyPairSlug(a, b),
  };
}

export function selectComparePairs(stoves, options = {}) {
  const brandLimit = options.brandLimit ?? COMPARE_BRAND_LIMIT;
  const pairLimit = options.pairLimit ?? COMPARE_PAIR_LIMIT;
  const relativeMax = options.relativeMax ?? COMPARE_HEAT_RELATIVE_MAX;
  const brandBySlug = options.brandBySlug;
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
  const drafted = [];
  for (const candidate of candidates) {
    if (used.has(candidate.left.id) || used.has(candidate.right.id)) continue;
    used.add(candidate.left.id);
    used.add(candidate.right.id);
    const described = describeComparePair(candidate.left, candidate.right, brandBySlug);
    drafted.push({
      ...described,
      heatDiff: candidate.diff,
      heatGap: candidate.gap,
    });
    if (drafted.length === pairLimit) break;
  }
  const blocked = new Set(drafted.map((pair) => pair.legacySlug));
  blocked.add("tool");
  const pairs = [];
  for (const pair of drafted) {
    const slug = uniqueCompareSlug(pair.baseSlug, blocked);
    blocked.add(slug);
    const legacyUrl = `/compare/${pair.legacySlug}/`;
    const url = `/compare/${slug}/`;
    pairs.push({
      ...pair,
      slug,
      url,
      legacyUrl,
    });
  }
  return pairs;
}

export function compareRedirects(pairs) {
  return pairs
    .filter((pair) => pair.legacySlug && pair.legacySlug !== pair.slug)
    .map((pair) => ({
      fromSlug: pair.legacySlug,
      toSlug: pair.slug,
      url: pair.legacyUrl,
      targetUrl: pair.url,
      heading: pair.heading,
      title: pair.title,
    }));
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

export function compareSentences(left, right, snapshotDate, brandBySlug, labels = null) {
  const [a, b] = orderPair(left, right);
  const nameA = labels?.leftModel || compareModelForms(a.model)[0];
  const nameB = labels?.rightModel || compareModelForms(b.model)[0];
  const brandA = brandRecord(a, brandBySlug).name;
  const brandB = brandRecord(b, brandBySlug).name;
  const sameKind = a.type === b.type && (a.subtype || "") === (b.subtype || "");
  const intro = a.current && b.current && sameKind
    ? `EPA lists the ${nameA} model line (${brandA}) and the ${nameB} model line (${brandB}) as currently certified ${pluralKind(a)} as of ${snapshotDate}.`
    : `EPA lists the ${nameA} model line (${brandA}) and the ${nameB} model line (${brandB}) as of ${snapshotDate}.`;
  return [
    intro,
    `EPA lists ${factPhrase(a)} for the ${nameA} model line, and ${factPhrase(b)} for the ${nameB} model line.`,
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

export function compareNotes(left, right) {
  const notes = [
    "Figures are the primary EPA row for each model line. When a line has more than one row, the model page lists every row.",
    "A blank emission, efficiency, or heat-output cell is not listed by EPA. It is not zero.",
    "Listed as currently certified means the row was in EPA's in-production result on the snapshot date. The export has no certification date.",
    "Example comparisons are chosen by brand-hub size, EPA type, subtype, and heat-output midpoint. They are not a ranking.",
    "The address and the title use a short brand label and the primary model name. The model line row is the full EPA string.",
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
