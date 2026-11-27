import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { metaDescription } from "../src/lib/format.js";
import { certificationSentence, modelPageDescription } from "../src/lib/model-certification.js";
import { site } from "../src/lib/site.js";
import {
  buildStovePageHeads,
  modelStartsWithManufacturer,
  stoveBaseTitle,
  stoveProductType,
} from "../src/lib/stove-page-meta.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(name) {
  return JSON.parse(readFileSync(join(root, "data", name), "utf8"));
}

const stoves = readJson("stoves.json");
const meta = readJson("meta.json");
const indexed = stoves.filter((stove) => stove.indexable);
const heads = buildStovePageHeads(stoves, meta.snapshotDate);
const BANNED = /\b(best|star ratings?|our score|top pick)\b/i;

function documentTitle(title) {
  return `${title} · ${site.name}`;
}

function digits(value, places) {
  return String(Number(Number(value).toFixed(places)));
}

function line(partial) {
  return {
    id: partial.id,
    indexable: partial.indexable !== false,
    current: Boolean(partial.current),
    insertFlag: Boolean(partial.insertFlag),
    type: partial.type,
    subtype: partial.subtype || "Non-Catalytic Stove",
    manufacturer: partial.manufacturer,
    model: partial.model,
    modelSlug: partial.modelSlug || "model",
    emission: partial.emission ?? null,
    emissionUnit: partial.emissionUnit || "g/hr",
    efficiency: partial.efficiency ?? null,
    btuLow: partial.btuLow ?? null,
    btuHigh: partial.btuHigh ?? null,
    btuMax: partial.btuMax ?? null,
    rowCount: 1,
    tests: [],
  };
}

test("indexed stove titles name the model and the published EPA figures", () => {
  assert.equal(heads.size, stoves.length);
  assert.equal(site.name, "StoveRatings");

  const titles = [];
  const descriptions = [];
  for (const stove of indexed) {
    const head = heads.get(stove.id);
    assert.ok(head, stove.id);
    const title = documentTitle(head.title);
    titles.push(title);
    descriptions.push(head.description);

    assert.equal(head.title.includes("StoveRatings"), false, head.title);
    assert.equal(title.endsWith(" · StoveRatings"), true, title);
    assert.ok(head.title.includes(stove.current ? "currently certified" : "previously certified"), head.title);
    if (stove.emission != null && stove.emissionUnit === "g/hr") {
      assert.ok(head.title.includes(`${digits(stove.emission, 3)} g/hr`), head.title);
    }
    assert.equal(BANNED.test(head.title), false, head.title);
    assert.equal(BANNED.test(head.description), false, head.description);
    assert.ok(head.description.length >= 40 && head.description.length <= 180, head.description.length);
    assert.equal(head.description.includes("StoveRatings"), false);
  }

  assert.equal(new Set(titles).size, titles.length, "duplicate stove titles");
  assert.equal(new Set(descriptions).size, descriptions.length, "duplicate stove meta descriptions");
});

test("same model names under different EPA manufacturers no longer share a title", () => {
  const hr = indexed.filter((stove) => stove.model === "HR-2");
  assert.deepEqual(
    hr.map((stove) => stove.manufacturer).sort(),
    ["Dansons, Inc", "Glow Boy", "Horizon Research Inc."],
  );
  const titles = hr.map((stove) => documentTitle(heads.get(stove.id).title));
  assert.equal(new Set(titles).size, hr.length);
  for (const stove of hr) {
    const title = heads.get(stove.id).title;
    assert.ok(title.startsWith("HR-2 — ") || title.startsWith("HR-2 ("), title);
    assert.ok(title.includes(`${digits(stove.emission, 3)} g/hr`), title);
    assert.equal(title.includes("StoveRatings"), false);
  }

  const eclipses = indexed.filter((stove) => stove.model === "Eclipse");
  assert.equal(new Set(eclipses.map((stove) => heads.get(stove.id).title)).size, eclipses.length);
  for (const stove of eclipses) {
    const title = heads.get(stove.id).title;
    assert.ok(title.includes("Eclipse"), title);
    assert.ok(title.includes(stove.emissionUnit === "g/hr" ? "g/hr" : stove.emissionUnit), title);
  }

  const hp = indexed.find((stove) => stove.model === "HP 14");
  assert.equal(hp.manufacturer, "Evoworld, Inc.");
  assert.equal(hp.type, "Hydronic Heater");
  const hpTitle = heads.get(hp.id).title;
  assert.ok(hpTitle.includes("HP 14"), hpTitle);
  assert.ok(hpTitle.includes("lb/mmBTU"), hpTitle);
  assert.equal(hpTitle.includes("g/hr"), false, hpTitle);
});

