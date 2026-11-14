import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  GLOSSARY_PAGE,
  GLOSSARY_RETRIEVED,
  assertGlossaryCopy,
  glossaryParts,
  glossaryVisibleText,
} from "../src/lib/glossary.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(name) {
  return readFileSync(join(root, name), "utf8");
}

function readJson(name) {
  return JSON.parse(read(`data/${name}`));
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(path, out);
    } else out.push(path);
  }
  return out;
}

const stoves = readJson("stoves.json");
const meta = readJson("meta.json");
const parts = glossaryParts(stoves, meta.snapshotDate);
const text = glossaryVisibleText(parts);
const lib = read("src/lib/glossary.js");
const page = read("src/pages/glossary.astro");

test("glossary definitions stay short, sourced, and free of banned wording", () => {
  assertGlossaryCopy(text);
  assert.equal(parts.sentences.length, 3);
  assert.equal(parts.faqs.length, 5);
  assert.ok(parts.terms.length >= 20);
  assert.match(text, /4\.5 grams[- ]per[- ]hour/);
  assert.match(text, /2\.0 grams per hour/);
  assert.match(text, /2\.5 grams per hour/);
  assert.match(text, /May 15, 2015/);
  assert.match(text, /May 15, 2020/);
  assert.match(text, /December 31, 2015/);
  assert.match(text, /not legal advice/i);
  assert.match(text, new RegExp(meta.snapshotDate));
  assert.match(text, new RegExp(GLOSSARY_RETRIEVED));
  assert.doesNotMatch(text, /\bbest\b/i);
  assert.equal(/\b(265|1444|1,444|192|41)\b/.test(lib), false);
  assert.equal(lib.includes("cfpub.epa.gov"), true);
  assert.equal(text.includes("cfpub.epa.gov"), false);
});

test("every external citation has an EPA or eCFR URL and a retrieved date", () => {
  assert.ok(parts.sources.length >= 8);
  const hrefs = parts.sources.map((source) => source.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const source of parts.sources) {
    assert.match(source.href, /^https:\/\/(www\.epa\.gov|www\.ecfr\.gov)\//);
    assert.match(source.retrieved, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(source.href.includes("cfpub.epa.gov"), false);
    assert.ok(source.label.trim());
    assert.match(text, new RegExp(source.retrieved));
    assert.match(text, new RegExp(source.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const match of lib.matchAll(/https:\/\/[^"'\s)]+/g)) {
    assert.ok(hrefs.includes(match[0]), match[0]);
  }
  assert.match(page, /source\.href/);
  assert.match(page, /source\.retrieved/);
  assert.equal(page.includes("cfpub.epa.gov"), false);
});

test("snapshot examples are computed and every term links to a deeper page", () => {
  const fuels = new Set();
  const types = new Set();
  const subtypes = new Set();
  const methods = new Set();
  for (const stove of stoves) {
    for (const row of stove.tests) {
      if (row.fuel) fuels.add(row.fuel);
      if (row.type) types.add(row.type);
      if (row.subtype) subtypes.add(row.subtype);
      if (stove.category === "room" && row.current && row.subtype) subtypes.add(`current:${row.subtype}`);
      if (row.testMethod) methods.add(row.testMethod);
    }
  }
  const fuel = parts.terms.find((item) => item.id === "certified-fuel");
  const type = parts.terms.find((item) => item.id === "epa-type");
  const subtype = parts.terms.find((item) => item.id === "epa-subtype");
  const method = parts.terms.find((item) => item.id === "test-method");
  for (const value of fuels) assert.match(fuel.sentences.join(" "), new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const value of types) assert.match(type.sentences.join(" "), new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const value of [...subtypes].filter((item) => item.startsWith("current:"))) {
    assert.match(subtype.sentences.join(" "), new RegExp(value.slice("current:".length).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const value of methods) assert.match(method.sentences.join(" "), new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const ids = new Set(parts.terms.map((item) => item.id));
  for (const item of parts.terms) {
    assert.equal(ids.has(item.id), true);
    assert.ok(
      item.links.some((link) => link.href.startsWith("/") && !link.href.startsWith("/glossary/#")),
      item.id,
    );
  }
  const questions = parts.faqs.map((faq) => faq.question);
  assert.equal(new Set(questions).size, questions.length);
  for (const faq of parts.faqs) {
    assert.ok(faq.answer.length > 40);
    assert.equal(text.includes(faq.question), true);
    assert.equal(text.includes(faq.answer), true);
  }
});

test("every glossary anchor linked from the site is defined on the page", () => {
  const ids = new Set([
    ...parts.terms.map((item) => item.id),
    ...parts.groups.map((group) => group.id),
  ]);
  const linked = new Set();
  for (const file of walk(join(root, "src"))) {
    if (!/\.(astro|js|mjs)$/.test(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\/glossary\/#([a-z0-9-]+)/g)) linked.add(match[1]);
  }
  assert.ok(linked.has("g-hr"));
  assert.ok(linked.has("hhv"));
  assert.ok(linked.has("btu-hr"));
  assert.ok(linked.has("nsps-2020"));
  for (const id of linked) assert.equal(ids.has(id), true, id);
  assert.match(page, /id=\{item\.id\}/);
  assert.match(page, /id=\{group\.id\}/);
  assert.match(page, /articleLd/);
  assert.match(page, /faqLd\(faqs\)/);
  assert.match(page, /<Answer sentences=\{sentences\} \/>/);
  assert.doesNotMatch(page, /AggregateRating|DefinedTerm|@type": "Product"|@type": "Review"/);
  assert.match(read("src/components/Footer.astro"), /href="\/glossary\/"/);
  assert.match(read("src/pages/methodology.astro"), /href="\/glossary\/"/);
  assert.match(read("src/pages/index.astro"), /href="\/glossary\/"/);
  assert.match(read("public/llms.txt"), /https:\/\/stoveratings\.com\/glossary\//);
  const noindex = readJson("noindex-paths.json");
  assert.equal(noindex.includes(GLOSSARY_PAGE), false);
  assert.equal(statSync(join(root, "src/pages/glossary.astro")).isFile(), true);
});
