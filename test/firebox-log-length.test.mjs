import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatCount, formatNumber } from "../src/lib/format.js";
import {
  ALLOWANCE_SENTENCE,
  DEPTH_ERROR,
  EXAMPLE_DEPTH,
  EXAMPLE_WIDTH,
  FIELD_SENTENCE,
  FIREBOX_COLUMN,
  INPUT_ERROR,
  LENGTH_TABLE_CAPTION,
  LOG_ALLOWANCE_INCHES,
  LOG_PAGE,
  LOG_RETRIEVED,
  RESULT_PLACEHOLDER,
  VOLUME_BANDS,
  VOLUME_TABLE_CAPTION,
  WIDTH_ERROR,
  currentWoodLines,
  exampleRows,
  fitLength,
  fitReport,
  inchesPhrase,
  lineVolumeSentence,
  listedVolumes,
  logAnswer,
  logFaqs,
  logNotes,
  logSources,
  measurementProblem,
  readInches,
  standardLengthRows,
  volumeSummary,
  volumeTableRows,
  woodLineOptions,
} from "../src/lib/firebox-log-length.js";
import { mountFireboxLog } from "../src/lib/firebox-log-ui.js";
import { modelLineCount, splitSmallWoodRows } from "../src/lib/small-wood-stoves.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const banned = /\b(best|top-rated|recommend\w*|scores?)\b/i;

// 1bc4d4a is the commit before the log-length page. Deploy checks out main at
// the merged commit, and a depth-1 checkout has no parent, so `git show` and
// `git ls-tree` of origin/main read the tree under test.
const AFFILIATES_SHA256_BEFORE_LOG_LENGTH = "bdd081b2fb089d0ec6cb59e10ad67ff5d56c3160ce714b79ea5823ee15cea618";
const PAGES_BEFORE_LOG_LENGTH = [
  "404.astro",
  "about.astro",
  "brands/[brand].astro",
  "brands/index.astro",
  "catalytic-vs-non-catalytic.astro",
  "catalytic-wood-stoves.astro",
  "certified-before-2020.astro",
  "cleanest-burning-pellet-stoves.astro",
  "cleanest-burning-wood-stoves.astro",
  "compare/[pair].astro",
  "compare/index.astro",
  "compare/tool.astro",
  "contact.astro",
  "data/changelog.astro",
  "disclosure.astro",
  "finder.astro",
  "firewood-btu-chart.astro",
  "glossary.astro",
  "hybrid-wood-stoves.astro",
  "index.astro",
  "lookup.astro",
  "methodology.astro",
  "most-efficient-pellet-stoves.astro",
  "most-efficient-wood-stoves.astro",
  "non-catalytic-wood-stoves.astro",
  "outdoor-wood-boilers.astro",
  "pellet-boilers.astro",
  "pellet-stove-inserts.astro",
  "pellet-stove-vs-wood-stove.astro",
  "pellet-stoves.astro",
  "privacy.astro",
  "small-wood-stoves.astro",
  "stoves/[manufacturer]/[model].astro",
  "tools/heating-cost-calculator.astro",
  "tools/stove-size-calculator.astro",
  "wood-furnaces.astro",
  "wood-stove-inserts.astro",
  "wood-stove-tax-credit.astro",
];

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function readJson(path) {
  return JSON.parse(read(path));
}

const stoves = readJson("data/stoves.json");
const meta = readJson("data/meta.json");

function wood(partial) {
  return {
    category: "room",
    id: partial.id || "line",
    manufacturer: partial.manufacturer || "Maker",
    model: partial.model || "Model",
    url: partial.url || "/stoves/maker/model/",
    tests: partial.tests,
  };
}

function row(partial) {
  return {
    type: "Wood Stove",
    current: true,
    firebox: 1.5,
    fireboxStatus: "listed",
    ...partial,
  };
}

function offlineSummary(rows) {
  const bands = [
    { id: "to-1", test: (value) => value >= 0 && value <= 1 },
    { id: "1-to-2", test: (value) => value > 1 && value <= 2 },
    { id: "2-to-3", test: (value) => value > 2 && value <= 3 },
    { id: "over-3", test: (value) => value > 3 },
  ];
  const counts = Object.fromEntries(bands.map((band) => [band.id, 0]));
  let lines = 0;
  let listed = 0;
  let notListed = 0;
  let notApplicable = 0;
  for (const stove of rows) {
    if (!stove || stove.category !== "room" || !Array.isArray(stove.tests)) continue;
    const tests = stove.tests.filter((test) => test && test.type === "Wood Stove" && test.current === true);
    if (!tests.length) continue;
    lines += 1;
    const volumes = [];
    for (const test of tests) {
      if (test.fireboxStatus !== "listed") continue;
      if (typeof test.firebox !== "number" || !Number.isFinite(test.firebox) || test.firebox < 0) continue;
      if (!volumes.includes(test.firebox)) volumes.push(test.firebox);
    }
    if (volumes.length) {
      listed += 1;
      for (const band of bands) {
        if (volumes.some(band.test)) counts[band.id] += 1;
      }
    } else if (tests.every((test) => test.fireboxStatus === "not_applicable")) notApplicable += 1;
    else notListed += 1;
  }
  return { lines, listed, notListed, notApplicable, counts };
}

