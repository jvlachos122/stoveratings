import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatCount } from "../src/lib/format.js";
import { SIZE_BANDS } from "../src/lib/heating-cost.js";
import {
  COMMON_SIZES,
  EXAMPLE_SQFT,
  NOT_LISTED_BY_EPA,
  bandById,
  commonSizeRows,
  efficiencyLabel,
  emissionLabel,
  exampleAnswer,
  excludedHeatCount,
  excludedSentence,
  hasHeatRange,
  heatLabel,
  overlapModels,
  overlapRowView,
  overlapStatus,
  planningRange,
  planningSentence,
  rangesOverlap,
  selectOverlaps,
  sizeFaqs,
  sizeOverlapPayload,
} from "../src/lib/stove-size.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stoves = JSON.parse(readFileSync(join(root, "data/stoves.json"), "utf8"));
const meta = JSON.parse(readFileSync(join(root, "data/meta.json"), "utf8"));
const banned = /\b(best|scores?|right size(?: for you)?)\b/i;

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function line(partial) {
  return {
    current: true,
    type: "Wood Stove",
    manufacturer: "Example",
    url: `/stoves/example/${String(partial.model || "line").toLowerCase().replace(/\s+/g, "-")}/`,
    insertFlag: false,
    efficiency: 70,
    emission: 1.2,
    emissionUnit: "g/hr",
    btuLow: 10000,
    btuHigh: 20000,
    btuMax: null,
    ...partial,
  };
}

function independentOverlap(rows, low, high) {
  return rows.filter((stove) => {
    if (stove.current !== true) return false;
    if (stove.type !== "Wood Stove" && stove.type !== "Pellet Stove") return false;
    if (stove.btuLow == null || stove.btuHigh == null) return false;
    if (!Number.isFinite(Number(stove.btuLow)) || !Number.isFinite(Number(stove.btuHigh))) return false;
    if (Number(stove.btuHigh) < Number(stove.btuLow)) return false;
    return Number(stove.btuLow) <= high && Number(stove.btuHigh) >= low;
  });
}

function overlapWidth(stove, low, high) {
  return Math.min(stove.btuHigh, high) - Math.max(stove.btuLow, low);
}

function independentSort(rows, low, high) {
  return rows.slice().sort((a, b) => {
    const width = overlapWidth(b, low, high) - overlapWidth(a, low, high);
    if (width) return width;
    const mid = (b.btuLow + b.btuHigh) / 2 - (a.btuLow + a.btuHigh) / 2;
    if (mid) return mid;
    return a.model.localeCompare(b.model, "en");
  });
}

