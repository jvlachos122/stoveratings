import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { LOGOX_PLACEMENTS } from "../src/lib/affiliates.js";
import { glossaryParts } from "../src/lib/glossary.js";
import {
  GRADES_PAGE,
  GRADES_RETRIEVED,
  GRADE_CAPTION,
  assertGradeCopy,
  gradeParts,
  gradeVisibleText,
  pelletGradeCounts,
} from "../src/lib/pellet-fuel-grades.js";
import { faqLd } from "../src/lib/schema.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const banned = /\b(best|safe|safest|safer|top-rated|recommend\w*|scores?|ratings?|popular|winners?|affiliate|sponsored|cleanest|better)\b/i;
const epaAppHost = ["cf", "pub.epa.gov"].join("");

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function readJson(path) {
  return JSON.parse(read(path));
}

function withoutUrls(text) {
  return text
    .replace(/const BANNED_COPY =[\s\S]*?;\n/, "")
    .replace(/["'`]\/[^"'`]+["'`]/g, '""')
    .replace(/https?:\/\/\S+/g, "");
}

function offlineCounts(stoves) {
  let currentRows = 0;
  let currentLines = 0;
  let insertLines = 0;
  let insertRows = 0;
  let blankRows = 0;
  const fuelRows = new Map();
  for (const stove of stoves) {
    if (!stove || stove.category !== "room" || !Array.isArray(stove.tests)) continue;
    const pelletTests = stove.tests.filter((test) => test && test.current === true && test.type === "Pellet Stove");
    currentRows += pelletTests.length;
    if (stove.type === "Pellet Stove" && stove.current === true) {
      currentLines += 1;
      if (stove.insertFlag === true) {
        insertLines += 1;
        insertRows += stove.tests.filter((test) => test && test.current === true).length;
      }
    }
    for (const test of pelletTests) {
      const fuel = typeof test.fuel === "string" ? test.fuel.trim() : "";
      if (!fuel) blankRows += 1;
      else fuelRows.set(fuel, (fuelRows.get(fuel) || 0) + 1);
    }
  }
  const fuels = [...fuelRows.entries()]
    .map(([fuel, rows]) => ({ fuel, rows }))
    .sort((a, b) => b.rows - a.rows || a.fuel.localeCompare(b.fuel));
  return { currentRows, currentLines, insertLines, insertRows, blankRows, fuels };
}

const stoves = readJson("data/stoves.json");
const meta = readJson("data/meta.json");
const stats = readJson("data/stats.json");
const parts = gradeParts(stoves, meta.snapshotDate);
const text = gradeVisibleText(parts);
const page = read("src/pages/pellet-fuel-grades.astro");
const lib = read("src/lib/pellet-fuel-grades.js");

test("the page quotes subpart AAA and prints only cited grade limits", () => {
  assertGradeCopy(text);
  assert.equal(banned.test(`${text}\n${page}\n${withoutUrls(lib)}`), false);
  assert.equal(`${lib}\n${page}\n${text}`.includes(epaAppHost), false);
  assert.equal(parts.sentences.length, 3);
  assert.equal(parts.faqs.length, 4);
  assert.equal(page.includes("<Answer"), true);
  const answerAt = page.indexOf("<Answer");
  const tableAt = page.indexOf("<table");
  const sourcesAt = page.indexOf("<h2>Sources</h2>");
  assert.ok(answerAt >= 0 && tableAt > answerAt && sourcesAt > tableAt);
  assert.match(page, /faqLd\(faqs\)/);
  assert.match(page, /articleLd\(/);
  assert.doesNotMatch(page, /webAppLd|datasetLd|Product|Review|AggregateRating|LogoxNote/);
  assert.match(text, /40 CFR 60\.532\(e\)/);
  assert.match(text, /Pellet Fuels Institute, ENplus, and CANplus are initially deemed to be approved/);
  assert.match(text, /40 CFR 60\.531/);
  assert.match(text, /40 CFR 60\.534\(a\)\(1\)\(i\)/);
  assert.match(text, /ASTM E2779-10/);
  assert.match(text, /40 CFR 60\.536\(g\)\(1\)/);
  assert.match(text, /40 CFR 60\.538\(e\)/);
  assert.match(text, /Premium, Standard, and Utility/);
  assert.match(text, /≤ 0\.50%/);
  assert.match(text, /1\/8 inch screen/);
  assert.match(text, /≤ 1\.0% as-received/);
  assert.match(text, /≤ 6\.0%/);
  assert.match(text, /≤ 0\.70 w-%/);
  assert.match(text, /≤ 2\.00 w-%/);
  assert.match(text, /Blank cell/);
  assert.match(text, /7800 BTU\/lb/);
  assert.match(text, /no less-than or greater-than sign/);
  assert.match(text, /≥ 4\.6 kWh\/kg/);
  assert.match(text, /16\.5 MJ\/kg/);
  assert.match(text, /40 °C/);
  assert.match(text, /does not print ash, moisture, or fines limits/);
  assert.match(text, /No CANplus standard-owner table/);
  assert.match(text, /demolition wood and chemically treated wood/);
  assert.equal(text.includes("$"), false);
  assert.equal(parts.caption, GRADE_CAPTION);
});

test("computed pellet counts match an offline pass over the committed rows", () => {
  const offline = offlineCounts(stoves);
  assert.deepEqual(parts.counts, offline);
  assert.deepEqual(pelletGradeCounts(stoves), offline);
  assert.equal(offline.currentRows, stats.roomCurrentByType["Pellet Stove"]);
  assert.equal(offline.currentRows, stats.medians.currentPellet.rows);
  assert.equal(offline.insertLines, stats.insert.pelletCurrentModelLines);
  assert.equal(offline.currentRows, offline.fuels.reduce((sum, item) => sum + item.rows, 0) + offline.blankRows);
  assert.match(text, new RegExp(String(offline.currentRows)));
  assert.match(text, new RegExp(String(offline.insertLines)));
  assert.match(text, new RegExp(meta.snapshotDate));
  for (const item of offline.fuels) assert.match(text, new RegExp(item.fuel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(page.includes(String(offline.currentRows)), false);
});

test("every citation is visible, and the new URL adds no affiliate placement", () => {
  const hrefs = parts.sources.map((source) => source.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const source of parts.sources) {
    assert.match(source.href, /^https:\/\//);
    assert.equal(source.href.includes(epaAppHost), false);
    assert.match(text, new RegExp(source.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(text, new RegExp(`Retrieved ${source.retrieved}`));
  }
  for (const match of lib.matchAll(/https?:\/\/[^"'`\s)]+/g)) {
    assert.ok(hrefs.includes(match[0]), match[0]);
  }
  const external = parts.sources.filter((source) => source.id !== "epa-database");
  assert.equal(external.every((source) => source.retrieved === GRADES_RETRIEVED), true);
  assert.equal(parts.sources.find((source) => source.id === "epa-database").retrieved, meta.snapshotDate);
  assert.match(page, /item\.href/);
  assert.match(page, /Retrieved/);
  const glossary = glossaryParts(stoves, meta.snapshotDate);
  const term = glossary.terms.find((item) => item.id === "pellet-fuel-grade");
  assert.ok(term);
  assert.equal(term.links.some((link) => link.href === GRADES_PAGE), true);
  assert.match(page, /href="\/glossary\/#pellet-fuel-grade"/);
  assert.match(read("src/pages/pellet-stoves.astro"), /href="\/pellet-fuel-grades\/"/);
  assert.match(read("src/components/Footer.astro"), /href="\/pellet-fuel-grades\/"/);
  assert.match(read("public/llms.txt"), /https:\/\/stoveratings\.com\/pellet-fuel-grades\//);
  for (const href of [
    "/pellet-stoves/",
    "/most-efficient-pellet-stoves/",
    "/cleanest-burning-pellet-stoves/",
    "/pellet-stove-vs-wood-stove/",
    "/tools/heating-cost-calculator/",
  ]) {
    assert.equal(parts.links.some((link) => link.href === href), true, href);
  }
  const noindex = readJson("data/noindex-paths.json");
  assert.equal(noindex.includes(GRADES_PAGE), false);
  assert.equal(LOGOX_PLACEMENTS.some((item) => item.path === GRADES_PAGE), false);
  assert.equal(page.includes("sponsored"), false);
  assert.equal(withoutUrls(lib).includes("sponsored"), false);
  const faq = faqLd(parts.faqs);
  assert.equal(faq["@type"], "FAQPage");
  assert.equal(faq.mainEntity.length, parts.faqs.length);
  for (const item of parts.faqs) {
    const match = faq.mainEntity.find((question) => question.name === item.question);
    assert.equal(match.acceptedAnswer.text, item.answer);
    assert.equal(text.includes(item.question), true);
    assert.equal(text.includes(item.answer), true);
  }
});
