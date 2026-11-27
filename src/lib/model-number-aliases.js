import { TRAILING_SUFFIXES } from "./brand-names.js";

// Model-number aliases for the existing lookup and model pages.
//
// Every alias is a token already printed in a committed EPA model string.
// Nothing here invents a code, and nothing is fetched from EPA.
//
// 1. A searchable key is the token's letters and digits, lowercased, with
//    spaces, dots, dashes, slashes, and other punctuation removed.
//    "G2-C130WTS", "g2 c130wts", and "g2c130wts" share one key.
// 2. Keys come only from verbatim substrings of the model cell: the whole
//    cell, a comma / semicolon / colon / parenthesis / "and" piece, a
//    whitespace word inside that piece, or one side of a slash. A retail
//    name is included only when that exact string still sits in the cell.
// 3. A one-token query hits when its key equals one of those keys. Several
//    model lines can share a key. All of them are returned.
// 4. A longer query hits a model line when every number token's key is on
//    that line and every other word is a whole word in the model cell, the
//    EPA manufacturer string, the hub name, or the hub's initials. Initials
//    follow the same hub-name rule as comparison titles (Pacific Energy → pe).
//    "manchester 8361" matches "Manchester 2 8361" because both words are in
//    the cell and 8361 is a number token. A word that is in none of those
//    places drops the line. It is not guessed away.
// 5. "vs" splits a query into sides. Each side is resolved on its own.
// 6. wood, stove, and the other lookup filler words are set aside when other
//    words remain. They are the same words as ALIAS_FILLER.

