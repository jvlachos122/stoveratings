import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { catalog } from "../src/lib/catalog.js";
import {
  NEIGHBOR_CAP,
  brandModelLabel,
  heatMidpoint,
  isLinkableCurrent,
  neighborSections,
  typePlural,
} from "../src/lib/model-neighbors.js";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const date = "2026-11-15";
const banned = /\b(best|top-rated|recommend\w*|scores?|ratings?|safest|safer|popular|winners?|affiliate|sponsored|cleanest|better)\b/i;

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function line(partial) {
  return {
    manufacturer: "Alpha Works",
    type: "Wood Stove",
    current: true,
    indexable: true,
    btuLow: 10000,
    btuHigh: 20000,
    btuMax: null,
    ...partial,
    url: partial.url || `/stoves/${partial.slug || "alpha"}/${partial.id}/`,
    primarySlug: partial.slug || "alpha",
  };
}

const brands = new Map([
  ["alpha", { name: "Alpha", slug: "alpha", url: "/brands/alpha/" }],
  ["beta", { name: "Beta", slug: "beta", url: "/brands/beta/" }],
  ["jotul", { name: "Jotul", slug: "jotul", url: "/brands/jotul/" }],
]);

test("the row label is the brand hub name and the EPA model line", () => {
  assert.equal(brandModelLabel("Jotul", "F445"), "Jotul F445");
  assert.equal(brandModelLabel("Hearthstone", "Hearthstone Manchester"), "Hearthstone Manchester");
  assert.equal(brandModelLabel("Hearthstone", "hearthstone manchester"), "hearthstone manchester");
  assert.equal(brandModelLabel("", "F445"), "F445");
  assert.equal(brandModelLabel("Jotul", ""), "Jotul");
  assert.equal(typePlural("Wood Stove"), "wood stoves");
  assert.equal(typePlural("Forced Air Furnace"), "forced-air furnaces");
  assert.equal(typePlural(""), "model lines");
});

test("neighbor lists stay within six current lines of the same EPA type", () => {
  const stoves = [
    line({ id: "a1", model: "Alpha One", btuLow: 1000, btuHigh: 1000 }),
    line({ id: "a2", model: "Alpha Two", btuLow: 2000, btuHigh: 2000 }),
    line({ id: "a3", model: "Alpha Three", btuLow: 3000, btuHigh: 3000 }),
    line({ id: "a4", model: "Alpha Four", btuLow: 4000, btuHigh: 4000 }),
    line({ id: "a5", model: "Alpha Five", btuLow: 5000, btuHigh: 5000 }),
    line({ id: "b1", slug: "beta", manufacturer: "Beta Works", model: "Beta One", btuLow: 1500, btuHigh: 1500 }),
    line({ id: "b2", slug: "beta", manufacturer: "Beta Works", model: "Beta Two", btuLow: 9000, btuHigh: 9000 }),
    line({ id: "old", model: "Alpha Old", current: false, btuLow: 1000, btuHigh: 1000 }),
    line({ id: "hidden", model: "Alpha Hidden", indexable: false, btuLow: 1000, btuHigh: 1000 }),
    line({ id: "pellet", model: "Pellet", type: "Pellet Stove", btuLow: 1000, btuHigh: 1000 }),
    line({ id: "max", slug: "beta", manufacturer: "Beta Works", model: "Beta Max", btuLow: null, btuHigh: null, btuMax: 2500 }),
  ];
  const sections = neighborSections(stoves[0], stoves, brands, date);
  const rows = sections.flatMap((section) => section.rows);
  assert.ok(rows.length > 0);
  assert.ok(rows.length <= NEIGHBOR_CAP);
  assert.equal(new Set(rows.map((row) => row.href)).size, rows.length);
  const byId = new Map(stoves.map((stove) => [stove.url, stove]));
  for (const row of rows) {
    const target = byId.get(row.href);
    assert.equal(isLinkableCurrent(target), true);
    assert.equal(target.type, "Wood Stove");
    assert.notEqual(target.id, "a1");
    assert.equal(row.label, brandModelLabel(brands.get(target.primarySlug).name, target.model));
  }
  const brand = sections.find((section) => section.id === "current-brand");
  const heat = sections.find((section) => section.id === "similar-heat");
  assert.ok(brand);
  assert.ok(heat);
  assert.ok(brand.rows.length <= 3);
  assert.equal(brand.rows.every((row) => byId.get(row.href).primarySlug === "alpha"), true);
  assert.equal(brand.rows.some((row) => row.href.endsWith("/old/")), false);
  assert.equal(brand.rows.some((row) => row.href.endsWith("/hidden/")), false);
  assert.equal(heat.rows.some((row) => byId.get(row.href).type === "Pellet Stove"), false);
  const distances = heat.rows.map((row) => Math.abs(heatMidpoint(byId.get(row.href)) - 1000));
  const sorted = [...distances].sort((left, right) => left - right);
  assert.deepEqual(distances, sorted);
  assert.match(brand.heading, /^Other current EPA-certified wood stoves from Alpha$/);
  assert.match(brand.caption, new RegExp(date));
  assert.match(brand.caption, /EPA snapshot/);
  assert.match(heat.heading, /^Similar heat output$/);
  assert.match(heat.caption, /midpoint/);
  assert.match(heat.caption, new RegExp(date));
  for (const section of sections) {
    assert.equal(banned.test(`${section.heading} ${section.caption}`), false);
  }

  const previous = neighborSections(stoves.find((stove) => stove.id === "old"), stoves, brands, date);
  const previousRows = previous.flatMap((section) => section.rows);
  assert.ok(previousRows.length <= NEIGHBOR_CAP);
  assert.equal(previousRows.every((row) => byId.get(row.href).current), true);
  assert.throws(() => neighborSections(stoves[0], stoves, brands, "November 2026"), /snapshot date/);
});

