import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  PRICE_MISSING,
  costsForFuel,
  deliveredMmbtuFromSize,
  formatUsd,
  fuelUnits,
  heatingCostPayload,
  heatingCostSearch,
  readHeatingCostQuery,
} from "../src/lib/heating-cost.js";
import { mountHeatingCost } from "../src/lib/heating-cost-ui.js";
import {
  COST_CAVEAT,
  EXAMPLE_END,
  EXAMPLE_HOURS,
  EXAMPLE_PELLET_HEAT_ID,
  EXAMPLE_PELLET_PRICE_ID,
  EXAMPLE_SPECIES,
  SEASON_FORMULA,
  seasonComparison,
  seasonCostCopy,
  seasonCostFaqs,
  seasonCostNotes,
} from "../src/lib/pellet-wood-cost.js";
import { EXAMPLE_BAND_ID, EXAMPLE_SQFT, bandById } from "../src/lib/stove-size.js";
import { buildSitemapLastmods } from "../src/lib/sitemap-lastmod.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const banned = /\b(best|top-rated|recommend\w*)\b/i;

function readJson(name) {
  return JSON.parse(readFileSync(join(root, "data", name), "utf8"));
}

function comparisonFromFiles() {
  const stats = readJson("stats.json");
  const meta = readJson("meta.json");
  return seasonComparison({
    firewood: readJson("firewood.json"),
    heat: readJson("fuel-heat.json"),
    prices: readJson("fuel-prices.json"),
    woodMedian: stats.medians.currentWood,
    pelletMedian: stats.medians.currentPellet,
    snapshotDate: meta.snapshotDate,
  });
}

test("fuel units follow the published season formula and a blank efficiency is not zero", () => {
  const oak = fuelUnits({
    deliveredMmbtu: 80,
    btuLow: 24_000_000,
    btuHigh: 28_000_000,
    efficiencyPercent: 70,
  });
  assert.equal(oak.ok, true);
  assert.ok(Math.abs(oak.fuelMmbtu - 80 / 0.7) < 1e-9);
  assert.ok(Math.abs(oak.unitsLow - 80 / (28 * 0.7)) < 1e-9);
  assert.ok(Math.abs(oak.unitsHigh - 80 / (24 * 0.7)) < 1e-9);
  const priced = costsForFuel({
    price: 300,
    btuLow: 24_000_000,
    btuHigh: 28_000_000,
    efficiencyPercent: 70,
    deliveredMmbtu: 80,
  });
  assert.ok(Math.abs(oak.unitsLow * 300 - priced.seasonLow) < 1e-6);
  assert.ok(Math.abs(oak.unitsHigh * 300 - priced.seasonHigh) < 1e-6);

  for (const efficiencyPercent of [null, "", " ", 0, -5]) {
    const blank = fuelUnits({
      deliveredMmbtu: 80,
      btuLow: 24_000_000,
      btuHigh: 28_000_000,
      efficiencyPercent,
    });
    assert.equal(blank.ok, false);
    assert.equal(blank.reason, "efficiency");
    assert.equal(blank.unitsLow, null);
    assert.equal(blank.unitsLow === 0, false);
  }

  const pellets = fuelUnits({
    deliveredMmbtu: 50,
    btuLow: 16_690_400,
    btuHigh: 16_690_400,
    efficiencyPercent: 75,
  });
  const expected = 50 / ((16_690_400 / 1e6) * 0.75);
  assert.ok(Math.abs(pellets.unitsLow - expected) < 1e-9);
  assert.equal(pellets.unitsLow, pellets.unitsHigh);
  const pelletCost = costsForFuel({
    price: 350,
    btuLow: 16_690_400,
    btuHigh: 16_690_400,
    efficiencyPercent: 75,
    deliveredMmbtu: 50,
  });
  assert.ok(Math.abs(pellets.unitsLow * 350 - pelletCost.seasonLow) < 1e-6);
});

