import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import noindex from "../data/noindex-paths.json" with { type: "json" };
import { compareBrandForms } from "../src/lib/compare-pairs.js";
import {
  buildModelNumberIndex,
  compactModelKey,
  hubInitials,
  hydrateModelNumberIndex,
  modelNumberLabels,
  modelNumberStatus,
  MODEL_QUERY_FILLER,
  resolveModelNumberQuery,
} from "../src/lib/model-number-aliases.js";
import { ALIAS_FILLER } from "../src/lib/retail-aliases.js";
import { buildSitemapLastmods, buildSitemapLastmodsFromDates } from "../src/lib/sitemap-lastmod.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stoves = JSON.parse(readFileSync(join(root, "data/stoves.json"), "utf8"));
const brands = JSON.parse(readFileSync(join(root, "data/brands.json"), "utf8"));
const meta = JSON.parse(readFileSync(join(root, "data/meta.json"), "utf8"));
const built = buildModelNumberIndex(stoves, brands);
const index = hydrateModelNumberIndex(JSON.parse(JSON.stringify(built)));
const byId = new Map(stoves.map((stove) => [stove.id, stove]));
const SITEMAP_URL_HASH_BEFORE_BURN_RULES = "90100cc20d1d6045b2088974b9241c87d46f87421bfbb4d8639578dc531365f1";
const BASE = "2026-01-01T00:00:00Z";
const PAGE_COMMIT = "2026-11-21T15:00:00Z";

class FallbackDates extends Map {
  constructor(fallback, entries) {
    super(entries);
    this.fallback = fallback;
  }

  get(key) {
    return super.has(key) ? super.get(key) : this.fallback;
  }
}

function changedPaths(before, after) {
  const changed = [];
  for (const [path, date] of after) {
    if (before.get(path) !== date) changed.push(path);
  }
  for (const path of before.keys()) {
    if (!after.has(path)) changed.push(path);
  }
  return changed.sort();
}

function ids(matches) {
  return matches.map((match) => match.id).sort();
}

function resolve(query) {
  return resolveModelNumberQuery(index, query);
}

// Independent of the index: a key counts only when some verbatim piece of the
// model cell compacts to it. Retail names that are not still in the cell do not.
function expectsKey(stove, key) {
  const model = String(stove.model || "");
  function add(value, found) {
    const raw = String(value || "").trim().replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    if (!raw || !/\d/.test(raw)) return;
    if (raw !== model.trim() && !model.includes(raw)) return;
    if (compactModelKey(raw) === key) found.add(raw);
  }
  const found = new Set();
  add(model, found);
  for (const name of stove.retailNames || []) {
    add(name, found);
    for (const word of String(name).split(/\s+/)) {
      add(word, found);
      for (const part of String(word).split("/")) add(part, found);
    }
  }
  for (const piece of model.split(/\s*(?:,|;|:|\(|\)|\band\b)\s*/i)) {
    add(piece, found);
    for (const word of String(piece).split(/\s+/)) {
      add(word, found);
      for (const part of String(word).split("/")) add(part, found);
    }
  }
  return found.size > 0;
}

function stovesWithKey(key) {
  return stoves.filter((stove) => expectsKey(stove, key));
}

test("compact keys ignore case, spaces, dots, dashes, and slashes", () => {
  assert.equal(compactModelKey("G2-C130WTS"), "g2c130wts");
  assert.equal(compactModelKey("g2 c130wts"), compactModelKey("G2-C130WTS"));
  assert.equal(compactModelKey("HP 21"), "hp21");
  assert.equal(compactModelKey("hp-21"), "hp21");
  assert.equal(compactModelKey("848.09.73"), "8480973");
  assert.equal(compactModelKey("PE/PES 12-20"), "pepes1220");
});

test("filler words stay the same list the retail-name lookup already uses", () => {
  assert.deepEqual([...MODEL_QUERY_FILLER].sort(), [...ALIAS_FILLER].sort());
});