function listPages(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listPages(path));
    else if (entry.name.endsWith(".astro")) out.push(relative(join(root, "src/pages"), path).replaceAll("\\", "/"));
  }
  return out.sort();
}

test("committed EPA files publish firebox volume and no inside dimensions", () => {
  const files = ["data/raw/rh_all.csv", "data/raw/rh_inprod.csv", "data/raw/wh_all.csv", "data/raw/wh_inprod.csv"];
  for (const file of files) {
    const header = read(file).split(/\r?\n/, 1)[0].split(",");
    const named = header.filter((column) => /firebox|width|depth|height|length/i.test(column));
    assert.deepEqual(named, [FIREBOX_COLUMN], file);
  }
  const keys = new Set();
  for (const stove of stoves) {
    for (const key of Object.keys(stove)) keys.add(key);
    for (const testRow of stove.tests) {
      for (const key of Object.keys(testRow)) keys.add(`test.${key}`);
    }
  }
  assert.equal([...keys].some((key) => /width|depth|height|length|dimension/i.test(key)), false);
  assert.equal(keys.has("firebox"), true);
  assert.equal(keys.has("test.firebox"), true);
  assert.equal(keys.has("fireboxStatus"), true);
});

test("blank, zero, and negative measurements do not invent a log length", () => {
  for (const value of ["", "   ", null, undefined, 0, "0", "0.0", -1, "-4", "nope", "16in", Number.NaN, Infinity]) {
    assert.equal(readInches(value), null, String(value));
    assert.equal(fitLength(value).ok, false, String(value));
  }
  assert.equal(readInches("16"), 16);
  assert.equal(readInches(" 16.5 "), 16.5);
  assert.equal(readInches(18), 18);
  assert.equal(fitLength(EXAMPLE_DEPTH).fit, EXAMPLE_DEPTH - LOG_ALLOWANCE_INCHES);
  assert.equal(fitLength(EXAMPLE_WIDTH).fit, EXAMPLE_WIDTH - LOG_ALLOWANCE_INCHES);
  assert.equal(fitLength(LOG_ALLOWANCE_INCHES).ok, true);
  assert.equal(fitLength(LOG_ALLOWANCE_INCHES).fit, null);
  assert.equal(fitLength(3).fit, null);
  assert.equal(fitLength(4.01).fit, 0.01);
  assert.equal(measurementProblem("", "0"), INPUT_ERROR);
  assert.equal(measurementProblem(-2, -3), INPUT_ERROR);
  assert.equal(measurementProblem(" ", 12), DEPTH_ERROR);
  assert.equal(measurementProblem("20", "abc"), WIDTH_ERROR);
  assert.equal(measurementProblem(16, 18), "");
  assert.match(fitReport("", 0), /greater than 0/);
  assert.match(fitReport(2, 16), /does not report a positive log length/);
  assert.match(fitReport(16, 18), /12 inches/);
  assert.match(fitReport(16, 18), /14 inches/);
  assert.match(fitReport(16, 18), /Follow the stove manual/);
  assert.equal(inchesPhrase(1), "1 inch");
  assert.equal(inchesPhrase(4), "4 inches");
});

