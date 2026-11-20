import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { modelSentences } from "../src/lib/answers.js";
import { metaDescription, pageTitle } from "../src/lib/format.js";
import { site } from "../src/lib/site.js";
import {
  STOVE_MODEL_TITLE_LIMIT,
  STOVE_TITLE_CONTEXT,
  buildStovePageHeads,
  modelStartsWithManufacturer,
  stoveBaseTitle,
  stoveProductType,
  titleIncludesProductType,
} from "../src/lib/stove-page-meta.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(name) {
  return JSON.parse(readFileSync(join(root, "data", name), "utf8"));
}

const stoves = readJson("stoves.json");
const meta = readJson("meta.json");
const stats = readJson("stats.json");
const indexed = stoves.filter((stove) => stove.indexable);
const heads = buildStovePageHeads(stoves, meta.snapshotDate);
const PRODUCT_TYPES = new Set([
  "Wood Stove",
  "Wood Stove Insert",
  "Pellet Stove",
  "Pellet Stove Insert",
  "Hydronic Heater",
  "Forced Air Furnace",
]);
const BANNED = /\b(best|star ratings?|our score|top pick)\b/i;

function documentTitle(title) {
  return `${title} · ${site.name}`;
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
    rowCount: 1,
    tests: [],
  };
}