test("a repeated long model line is split when the EPA figures differ", () => {
  const pair = indexed.filter((stove) => stove.manufacturer === "United States Stove Company" && stove.model.startsWith("US2500E, AW2520E"));
  assert.equal(pair.length, 2);
  const titles = pair.map((stove) => heads.get(stove.id).title);
  const descriptions = pair.map((stove) => heads.get(stove.id).description);
  assert.equal(new Set(titles).size, 2);
  assert.equal(new Set(descriptions).size, 2);
  for (const stove of pair) {
    const title = heads.get(stove.id).title;
    const description = heads.get(stove.id).description;
    assert.ok(title.includes(stove.current ? "currently certified" : "previously certified"), title);
    assert.ok(description.includes(stove.current ? "currently certified" : "previously certified"), description);
    if (stove.emission != null) assert.ok(description.includes(digits(stove.emission, 3)), description);
  }
});

test("the manufacturer is not repeated when the model text already starts with it", () => {
  const spartherm = indexed.filter((stove) => stove.manufacturer === "Spartherm" && modelStartsWithManufacturer(stove.model, stove.manufacturer));
  assert.ok(spartherm.length >= 1);
  for (const stove of spartherm) {
    const title = heads.get(stove.id).title;
    assert.equal(title.includes("Spartherm Spartherm"), false, title);
    assert.equal(title.startsWith("Spartherm Spartherm"), false, title);
  }
});

test("insert and furnace phrases come from EPA type and the model-name insert flag", () => {
  const insert = line({
    id: "insert",
    manufacturer: "Blaze King Industries, Inc.",
    model: "Princess Insert PI 1010",
    type: "Wood Stove",
    insertFlag: true,
    current: true,
    emission: 1,
    efficiency: 70,
  });
  const named = line({
    id: "named",
    manufacturer: "Example Heaters",
    model: "Soul Pellet Stove Insert",
    type: "Pellet Stove",
    insertFlag: true,
    current: true,
    emission: 1,
    efficiency: 70,
  });
  const furnace = line({
    id: "furnace",
    manufacturer: "Fire Chief Industries",
    model: "Shelter Furnace SF2600",
    type: "Forced Air Furnace",
    current: true,
    emission: 0.1,
    emissionUnit: "lb/mmBTU",
    efficiency: 70,
  });
  const boiler = line({
    id: "boiler",
    manufacturer: "Central Boiler Inc.",
    model: "Classic Edge 360",
    type: "Hydronic Heater",
    current: false,
    emission: 0.2,
    emissionUnit: "lb/mmBTU",
    efficiency: 60,
  });
  const built = buildStovePageHeads([insert, named, furnace, boiler], "2026-11-15");
  assert.ok(built.get("insert").title.includes("currently certified"), built.get("insert").title);
  assert.ok(built.get("insert").title.includes("1 g/hr"), built.get("insert").title);
  assert.ok(built.get("insert").title.includes("heat output not listed by EPA"), built.get("insert").title);
  assert.equal(built.get("insert").title.includes("0 BTU/hr"), false);
  assert.ok(built.get("furnace").title.includes("0.1 lb/mmBTU"), built.get("furnace").title);
  assert.equal(built.get("furnace").title.includes("g/hr"), false);
  assert.ok(built.get("boiler").title.includes("previously certified"), built.get("boiler").title);
  assert.ok(built.get("boiler").title.includes("0.2 lb/mmBTU"), built.get("boiler").title);
  assert.equal(stoveProductType(insert), "Wood Stove Insert");
  assert.equal(stoveProductType(named), "Pellet Stove Insert");
  assert.equal(stoveProductType(furnace), "Forced Air Furnace");
  assert.equal(stoveProductType(boiler), "Hydronic Heater");
});

