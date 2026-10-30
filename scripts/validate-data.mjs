import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeHubName } from "../src/lib/brand-names.js";
import { sourceIssues } from "../src/lib/heating-cost.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(name) {
  return JSON.parse(readFileSync(join(root, "data", name), "utf8"));
}

const stoves = read("stoves.json");
const brands = read("brands.json");
const stats = read("stats.json");
const meta = read("meta.json");
const firewood = read("firewood.json");
const fuelHeat = read("fuel-heat.json");
const fuelPrices = read("fuel-prices.json");
const noindex = read("noindex-paths.json");

assert.equal(stats.rows.roomAll, 1444);
assert.equal(stats.rows.roomCurrent, 265);
assert.equal(stats.rows.centralAll, 192);
assert.equal(stats.rows.centralCurrent, 41);
assert.equal(meta.rows.roomAll, 1444);
assert.equal(meta.snapshotDate, "2026-10-23");
assert.equal(stoves.filter((stove) => stove.category === "room").reduce((sum, stove) => sum + stove.rowCount, 0), 1444);
assert.equal(stoves.filter((stove) => stove.category === "central").reduce((sum, stove) => sum + stove.rowCount, 0), 192);
assert.equal(stoves.flatMap((stove) => stove.tests).filter((test) => test.current && test.emissionUnit === "g/hr").length, 265);
assert.equal(stoves.flatMap((stove) => stove.tests).filter((test) => test.current && test.emissionUnit === "lb/mmBTU").length, 41);

const ids = new Set();
for (const stove of stoves) {
  assert.ok(!ids.has(stove.id), stove.id);
  ids.add(stove.id);
  assert.equal(typeof stove.emission === "number" || stove.emission === null, true);
  for (const test of stove.tests) {
    for (const key of ["emission", "efficiency", "co", "firebox"]) {
      assert.ok(test[key] === null || typeof test[key] === "number", `${stove.id} ${key}`);
    }
  }
}

for (const row of firewood) {
  assert.match(row.sourceUrl, /^https:\/\//);
  assert.ok(row.btuLow > 0 && row.btuHigh >= row.btuLow);
}

assert.ok(fuelHeat.length >= 7);
assert.ok(fuelPrices.length >= 5);
const heatIds = new Set();
for (const row of fuelHeat) {
  assert.equal(sourceIssues(row).length, 0, `${row.id} ${sourceIssues(row).join(",")}`);
  assert.equal(heatIds.has(row.id), false, row.id);
  heatIds.add(row.id);
  assert.ok(row.btuPerUnit > 0, row.id);
  assert.ok(row.btuText, row.id);
}
const priceIds = new Set();
for (const row of fuelPrices) {
  assert.equal(sourceIssues(row).length, 0, `${row.id} ${sourceIssues(row).join(",")}`);
  assert.equal(priceIds.has(row.id), false, row.id);
  priceIds.add(row.id);
  assert.equal(typeof row.prefill, "boolean", row.id);
  assert.ok(row.price > 0 && row.priceText, row.id);
  if (row.prefill) assert.ok(heatIds.has(row.id), row.id);
  if (row.id.startsWith("pellet") || row.id.includes("wood") || row.id.includes("cord")) {
    assert.equal(row.prefill, false, row.id);
  }
}
assert.equal(fuelPrices.some((row) => row.id === "cord-wood" || row.id === "firewood"), false);

const slugs = new Set(brands.map((brand) => brand.slug));
for (const stove of stoves) {
  assert.ok(slugs.has(stove.primarySlug), stove.primarySlug);
  assert.equal(new Set(stove.brandSlugs).size, stove.brandSlugs.length, stove.id);
}
const normalizedNames = new Map();
for (const brand of brands) {
  const key = normalizeHubName(brand.name);
  assert.ok(key, brand.slug);
  assert.equal(normalizedNames.has(key), false, `${brand.name} collides with ${normalizedNames.get(key)}`);
  normalizedNames.set(key, brand.name);
  const lines = stoves.filter((stove) => stove.brandSlugs.includes(brand.slug));
  assert.ok(lines.length > 0, `empty hub ${brand.slug}`);
}
const primaryByManufacturer = new Map();
for (const brand of brands) {
  if (brand.role !== "primary") continue;
  for (const manufacturer of brand.manufacturers) {
    assert.equal(primaryByManufacturer.has(manufacturer), false, manufacturer);
    primaryByManufacturer.set(manufacturer, brand.slug);
  }
}
for (const stove of stoves) {
  assert.equal(primaryByManufacturer.get(stove.manufacturer), stove.primarySlug, stove.id);
}
const redirects = read("brand-redirects.json");
const history = read("brand-slug-history.json");
for (const [slug, name] of Object.entries(history.slugs)) {
  const brand = brands.find((item) => item.slug === slug);
  const redirect = redirects.find((item) => item.fromSlug === slug);
  assert.ok(brand || redirect, `retired hub ${slug} has no redirect`);
  assert.equal(Boolean(brand && redirect), false, slug);
  if (brand) assert.equal(brand.name, name, slug);
  if (redirect) {
    assert.equal(redirect.fromName, name, slug);
    assert.ok(slugs.has(redirect.toSlug), redirect.toSlug);
  }
}
for (const redirect of redirects) {
  assert.equal(history.slugs[redirect.fromSlug], redirect.fromName);
  assert.ok(noindex.includes(redirect.url), redirect.url);
  assert.equal(noindex.includes(redirect.targetUrl), false, redirect.targetUrl);
}
const drolet = stoves.filter((stove) => stove.brandSlugs.includes("drolet"));
assert.equal(drolet.length, 1);
assert.match(drolet[0].model, /Drolet/);

assert.ok(noindex.includes("/compare/"));
assert.ok(noindex.includes("/finder/"));
assert.equal(noindex.filter((path) => path.startsWith("/stoves/")).length, stats.modelLines.noindex);

console.log(`Data OK: ${stats.rows.roomAll}/${stats.rows.roomCurrent} room, ${stats.rows.centralAll}/${stats.rows.centralCurrent} central, ${stoves.length} model pages.`);
