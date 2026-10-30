import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { webAppLd } from "../src/lib/schema.js";
import {
  EFFICIENCY_MISSING,
  PRICE_MISSING,
  SEASON_MISSING,
  SIZE_BANDS,
  applianceSide,
  cordHeatText,
  costsForFuel,
  deliveredMmbtuFromSize,
  efficiencyNote,
  efficiencyVaries,
  formatUsd,
  formatUsdRange,
  heatingModels,
  heatingSentences,
  pelletBtuPerShortTon,
  perMmbtuText,
  seasonText,
  sharedRetrieved,
  sourceIssues,
} from "../src/lib/heating-cost.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(name) {
  return JSON.parse(readFileSync(join(root, "data", name), "utf8"));
}

test("cordwood range, blank efficiency, and season heat use the published formula", () => {
  const oak = costsForFuel({
    price: 300,
    btuLow: 24_000_000,
    btuHigh: 28_000_000,
    efficiencyPercent: 70,
    deliveredMmbtu: 80,
  });
  assert.equal(oak.ok, true);
  assert.ok(Math.abs(oak.perMmbtuLow - 300 / 19.6) < 1e-9);
  assert.ok(Math.abs(oak.perMmbtuHigh - 300 / 16.8) < 1e-9);
  assert.ok(Math.abs(oak.seasonLow - (80 * 300) / 19.6) < 1e-9);
  assert.ok(Math.abs(oak.seasonHigh - (80 * 300) / 16.8) < 1e-9);
  assert.equal(formatUsd(oak.perMmbtuLow), "$15.31");
  assert.equal(formatUsd(oak.perMmbtuHigh), "$17.86");
  assert.equal(formatUsd(oak.seasonLow), "$1,224.49");
  assert.equal(formatUsd(oak.seasonHigh), "$1,428.57");
  assert.equal(formatUsdRange(oak.perMmbtuLow, oak.perMmbtuHigh), "$15.31 to $17.86");

  for (const efficiencyPercent of [null, "", " ", 0, -5]) {
    const blank = costsForFuel({
      price: 300,
      btuLow: 24_000_000,
      btuHigh: 28_000_000,
      efficiencyPercent,
      deliveredMmbtu: 80,
    });
    assert.equal(blank.ok, false);
    assert.equal(blank.reason, "efficiency");
    assert.equal(blank.perMmbtuLow, null);
    assert.equal(blank.seasonLow, null);
    assert.equal(perMmbtuText(blank), EFFICIENCY_MISSING);
    assert.equal(blank.perMmbtuLow === 0, false);
    assert.match(EFFICIENCY_MISSING, /not zero/);
  }

  const noPrice = costsForFuel({
    price: "",
    btuLow: 91_452,
    btuHigh: 91_452,
    efficiencyPercent: 80,
    deliveredMmbtu: 10,
  });
  assert.equal(noPrice.reason, "price");
  assert.equal(perMmbtuText(noPrice), PRICE_MISSING);

  const noSeason = costsForFuel({
    price: "2.730",
    btuLow: 91452,
    btuHigh: 91452,
    efficiencyPercent: 80,
    deliveredMmbtu: "",
  });
  assert.equal(noSeason.ok, true);
  assert.equal(noSeason.seasonLow, null);
  assert.equal(seasonText(noSeason), SEASON_MISSING);
  const propanePer = 2.73 / ((91452 / 1e6) * 0.8);
  assert.ok(Math.abs(noSeason.perMmbtuLow - propanePer) < 1e-9);
  assert.equal(formatUsdRange(noSeason.perMmbtuLow, noSeason.perMmbtuHigh), formatUsd(propanePer));
});

test("pellet tons, natural gas, and a heat pump stay on the cited heat contents", () => {
  assert.equal(pelletBtuPerShortTon("8345.2"), 16_690_400);
  assert.equal(pelletBtuPerShortTon("7936.664"), 15_873_328);
  assert.equal(pelletBtuPerShortTon("8459.172"), 16_918_344);
  const pellets = costsForFuel({
    price: 350,
    btuLow: 16_690_400,
    btuHigh: 16_690_400,
    efficiencyPercent: 75,
    deliveredMmbtu: 50,
  });
  const expectedPellet = 350 / ((16_690_400 / 1e6) * 0.75);
  assert.ok(Math.abs(pellets.perMmbtuLow - expectedPellet) < 1e-9);
  assert.ok(Math.abs(pellets.seasonLow - expectedPellet * 50) < 1e-6);
  assert.equal(formatUsd(pellets.perMmbtuLow), "$27.96");
  assert.equal(formatUsd(pellets.seasonLow), "$1,398.01");

  const gas = costsForFuel({
    price: "26.45",
    btuLow: 1_036_000,
    btuHigh: 1_036_000,
    efficiencyPercent: 95,
    deliveredMmbtu: 40,
  });
  const expectedGas = 26.45 / (1.036 * 0.95);
  assert.ok(Math.abs(gas.perMmbtuLow - expectedGas) < 1e-9);
  assert.ok(Math.abs(gas.seasonLow - expectedGas * 40) < 1e-6);

  const pump = costsForFuel({
    price: "0.1816",
    btuLow: 3412,
    btuHigh: 3412,
    efficiencyPercent: 250,
    deliveredMmbtu: 10,
  });
  const expectedPump = 0.1816 / ((3412 / 1e6) * 2.5);
  assert.ok(Math.abs(pump.perMmbtuLow - expectedPump) < 1e-9);
  assert.equal(pump.perMmbtuLow, pump.perMmbtuHigh);
  assert.equal(formatUsd(pump.perMmbtuLow), "$21.29");
  assert.equal(formatUsd(pump.seasonLow), "$212.90");
});