test("hub initials follow the comparison title forms for every committed hub", () => {
  function expected(name) {
    const forms = compareBrandForms(name);
    if (forms.length >= 2) return forms[forms.length - 1].toLowerCase().replace(/[^a-z0-9]+/g, "");
    const mine = hubInitials(name);
    const only = forms[0] ? forms[0].toLowerCase().replace(/[^a-z0-9]+/g, "") : "";
    if (forms.length === 1 && mine && mine === only) return mine;
    return "";
  }
  assert.ok(brands.length > 0);
  for (const brand of brands) assert.equal(hubInitials(brand.name), expected(brand.name), brand.name);
});

test("every indexed token is a verbatim substring, and the key count is not a fixed total", () => {
  assert.equal(index.tokenCount, built.tokenCount);
  assert.equal(index.byKey.size, built.tokenCount);
  assert.ok(built.tokenCount > 0);
  assert.equal(index.records.length, built.stoves.length);
  for (const record of index.records) {
    const stove = byId.get(record.id);
    assert.ok(stove);
    assert.equal(record.model, stove.model);
    const explained = new Set([compactModelKey(stove.model)]);
    for (const token of record.tokens) {
      assert.equal(stove.model.includes(token.text), true, token.text);
      assert.equal(token.key, compactModelKey(token.text));
      assert.match(token.key, /\d/);
      explained.add(token.key);
    }
    for (const key of record.keys) {
      assert.match(key, /\d/);
      assert.equal(explained.has(key), true, `${record.id} ${key}`);
    }
    const labels = modelNumberLabels(stove.model);
    for (const label of labels) {
      assert.equal(stove.model.includes(label), true, label);
      assert.notEqual(label, stove.model.trim());
      assert.match(label, /\d/);
      assert.equal(/^\d{1,2}$/.test(label), false);
    }
    if (labels.length) assert.equal(record.url, `${stove.url}#model-numbers`);
    else assert.equal(record.url, stove.url);
  }
});

test("g2-c130wts resolves with or without the dash to the lines that print it", () => {
  const expected = ids(stovesWithKey("g2c130wts").map((stove) => ({ id: stove.id })));
  assert.ok(expected.length > 0);
  assert.deepEqual(ids(resolve("g2-c130wts").matches), expected);
  assert.deepEqual(ids(resolve("g2c130wts").matches), expected);
  assert.deepEqual(ids(resolve("G2-C130WTS").matches), expected);
  for (const hit of resolve("G2-C130WTS").matches) {
    assert.equal(hit.model.includes("G2-C130WTS"), true);
    assert.ok(hit.matched.includes("G2-C130WTS"));
  }
});

test("hp21 resolves to every committed HP 21 line and no other line", () => {
  const expected = ids(stovesWithKey("hp21").map((stove) => ({ id: stove.id })));
  assert.ok(expected.length > 0);
  assert.deepEqual(ids(resolve("hp21").matches), expected);
  assert.deepEqual(ids(resolve("HP 21").matches), expected);
  assert.deepEqual(ids(resolve("hp-21").matches), expected);
  for (const hit of resolve("hp21").matches) assert.equal(compactModelKey(hit.model), "hp21");
});

test("manchester 8361 resolves to lines that print both words, including the intervening 2", () => {
  const expected = stoves.filter((stove) => /\bmanchester\b/i.test(stove.model) && expectsKey(stove, "8361"));
  assert.ok(expected.length > 0);
  assert.deepEqual(ids(resolve("manchester 8361").matches), ids(expected.map((stove) => ({ id: stove.id }))));
  for (const hit of resolve("manchester 8361").matches) {
    assert.match(hit.model, /\bmanchester\b/i);
    assert.match(hit.model, /\b8361\b/);
    assert.ok(hit.matched.includes("8361"));
  }
  const message = modelNumberStatus(resolve("manchester 8361"), meta.snapshotDate);
  assert.match(message, /model line/);
  assert.doesNotMatch(message, /\bbest\b/i);
});