test("a missing heat output is not zero and does not overlap a planning range", () => {
  assert.equal(rangesOverlap(null, 90000, 60000, 90000), false);
  assert.equal(rangesOverlap(0, 90000, 60000, 90000), true);
  assert.equal(rangesOverlap(90000, 120000, 60000, 90000), true);
  assert.equal(rangesOverlap(90001, 120000, 60000, 90000), false);
  assert.equal(hasHeatRange({ btuLow: null, btuHigh: null, btuMax: 80000 }), false);
  assert.equal(hasHeatRange({ btuLow: null, btuHigh: 80000, btuMax: null }), false);
  assert.equal(hasHeatRange({ btuLow: 10, btuHigh: 5 }), false);
  assert.equal(hasHeatRange({ btuLow: 0, btuHigh: 0 }), true);

  const rows = [
    line({ model: "Max only", btuLow: null, btuHigh: null, btuMax: 80000 }),
    line({ model: "High only", btuLow: null, btuHigh: 80000 }),
    line({ model: "Zeros", btuLow: 0, btuHigh: 0 }),
    line({ model: "Partial", btuLow: 50000, btuHigh: 70000 }),
    line({ model: "Wide", btuLow: 10000, btuHigh: 100000 }),
    line({ model: "Snug", btuLow: 60000, btuHigh: 90000 }),
    line({ model: "Touch", btuLow: 90000, btuHigh: 120000 }),
    line({ model: "Miss", btuLow: 90001, btuHigh: 100000 }),
    line({ model: "Old", current: false, btuLow: 60000, btuHigh: 90000 }),
    line({ model: "Boiler", type: "Hydronic Heater", btuLow: 10000, btuHigh: 200000 }),
    line({
      model: "Pellet blank",
      type: "Pellet Stove",
      btuLow: 65000,
      btuHigh: 85000,
      insertFlag: true,
      efficiency: null,
      emission: null,
      emissionUnit: "",
    }),
    line({ model: "Listed zero", btuLow: 60000, btuHigh: 80000, efficiency: 0, emission: 0 }),
  ];
  const matched = overlapModels(rows, 60000, 90000).map((stove) => stove.model);
  assert.deepEqual(matched, ["Snug", "Wide", "Pellet blank", "Listed zero", "Partial", "Touch"]);
  assert.equal(matched.includes("Max only"), false);
  assert.equal(matched.includes("High only"), false);
  assert.equal(matched.includes("Zeros"), false);
  assert.equal(matched.includes("Old"), false);
  assert.equal(matched.includes("Boiler"), false);
  assert.equal(excludedHeatCount(rows), 2);

  const blank = overlapRowView(rows.find((stove) => stove.model === "Pellet blank"));
  assert.equal(blank.efficiency, NOT_LISTED_BY_EPA);
  assert.equal(blank.emission, NOT_LISTED_BY_EPA);
  assert.equal(blank.insert, true);
  assert.equal(blank.type, "Pellet stove");
  assert.notEqual(blank.efficiency, "0%");
  assert.notEqual(blank.emission, "0 g/hr");

  const zero = overlapRowView(rows.find((stove) => stove.model === "Listed zero"));
  assert.equal(zero.efficiency, "0%");
  assert.equal(zero.emission, "0 g/hr");
  assert.equal(efficiencyLabel(null), NOT_LISTED_BY_EPA);
  assert.equal(efficiencyLabel(0), "0%");
  assert.equal(emissionLabel(null, "g/hr"), NOT_LISTED_BY_EPA);
  assert.equal(heatLabel(null, null), NOT_LISTED_BY_EPA);
  assert.equal(heatLabel(null, 80000), NOT_LISTED_BY_EPA);

  const compact = {
    u: "/stoves/example/null-low/",
    n: "Null low",
    m: "",
    t: "w",
    i: 0,
    lo: null,
    hi: 90000,
    eff: null,
    em: null,
    eu: "g/hr",
  };
  assert.deepEqual(selectOverlaps([compact], 1000, 2000), []);
  assert.equal(selectOverlaps([{ ...compact, lo: 0, hi: 90000, n: "Zero low" }], 1000, 2000).length, 1);
  assert.equal(overlapRowView(compact).manufacturer, NOT_LISTED_BY_EPA);
  assert.equal(overlapRowView(compact).efficiency, NOT_LISTED_BY_EPA);

  const payload = sizeOverlapPayload(rows, "2026-10-23");
  assert.equal(payload.excluded, 2);
  assert.equal(payload.models.some((model) => model.n === "Max only" || model.n === "High only" || model.n === "Old" || model.n === "Boiler"), false);
  assert.equal(payload.models.some((model) => model.lo == null || model.hi == null), false);
  const pellet = payload.models.find((model) => model.n === "Pellet blank");
  assert.equal(pellet.t, "p");
  assert.equal(pellet.i, 1);
  assert.equal(pellet.eff, null);
  assert.equal(pellet.em, null);
  const encoded = JSON.stringify(payload);
  assert.equal(encoded.includes('"eff":null'), true);
  assert.equal(encoded.includes('"eff":0'), true);
  assert.equal(encoded.includes("btuMax"), false);
  assert.equal(encoded.includes("retailNames"), false);
  assert.equal(encoded.includes("Max only"), false);
  const keys = Object.keys(payload.models[0]).sort();
  assert.deepEqual(keys, ["eff", "em", "eu", "hi", "i", "lo", "m", "n", "t", "u"]);
});