test("the worked example uses cited heat, median efficiencies, and no invented cord price", () => {
  const stats = readJson("stats.json");
  const meta = readJson("meta.json");
  const firewood = readJson("firewood.json");
  const heat = readJson("fuel-heat.json");
  const prices = readJson("fuel-prices.json");
  const species = firewood.find((row) => row.species === EXAMPLE_SPECIES);
  const pelletHeat = heat.find((row) => row.id === EXAMPLE_PELLET_HEAT_ID);
  const pelletPrice = prices.find((row) => row.id === EXAMPLE_PELLET_PRICE_ID);
  const woodMedian = stats.medians.currentWood;
  const pelletMedian = stats.medians.currentPellet;
  const factor = bandById(EXAMPLE_BAND_ID).low;
  const delivered = deliveredMmbtuFromSize(EXAMPLE_SQFT, factor, EXAMPLE_HOURS);
  const view = comparisonFromFiles();

  assert.equal(EXAMPLE_END, "low");
  assert.equal(view.delivered, delivered);
  assert.equal(view.factor, factor);
  assert.equal(view.snapshotDate, meta.snapshotDate);
  const citedDates = [meta.snapshotDate, view.woodRetrieved, pelletHeat.retrieved, pelletPrice.retrieved].sort();
  assert.equal(view.lastUpdated, citedDates[citedDates.length - 1]);
  assert.equal(view.woodEff, woodMedian.efficiencyMedian);
  assert.equal(view.pelletEff, pelletMedian.efficiencyMedian);
  assert.ok(view.woodEff > 0);
  assert.ok(view.pelletEff > 0);
  assert.equal(view.species.species, species.species);
  assert.match(species.sourceNote, /559/);
  assert.match(species.sourceUrl, /^https:\/\//);
  assert.doesNotMatch(species.sourceUrl, /cfpub\.epa\.gov/);
  assert.match(pelletHeat.sourceUrl, /EIA_63C_Table_5\.csv$/);
  assert.match(pelletPrice.sourceUrl, /EIA_63C_Table_7\.csv$/);
  assert.equal(view.pelletHeatTable, "Table 5");
  assert.equal(view.pelletPriceTable, "Table 7");
  assert.equal(pelletPrice.prefill, false);
  assert.match(view.policy, /leaves this average empty/);

  const woodLow = delivered / (species.btuHigh * (woodMedian.efficiencyMedian / 100));
  const woodHigh = delivered / (species.btuLow * (woodMedian.efficiencyMedian / 100));
  assert.ok(Math.abs(view.woodUnits.unitsLow - woodLow) < 1e-9);
  assert.ok(Math.abs(view.woodUnits.unitsHigh - woodHigh) < 1e-9);
  const perTon = Number(pelletHeat.btuText) * 2000;
  const tons = delivered / ((perTon / 1e6) * (pelletMedian.efficiencyMedian / 100));
  assert.ok(Math.abs(view.pelletUnits.unitsLow - tons) < 1e-9);
  assert.ok(Math.abs(view.pelletCost.seasonLow - tons * Number(pelletPrice.priceText)) < 1e-6);
  assert.equal(formatUsd(view.pelletCost.seasonLow), formatUsd(tons * Number(pelletPrice.priceText)));

  const costRow = view.rows.find((row) => row.label === "Season cost");
  assert.match(costRow.wood, /Not calculated/);
  assert.equal(costRow.pellet.includes(formatUsd(view.pelletCost.seasonLow)), true);
  assert.doesNotMatch(view.href, /(?:^|[?&])wood=/);
  assert.match(view.href, /^\/tools\/heating-cost-calculator\/\?/);

  const parsed = readHeatingCostQuery(view.href);
  assert.equal(parsed.mode, "size");
  assert.equal(parsed.sqftText, String(EXAMPLE_SQFT));
  assert.equal(parsed.hoursText, String(EXAMPLE_HOURS));
  assert.equal(parsed.band, EXAMPLE_BAND_ID);
  assert.equal(parsed.end, EXAMPLE_END);
  assert.equal(parsed.species, EXAMPLE_SPECIES);
  assert.equal(parsed.woodEffText, String(woodMedian.efficiencyMedian));
  assert.equal(parsed.pelletEffText, String(pelletMedian.efficiencyMedian));
  assert.equal(parsed.region, EXAMPLE_PELLET_HEAT_ID);
  assert.equal(parsed.pelletPriceText, pelletPrice.priceText);
  assert.equal(parsed.woodPriceText, null);
  assert.equal(parsed.heatText, null);

  const faqs = seasonCostFaqs(view);
  assert.equal(faqs.length, 4);
  assert.equal(faqs[2].answer.includes(view.pelletPriceTable), true);
  assert.equal(faqs[2].answer.includes(pelletPrice.periodLabel), true);
  assert.equal(faqs[2].answer.includes(pelletPrice.priceText), true);
  assert.match(faqs[3].answer, /moisture/);
  assert.equal(faqs[3].answer.includes(species.sourceNote), true);
  const copy = seasonCostCopy(view, faqs, seasonCostNotes(view));
  assert.equal(banned.test(copy), false);
  assert.equal(copy.includes(COST_CAVEAT), true);
  assert.equal(copy.includes(SEASON_FORMULA), true);
  assert.match(copy, /estimates, not a quote/);
  assert.equal(view.pelletHeat.sourceNote, pelletHeat.sourceNote);
  assert.match(pelletHeat.sourceNote, /Table 5/);
  assert.match(pelletPrice.sourceNote, /retail and wholesale/);
  assert.doesNotMatch(copy, /\$300\b|\$350\b/);
});

test("calculator query params ignore a blank or zero and prefer a complete size query", () => {
  const blank = readHeatingCostQuery("?weff=0&peff=&pellet=0&wood=-4&hours=0&heat=");
  assert.equal(blank.woodEffText, null);
  assert.equal(blank.pelletEffText, null);
  assert.equal(blank.pelletPriceText, null);
  assert.equal(blank.woodPriceText, null);
  assert.equal(blank.mode, null);
  assert.equal(blank.woodEffText === 0, false);

  const direct = readHeatingCostQuery("?heat=60.50&sqft=2000&band=moderate&end=low");
  assert.equal(direct.mode, "direct");
  assert.equal(direct.heatText, "60.50");

  const sized = readHeatingCostQuery("?heat=60.50&sqft=2000&band=moderate&end=low&hours=1000&species=Oaks%3A+red+oak+family&model=room--example");
  assert.equal(sized.mode, "size");
  assert.equal(sized.heatText, null);
  assert.equal(sized.species, "Oaks: red oak family");
  assert.equal(sized.model, "room--example");
  assert.equal(heatingCostSearch({
    sqft: 2000,
    band: "moderate",
    end: "low",
    hours: 1000,
    species: "Oaks: red oak family",
    model: "room--example",
  }).includes("wood="), false);
});

function fakeDocument(search) {
  const radios = [
    { name: "heat-mode", value: "direct", checked: true },
    { name: "heat-mode", value: "size", checked: false },
  ];
  const nodes = new Map();
  function make(id) {
    const node = {
      id,
      value: "",
      textContent: "",
      firstChild: null,
      href: "",
      append() {},
      addEventListener() {},
      removeChild() {
        this.firstChild = null;
      },
    };
    nodes.set(id, node);
    return node;
  }
  const form = make("cost-form");
  form.querySelector = (selector) => {
    const value = /value="([^"]+)"/.exec(selector);
    if (selector.includes(":checked")) return radios.find((radio) => radio.checked) || null;
    if (value) return radios.find((radio) => radio.value === value[1]) || null;
    return null;
  };
  return {
    nodes,
    radios,
    getElementById(id) {
      return nodes.get(id) || make(id);
    },
    defaultView: { location: { search } },
    createElement() {
      return { type: "", textContent: "", href: "", append() {}, addEventListener() {} };
    },
    createTextNode(text) {
      return { textContent: text };
    },
  };
}