export const MODEL_QUERY_FILLER = new Set([
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

// Trailing org words dropped before hub initials. Same pair as compareBrandForms.
const HUB_EXTRA = new Set(["group", "industries"]);
const HUB_STOP = new Set(["and", "of", "the", "for", "by"]);
const PIECE_SPLIT = /\s*(?:,|;|:|\(|\)|\band\b)\s*/i;

export function compactModelKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function cleanPiece(value) {
  return String(value || "").trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
}

export function hubInitials(name) {
  const original = String(name || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const words = original.split(/\s+/).filter(Boolean);
  const norms = words.map((word) => word.toLowerCase().replace(/[^a-z0-9]+/g, ""));
  let end = words.length;
  while (end > 0 && TRAILING_SUFFIXES.has(norms[end - 1])) end -= 1;
  while (end > 0 && HUB_EXTRA.has(norms[end - 1])) end -= 1;
  const content = [];
  for (let index = 0; index < end; index += 1) {
    if (!norms[index] || HUB_STOP.has(norms[index])) continue;
    content.push(norms[index]);
  }
  if (content.length < 2) return "";
  return content.map((word) => word[0]).join("");
}

export function modelNumberLabels(model) {
  const text = String(model || "").trim();
  if (!text) return [];
  const labels = [];
  const seen = new Set();
  function consider(label) {
    const value = cleanPiece(label);
    if (!value || value === text || seen.has(value)) return false;
    if (!/\d/.test(value) || /^\d{1,2}$/.test(value)) return false;
    if (!text.includes(value)) return false;
    seen.add(value);
    labels.push(value);
    return true;
  }
  let found = false;
  for (const piece of text.split(PIECE_SPLIT)) {
    if (consider(piece)) found = true;
  }
  if (!found) {
    for (const piece of text.split(/\s+/)) consider(piece);
    for (const piece of text.split("/")) consider(piece);
  }
  return labels;
}

function wordList(...parts) {
  const words = new Set();
  for (const part of parts) {
    for (const word of String(part || "").toLowerCase().split(/[^a-z0-9]+/)) {
      if (word) words.add(word);
    }
  }
  return [...words].sort();
}

function collectKeys(model, retailNames) {
  const text = String(model || "");
  const trimmed = text.trim();
  const keys = new Set();
  const tokens = [];
  const seenText = new Set();
  function add(value) {
    const raw = cleanPiece(value);
    if (!raw || !/\d/.test(raw)) return;
    if (raw !== trimmed && !text.includes(raw)) return;
    const key = compactModelKey(raw);
    if (key.length < 2 || !/\d/.test(key)) return;
    keys.add(key);
    if (raw === trimmed || seenText.has(raw)) return;
    seenText.add(raw);
    tokens.push({ key, text: raw });
  }
  function addAll(value) {
    const raw = cleanPiece(value);
    if (!raw) return;
    add(raw);
    for (const word of raw.split(/\s+/)) {
      add(word);
      if (!word.includes("/")) continue;
      for (const part of word.split("/")) add(part);
    }
  }
  add(trimmed);
  for (const name of retailNames || []) addAll(name);
  for (const piece of text.split(PIECE_SPLIT)) addAll(piece);
  return { keys: [...keys].sort(), tokens };
}

export function buildModelNumberIndex(stoves, brands) {
  const brandBySlug = new Map((brands || []).map((brand) => [brand.slug, brand]));
  const records = [];
  const allKeys = new Set();
  for (const stove of stoves || []) {
    const model = String(stove?.model || "");
    const collected = collectKeys(model, stove?.retailNames);
    if (!collected.keys.length) continue;
    const labels = modelNumberLabels(model);
    const brandNames = [];
    const initials = new Set();
    for (const slug of stove.brandSlugs || []) {
      const brand = brandBySlug.get(slug);
      if (!brand?.name) continue;
      brandNames.push(brand.name);
      const initial = hubInitials(brand.name);
      if (initial.length >= 2) initials.add(initial);
    }
    for (const key of collected.keys) allKeys.add(key);
    records.push({
      id: stove.id,
      url: labels.length ? `${stove.url}#model-numbers` : stove.url,
      model,
      mfr: stove.manufacturer || "",
      current: Boolean(stove.current),
      keys: collected.keys,
      words: wordList(model, stove.manufacturer, ...(stove.retailNames || []), ...brandNames),
      initials: [...initials].sort(),
      tokens: collected.tokens,
    });
  }
  records.sort((a, b) => a.id.localeCompare(b.id));
  return { tokenCount: allKeys.size, stoves: records };
}

export function hydrateModelNumberIndex(payload) {
  const source = Array.isArray(payload?.stoves) ? payload.stoves : [];
  const records = source.map((stove) => ({
    ...stove,
    keys: stove.keys || [],
    words: stove.words || [],
    initials: stove.initials || [],
    tokens: stove.tokens || [],
    keySet: new Set(stove.keys || []),
    wordSet: new Set(stove.words || []),
    initialSet: new Set(stove.initials || []),
  }));
  const byKey = new Map();
  records.forEach((record, index) => {
    for (const key of record.keys) {
      const list = byKey.get(key);
      if (list) list.push(index);
      else byKey.set(key, [index]);
    }
  });
  return { records, byKey, tokenCount: byKey.size };
}

export function queryTokens(value) {
  const raw = String(value || "")
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter(Boolean);
  const kept = raw.filter((token) => !MODEL_QUERY_FILLER.has(compactModelKey(token)));
  return kept.length ? kept : raw;
}

export function splitModelQuery(query) {
  const text = String(query || "").trim();
  const parts = text.split(/\s+vs\.?\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) return parts;
  return text ? [text] : [];
}

function byListing(a, b) {
  return Number(b.current) - Number(a.current) || a.model.localeCompare(b.model, "en") || a.id.localeCompare(b.id);
}

function present(record, keys, side) {
  const sideKey = compactModelKey(side);
  const candidates = [];
  const seen = new Set();
  for (const token of record.tokens) {
    if (seen.has(token.text)) continue;
    const covers = [...keys].some((key) => token.key === key || token.key.includes(key));
    if (!covers || !sideKey.includes(token.key)) continue;
    seen.add(token.text);
    candidates.push(token.text);
  }
  candidates.sort((a, b) => b.length - a.length || a.localeCompare(b, "en"));
  const matched = [];
  for (const text of candidates) {
    if (matched.some((longer) => longer.includes(text))) continue;
    matched.push(text);
  }
  return {
    id: record.id,
    url: record.url,
    model: record.model,
    mfr: record.mfr,
    current: record.current,
    matched,
  };
}

function matchesForKey(index, key) {
  if (!key || key.length < 2) return [];
  const hits = index.byKey.get(key);
  if (!hits) return [];
  return hits.map((entry) => index.records[entry]);
}

function resolveSide(index, side) {
  const fullKey = compactModelKey(side);
  const full = matchesForKey(index, fullKey);
  if (full.length) return full.map((record) => present(record, new Set([fullKey]), side));

  const tokens = queryTokens(side);
  const strippedKey = compactModelKey(tokens.join(" "));
  if (strippedKey && strippedKey !== fullKey) {
    const stripped = matchesForKey(index, strippedKey);
    if (stripped.length) return stripped.map((record) => present(record, new Set([strippedKey]), side));
  }

  const numberTokens = tokens.filter((token) => /\d/.test(token) && compactModelKey(token).length >= 2);
  const letterTokens = tokens.filter((token) => {
    const key = compactModelKey(token);
    return key.length >= 2 && !/\d/.test(key);
  });
  if (!numberTokens.length || !letterTokens.length) return [];
  const numberKeys = numberTokens.map((token) => compactModelKey(token));
  const letterKeys = letterTokens.map((token) => compactModelKey(token));
  const hits = [];
  for (const record of index.records) {
    if (!numberKeys.every((key) => record.keySet.has(key))) continue;
    if (!letterKeys.every((key) => record.wordSet.has(key) || record.initialSet.has(key))) continue;
    hits.push(present(record, new Set(numberKeys), side));
  }
  return hits;
}

export function resolveModelNumberQuery(index, query) {
  const sides = splitModelQuery(query).map((side) => ({
    query: side,
    matches: resolveSide(index, side).sort(byListing),
  }));
  const seen = new Set();
  const matches = [];
  for (const side of sides) {
    for (const match of side.matches) {
      if (seen.has(match.id)) continue;
      seen.add(match.id);
      matches.push(match);
    }
  }
  matches.sort(byListing);
  return { sides, matches };
}

export function modelNumberStatus(result, snapshotDate) {
  const listed = snapshotDate ? `is not in EPA's list as of ${snapshotDate}` : "is not in EPA's list";
  const sides = result?.sides || [];
  if (!sides.length) return `That model number ${listed}.`;
  const countText = (count) => (count === 1 ? "1 model line" : `${count.toLocaleString("en-US")} model lines`);
  if (sides.length === 1) {
    const side = sides[0];
    if (!side.matches.length) return `${side.query} ${listed}.`;
    const verb = side.matches.length === 1 ? "lists" : "list";
    return `${countText(side.matches.length)} ${verb} that model number.`;
  }
  return sides.map((side) => {
    if (!side.matches.length) return `${side.query} ${listed}.`;
    return `${side.query} matches ${countText(side.matches.length)}.`;
  }).join(" ");
}