test("stove-size hours reuse the published band factors and do not invent a duration", () => {
  assert.equal(deliveredMmbtuFromSize(2000, 30, 1000), 60);
  assert.equal(deliveredMmbtuFromSize(2000, 45, 1000), 90);
  assert.equal(deliveredMmbtuFromSize(2000, 30, ""), null);
  assert.equal(deliveredMmbtuFromSize(2000, 30, 0), null);
  const calc = readFileSync(join(root, "public/scripts/calculator.js"), "utf8");
  const page = readFileSync(join(root, "src/pages/tools/stove-size-calculator.astro"), "utf8");
  for (const band of SIZE_BANDS) {
    assert.match(calc, new RegExp(`${band.id}: \\[${band.low}, ${band.high}\\]`));
    assert.match(page, new RegExp(`${band.low}`));
    assert.match(page, new RegExp(`${band.high}`));
  }
  assert.equal(cordHeatText(24, 28), "24 to 28 million BTU per cord");
  assert.equal(cordHeatText(27, 27), "27 million BTU per cord");
});

test("EPA efficiency stays null when the snapshot leaves it blank", () => {
  const blank = heatingModels([
    {
      id: "room--example--blank",
      model: "Blank",
      manufacturer: "Example",
      type: "Wood Stove",
      fuel: "Crib Wood",
      efficiency: null,
      url: "/stoves/example/blank/",
      current: false,
      tests: [{ efficiency: null }, { efficiency: null }],
    },
  ]);
  assert.equal(blank[0].eff, null);
  assert.equal(blank[0].side, "wood");
  assert.match(efficiencyNote(blank[0], "2026-10-23"), /Not listed by EPA/);
  assert.doesNotMatch(efficiencyNote(blank[0], "2026-10-23"), /0 percent/);

  const listed = {
    id: "room--example--listed",
    model: "Listed",
    manufacturer: "Example",
    type: "Pellet Stove",
    fuel: "",
    efficiency: 76,
    url: "/stoves/example/listed/",
    current: true,
    tests: [{ efficiency: 76 }, { efficiency: null }],
  };
  const models = heatingModels([listed]);
  assert.equal(models[0].side, "pellet");
  assert.equal(models[0].eff, 76);
  assert.equal(models[0].varied, true);
  assert.match(efficiencyNote(models[0], "2026-10-23"), /76 percent/);
  assert.equal(efficiencyVaries([{ efficiency: 70 }, { efficiency: 70 }]), false);
  assert.equal(applianceSide({ fuel: "Wood Pellets", type: "Forced Air Furnace" }), "pellet");
  assert.equal(applianceSide({ fuel: "Cord Wood", type: "Hydronic Heater" }), "wood");
});

