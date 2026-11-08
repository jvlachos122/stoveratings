import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  EPA_BURN_WISE_FAQ_URL,
  NOT_LISTED_BY_EPA,
  SUBTYPE_ORDER,
  SUBTYPE_PAGE,
  assertSubtypeCopy,
  catalyticHybridCopy,
  findBlock,
  labelParagraph,
  listedNumber,
  median,
  mixedSubtypeText,
  pelletTableLead,
  roomTableLead,
  subtypeAnswer,
  subtypeDataNotes,
  subtypeFaqs,
  subtypeMixedLines,
  subtypeNameMismatches,
  subtypeReport,
  technologyCopy,
  woodTableLead,
} from "../src/lib/subtype-explain.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(name) {
  return JSON.parse(readFileSync(join(root, "data", name), "utf8"));
}

function roomCurrentTests(stoves) {
  return stoves
    .filter((stove) => stove.category === "room")
    .flatMap((stove) => stove.tests)
    .filter((test) => test.current);
}

test("room-heater subtype counts and wood medians match the committed snapshot", () => {
  const stoves = readJson("stoves.json");
  const stats = readJson("stats.json");
  const report = subtypeReport(stoves);
  assert.equal(report.currentRows, stats.rows.roomCurrent);
  let named = 0;
  for (const subtype of SUBTYPE_ORDER) {
    const block = findBlock(report.all, subtype);
    assert.equal(block.rows, stats.roomCurrentBySubtype[subtype] || 0);
    assert.equal(block.woodRows + block.pelletRows + block.otherTypeRows, block.rows);
    named += block.rows;
    assert.equal(findBlock(report.wood, subtype).rows, stats.roomCurrentWoodBySubtype[subtype] || 0);
  }
  const extra = report.all
    .filter((block) => !SUBTYPE_ORDER.includes(block.subtype))
    .reduce((sum, block) => sum + block.rows, 0);
  assert.equal(named + extra, report.currentRows);
  assert.equal(
    findBlock(report.all, "Catalytic Stove").rows
      + findBlock(report.all, "Non-Catalytic Stove").rows
      + findBlock(report.all, "Hybrid").rows
      + extra,
    stats.rows.roomCurrent,
  );

  const published = {
    "Catalytic Stove": stats.medians.currentWoodCatalytic,
    "Non-Catalytic Stove": stats.medians.currentWoodNonCatalytic,
    Hybrid: stats.medians.currentWoodHybrid,
  };
  for (const [subtype, block] of Object.entries(published)) {
    const wood = findBlock(report.wood, subtype);
    assert.equal(wood.rows, block.rows);
    assert.equal(wood.emissionN, block.emissionN);
    assert.equal(wood.efficiencyN, block.efficiencyN);
    assert.equal(wood.emissionMedian, block.emissionMedian);
    assert.equal(wood.efficiencyMedian, block.efficiencyMedian);
  }
});

test("subtype medians are recomputed from the test rows", () => {
  const stoves = readJson("stoves.json");
  const report = subtypeReport(stoves);
  const current = roomCurrentTests(stoves);
  for (const subtype of SUBTYPE_ORDER) {
    const rows = current.filter((test) => (test.subtype || "") === subtype);
    const block = findBlock(report.all, subtype);
    const emissions = rows.map((row) => row.emission).filter((value) => value != null);
    const efficiencies = rows.map((row) => row.efficiency).filter((value) => value != null);
    assert.equal(block.rows, rows.length);
    assert.equal(block.emissionN, emissions.length);
    assert.equal(block.efficiencyN, efficiencies.length);
    assert.equal(block.emissionMedian, median(emissions));
    assert.equal(block.efficiencyMedian, median(efficiencies));
    if (emissions.length) {
      assert.equal(block.emissionLow, Math.min(...emissions));
      assert.equal(block.emissionHigh, Math.max(...emissions));
    } else {
      assert.equal(block.emissionMedian, null);
      assert.equal(listedNumber(block.emissionMedian, 3), NOT_LISTED_BY_EPA);
    }
  }
  const blankRows = current.filter((test) => !test.subtype).length;
  assert.equal(report.blankCurrentRows, blankRows);
});

test("a blank EPA figure is not listed by EPA and a listed zero stays zero", () => {
  assert.equal(listedNumber(null, 3), NOT_LISTED_BY_EPA);
  assert.equal(listedNumber(undefined, 2), NOT_LISTED_BY_EPA);
  assert.equal(NOT_LISTED_BY_EPA, "not listed by EPA");
  assert.equal(listedNumber(0, 3), "0");
  assert.notEqual(listedNumber(0, 3), NOT_LISTED_BY_EPA);

  const line = (subtype, emission, efficiency) => ({
    category: "room",
    current: true,
    type: "Wood Stove",
    subtype,
    model: subtype || "blank",
    url: "/stoves/example/line/",
    manufacturer: "Example",
    primarySlug: "example",
    tests: [{ current: true, type: "Wood Stove", subtype, emission, efficiency }],
  });
  const blank = findBlock(subtypeReport([line("Catalytic Stove", null, null)]).all, "Catalytic Stove");
  assert.equal(blank.rows, 1);
  assert.equal(blank.emissionN, 0);
  assert.equal(blank.efficiencyN, 0);
  assert.equal(listedNumber(blank.emissionMedian, 3), NOT_LISTED_BY_EPA);
  assert.equal(listedNumber(blank.efficiencyLow, 3), NOT_LISTED_BY_EPA);
  assert.equal(listedNumber(blank.efficiencyMedian, 2), NOT_LISTED_BY_EPA);

  const zero = findBlock(subtypeReport([line("Hybrid", 0, 0)]).all, "Hybrid");
  assert.equal(zero.emissionMedian, 0);
  assert.equal(zero.efficiencyMedian, 0);
  assert.equal(listedNumber(zero.emissionMedian, 3), "0");
  assert.equal(listedNumber(zero.efficiencyMedian, 2), "0");
});