test("indexed stove titles name the manufacturer, model, EPA product type, and EPA context", () => {
  assert.equal(stats.modelLines.indexable, 824);
  assert.equal(indexed.length, 824);
  assert.equal(site.name, "StoveRatings");
  assert.equal(heads.size, stoves.length);

  const titles = [];
  const descriptions = [];
  for (const stove of indexed) {
    const head = heads.get(stove.id);
    assert.ok(head, stove.id);
    const title = documentTitle(head.title);
    titles.push(title);
    descriptions.push(head.description);

    assert.equal(head.title.endsWith(STOVE_TITLE_CONTEXT), true, head.title);
    assert.equal(head.title.includes("StoveRatings"), false, head.title);
    assert.equal(title.endsWith(" · StoveRatings"), true, title);
    assert.equal(titleIncludesProductType(title, stove), true, `${stove.id} ${title}`);
    assert.equal(PRODUCT_TYPES.has(stoveProductType(stove)), true, stoveProductType(stove));
    assert.equal(head.title.includes(pageTitle(stove.model, STOVE_MODEL_TITLE_LIMIT)), true, head.title);

    const manufacturer = String(stove.manufacturer || "").trim();
    if (modelStartsWithManufacturer(stove.model, manufacturer)) {
      assert.equal(head.title.startsWith(`${manufacturer} ${manufacturer}`), false, head.title);
    } else {
      assert.equal(head.title.includes(manufacturer), true, head.title);
    }

    assert.equal(BANNED.test(head.title), false, head.title);
    assert.equal(BANNED.test(head.description), false, head.description);
    assert.ok(head.description.length >= 40 && head.description.length <= 180, head.description.length);
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
  assert.deepEqual(titles, [
    "Dansons, Inc HR-2 Pellet Stove — EPA Emissions & Efficiency · StoveRatings",
    "Glow Boy HR-2 Pellet Stove — EPA Emissions & Efficiency · StoveRatings",
    "Horizon Research Inc. HR-2 Pellet Stove — EPA Emissions & Efficiency · StoveRatings",
  ]);

  const eclipses = indexed.filter((stove) => stove.model === "Eclipse");
  assert.deepEqual(
    eclipses.map((stove) => documentTitle(heads.get(stove.id).title)),
    [
      "Dansons, Inc Eclipse Pellet Stove — EPA Emissions & Efficiency · StoveRatings",
      "Horizon Research Inc. Eclipse Pellet Stove — EPA Emissions & Efficiency · StoveRatings",
    ],
  );

  const hp = indexed.find((stove) => stove.model === "HP 14");
  assert.equal(hp.manufacturer, "Evoworld, Inc.");
  assert.equal(hp.type, "Hydronic Heater");
  assert.equal(
    documentTitle(heads.get(hp.id).title),
    "Evoworld, Inc. HP 14 Hydronic Heater — EPA Emissions & Efficiency · StoveRatings",
  );
});

test("a repeated long model line is split with certification status, not a second copy of the model", () => {
  const pair = indexed.filter((stove) => stove.manufacturer === "United States Stove Company" && stove.model.startsWith("US2500E, AW2520E"));
  assert.equal(pair.length, 2);
  const titles = pair.map((stove) => heads.get(stove.id).title);
  const descriptions = pair.map((stove) => heads.get(stove.id).description);
  assert.equal(new Set(titles).size, 2);
  assert.equal(new Set(descriptions).size, 2);
  assert.equal(titles.filter((title) => title.includes("Currently certified")).length, 1);
  assert.equal(titles.filter((title) => title.includes("Previously certified")).length, 1);
  assert.equal(descriptions.filter((text) => text.startsWith("Currently certified.")).length, 1);
  assert.equal(descriptions.filter((text) => text.startsWith("Previously certified.")).length, 1);
  for (const title of titles) {
    assert.match(title, /Wood Stove \(Currently certified|Previously certified\) — EPA Emissions & Efficiency$/);
    assert.equal(title.includes("us2500e-aw2520e"), false);
  }
});

test("the manufacturer is not repeated when the model text already starts with it", () => {
  const spartherm = indexed.filter((stove) => stove.manufacturer === "Spartherm" && modelStartsWithManufacturer(stove.model, stove.manufacturer));
  assert.ok(spartherm.length >= 1);
  for (const stove of spartherm) {
    const title = heads.get(stove.id).title;
    assert.equal(title.startsWith("Spartherm Spartherm"), false, title);
    assert.equal(title.startsWith(stove.model.slice(0, 12)), true, title);
    assert.equal(title.includes("Spartherm Spartherm"), false, title);
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
  assert.equal(
    built.get("insert").title,
    "Blaze King Industries, Inc. Princess Insert PI 1010 Wood Stove — EPA Emissions & Efficiency",
  );
  assert.equal(built.get("named").title, "Example Heaters Soul Pellet Stove Insert — EPA Emissions & Efficiency");
  assert.equal(
    built.get("furnace").title,
    "Fire Chief Industries Shelter Furnace SF2600 Forced Air Furnace — EPA Emissions & Efficiency",
  );
  assert.equal(
    built.get("boiler").title,
    "Central Boiler Inc. Classic Edge 360 Hydronic Heater — EPA Emissions & Efficiency",
  );
  assert.equal(stoveProductType(insert), "Wood Stove Insert");
  assert.equal(titleIncludesProductType(built.get("insert").title, insert), true);
  assert.equal(titleIncludesProductType(built.get("furnace").title, furnace), true);
});

test("colliding indexed titles and descriptions gain EPA qualifiers in a fixed order", () => {
  const shared = "US2500E, ".padEnd(160, "A");
  const previous = line({
    id: "previous",
    manufacturer: "United States Stove Company",
    model: shared,
    modelSlug: "us2500-a",
    current: false,
    emission: 0.88,
    efficiency: 73,
    type: "Wood Stove",
  });
  const current = line({
    id: "current",
    manufacturer: "United States Stove Company",
    model: `${shared}, KW25`,
    modelSlug: "us2500-b",
    current: true,
    emission: 2.4,
    efficiency: 72,
    type: "Wood Stove",
  });
  const hidden = line({
    id: "hidden",
    indexable: false,
    manufacturer: "United States Stove Company",
    model: shared,
    modelSlug: "us2500-hidden",
    current: false,
    emission: 0.88,
    efficiency: 73,
    type: "Wood Stove",
  });
  const built = buildStovePageHeads([previous, current, hidden], "2026-11-15");
  assert.equal(stoveBaseTitle(previous), stoveBaseTitle(current));
  assert.match(built.get("previous").title, /Wood Stove \(Previously certified\) — EPA Emissions & Efficiency$/);
  assert.match(built.get("current").title, /Wood Stove \(Currently certified\) — EPA Emissions & Efficiency$/);
  assert.equal(built.get("previous").title === built.get("current").title, false);
  assert.equal(built.get("hidden").title.includes("Previously certified"), false);
  assert.notEqual(built.get("previous").description, built.get("current").description);
  assert.match(built.get("previous").description, /^Previously certified\./);
  assert.match(built.get("current").description, /^Currently certified\./);
  assert.equal(built.get("hidden").description, metaDescription(modelSentences(hidden, "2026-11-15")));
});

test("a unique indexed description stays the answer text", () => {
  const eclipse = indexed.find((stove) => stove.model === "Eclipse" && stove.manufacturer === "Dansons, Inc");
  assert.ok(eclipse);
  assert.equal(heads.get(eclipse.id).description, metaDescription(modelSentences(eclipse, meta.snapshotDate)));
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
