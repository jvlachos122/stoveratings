import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { LOGOX_PLACEMENTS } from "../src/lib/affiliates.js";
import {
  MOISTURE_PAGE,
  MOISTURE_RETRIEVED,
  assertMoistureCopy,
  moistureParts,
  moistureVisibleText,
} from "../src/lib/firewood-moisture.js";
import { glossaryParts } from "../src/lib/glossary.js";
import { faqLd } from "../src/lib/schema.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const banned = /\b(best|top-rated|recommend\w*|scores?)\b/i;

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

const parts = moistureParts();
const text = moistureVisibleText(parts);
const page = read("src/pages/firewood-moisture.astro");
const lib = read("src/lib/firewood-moisture.js");

test("every moisture citation has a URL and a retrieved date, and the copy does not say best", () => {
  assertMoistureCopy(text);
  const libCopy = lib.replace(/const BANNED_COPY =[\s\S]*?;\n/, "");
  assert.equal(banned.test(`${text}\n${page}\n${libCopy}`), false);
  const epaAppHost = ["cf", "pub.epa.gov"].join("");
  assert.equal(`${lib}\n${page}\n${text}`.includes(epaAppHost), false);
  const hrefs = parts.sources.map((source) => source.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.ok(hrefs.length >= 8);
  for (const source of parts.sources) {
    assert.match(source.href, /^https?:\/\//);
    assert.equal(source.href.includes(epaAppHost), false);
    assert.equal(source.retrieved, MOISTURE_RETRIEVED);
    assert.match(text, new RegExp(source.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(text, new RegExp(`Retrieved ${source.retrieved}|${source.retrieved}`));
  }
  for (const match of lib.matchAll(/https?:\/\/[^"'`\s)]+/g)) {
    assert.ok(hrefs.includes(match[0]), match[0]);
  }
  assert.match(page, /source\.href|row\.href|item\.href/);
  assert.match(page, /Retrieved/);
  assert.match(page, /faqLd\(faqs\)/);
  assert.match(page, /articleLd\(/);
  assert.doesNotMatch(page, /webAppLd|datasetLd|Product|Review|AggregateRating/);
  assert.equal(parts.sentences.length, 3);
  assert.equal(parts.faqs.length, 4);
  assert.equal(page.includes("<Answer"), true);
  const answerAt = page.indexOf("<Answer");
  const tableAt = page.indexOf("<table");
  assert.ok(answerAt >= 0 && tableAt > answerAt);
});

test("cited moisture figures stay attached to the source that stated them", () => {
  assert.match(text, /20% or less/);
  assert.match(text, /[Bb]elow 20%/);
  assert.match(text, /about 20%/i);
  assert.match(text, /15 to 25%/);
  assert.match(text, /60 to 80%/);
  assert.match(text, /75%/);
  assert.match(text, /50%/);
  assert.match(text, /oven-dry basis/i);
  assert.match(text, /wet basis/i);
  assert.match(text, /Not stated/);
  assert.match(text, /more than 200%/);
  assert.match(text, /15% on an oven-dry basis and 13% on a wet basis/);
  assert.match(text, /at least 6 months for softwood/i);
  assert.match(text, /at least 12 months for hardwood/i);
  assert.match(text, /6 to 12 months/);
  assert.match(text, /six to nine months/i);
  assert.match(text, /one drying season/i);
  assert.match(text, /newly split side/i);
  assert.match(text, /8,600 Btu/);
  assert.match(text, /4,900 Btu/);
  assert.match(text, /7,100 Btu/);
  assert.match(text, /does not state a moisture percent/);
  assert.match(text, /may not reflect current scientific knowledge/);
  assert.match(text, /Follow the stove manual/);
  assert.equal(parts.targets.some((row) => row.basis === "Oven-dry basis"), true);
  assert.equal(parts.targets.some((row) => row.basis === "Not stated"), true);
  assert.equal(parts.targets.every((row) => row.basis !== "Not stated" || !/oven-dry basis/i.test(row.moisture) || row.id === "mu-g5450"), true);
  const epa = parts.targets.filter((row) => row.id.startsWith("epa-"));
  assert.equal(epa.length, 2);
  assert.equal(epa.every((row) => row.basis === "Not stated"), true);
  assert.notEqual(epa[0].moisture, epa[1].moisture);
});

test("the glossary anchor resolves and the new page adds no affiliate placement", () => {
  const stoves = JSON.parse(read("data/stoves.json"));
  const meta = JSON.parse(read("data/meta.json"));
  const glossary = glossaryParts(stoves, meta.snapshotDate);
  const term = glossary.terms.find((item) => item.id === "moisture-content");
  assert.ok(term);
  assert.equal(term.links.some((link) => link.href === MOISTURE_PAGE), true);
  assert.match(page, /href="\/glossary\/#moisture-content"/);
  assert.match(read("src/pages/firewood-btu-chart.astro"), /href="\/firewood-moisture\/"/);
  assert.match(read("src/pages/firewood-btu-chart.astro"), /path="\/firewood-btu-chart\/"/);
  assert.match(read("src/pages/tools/heating-cost-calculator.astro"), /href="\/firewood-moisture\/"/);
  assert.match(read("src/pages/tools/firebox-log-length.astro"), /href="\/firewood-moisture\/"/);
  assert.match(read("src/components/Footer.astro"), /href="\/firewood-moisture\/"/);
  assert.match(read("public/llms.txt"), /https:\/\/stoveratings\.com\/firewood-moisture\//);
  const noindex = JSON.parse(read("data/noindex-paths.json"));
  assert.equal(noindex.includes(MOISTURE_PAGE), false);
  assert.equal(LOGOX_PLACEMENTS.some((item) => item.path === MOISTURE_PAGE), false);
  assert.equal(page.includes("LogoxNote"), false);
  assert.equal(page.includes("sponsored"), false);
  assert.equal(lib.includes("sponsored"), false);
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