test("the calculator link fills the worked example and a model id still replaces that efficiency", async () => {
  const meta = readJson("meta.json");
  const view = comparisonFromFiles();
  const payload = heatingCostPayload({
    snapshotDate: meta.snapshotDate,
    firewood: readJson("firewood.json"),
    heat: readJson("fuel-heat.json"),
    stoves: [
      {
        id: "room--example--listed",
        model: "Listed stove",
        manufacturer: "Example",
        type: "Wood Stove",
        fuel: "Cord Wood",
        efficiency: 61,
        url: "/stoves/example/listed/",
        current: true,
        tests: [{ efficiency: 61 }],
      },
    ],
  });
  const url = `data:application/json,${encodeURIComponent(JSON.stringify(payload))}`;
  const doc = fakeDocument(`?${view.href.split("?")[1]}`);
  await mountHeatingCost(doc, url);
  assert.equal(doc.radios.find((radio) => radio.value === "size").checked, true);
  assert.equal(doc.nodes.get("size-hours").value, String(EXAMPLE_HOURS));
  assert.equal(doc.nodes.get("size-sqft").value, String(EXAMPLE_SQFT));
  assert.equal(doc.nodes.get("size-band").value, EXAMPLE_BAND_ID);
  assert.equal(doc.nodes.get("size-end").value, EXAMPLE_END);
  assert.equal(doc.nodes.get("wood-species").value, EXAMPLE_SPECIES);
  assert.equal(doc.nodes.get("wood-eff").value, String(view.woodEff));
  assert.equal(doc.nodes.get("wood-price").value, "");
  assert.equal(doc.nodes.get("pellet-region").value, EXAMPLE_PELLET_HEAT_ID);
  assert.equal(doc.nodes.get("pellet-price").value, view.pelletPrice.priceText);
  assert.equal(doc.nodes.get("pellet-eff").value, String(view.pelletEff));
  assert.equal(doc.nodes.get("out-pellet-season").textContent, formatUsd(view.pelletCost.seasonLow));
  assert.equal(doc.nodes.get("out-wood-season").textContent, PRICE_MISSING);

  const withModel = fakeDocument(`?${heatingCostSearch({
    sqft: EXAMPLE_SQFT,
    band: EXAMPLE_BAND_ID,
    end: EXAMPLE_END,
    hours: EXAMPLE_HOURS,
    species: EXAMPLE_SPECIES,
    woodEffText: "74",
    region: "natural-gas",
    pelletEffText: String(view.pelletEff),
    model: "room--example--listed",
  })}`);
  await mountHeatingCost(withModel, url);
  assert.equal(withModel.nodes.get("wood-eff").value, "61");
  assert.equal(withModel.nodes.get("wood-species").value, EXAMPLE_SPECIES);
  assert.equal(withModel.nodes.get("size-hours").value, String(EXAMPLE_HOURS));
  assert.equal(withModel.nodes.get("pellet-region").value, "");
  assert.equal(withModel.nodes.get("pellet-eff").value, String(view.pelletEff));
});