test("848.09.73 is returned only when a committed model cell contains that key", () => {
  const expected = stovesWithKey("8480973");
  const result = resolve("848.09.73");
  assert.deepEqual(ids(result.matches), ids(expected.map((stove) => ({ id: stove.id }))));
  if (!expected.length) {
    const message = modelNumberStatus(result, meta.snapshotDate);
    assert.match(message, new RegExp(`848\\.09\\.73 is not in EPA's list as of ${meta.snapshotDate}`));
    assert.doesNotMatch(message, /G2-|HP 21|Manchester|Vista/);
  }
});

test("a two-model vs query lists each side that the cells support and does not invent the other", () => {
  const query = "pe vista classic le2 vs neo view 1.6 le2";
  const result = resolve(query);
  assert.equal(result.sides.length, 2);
  assert.equal(result.sides[0].query, "pe vista classic le2");
  assert.equal(result.sides[1].query, "neo view 1.6 le2");
  const leftExpected = stoves.filter((stove) => {
    if (!expectsKey(stove, "le2")) return false;
    const words = `${stove.model} ${stove.manufacturer}`.toLowerCase();
    if (!/\bvista\b/.test(words) || !/\bclassic\b/.test(words)) return false;
    const initials = new Set((stove.brandSlugs || []).map((slug) => hubInitials(brands.find((brand) => brand.slug === slug)?.name || "")));
    return /\bpe\b/.test(words) || initials.has("pe");
  });
  assert.ok(leftExpected.length > 0);
  assert.deepEqual(ids(result.sides[0].matches), ids(leftExpected.map((stove) => ({ id: stove.id }))));
  for (const hit of result.sides[0].matches) {
    assert.match(hit.model, /Vista Classic LE2/);
    assert.ok(hit.matched.includes("Vista Classic LE2"));
  }

  const rightExpected = stoves.filter((stove) => {
    if (!expectsKey(stove, "le2") || !expectsKey(stove, "16")) return false;
    const words = `${stove.model} ${stove.manufacturer}`.toLowerCase();
    if (!/\bneo\b/.test(words)) return false;
    const initials = new Set((stove.brandSlugs || []).map((slug) => hubInitials(brands.find((brand) => brand.slug === slug)?.name || "")));
    return /\bview\b/.test(words) || initials.has("view");
  });
  assert.deepEqual(ids(result.sides[1].matches), ids(rightExpected.map((stove) => ({ id: stove.id }))));
  for (const hit of result.sides[1].matches) assert.match(`${hit.model} ${hit.mfr}`, /\bview\b/i);
  if (!rightExpected.length) {
    const message = modelNumberStatus(result, meta.snapshotDate);
    assert.match(message, /Vista Classic LE2|pe vista classic le2/);
    assert.match(message, new RegExp(`neo view 1\\.6 le2 is not in EPA's list as of ${meta.snapshotDate}`));
  }
  for (const hit of result.matches) {
    assert.equal(byId.get(hit.id).model, hit.model);
    for (const text of hit.matched) assert.equal(hit.model.includes(text), true);
    assert.equal(hit.url.startsWith(byId.get(hit.id).url), true);
  }
});

test("an extra brand word that the cell does not print is not turned into a model-number hit", () => {
  for (const hit of resolve("drolet escape 1500").matches) {
    assert.match(`${hit.model} ${hit.mfr}`, /\bdrolet\b/i);
  }
});

