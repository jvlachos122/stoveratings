import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatCount } from "./format.js";

// Name aliases for the lookup. There is no search-volume file in this repo.
//
// Rule, applied only to the committed EPA snapshot:
// 1. If data/retail-alias-research.json exists, it is the list. Each entry is
//    { query, label?, listedAs? }, in file order, capped at ALIAS_LIMIT.
//    A query that matches no retail name is omitted. The file is not padded.
// 2. Otherwise the first aliases are PINNED_ALIASES, in that order. They are
//    the buying-intent phrases named for this list.
// 3. The remaining slots are exact retail names from this snapshot. Count a
//    name once per model line. Order by that count descending, then by how
//    many of those lines are currently certified, then by name (en).
// 4. Skip a frequency name when its text is one of the pinned queries, or
//    when its tokens sit inside a pinned query and every line it matches is
//    already listed under that phrase.
// 5. A phrase matches a model line only when one retail name contains the
//    words, in order. "wood" and "stove" are set aside when other words
//    remain. A leading brand name is set aside only when the remaining words
//    match. If that brand is on at least one matching line, lines without it
//    are omitted. If it is on none of them, every matching line is listed and
//    the alias says the brand word is not in those cells. A numeric word
//    matches that number or that number plus a decimal part (30 matches 30.2)
//    and does not match a longer integer (30 does not match 300 or AF30).
//
// The list is not a ranking and it is not a search-volume measurement.

export const ALIAS_LIMIT = 40;
export const RESEARCH_FILENAME = "retail-alias-research.json";

export const ALIAS_FILLER = new Set([
  "wood",
  "stove",
  "stoves",
  "pellet",
  "pellets",
  "heater",
  "heaters",
  "epa",
  "certified",
]);

export const PINNED_ALIASES = [
  { query: "ashley wood stove", label: "Ashley wood stove", listedAs: "Ashley" },
  { query: "vogelzang", label: "Vogelzang", listedAs: "Vogelzang" },
  { query: "castle serenity", label: "Castle Serenity", listedAs: "Castle Serenity" },
  { query: "blaze king ashford 30", label: "Blaze King Ashford 30", listedAs: "Ashford 30" },
  { query: "drolet escape 1500", label: "Drolet Escape 1500", listedAs: "Escape 1500" },
];

const RESEARCH_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../data", RESEARCH_FILENAME);

export function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function significantTokens(phrase) {
  const all = tokenize(phrase);
  const kept = all.filter((token) => !ALIAS_FILLER.has(token));
  return kept.length ? kept : all;
}

export function tokenMatches(queryToken, nameToken) {
  if (queryToken === nameToken) return true;
  return /^\d+$/.test(queryToken) && nameToken.startsWith(`${queryToken}.`);
}