test("equal coverage sorts by EPA heat-output midpoint, then model name", () => {
  const planLow = 10000;
  const planHigh = 20000;
  const rows = [
    line({ model: "Zed", btuLow: 15000, btuHigh: 25000 }),
    line({ model: "Alpha", btuLow: 10000, btuHigh: 15000 }),
    line({ model: "Cover", btuLow: 5000, btuHigh: 40000 }),
    line({ model: "Beta", btuLow: 10000, btuHigh: 20000 }),
    line({ model: "Able", btuLow: 10000, btuHigh: 20000 }),
    line({ model: "Outside", btuLow: 20001, btuHigh: 30000 }),
  ];
  const names = overlapModels(rows, planLow, planHigh).map((stove) => stove.model);
  assert.deepEqual(names, independentSort(independentOverlap(rows, planLow, planHigh), planLow, planHigh).map((stove) => stove.model));
  assert.deepEqual(names, ["Cover", "Able", "Beta", "Zed", "Alpha"]);
  const inserts = selectOverlaps(
    rows.map((stove) => ({ ...stove, lo: stove.btuLow, hi: stove.btuHigh, t: "w", n: stove.model, i: stove.model === "Alpha" ? 1 : 0 })),
    planLow,
    planHigh,
    "wood",
    true,
  );
  assert.deepEqual(inserts.map((stove) => stove.n), ["Alpha"]);
  const pelletOnly = selectOverlaps(
    [{ lo: 10000, hi: 20000, t: "p", n: "Pel", i: 0 }, { lo: 10000, hi: 20000, t: "w", n: "Wood", i: 0 }],
    planLow,
    planHigh,
    "pellet",
    false,
  );
  assert.deepEqual(pelletOnly.map((stove) => stove.n), ["Pel"]);
});

test("common sizes and the 2,000 sq ft moderate example are recomputed from the snapshot", () => {
  assert.deepEqual(COMMON_SIZES, [500, 1000, 1500, 2000, 2500, 3000]);
  assert.deepEqual(
    SIZE_BANDS.map((band) => [band.id, band.low, band.high]),
    [
      ["mild", 20, 30],
      ["moderate", 30, 45],
      ["cold", 45, 60],
      ["severe", 60, 75],
    ],
  );
  const rows = commonSizeRows(stoves);
  assert.equal(rows.length, COMMON_SIZES.length * SIZE_BANDS.length);
  for (const row of rows) {
    const expected = planningRange(row.sqft, row.band);
    assert.deepEqual(row.range, expected);
    const matched = independentOverlap(stoves, expected.low, expected.high);
    const wood = matched.filter((stove) => stove.type === "Wood Stove").length;
    const pellet = matched.filter((stove) => stove.type === "Pellet Stove").length;
    assert.equal(row.wood, wood, `${row.sqft} ${row.band.id} wood`);
    assert.equal(row.pellet, pellet, `${row.sqft} ${row.band.id} pellet`);
  }

  const band = bandById("moderate");
  const range = planningRange(EXAMPLE_SQFT, band);
  assert.deepEqual(range, { low: 60000, high: 90000 });
  const listed = overlapModels(stoves, range.low, range.high);
  const expected = independentSort(independentOverlap(stoves, range.low, range.high), range.low, range.high);
  assert.deepEqual(listed.map((stove) => stove.id), expected.map((stove) => stove.id));
  const wood = expected.filter((stove) => stove.type === "Wood Stove").length;
  const pellet = expected.filter((stove) => stove.type === "Pellet Stove").length;
  const sentences = exampleAnswer(stoves, meta.snapshotDate);
  assert.equal(sentences.length, 3);
  assert.match(sentences[0], /60,000 BTU\/hr/);
  assert.match(sentences[0], /90,000 BTU\/hr/);
  assert.match(sentences[0], /times 30/);
  assert.match(sentences[0], /times 45/);
  assert.ok(sentences[1].includes(`${formatCount(wood)} currently certified wood-stove model line`));
  assert.ok(sentences[1].includes(`${formatCount(pellet)} currently certified pellet-stove model line`));
  assert.ok(sentences[1].includes(meta.snapshotDate));
  assert.match(sentences[2], /not EPA figures/);
  assert.match(sentences[2], /lab test range/);
  assert.match(sentences[2], /not a sizing guarantee/);
  assert.equal(planningSentence(2000, band), "2,000 sq ft × 30 = 60,000 BTU/hr, and 2,000 sq ft × 45 = 90,000 BTU/hr. That is StoveRatings' planning range for this band, not an EPA figure.");

  const population = stoves.filter((stove) => stove.current === true && (stove.type === "Wood Stove" || stove.type === "Pellet Stove"));
  const missing = population.filter((stove) => stove.btuLow == null || stove.btuHigh == null || stove.btuHigh < stove.btuLow);
  assert.equal(excludedHeatCount(stoves), missing.length);
  const payload = sizeOverlapPayload(stoves, meta.snapshotDate);
  assert.equal(payload.snapshot, meta.snapshotDate);
  assert.equal(payload.excluded, missing.length);
  assert.equal(payload.models.length + payload.excluded, population.length);
  assert.equal(payload.models.some((model) => model.lo == null || model.hi == null || model.hi < model.lo), false);
  const encoded = JSON.stringify(payload);
  assert.equal(encoded.includes("retailNames"), false);
  assert.equal(encoded.includes("manufacturerSlug"), false);
  assert.equal(encoded.includes("btuMax"), false);
  assert.ok(Buffer.byteLength(encoded) < 120000);

  const fromPayload = selectOverlaps(payload.models, range.low, range.high).map(overlapRowView);
  assert.deepEqual(fromPayload, listed.map(overlapRowView));

  const faqs = sizeFaqs(stoves, meta.snapshotDate);
  assert.deepEqual(faqs.map((faq) => faq.question), [
    "How many BTU to heat 2,000 sq ft?",
    "How many BTU to heat 1,000 sq ft?",
    "What does an overlapping EPA heat-output range mean?",
  ]);
  assert.match(faqs[0].answer, /40,000/);
  assert.match(faqs[0].answer, /150,000/);
  assert.match(faqs[0].answer, /not a room-by-room heat-loss calculation/);
  assert.match(faqs[2].answer, /not listed by EPA/);
  assert.match(faqs[2].answer, /not treated as zero/);
  assert.match(faqs.map((faq) => `${faq.question} ${faq.answer}`).join(" "), /not a recommendation or a sizing guarantee/);
  assert.equal(banned.test(sentences.join(" ")), false);
  assert.equal(banned.test(faqs.map((faq) => `${faq.question} ${faq.answer}`).join(" ")), false);
});