test("explainer copy uses the recomputed counts, the snapshot date, and no score language", () => {
  const stoves = readJson("stoves.json");
  const meta = readJson("meta.json");
  const report = subtypeReport(stoves);
  const mismatches = subtypeNameMismatches(stoves);
  const mixed = subtypeMixedLines(stoves);
  const sentences = subtypeAnswer(report, meta.snapshotDate);
  const faqs = subtypeFaqs(report, mismatches, mixed, meta.snapshotDate);
  const text = [
    sentences.join(" "),
    labelParagraph(report, meta.snapshotDate),
    roomTableLead(report),
    woodTableLead(),
    pelletTableLead(),
    ...Object.values(technologyCopy()),
    ...Object.values(catalyticHybridCopy()),
    mixedSubtypeText(mixed),
    faqs.map((faq) => `${faq.question} ${faq.answer}`).join(" "),
    subtypeDataNotes().join(" "),
  ].join("\n");
  assertSubtypeCopy(text);
  assert.equal(sentences.length, 4);
  assert.equal(sentences.at(-1), `Source: EPA Certified Wood Heater Database, snapshot ${meta.snapshotDate}.`);
  assert.match(sentences[0], new RegExp(meta.snapshotDate));
  const cat = findBlock(report.all, "Catalytic Stove");
  const non = findBlock(report.all, "Non-Catalytic Stove");
  const hybrid = findBlock(report.all, "Hybrid");
  assert.match(sentences[0], new RegExp(`${cat.rows} currently certified room-heater rows with the subtype Catalytic Stove`));
  assert.match(sentences[0], new RegExp(`${non.rows} with Non-Catalytic Stove`));
  assert.match(sentences[0], new RegExp(`${hybrid.rows} with Hybrid`));
  assert.match(text, /not listed by EPA/);
  assert.doesNotMatch(text, /cfpub\.epa\.gov/);
  assert.equal(EPA_BURN_WISE_FAQ_URL.includes("cfpub.epa.gov"), false);
  assert.match(EPA_BURN_WISE_FAQ_URL, /^https:\/\/www\.epa\.gov\/burnwise\//);
  assert.equal(faqs.length, 5);
  assert.equal(new Set(faqs.map((faq) => faq.question)).size, faqs.length);
  assert.ok(faqs.some((faq) => /catalytic-hybrid/i.test(faq.question)));
  for (const faq of faqs) {
    assert.match(faq.answer, new RegExp(meta.snapshotDate));
  }
});

test("hybrid in a model name is not treated as the Hybrid subtype", () => {
  const stoves = readJson("stoves.json");
  const mismatches = subtypeNameMismatches(stoves);
  const expected = stoves.filter((stove) => (
    stove.category === "room"
    && stove.current
    && /hybrid/i.test(stove.model)
    && stove.subtype !== "Hybrid"
  ));
  assert.deepEqual(
    mismatches.map((item) => item.url).sort(),
    expected.map((stove) => stove.url).sort(),
  );
  for (const item of mismatches) {
    assert.notEqual(item.subtype, "Hybrid");
    assert.match(item.model, /hybrid/i);
    assert.match(item.url, /^\/stoves\//);
  }
  const mixed = subtypeMixedLines(stoves);
  const expectedMixed = stoves.filter((stove) => (
    stove.category === "room"
    && new Set(stove.tests.map((test) => test.subtype || "")).size > 1
  ));
  assert.deepEqual(
    mixed.map((item) => item.url).sort(),
    expectedMixed.map((stove) => stove.url).sort(),
  );
  const text = mixedSubtypeText(mixed);
  for (const line of mixed) {
    assert.ok(new Set(line.tests.map((test) => test.subtype)).size > 1);
    assert.match(text, new RegExp(line.model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("the explainer is an indexable page that names the EPA fields it orders by", () => {
  const page = readFileSync(join(root, "src/pages/catalytic-vs-non-catalytic.astro"), "utf8");
  const noindex = JSON.parse(readFileSync(join(root, "data/noindex-paths.json"), "utf8"));
  assert.equal(noindex.includes(SUBTYPE_PAGE), false);
  assert.match(page, /subtypeReport/);
  assert.match(page, /faqLd\(faqs\)/);
  assert.match(page, /articleLd/);
  assert.doesNotMatch(page, /AggregateRating|@type": "Product"|@type": "Review"/);
  for (const href of [
    "/catalytic-wood-stoves/",
    "/non-catalytic-wood-stoves/",
    "/hybrid-wood-stoves/",
    "/most-efficient-wood-stoves/",
    "/cleanest-burning-wood-stoves/",
    "/most-efficient-pellet-stoves/",
    "/cleanest-burning-pellet-stoves/",
    "/pellet-stoves/",
  ]) {
    assert.ok(page.includes(`href="${href}"`), href);
  }
  assert.equal(catalyticHybridCopy().href, "/methodology/#certified-wood-2013");
  assert.match(page, /older\.href/);
  assert.equal(technologyCopy().href, EPA_BURN_WISE_FAQ_URL);
  assert.match(page, /tech\.href/);
  const visible = page.replace(/href="[^"]*"/g, "");
  assert.doesNotMatch(visible, /\b(best|scores?|safest|popular|winners?|affiliate)\b/i);
  assert.match(visible, /ordered by HHV efficiency/);
  assert.match(visible, /ordered by emission rate/);
  const llms = readFileSync(join(root, "public/llms.txt"), "utf8");
  assert.match(llms, /https:\/\/stoveratings\.com\/catalytic-vs-non-catalytic\//);
});
