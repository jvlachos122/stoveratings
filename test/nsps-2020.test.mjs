import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { NOT_LISTED_BY_EPA } from "../src/lib/compare-pairs.js";
import {
  BLANK_COLUMN,
  NSPS_COLUMN,
  NSPS_PAGE,
  NSPS_SOURCES,
  assertNspsCopy,
  blankCountText,
  currentNoLead,
  nspsCopyParts,
  nspsReport,
  nspsValueLabel,
  nspsVisibleText,
} from "../src/lib/nsps-2020.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(name) {
  return readFileSync(join(root, name), "utf8");
}

function readJson(name) {
  return JSON.parse(read(`data/${name}`));
}

function classify(value) {
  if (value === "Yes") return "yes";
  if (value === "No") return "no";
  if (value == null || String(value).trim() === "") return "blank";
  throw new Error(`unexpected ${NSPS_COLUMN} value`);
}

function recompute(stoves) {
  const rows = [];
  for (const stove of stoves) {
    if (stove.category !== "room") continue;
    for (const test of stove.tests) {
      rows.push({
        nsps2020: test.nsps2020,
        current: Boolean(test.current),
        type: test.type,
        subtype: test.subtype || "",
        url: stove.url,
        model: stove.model,
      });
    }
  }
  function count(list) {
    const out = { yes: 0, no: 0, blank: 0, rows: list.length };
    for (const row of list) out[classify(row.nsps2020)] += 1;
    return out;
  }
  function by(list, keyFn) {
    const map = new Map();
    for (const row of list) {
      const key = keyFn(row);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    const out = new Map();
    for (const [key, group] of map) out.set(key, count(group));
    return out;
  }
  const current = rows.filter((row) => row.current);
  return {
    rows,
    all: count(rows),
    current: count(current),
    allByType: by(rows, (row) => row.type),
    currentByType: by(current, (row) => row.type),
    allCross: by(rows, (row) => `${row.type}\0${row.subtype}`),
    currentCross: by(current, (row) => `${row.type}\0${row.subtype}`),
    currentNo: current.filter((row) => row.nsps2020 === "No"),
  };
}

function sameCount(actual, expected) {
  assert.equal(actual.yes, expected.yes);
  assert.equal(actual.no, expected.no);
  assert.equal(actual.blank, expected.blank);
  assert.equal(actual.rows, expected.rows);
  assert.equal(actual.yes + actual.no + actual.blank, actual.rows);
}

test("2020 NSPS room-heater counts match an independent recompute of the snapshot", () => {
  const stoves = readJson("stoves.json");
  const stats = readJson("stats.json");
  const meta = readJson("meta.json");
  const report = nspsReport(stoves);
  const again = recompute(stoves);
  sameCount(report.current, again.current);
  sameCount(report.all, again.all);
  assert.equal(report.current.rows, stats.rows.roomCurrent);
  assert.equal(report.all.rows, stats.rows.roomAll);
  assert.equal(report.current.yes, stats.nsps.roomCurrentYes);
  assert.equal(report.current.no, stats.nsps.roomCurrentNo);
  assert.equal(report.all.yes, stats.nsps.roomAllYes);
  assert.equal(meta.snapshotDate, "2026-10-23");

  for (const [blocks, expected] of [
    [report.currentByType, again.currentByType],
    [report.allByType, again.allByType],
  ]) {
    assert.equal(blocks.length, expected.size);
    for (const block of blocks) sameCount(block, expected.get(block.key));
  }
  for (const [blocks, expected] of [
    [report.currentCross, again.currentCross],
    [report.allCross, again.allCross],
  ]) {
    assert.equal(blocks.length, expected.size);
    let rows = 0;
    for (const block of blocks) {
      sameCount(block, expected.get(`${block.type}\0${block.subtype}`));
      rows += block.rows;
    }
    assert.equal(rows, [...expected.values()].reduce((sum, block) => sum + block.rows, 0));
  }

  assert.equal(report.currentNo.length, again.currentNo.length);
  assert.deepEqual(
    report.currentNo.map((row) => row.url).sort(),
    again.currentNo.map((row) => row.url).sort(),
  );
  for (const row of report.currentNo) {
    assert.equal(row.url.startsWith("/stoves/"), true, row.url);
    assert.ok(row.model);
  }
});

test("a blank 2020 NSPS cell is not listed by EPA and is not shown as zero", () => {
  assert.equal(nspsValueLabel(null), NOT_LISTED_BY_EPA);
  assert.equal(nspsValueLabel(""), NOT_LISTED_BY_EPA);
  assert.equal(nspsValueLabel("   "), NOT_LISTED_BY_EPA);
  assert.equal(nspsValueLabel("Yes"), "Yes");
  assert.equal(nspsValueLabel("No"), "No");
  assert.notEqual(nspsValueLabel(null), "0");
  assert.equal(blankCountText(0), "None");
  assert.equal(blankCountText(2), "2");
  assert.equal(BLANK_COLUMN, "Not listed by EPA");
  assert.throws(() => nspsValueLabel("0"), /unexpected/);
});

test("every cited EPA or eCFR page has a URL and a retrieved date", () => {
  assert.ok(NSPS_SOURCES.length >= 4);
  for (const source of NSPS_SOURCES) {
    assert.match(source.href, /^https:\/\/(www\.epa\.gov|www\.ecfr\.gov)\//);
    assert.match(source.retrieved, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(source.href.includes("cfpub.epa.gov"), false);
    assert.ok(source.label.trim());
  }
  const hrefs = NSPS_SOURCES.map((source) => source.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  const lib = read("src/lib/nsps-2020.js");
  const page = read("src/pages/certified-before-2020.astro");
  for (const match of lib.matchAll(/https:\/\/[^"'\s)]+/g)) {
    assert.ok(hrefs.includes(match[0]), match[0]);
  }
  assert.match(page, /source\.href/);
  assert.match(page, /source\.retrieved/);
  assert.equal(page.includes("cfpub.epa.gov"), false);
  assert.match(lib, /text\.includes\("cfpub\.epa\.gov"\)/);
});

test("visible copy avoids banned wording and keeps the lookup, the No row, and the FAQ", () => {
  const stoves = readJson("stoves.json");
  const meta = readJson("meta.json");
  const report = nspsReport(stoves);
  const parts = nspsCopyParts(report, meta.snapshotDate);
  const text = nspsVisibleText(parts);
  assertNspsCopy(text);
  assert.equal(parts.sentences.length, 3);
  assert.ok(parts.faqs.length >= 2 && parts.faqs.length <= 4);
  assert.match(text, /2\.0 grams per hour/);
  assert.match(text, /2\.5 grams per hour/);
  assert.match(text, /4\.5 grams per hour/);
  assert.match(text, /May 15, 2020/);
  assert.match(text, /May 15, 2015/);
  assert.match(text, /December 31, 2015/);
  assert.match(text, /Step 2/);
  assert.match(text, /not legal advice/i);
  assert.match(text, /Check the rules where a stove would be sold or installed/);
  assert.match(text, new RegExp(meta.snapshotDate));
  for (const source of NSPS_SOURCES) {
    assert.match(text, new RegExp(source.retrieved));
    assert.match(text, new RegExp(source.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const questions = new Set(parts.faqs.map((faq) => faq.question));
  assert.equal(questions.size, parts.faqs.length);
  for (const faq of parts.faqs) {
    assert.ok(faq.question.trim());
    assert.ok(faq.answer.trim());
    assert.equal(faq.answer.includes(faq.question), false);
  }
  const lead = currentNoLead(report.currentNo);
  assert.equal(lead.text.length > 0, true);
  if (lead.kind === "one") {
    assert.equal(text.includes(lead.label), true);
    assert.equal(lead.href.startsWith("/stoves/"), true);
  }
  const page = read("src/pages/certified-before-2020.astro");
  assert.match(page, /faqLd\(faqs\)/);
  assert.match(page, /articleLd/);
  assert.match(page, /<Answer sentences=\{sentences\} \/>/);
  assert.doesNotMatch(page, /AggregateRating|@type": "Product"|@type": "Review"|WebApplication/);
  for (const href of ["/lookup/", "/methodology/", "/catalytic-vs-non-catalytic/", "/wood-stove-tax-credit/", NSPS_PAGE]) {
    assert.match(read("src/lib/nsps-2020.js") + page, new RegExp(href.replaceAll("/", "\\/")));
  }
  const lib = read("src/lib/nsps-2020.js");
  assert.equal(/\b264\b/.test(lib), false);
  assert.equal(/\b417\b/.test(lib), false);
  assert.equal(/\b1027\b/.test(lib), false);
  assert.doesNotMatch(text, /\b(best|top-rated|recommend\w*|scores?|ratings?|safest|popular|winners?|affiliate|sponsored|cleanest)\b/i);
});

test("methodology, stove pages, and the reference links point at the explainer", () => {
  assert.match(read("src/pages/methodology.astro"), /href="\/certified-before-2020\/"/);
  assert.match(read("src/pages/stoves/[manufacturer]/[model].astro"), /href="\/certified-before-2020\/"/);
  assert.match(read("src/pages/stoves/[manufacturer]/[model].astro"), /Not listed by EPA/);
  assert.match(read("src/components/Footer.astro"), /href="\/certified-before-2020\/"/);
  assert.match(read("src/pages/index.astro"), /href="\/certified-before-2020\/"/);
  assert.match(read("public/llms.txt"), /https:\/\/stoveratings\.com\/certified-before-2020\//);
  const noindex = JSON.parse(read("data/noindex-paths.json"));
  assert.equal(noindex.includes(NSPS_PAGE), false);
});