test("a brand group links every current member from another member", () => {
  const stoves = ["A", "B", "C", "D", "E", "F", "G", "H"].map((model, index) => line({
    id: model,
    model,
    btuLow: 1000 * (index + 1),
    btuHigh: 1000 * (index + 1),
  }));
  const inbound = new Map(stoves.map((stove) => [stove.id, 0]));
  for (const stove of stoves) {
    const sections = neighborSections(stove, stoves, brands, date);
    const rows = sections.flatMap((section) => section.rows);
    assert.ok(rows.length <= NEIGHBOR_CAP);
    const brand = sections.find((section) => section.id === "current-brand");
    assert.ok(brand);
    assert.equal(brand.rows.length, 3);
    for (const row of brand.rows) {
      const id = row.href.split("/").filter(Boolean).at(-1);
      inbound.set(id, inbound.get(id) + 1);
    }
  }
  for (const stove of stoves) assert.ok(inbound.get(stove.id) > 0, stove.id);
});

test("committed current lines only link other current indexable lines, with no new URLs", () => {
  const stoves = catalog.stoves;
  const hidden = new Set(JSON.parse(read("data/noindex-paths.json")));
  const urls = new Set(stoves.map((stove) => stove.url));
  const groups = new Map();
  for (const stove of stoves) {
    if (!isLinkableCurrent(stove)) continue;
    const key = `${stove.primarySlug}\0${stove.type || ""}`;
    const pool = groups.get(key) || [];
    pool.push(stove);
    groups.set(key, pool);
  }
  const inbound = new Map();
  for (const stove of stoves) {
    if (!stove.indexable) continue;
    const sections = neighborSections(stove, stoves, catalog.brandBySlug, catalog.meta.snapshotDate);
    const rows = sections.flatMap((section) => section.rows);
    assert.ok(rows.length <= NEIGHBOR_CAP, stove.url);
    assert.equal(new Set(rows.map((row) => row.href)).size, rows.length, stove.url);
    for (const section of sections) {
      assert.equal(banned.test(`${section.heading} ${section.caption}`), false, section.heading);
      assert.match(section.caption, new RegExp(catalog.meta.snapshotDate));
      assert.equal(section.caption.includes("cfpub.epa.gov"), false);
    }
    for (const row of rows) {
      assert.equal(urls.has(row.href), true, row.href);
      assert.equal(hidden.has(row.href), false, row.href);
      const target = stoves.find((item) => item.url === row.href);
      assert.equal(target.current, true);
      assert.equal(target.indexable, true);
      assert.equal(target.type, stove.type);
      assert.notEqual(target.id, stove.id);
      const brand = catalog.brandBySlug.get(target.primarySlug);
      assert.equal(row.label, brandModelLabel(brand?.name || target.manufacturer, target.model));
      if (sectionId(sections, row.href) === "current-brand") {
        assert.equal(target.primarySlug, stove.primarySlug);
      }
    }
    const brandSection = sections.find((section) => section.id === "current-brand");
    if (brandSection) {
      for (const row of brandSection.rows) {
        const target = stoves.find((item) => item.url === row.href);
        inbound.set(target.id, (inbound.get(target.id) || 0) + 1);
      }
    }
  }
  for (const pool of groups.values()) {
    if (pool.length < 2) continue;
    for (const stove of pool) assert.ok(inbound.get(stove.id) > 0, stove.url);
  }
  const source = [
    read("src/lib/model-neighbors.js"),
    read("src/components/CurrentNeighbors.astro"),
    read("src/components/ListStoveTable.astro"),
  ].join("\n");
  assert.equal(source.includes("cfpub.epa.gov"), false);
  assert.equal(source.includes('rel="sponsored'), false);
  assert.equal(source.includes("affiliates.js"), false);
});

function sectionId(sections, href) {
  return sections.find((section) => section.rows.some((row) => row.href === href))?.id || "";
}