test("a code that is not in the model cells returns no model", () => {
  const query = "zz-not-listed-99999";
  const result = resolve(query);
  assert.deepEqual(result.matches, []);
  assert.equal(stovesWithKey(compactModelKey(query)).length, 0);
  const message = modelNumberStatus(result, meta.snapshotDate);
  assert.match(message, new RegExp(`${query} is not in EPA's list as of ${meta.snapshotDate}`));
  assert.doesNotMatch(message, /\bbest\b|https?:\/\//i);
});

test("model pages and the lookup expose the tokens without a new URL", () => {
  const modelPage = readFileSync(join(root, "src/pages/stoves/[manufacturer]/[model].astro"), "utf8");
  const lookup = readFileSync(join(root, "src/pages/lookup.astro"), "utf8");
  const client = readFileSync(join(root, "src/lib/lookup-client.js"), "utf8");
  const prep = readFileSync(join(root, "scripts/prepare-public-data.mjs"), "utf8");
  assert.match(modelPage, /modelNumberLabels\(stove\.model\)/);
  assert.match(modelPage, /id="model-numbers"/);
  assert.match(modelPage, /id="retail-names"/);
  assert.match(modelPage, /<caption>Model numbers copied from this EPA model cell<\/caption>/);
  assert.doesNotMatch(modelPage, /\bbest\b/i);
  assert.match(lookup, /buildModelNumberIndex/);
  assert.match(lookup, /model-number tokens/);
  assert.match(lookup, /mountLookup/);
  assert.doesNotMatch(lookup, /src="\/scripts\/lookup\.js"/);
  assert.doesNotMatch(lookup, /\bbest\b/i);
  assert.match(client, /resolveModelNumberQuery/);
  assert.match(client, /entry\.alias/);
  assert.match(prep, /buildModelNumberIndex/);
  assert.match(prep, /modelNumbers/);
  const lib = readFileSync(join(root, "src/lib/model-number-aliases.js"), "utf8");
  assert.doesNotMatch(lib, /affiliates|cfpub\.epa\.gov/);
  const enerco = stoves.find((stove) => stove.model.includes("G2-C130WTS"));
  assert.ok(modelNumberLabels(enerco.model).includes("G2-C130WTS"));
  const manchester = stoves.find((stove) => stove.model.includes("8361"));
  assert.ok(modelNumberLabels(manchester.model).includes("8361"));
  assert.equal(modelNumberLabels(manchester.model).includes("2"), false);
  for (const stove of stoves.filter((item) => item.model === "HP 21")) {
    assert.equal(modelNumberLabels(stove.model).includes("HP21"), false);
  }
});

test("sitemap membership is unchanged", () => {
  const hidden = new Set(noindex);
  const urls = [...buildSitemapLastmods().keys()].filter((path) => !hidden.has(path) && !path.includes("404")).sort();
  const prior = urls.filter((path) => path !== "/burn-rules/");
  assert.equal(urls.length, prior.length + 1);
  assert.equal(
    createHash("sha256").update(prior.join("\n")).digest("hex"),
    SITEMAP_URL_HASH_BEFORE_BURN_RULES,
  );
  assert.equal(urls.includes("/lookup/"), true);
  assert.equal(urls.some((path) => path.startsWith("/lookup/") && path !== "/lookup/"), false);
});

test("model-number copy moves the lookup and stove URLs, and the client moves only the lookup", () => {
  const baseline = buildSitemapLastmodsFromDates(new FallbackDates(BASE));
  const moduleEdit = buildSitemapLastmodsFromDates(new FallbackDates(BASE, [
    ["src/lib/model-number-aliases.js", PAGE_COMMIT],
  ]));
  const changed = changedPaths(baseline, moduleEdit);
  assert.ok(changed.includes("/lookup/"));
  for (const stove of stoves) assert.ok(changed.includes(stove.url), stove.url);
  for (const path of changed) {
    assert.equal(path === "/lookup/" || /^\/stoves\/[^/]+\/[^/]+\/$/.test(path), true, path);
  }
  const clientEdit = buildSitemapLastmodsFromDates(new FallbackDates(BASE, [
    ["src/lib/lookup-client.js", PAGE_COMMIT],
  ]));
  assert.deepEqual(changedPaths(baseline, clientEdit), ["/lookup/"]);
});
