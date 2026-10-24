import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(name) {
  return JSON.parse(readFileSync(join(root, "data", name), "utf8"));
}

const stoves = read("stoves.json");
const brands = read("brands.json");
const stats = read("stats.json");
const meta = read("meta.json");
const firewood = read("firewood.json");
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

const slugs = new Set(brands.map((brand) => brand.slug));
for (const stove of stoves) {
  assert.ok(slugs.has(stove.primarySlug), stove.primarySlug);
}
const drolet = stoves.filter((stove) => stove.brandSlugs.includes("drolet"));
assert.equal(drolet.length, 1);
assert.match(drolet[0].model, /Drolet/);

assert.ok(noindex.includes("/compare/"));
assert.ok(noindex.includes("/finder/"));
assert.equal(noindex.filter((path) => path.startsWith("/stoves/")).length, stats.modelLines.noindex);

console.log(`Data OK: ${stats.rows.roomAll}/${stats.rows.roomCurrent} room, ${stats.rows.centralAll}/${stats.rows.centralCurrent} central, ${stoves.length} model pages.`);