test("fuel snapshot rows cite a source, and cord or pellet prices are not prefilled", () => {
  assert.deepEqual(sourceIssues({}), ["source_url", "retrieved", "period", "period_label", "source_note"]);
  assert.ok(sourceIssues({ sourceUrl: "https://cfpub.epa.gov/x", retrieved: "2026-10-30", period: "2026", periodLabel: "2026", sourceNote: "n" }).includes("cfpub"));

  const heat = readJson("fuel-heat.json");
  const prices = readJson("fuel-prices.json");
  assert.deepEqual(heat.map((row) => row.id), [
    "pellets-east",
    "pellets-south",
    "pellets-west",
    "natural-gas",
    "propane",
    "heating-oil",
    "electricity",
  ]);
  const btu = Object.fromEntries(heat.map((row) => [row.id, row.btuText]));
  assert.equal(btu["pellets-east"], "8345.2");
  assert.equal(btu["pellets-south"], "7936.664");
  assert.equal(btu["pellets-west"], "8459.172");
  assert.equal(btu["natural-gas"], "1036000");
  assert.equal(btu.propane, "91452");
  assert.equal(btu["heating-oil"], "137381");
  assert.equal(btu.electricity, "3412");
  for (const row of heat) assert.deepEqual(sourceIssues(row), []);

  const price = Object.fromEntries(prices.map((row) => [row.id, row]));
  assert.equal(price["natural-gas"].priceText, "26.45");
  assert.equal(price["natural-gas"].prefill, true);
  assert.equal(price["natural-gas"].periodLabel, "July 2026");
  assert.equal(price.propane.priceText, "2.730");
  assert.equal(price["heating-oil"].priceText, "6.233");
  assert.equal(price["heating-oil"].period, "2026-10-26");
  assert.equal(price.electricity.priceText, "0.1816");
  assert.equal(price.electricity.periodLabel, "August 2026");
  assert.equal(price["pellets-domestic"].priceText, "243.39");
  assert.equal(price["pellets-domestic"].prefill, false);
  assert.equal(prices.some((row) => /cord|firewood|species/i.test(row.id)), false);
  for (const row of prices) {
    assert.deepEqual(sourceIssues(row), []);
    assert.match(row.sourceUrl, /^https:\/\//);
    assert.equal(row.retrieved, "2026-10-30");
  }
  assert.equal(sharedRetrieved([...heat, ...prices]), "2026-10-30");

  const sentences = heatingSentences({
    gas: price["natural-gas"],
    oil: price["heating-oil"],
    propane: price.propane,
    electricity: price.electricity,
    pelletSales: price["pellets-domestic"],
    firewoodRetrieved: "2026-10-23",
    fuelRetrieved: "2026-10-30",
  });
  assert.equal(sentences.length, 3);
  const text = sentences.join(" ");
  assert.match(text, /July 2026/);
  assert.match(text, /week of October 26, 2026/);
  assert.match(text, /August 2026/);
  assert.match(text, /2026-10-23/);
  assert.match(text, /2026-10-30/);
  assert.match(text, /\$243\.39/);
  assert.match(text, /no prefilled price/i);
  assert.match(text, /starts empty/);
  assert.doesNotMatch(text, /\bbest\b|\bsafe\b/i);
});

test("the build loader rejects a fuel row with no source", () => {
  const script = `
import importlib.util, pathlib, tempfile, sys
spec = importlib.util.spec_from_file_location("build_data", "scripts/build_data.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def expect_fail(text, loader):
    path = pathlib.Path(tempfile.mkdtemp()) / "bad.csv"
    path.write_text(text, encoding="utf-8")
    try:
        loader(path)
    except SystemExit:
        return
    raise SystemExit("loader accepted a bad row")

heat_header = "id,label,unit,btu_per_unit,period,period_label,source_url,retrieved,source_note\\n"
expect_fail(heat_header + "a,Gas,gallon,1,2026,2026 estimate,,2026-10-30,note\\n", mod.load_fuel_heat)
expect_fail(heat_header + "a,Gas,gallon,1,2026,2026 estimate,https://www.eia.gov/x,,note\\n", mod.load_fuel_heat)
expect_fail(heat_header + "a,Gas,gallon,1,,2026 estimate,https://www.eia.gov/x,2026-10-30,note\\n", mod.load_fuel_heat)
expect_fail(heat_header + "a,Gas,gallon,1,2026,2026 estimate,https://cfpub.epa.gov/x,2026-10-30,note\\n", mod.load_fuel_heat)
price_header = "id,label,unit,price,price_decimals,prefill,period,period_label,source_url,retrieved,source_note\\n"
expect_fail(price_header + "pellets-east,Pellets,short ton,10,2,yes,2026-07,July 2026,https://www.eia.gov/x,2026-10-30,note\\n", mod.load_fuel_prices)
heat = mod.load_fuel_heat()
prices = mod.load_fuel_prices()
if len(heat) < 7 or len(prices) < 5:
    raise SystemExit("real fuel files did not load")
print("fuel loader ok")
`;
  const result = spawnSync("python3", ["-c", script], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /fuel loader ok/);
});

test("the calculator page is one WebApplication with an answer box and no review markup", () => {
  const page = readFileSync(join(root, "src/pages/tools/heating-cost-calculator.astro"), "utf8");
  const layout = readFileSync(join(root, "src/layouts/Base.astro"), "utf8");
  assert.equal((page.match(/<h1\b/g) || []).length, 1);
  assert.match(page, /<Answer/);
  assert.match(page, /webAppLd\(/);
  assert.match(page, /Heating cost calculator/);
  assert.match(page, /breadcrumbs=/);
  assert.match(layout, /rel="canonical"/);
  assert.match(layout, /name="description"/);
  assert.match(layout, /BreadcrumbList/);
  assert.doesNotMatch(page, /AggregateRating|FAQPage|@type": "Product"|@type": "Review"/);
  const app = webAppLd("Heating cost calculator", "x".repeat(50), "/tools/heating-cost-calculator/");
  assert.equal(app["@type"], "WebApplication");
  assert.equal(app.creator["@type"], "Organization");
  assert.equal(app.publisher["@type"], "Organization");
  assert.doesNotMatch(JSON.stringify(app), /AggregateRating|Review|Product/);

  const modelPage = readFileSync(join(root, "src/pages/stoves/[manufacturer]/[model].astro"), "utf8");
  assert.match(modelPage, /Estimate running cost/);
  assert.match(modelPage, /stove\.efficiency != null/);
  assert.match(modelPage, /\/tools\/heating-cost-calculator\//);
});