test("band counts match an offline recompute and do not treat a blank as zero", () => {
  const offline = offlineSummary(stoves);
  const summary = volumeSummary(stoves);
  assert.equal(summary.lines, offline.lines);
  assert.equal(summary.listed, offline.listed);
  assert.equal(summary.notListed, offline.notListed);
  assert.equal(summary.notApplicable, offline.notApplicable);
  assert.ok(summary.lines > 0);
  for (const band of summary.bands) assert.equal(band.lines, offline.counts[band.id], band.id);
  const rows = volumeTableRows(stoves);
  assert.equal(rows.length, VOLUME_BANDS.length + 2);
  const small = splitSmallWoodRows(stoves).current;
  const toOne = summary.bands.find((band) => band.id === "to-1");
  assert.equal(toOne.lines, modelLineCount(small));
  assert.equal(toOne.lines, small.length);

  const spanned = wood({
    id: "span",
    tests: [row({ firebox: 0.4 }), row({ firebox: 3.2 })],
  });
  const spanSummary = volumeSummary([spanned]);
  assert.equal(spanSummary.lines, 1);
  assert.equal(spanSummary.bands.find((band) => band.id === "to-1").lines, 1);
  assert.equal(spanSummary.bands.find((band) => band.id === "over-3").lines, 1);
  assert.equal(spanSummary.bands.find((band) => band.id === "1-to-2").lines, 0);

  const blank = wood({ id: "blank", tests: [row({ firebox: null, fireboxStatus: "not_listed" })] });
  const applicable = wood({ id: "na", tests: [row({ firebox: null, fireboxStatus: "not_applicable" })] });
  const zero = wood({ id: "zero", tests: [row({ firebox: 0, fireboxStatus: "listed" })] });
  const negative = wood({ id: "neg", tests: [row({ firebox: -1, fireboxStatus: "listed" })] });
  const pellet = wood({
    id: "pellet",
    tests: [row({ type: "Pellet Stove", firebox: 0.2, fireboxStatus: "listed" })],
  });
  const previous = wood({ id: "old", tests: [row({ current: false, firebox: 0.2 })] });
  const central = { ...wood({ id: "central", tests: [row({ firebox: 0.2 })] }), category: "central" };
  const mixed = volumeSummary([blank, applicable, zero, negative, pellet, previous, central]);
  assert.equal(mixed.lines, 4);
  assert.equal(mixed.listed, 1);
  assert.equal(mixed.notListed, 2);
  assert.equal(mixed.notApplicable, 1);
  assert.equal(mixed.bands.find((band) => band.id === "to-1").lines, 1);
  assert.deepEqual(listedVolumes({ tests: zero.tests }), [0]);
});