test("the pellet and wood page keeps one comparison section and does not add a tool URL", () => {
  const page = readFileSync(join(root, "src/pages/pellet-stove-vs-wood-stove.astro"), "utf8");
  const calculator = readFileSync(join(root, "src/pages/tools/heating-cost-calculator.astro"), "utf8");
  assert.match(page, /pelletHeat\.sourceNote/);
  assert.match(page, /pelletPrice\.sourceNote/);
  assert.match(page, /species\.sourceNote/);
  assert.match(page, /comparison\.lastUpdated/);
  assert.match(page, /id="cost-per-season"/);
  assert.match(page, /faqLd\(faqs\)/);
  assert.match(page, /articleLd\(/);
  assert.match(page, /COST_CAVEAT/);
  assert.doesNotMatch(page, /pellet-vs-wood-cost/);
  assert.doesNotMatch(page, /WebApplication|Product|Review|AggregateRating/);
  assert.equal(existsSync(join(root, "src/pages/tools/pellet-vs-wood-cost.astro")), false);
  assert.match(calculator, /\/pellet-stove-vs-wood-stove\/#cost-per-season/);
  const lastmods = buildSitemapLastmods();
  assert.equal(lastmods.has("/tools/pellet-vs-wood-cost/"), false);
  assert.equal(lastmods.has("/pellet-stove-vs-wood-stove/"), true);
  assert.equal(lastmods.has("/tools/heating-cost-calculator/"), true);
});