test("copy states the sort rule, keeps the factors, and skips banned sizing language", () => {
  assert.match(excludedSentence(0), /0 currently certified/);
  assert.match(excludedSentence(0), /not listed by EPA/);
  assert.match(excludedSentence(0), /not zero/);
  assert.match(excludedSentence(1), /1 currently certified wood-stove or pellet-stove model line has/);
  assert.match(excludedSentence(2), /2 currently certified wood-stove and pellet-stove model lines have/);
  const status = overlapStatus(2, { low: 60000, high: 90000 }, { side: "all", insertsOnly: true });
  assert.match(status, /2 model lines whose names indicate an insert list/);
  assert.doesNotMatch(status, /inserts list/);

  const page = read("src/pages/tools/stove-size-calculator.astro");
  const lib = read("src/lib/stove-size.js");
  const ui = read("src/lib/stove-size-ui.js");
  const text = `${page}\n${lib}\n${ui}`;
  assert.equal(banned.test(text), false);
  assert.doesNotMatch(text, /IECC|climate zone|DOE zone/i);
  assert.match(page, /faqLd\(faqs\)/);
  assert.match(page, /SIZE_TABLE_CAPTION/);
  assert.match(page, /id="size-table"/);
  assert.match(page, /id="size-inserts"/);
  assert.match(page, /mountStoveSize/);
  for (const href of [
    'href="/">',
    'href="/lookup/"',
    'href="/tools/heating-cost-calculator/"',
    'href="/most-efficient-wood-stoves/"',
    'href="/most-efficient-pellet-stoves/"',
    'href="/cleanest-burning-wood-stoves/"',
    'href="/cleanest-burning-pellet-stoves/"',
    'href="/catalytic-wood-stoves/"',
    'href="/non-catalytic-wood-stoves/"',
    'href="/hybrid-wood-stoves/"',
    'href="/pellet-stoves/"',
  ]) {
    assert.match(page, new RegExp(href.replaceAll("/", "\\/")));
  }
  assert.equal(existsSync(join(root, "public/scripts/calculator.js")), false);
  assert.equal(existsSync(join(root, "src/pages/tools/stove-size-calculator/[sqft].astro")), false);
  const noindex = JSON.parse(read("data/noindex-paths.json"));
  assert.equal(noindex.includes("/tools/stove-size-calculator/"), false);
  assert.match(read("public/llms.txt"), /stove-size-calculator/);
  assert.match(read("scripts/prepare-public-data.mjs"), /size-overlap\.json/);
});