test("a model line shows the wood-stove volume and not a fabricated dimension", () => {
  const options = woodLineOptions(stoves);
  assert.equal(options.length, volumeSummary(stoves).lines);
  const seen = new Set();
  for (const option of options) {
    assert.equal(seen.has(option.id), false);
    seen.add(option.id);
    assert.match(option.url, /^\/stoves\//);
    assert.match(option.label, new RegExp(option.volumeLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    if (option.status === "listed") {
      assert.ok(option.volumes.length > 0);
      assert.match(option.volumeLabel, /cu ft/);
    }
  }
  const mismatched = stoves.filter((stove) => {
    const woodTests = (stove.tests || []).filter((test) => test.type === "Wood Stove" && test.current === true);
    return woodTests.length && stove.fireboxStatus !== "listed";
  });
  assert.ok(mismatched.length >= 1);
  for (const stove of mismatched) {
    const option = options.find((item) => item.id === stove.id);
    const volumes = woodTestsOf(stove);
    assert.deepEqual(option.volumes, volumes);
    assert.equal(option.volumes.includes(stove.firebox), false);
    const sentence = lineVolumeSentence(option);
    assert.match(sentence, /does not list inside depth or width/);
    assert.match(sentence, /does not convert cubic feet into a log length/);
    assert.match(sentence, new RegExp(formatNumber(volumes[0], 3)));
  }
  const missing = lineVolumeSentence({ manufacturer: "Ex", model: "Blank", volumes: [], status: "not_listed" });
  assert.match(missing, /not listed by EPA/);
  assert.match(missing, /not zero/);
  const applicable = lineVolumeSentence({ manufacturer: "Ex", model: "Pellet", volumes: [], status: "not_applicable" });
  assert.match(applicable, /not applicable/);
});

function woodTestsOf(stove) {
  return stove.tests
    .filter((test) => test.type === "Wood Stove" && test.current === true && test.fireboxStatus === "listed")
    .map((test) => test.firebox)
    .sort((left, right) => left - right);
}

test("citations have a URL and a retrieved date, and the copy does not say best", () => {
  const sources = logSources(meta.snapshotDate);
  const hrefs = sources.map((source) => source.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const source of sources) {
    assert.match(source.href, /^https?:\/\//);
    assert.equal(source.href.includes("cfpub.epa.gov"), false);
    assert.match(source.retrieved, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(source.label.trim());
  }
  assert.equal(sources.filter((source) => source.id !== "epa-database").every((source) => source.retrieved === LOG_RETRIEVED), true);
  assert.equal(sources.find((source) => source.id === "epa-database").retrieved, meta.snapshotDate);
  const lib = read("src/lib/firebox-log-length.js");
  const page = read("src/pages/tools/firebox-log-length.astro");
  const ui = read("src/lib/firebox-log-ui.js");
  for (const match of lib.matchAll(/https?:\/\/[^"'`\s)]+/g)) {
    assert.ok(hrefs.includes(match[0]), match[0]);
  }
  assert.equal(lib.includes("cfpub.epa.gov"), false);
  assert.equal(page.includes("cfpub.epa.gov"), false);
  assert.equal(/\b156\b/.test(lib), false);
  assert.equal(banned.test(`${lib}\n${page}\n${ui}`), false);
  assert.match(page, /source\.href/);
  assert.match(page, /source\.retrieved/);
  assert.match(page, /faqLd\(faqs\)/);
  assert.match(page, /webAppLd\(/);
  assert.match(page, /mountFireboxLog/);
  assert.doesNotMatch(page, /affiliate/i);
  const copy = [
    ...logAnswer(stoves, meta.snapshotDate),
    ...logFaqs(stoves, meta.snapshotDate).flatMap((faq) => [faq.question, faq.answer]),
    ...logNotes(stoves, meta.snapshotDate),
    ...standardLengthRows().map((row) => `${row.statement} ${row.source}`),
    FIELD_SENTENCE,
    ALLOWANCE_SENTENCE,
    LENGTH_TABLE_CAPTION,
    VOLUME_TABLE_CAPTION,
    RESULT_PLACEHOLDER,
  ].join(" ");
  assert.equal(banned.test(copy), false);
  assert.match(copy, /128 cubic feet/);
  assert.match(copy, /16 inches, plus or minus 2 inches/);
  assert.match(copy, /about 4 inches shorter/);
  assert.match(copy, /4 inches shorter than the firebox/);
  assert.match(copy, /not zero/);
  assert.match(copy, /Firebox Volume \(Cubic Feet\)/);
  assert.equal(logFaqs(stoves, meta.snapshotDate).length, 4);
  assert.equal(logAnswer(stoves, meta.snapshotDate).length, 3);
  assert.equal(exampleRows().map((row) => row.log).join(","), "12 inches,14 inches");
  for (const path of [
    "src/components/Footer.astro",
    "src/components/Header.astro",
    "src/pages/index.astro",
    "src/pages/small-wood-stoves.astro",
    "src/pages/tools/stove-size-calculator.astro",
    "src/pages/firewood-btu-chart.astro",
    "src/pages/tools/heating-cost-calculator.astro",
  ]) {
    assert.match(read(path), /\/tools\/firebox-log-length\//, path);
  }
  assert.match(read("src/pages/firewood-btu-chart.astro"), /path="\/firewood-btu-chart\/"/);
  assert.match(read("public/llms.txt"), /https:\/\/stoveratings\.com\/tools\/firebox-log-length\//);
  assert.match(read("src/lib/glossary.js"), /id: "log-length"/);
  const noindex = readJson("data/noindex-paths.json");
  assert.equal(noindex.includes(LOG_PAGE), false);
  const affiliates = read("src/lib/affiliates.js");
  assert.equal(createHash("sha256").update(affiliates).digest("hex"), AFFILIATES_SHA256_BEFORE_LOG_LENGTH);
});

test("the form script rejects empty and negative sides and the sitemap gains one page", () => {
  const elements = new Map();
  function make(id, value = "") {
    const listeners = {};
    const node = {
      id,
      value,
      textContent: "",
      dataset: {},
      children: [],
      selectedOptions: [{ value: "" }],
      get firstChild() {
        return this.children[0] || null;
      },
      addEventListener(type, fn) {
        listeners[type] = fn;
      },
      dispatch(event) {
        listeners.submit?.(event);
      },
      append(child) {
        this.children.push(child);
      },
      removeChild(child) {
        this.children = this.children.filter((item) => item !== child);
      },
    };
    elements.set(id, { node, listeners });
    return node;
  }
  const doc = {
    getElementById(id) {
      return elements.get(id)?.node || null;
    },
    createElement() {
      return { href: "", textContent: "" };
    },
    createTextNode(text) {
      return { textContent: text };
    },
  };
  const form = make("log-form");
  const depth = make("depth");
  const width = make("width");
  const output = make("log-result");
  make("stove-line");
  make("line-result");
  mountFireboxLog(doc);
  depth.value = "";
  width.value = "";
  form.dispatch({ preventDefault() { this.defaultPrevented = true; }, defaultPrevented: false });
  assert.match(output.textContent, /greater than 0/);
  depth.value = "-5";
  width.value = "0";
  form.dispatch({ preventDefault() {} });
  assert.match(output.textContent, /greater than 0/);
  depth.value = "16";
  width.value = "18";
  form.dispatch({ preventDefault() {} });
  assert.match(output.textContent, /12 inches/);
  assert.match(output.textContent, /14 inches/);

  const current = listPages(join(root, "src/pages"));
  assert.deepEqual(current.filter((file) => !PAGES_BEFORE_LOG_LENGTH.includes(file)), [
    "firewood-moisture.astro",
    "pellet-fuel-grades.astro",
    "tools/firebox-log-length.astro",
  ]);
  assert.deepEqual(PAGES_BEFORE_LOG_LENGTH.filter((file) => !current.includes(file)), []);
  assert.equal(currentWoodLines(stoves).length, volumeSummary(stoves).lines);
  assert.equal(formatCount(volumeSummary(stoves).lines).includes(","), volumeSummary(stoves).lines >= 1000);
});
