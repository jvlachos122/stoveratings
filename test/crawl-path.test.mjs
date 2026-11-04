import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { HOME_BRAND_HUB_COUNT, brandHubsByModelLines, homeBrandHubs } from "../src/lib/brand-hubs.js";
import { relatedLists } from "../src/lib/lists.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("home brand hubs are the hubs with the most listed model lines", () => {
  const hubs = homeBrandHubs();
  const all = brandHubsByModelLines();
  assert.equal(hubs.length, HOME_BRAND_HUB_COUNT);
  assert.ok(all.length > hubs.length);
  for (let i = 1; i < hubs.length; i++) {
    const previous = hubs[i - 1];
    const current = hubs[i];
    const ordered = previous.lines > current.lines
      || (previous.lines === current.lines && previous.name.localeCompare(current.name, "en") <= 0);
    assert.equal(ordered, true, `${previous.name} before ${current.name}`);
  }
  assert.ok(hubs.at(-1).lines >= all[HOME_BRAND_HUB_COUNT].lines);
  assert.equal(new Set(hubs.map((hub) => hub.url)).size, hubs.length);
});

test("related lists follow the page filters and skip lists that omit the line", () => {
  const catalytic = relatedLists({
    category: "room",
    type: "Wood Stove",
    subtype: "Catalytic Stove",
    current: true,
    efficiency: 70,
    emission: 1,
    insertFlag: true,
    fuel: "Cord Wood",
  }).map((list) => list.href);
  assert.ok(catalytic.includes("/catalytic-wood-stoves/"));
  assert.ok(catalytic.includes("/wood-stove-inserts/"));
  assert.ok(catalytic.includes("/most-efficient-wood-stoves/"));
  assert.ok(catalytic.includes("/cleanest-burning-wood-stoves/"));
  assert.equal(catalytic.includes("/pellet-stoves/"), false);
  assert.equal(catalytic.includes("/hybrid-wood-stoves/"), false);

  const previous = relatedLists({
    category: "room",
    type: "Wood Stove",
    subtype: "Non-Catalytic Stove",
    current: false,
    efficiency: 60,
    emission: 2,
    insertFlag: false,
    fuel: "Crib Wood",
  }).map((list) => list.href);
  assert.deepEqual(previous, ["/non-catalytic-wood-stoves/"]);

  const pelletBoiler = relatedLists({
    category: "central",
    type: "Hydronic Heater",
    subtype: "Non-Catalytic Stove",
    current: true,
    fuel: "Wood Pellets",
    insertFlag: false,
  }).map((list) => list.href);
  assert.deepEqual(pelletBoiler, ["/pellet-boilers/"]);

  const cordBoiler = relatedLists({
    category: "central",
    type: "Hydronic Heater",
    fuel: "Cord Wood",
    current: false,
    insertFlag: false,
  }).map((list) => list.href);
  assert.deepEqual(cordBoiler, ["/outdoor-wood-boilers/"]);

  const furnace = relatedLists({
    category: "central",
    type: "Forced Air Furnace",
    fuel: "Wood Pellets",
    current: true,
    insertFlag: false,
  }).map((list) => list.href);
  assert.deepEqual(furnace, ["/wood-furnaces/"]);
});

test("the home page and footer link the browse path in server-rendered anchors", () => {
  const home = readFileSync(join(root, "src/pages/index.astro"), "utf8");
  const footer = readFileSync(join(root, "src/components/Footer.astro"), "utf8");
  for (const href of [
    "/tools/heating-cost-calculator/",
    "/lookup/",
    "/compare/",
    "/most-efficient-wood-stoves/",
    "/most-efficient-pellet-stoves/",
    "/cleanest-burning-wood-stoves/",
    "/wood-stove-tax-credit/",
    "/brands/",
  ]) {
    assert.match(home, new RegExp(`href="${href}"`));
  }
  assert.match(home, /homeBrandHubs\(\)/);
  assert.match(footer, /href="\/brands\/">Browse all brands/);
  const stove = readFileSync(join(root, "src/pages/stoves/[manufacturer]/[model].astro"), "utf8");
  assert.match(stove, /relatedLists\(stove\)/);
  assert.match(stove, /href=\{brand\.url\}/);
  assert.match(stove, /href=\{list\.href\}/);
});