export function containsContiguous(haystack, needle) {
  if (!needle.length || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    let matched = true;
    for (let index = 0; index < needle.length; index += 1) {
      if (!tokenMatches(needle[index], haystack[start + index])) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

export function aliasSlug(text) {
  const slug = String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "name";
}

function uniqueSlug(text, used) {
  const base = aliasSlug(text);
  let slug = `alias-${base}`;
  let suffix = 2;
  while (used.has(slug)) {
    slug = `alias-${base}-${suffix}`;
    suffix += 1;
  }
  used.add(slug);
  return slug;
}

function brandTokenList(brands) {
  return (brands || [])
    .map((brand) => ({
      name: brand.name,
      slug: brand.slug,
      tokens: tokenize(brand.name),
    }))
    .filter((brand) => brand.tokens.length)
    .sort((a, b) => b.tokens.length - a.tokens.length || b.name.length - a.name.length || a.name.localeCompare(b.name, "en"));
}

function lineListsBrand(stove, brand) {
  if (Array.isArray(stove.brandSlugs) && stove.brandSlugs.includes(brand.slug)) return true;
  const haystack = tokenize(`${stove.manufacturer || ""} ${stove.model || ""}`);
  return containsContiguous(haystack, brand.tokens);
}

function matchingRetailName(stove, tokens) {
  for (const name of stove.retailNames || []) {
    if (containsContiguous(tokenize(name), tokens)) return name;
  }
  return "";
}

function exactRetailName(stove, key) {
  for (const name of stove.retailNames || []) {
    if (name.toLowerCase() === key) return name;
  }
  return "";
}

function targetFrom(stove, retailName) {
  const url = stove.url || "";
  return {
    id: stove.id,
    url,
    href: `${url}#retail-names`,
    model: stove.model,
    manufacturer: stove.manufacturer || "",
    current: Boolean(stove.current),
    type: stove.type || "",
    retailName,
  };
}

function compareTargets(a, b) {
  const current = Number(b.current) - Number(a.current);
  if (current) return current;
  const model = a.model.localeCompare(b.model, "en");
  if (model) return model;
  return String(a.id).localeCompare(String(b.id));
}

export function resolveAliasPhrase(stoves, brands, phrase) {
  const tokens = significantTokens(phrase);
  const direct = [];
  for (const stove of stoves) {
    const retailName = matchingRetailName(stove, tokens);
    if (retailName) direct.push(targetFrom(stove, retailName));
  }
  if (direct.length) {
    direct.sort(compareTargets);
    return { tokens, targets: direct, brandListed: true, peeledBrand: "" };
  }

  const queryTokens = tokenize(phrase);
  let peeled = null;
  for (const brand of brandTokenList(brands)) {
    if (brand.tokens.length >= queryTokens.length) continue;
    const prefix = queryTokens.slice(0, brand.tokens.length);
    if (prefix.every((token, index) => token === brand.tokens[index])) {
      peeled = brand;
      break;
    }
  }
  if (!peeled) return { tokens, targets: [], brandListed: true, peeledBrand: "" };

  const rest = significantTokens(queryTokens.slice(peeled.tokens.length).join(" "));
  if (!rest.length) return { tokens, targets: [], brandListed: true, peeledBrand: "" };
  const loose = [];
  for (const stove of stoves) {
    const retailName = matchingRetailName(stove, rest);
    if (retailName) loose.push({ stove, retailName });
  }
  const branded = loose.filter((item) => lineListsBrand(item.stove, peeled));
  const chosen = branded.length ? branded : loose;
  const targets = chosen.map((item) => targetFrom(item.stove, item.retailName)).sort(compareTargets);
  return {
    tokens: rest,
    targets,
    brandListed: branded.length > 0,
    peeledBrand: peeled.name,
  };
}

function casingFor(casings) {
  return [...casings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en"))[0][0];
}

export function rankRetailNames(stoves) {
  const rows = new Map();
  for (const stove of stoves) {
    const seen = new Set();
    for (const name of stove.retailNames || []) {
      const key = name.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      let row = rows.get(key);
      if (!row) {
        row = { key, casings: new Map(), ids: [], current: 0 };
        rows.set(key, row);
      }
      row.casings.set(name, (row.casings.get(name) || 0) + 1);
      row.ids.push(stove.id);
      if (stove.current) row.current += 1;
    }
  }
  const ranked = [...rows.values()];
  for (const row of ranked) {
    row.lines = row.ids.length;
    row.name = casingFor(row.casings);
  }
  ranked.sort((a, b) => b.lines - a.lines || b.current - a.current || a.name.localeCompare(b.name, "en") || a.key.localeCompare(b.key));
  return ranked;
}

function coveredByPhrase(row, phrases) {
  if (phrases.some((alias) => alias.query.toLowerCase() === row.key)) return true;
  const nameTokens = tokenize(row.name);
  for (const alias of phrases) {
    if (!containsContiguous(tokenize(alias.query), nameTokens)) continue;
    const ids = new Set(alias.targets.map((target) => target.id));
    if (row.ids.every((id) => ids.has(id))) return true;
  }
  return false;
}

function finishAlias(partial, used) {
  const slug = uniqueSlug(partial.query, used);
  return {
    ...partial,
    slug,
    anchor: `/lookup/#${slug}`,
    lines: partial.targets.length,
    currentLines: partial.targets.filter((target) => target.current).length,
  };
}

function phraseAlias(stoves, brands, spec, source, used) {
  const resolved = resolveAliasPhrase(stoves, brands, spec.query);
  return finishAlias({
    query: spec.query,
    label: spec.label || spec.query,
    listedAs: spec.listedAs || spec.label || spec.query,
    source,
    brandListed: resolved.brandListed,
    peeledBrand: resolved.brandListed ? "" : resolved.peeledBrand,
    targets: resolved.targets,
  }, used);
}

function exactAlias(stoves, row, used) {
  const byId = new Map(stoves.map((stove) => [stove.id, stove]));
  const targets = [];
  for (const id of row.ids) {
    const stove = byId.get(id);
    if (!stove) continue;
    targets.push(targetFrom(stove, exactRetailName(stove, row.key) || row.name));
  }
  targets.sort(compareTargets);
  return finishAlias({
    query: row.name,
    label: row.name,
    listedAs: row.name,
    source: "frequency",
    brandListed: true,
    peeledBrand: "",
    targets,
  }, used);
}

export function readAliasResearch(path = RESEARCH_PATH) {
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${RESEARCH_FILENAME} must be a JSON array`);
  return parsed.map((entry, index) => {
    const query = String(entry?.query || "").trim();
    if (!query) throw new Error(`${RESEARCH_FILENAME} entry ${index + 1} is missing query`);
    return {
      query,
      label: String(entry.label || query).trim(),
      listedAs: String(entry.listedAs || entry.label || query).trim(),
    };
  });
}

export function selectRetailAliases(stoves, brands, options = {}) {
  const research = options.research === undefined ? readAliasResearch(options.researchPath) : options.research;
  const used = new Set();
  if (Array.isArray(research)) {
    const selected = [];
    for (const spec of research) {
      if (selected.length >= ALIAS_LIMIT) break;
      const alias = phraseAlias(stoves, brands, spec, "research", used);
      if (!alias.targets.length) continue;
      selected.push(alias);
    }
    return selected;
  }

  const pinned = PINNED_ALIASES.map((spec) => phraseAlias(stoves, brands, spec, "example", used));
  for (const alias of pinned) {
    if (!alias.targets.length) throw new Error(`pinned alias matched no retail name: ${alias.query}`);
  }
  const frequency = [];
  for (const row of rankRetailNames(stoves)) {
    if (pinned.length + frequency.length >= ALIAS_LIMIT) break;
    if (coveredByPhrase(row, pinned)) continue;
    frequency.push(exactAlias(stoves, row, used));
  }
  return [...pinned, ...frequency];
}

export function aliasSentences(alias) {
  const lines = alias.targets.length;
  const lineText = lines === 1 ? "1 model line" : `${formatCount(lines)} model lines`;
  const current = alias.targets.filter((target) => target.current).length;
  const currentText = current === 1 ? "1 of those lines is currently certified" : `${formatCount(current)} of those lines are currently certified`;
  const sentences = [
    `EPA lists ${alias.listedAs} on ${lineText} in this snapshot, and ${currentText}.`,
  ];
  if (alias.peeledBrand && alias.brandListed === false) {
    sentences.push(`${alias.peeledBrand} is not in those model cells.`);
  }
  return sentences;
}

export function aliasSearchEntries(aliases) {
  const entries = [];
  for (const alias of aliases) {
    for (const target of alias.targets) {
      entries.push({
        n: alias.label,
        q: alias.query.toLowerCase(),
        alias: true,
        id: target.id,
        url: target.href,
        current: target.current,
        mfr: target.manufacturer,
        model: target.model,
        type: target.type,
      });
    }
  }
  return entries;
}

export function aliasQueryHit(entry, query) {
  if (!entry?.alias) return false;
  const text = String(query || "").trim().toLowerCase();
  if (!text || entry.q === text) return entry.q === text;
  const tokens = text.split(/[^a-z0-9.]+/).filter(Boolean).filter((token) => !ALIAS_FILLER.has(token));
  if (tokens.length < 2) return false;
  return entry.q.includes(text);
}