test("colliding indexed titles and descriptions gain EPA qualifiers in a fixed order", () => {
  const shared = {
    manufacturer: "United States Stove Company",
    model: "Same Line",
    current: false,
    emission: 0.88,
    efficiency: 73,
    btuLow: 10000,
    btuHigh: 20000,
    type: "Wood Stove",
  };
  const previous = line({ ...shared, id: "previous", modelSlug: "same-a" });
  const current = line({ ...shared, id: "current", modelSlug: "same-b" });
  const hidden = line({ ...shared, id: "hidden", indexable: false, modelSlug: "same-hidden" });
  assert.equal(stoveBaseTitle(previous), stoveBaseTitle(current));
  const built = buildStovePageHeads([previous, current, hidden], "2026-11-15");
  assert.notEqual(built.get("previous").title, built.get("current").title);
  assert.match(built.get("previous").title, /Same Line \(same-a\) — /);
  assert.match(built.get("current").title, /Same Line \(same-b\) — /);
  assert.equal(built.get("previous").title.includes("Wood Stove"), false);
  assert.equal(built.get("hidden").title.includes("same-hidden"), false);
  assert.notEqual(built.get("previous").description, built.get("current").description);
  assert.equal(built.get("hidden").description, modelPageDescription(hidden, "2026-11-15"));
  assert.ok(built.get("previous").description.includes("0.88 grams per hour"));
  assert.ok(built.get("hidden").description.includes("not listed by EPA") === false);
});

test("a unique indexed description stays the answer text when that sentence fits", () => {
  const eclipse = indexed.find((stove) => stove.model === "Eclipse" && stove.manufacturer === "Dansons, Inc");
  assert.ok(eclipse);
  const sentence = certificationSentence(eclipse, meta.snapshotDate);
  if (sentence.length <= 180) {
    assert.equal(heads.get(eclipse.id).description, metaDescription([sentence]));
  } else {
    assert.equal(heads.get(eclipse.id).description, modelPageDescription(eclipse, meta.snapshotDate));
  }
});

test("the stove page uses the shared head and leaves the route, H1, and site suffix alone", () => {
  const page = readFileSync(join(root, "src/pages/stoves/[manufacturer]/[model].astro"), "utf8");
  const layout = readFileSync(join(root, "src/layouts/Base.astro"), "utf8");
  assert.match(page, /stovePageHead\(stove, catalog\.stoves, catalog\.meta\.snapshotDate\)/);
  assert.match(page, /title=\{head\.title\}/);
  assert.match(page, /description=\{head\.description\}/);
  assert.match(page, /noindex=\{!stove\.indexable\}/);
  assert.match(page, /<h1>\{stove\.model\}<\/h1>/);
  assert.match(page, /params: \{ manufacturer: stove\.manufacturerSlug, model: stove\.modelSlug \}/);
  assert.match(page, /label: pageTitle\(stove\.model, 48\)/);
  assert.doesNotMatch(page, /title=\{pageTitle\(stove\.model\)\}/);
  assert.doesNotMatch(page, /bareTitle/);
  assert.match(layout, /const fullTitle = home \|\| bareTitle \? title : `\$\{title\} · \$\{site\.name\}`;/);
  assert.match(readFileSync(join(root, "src/lib/site.js"), "utf8"), /tagline: "EPA test numbers for every certified wood and pellet stove\."/);
});
