import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { excludedEmission, rankByEmission } from "../src/lib/lists.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pelletPath = "/cleanest-burning-pellet-stoves/";

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function emissionOrder(stoves, type) {
  return stoves
    .filter((stove) => stove.current && stove.type === type && stove.emission != null)
    .sort((a, b) => {
      if (a.emission !== b.emission) return a.emission - b.emission;
      const left = a.efficiency == null ? -1 : a.efficiency;
      const right = b.efficiency == null ? -1 : b.efficiency;
      if (left !== right) return right - left;
      return a.model.localeCompare(b.model);
    });
}

test("emission order matches a recompute and does not treat a blank as zero", () => {
  const stoves = JSON.parse(read("data/stoves.json"));
  const ranked = rankByEmission(stoves, "Pellet Stove");
  const expected = emissionOrder(stoves, "Pellet Stove");
  assert.deepEqual(ranked.map((stove) => stove.id), expected.map((stove) => stove.id));
  const current = stoves.filter((stove) => stove.current && stove.type === "Pellet Stove");
  const excluded = current.filter((stove) => stove.emission == null);
  assert.equal(excludedEmission(stoves, "Pellet Stove"), excluded.length);
  assert.equal(ranked.length + excluded.length, current.length);
  assert.equal(ranked.some((stove) => stove.emission == null || stove.emission === ""), false);
  for (let index = 1; index < ranked.length; index += 1) {
    const previous = ranked[index - 1];
    const currentRow = ranked[index];
    assert.ok(previous.emission <= currentRow.emission);
    if (previous.emission !== currentRow.emission) continue;
    const previousEfficiency = previous.efficiency == null ? -1 : previous.efficiency;
    const currentEfficiency = currentRow.efficiency == null ? -1 : currentRow.efficiency;
    assert.ok(previousEfficiency >= currentEfficiency);
    if (previousEfficiency === currentEfficiency) {
      assert.ok(previous.model.localeCompare(currentRow.model) <= 0);
    }
  }
  if (ranked.length) {
    const lowest = Math.min(...ranked.map((stove) => stove.emission));
    assert.equal(ranked[0].emission, lowest);
    assert.equal(ranked.every((stove) => stove.emissionUnit === "g/hr"), true);
  }

  const fixture = [
    { current: true, type: "Pellet Stove", emission: null, efficiency: 99, model: "Blank" },
    { current: true, type: "Pellet Stove", emission: 0, efficiency: 10, model: "Listed zero" },
    { current: true, type: "Pellet Stove", emission: 0.2, efficiency: 70, model: "Zed" },
    { current: true, type: "Pellet Stove", emission: 0.2, efficiency: 70, model: "Alpha" },
    { current: true, type: "Pellet Stove", emission: 0.2, efficiency: 80, model: "Higher efficiency" },
    { current: true, type: "Pellet Stove", emission: 0.2, efficiency: null, model: "Missing efficiency" },
    { current: false, type: "Pellet Stove", emission: 0, efficiency: 99, model: "Previous zero" },
    { current: true, type: "Wood Stove", emission: 0, efficiency: 99, model: "Wood zero" },
  ];
  assert.deepEqual(rankByEmission(fixture, "Pellet Stove").map((stove) => stove.model), [
    "Listed zero",
    "Higher efficiency",
    "Alpha",
    "Zed",
    "Missing efficiency",
  ]);
  assert.equal(rankByEmission(fixture, "Pellet Stove")[0].emission, 0);
  assert.equal(excludedEmission(fixture, "Pellet Stove"), 1);
});

test("ranked list pages stay in efficiency and emission pairs", () => {
  const names = readdirSync(join(root, "src/pages"));
  const efficiency = names.filter((name) => name.startsWith("most-efficient-")).map((name) => name.slice("most-efficient-".length)).sort();
  const emission = names.filter((name) => name.startsWith("cleanest-burning-")).map((name) => name.slice("cleanest-burning-".length)).sort();
  assert.deepEqual(efficiency, emission);
  assert.equal(existsSync(join(root, "src/pages/lowest-emission-pellet-stoves.astro")), false);
  assert.equal(existsSync(join(root, "src/pages/lowest-emission-wood-stoves.astro")), false);
  const noindex = JSON.parse(read("data/noindex-paths.json"));
  assert.equal(noindex.includes(pelletPath), false);
});

test("the pellet emission page states live counts, ties, blanks, and sibling links", () => {
  const page = read("src/pages/cleanest-burning-pellet-stoves.astro");
  assert.match(page, /rankByEmission\(catalog\.stoves, "Pellet Stove"\)/);
  assert.match(page, /excludedEmission\(catalog\.stoves, "Pellet Stove"\)/);
  assert.match(page, /ranked\.length/);
  assert.match(page, /catalog\.meta\.snapshotDate/);
  assert.match(page, /not listed by EPA/);
  assert.match(page, /not zero/);
  assert.match(page, /Ties are ordered by a higher HHV efficiency, then by model name/);
  assert.match(page, /EPA does not break those ties/);
  assert.match(page, /not a StoveRatings score/);
  assert.match(page, /Source: EPA Certified Wood Heater Database, snapshot/);
  assert.match(page, /href="\/most-efficient-pellet-stoves\/"/);
  assert.match(page, /href="\/cleanest-burning-wood-stoves\/"/);
  assert.match(page, /articleLd\(/);
  assert.match(page, /caption="Currently certified pellet stoves ordered by emission rate, lowest first"/);
  assert.doesNotMatch(page, /\bbest\b/i);
  assert.doesNotMatch(page, /AggregateRating|@type": "Product"|@type": "Review"/);
  assert.doesNotMatch(page, /lowest-emission-/);
  assert.doesNotMatch(page, /\b(?:0\.08|109)\b/);

  const wood = read("src/pages/cleanest-burning-wood-stoves.astro");
  assert.match(wood, /href="\/cleanest-burning-pellet-stoves\/"/);
  assert.match(wood, /Ties are ordered by a higher HHV efficiency, then by model name/);
  assert.match(wood, /not listed by EPA/);
  assert.match(read("src/pages/most-efficient-pellet-stoves.astro"), /href="\/cleanest-burning-pellet-stoves\/"/);
  assert.match(read("src/pages/pellet-stoves.astro"), /href="\/cleanest-burning-pellet-stoves\/"/);
  assert.match(read("src/pages/index.astro"), /href="\/cleanest-burning-pellet-stoves\/"/);
  assert.match(read("src/components/Footer.astro"), /href="\/cleanest-burning-pellet-stoves\/"/);
  assert.match(read("public/llms.txt"), /https:\/\/stoveratings\.com\/cleanest-burning-pellet-stoves\//);
});
