import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import noindex from "../data/noindex-paths.json" with { type: "json" };
import {
  certificationSentence,
  certificationStatus,
  modelCertificationSentences,
  modelCertificationTitle,
  modelPageDescription,
} from "../src/lib/model-certification.js";
import { buildSitemapLastmodsFromDates } from "../src/lib/sitemap-lastmod.js";
import { buildStovePageHeads } from "../src/lib/stove-page-meta.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stoves = JSON.parse(readFileSync(join(root, "data/stoves.json"), "utf8"));
const meta = JSON.parse(readFileSync(join(root, "data/meta.json"), "utf8"));
const date = meta.snapshotDate;
const heads = buildStovePageHeads(stoves, date);
const banned = /\b(best|star ratings?|our score|top pick|ranking)\b/i;

function digits(value, places) {
  return String(Number(Number(value).toFixed(places)));
}

function btu(value) {
  return Math.round(Number(value)).toLocaleString("en-US");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasToken(text, token) {
  return new RegExp(`(?:^|[^0-9])${escapeRegExp(token)}(?:[^0-9]|$)`).test(text);
}

function offlineEmission(stove) {
  if (stove.emission == null) return { prose: "an emission rate not listed by EPA", title: "emission not listed by EPA" };
  const number = digits(stove.emission, 3);
  if (stove.emissionUnit === "g/hr") return { prose: `${number} grams per hour`, title: `${number} g/hr` };
  if (stove.emissionUnit === "lb/mmBTU") return { prose: `${number} pounds per million BTU`, title: `${number} lb/mmBTU` };
  if (!stove.emissionUnit) return { prose: `${number}, unit not listed by EPA`, title: `${number}, unit not listed by EPA` };
  return { prose: `${number} ${stove.emissionUnit}`, title: `${number} ${stove.emissionUnit}` };
}

function offlineEfficiency(stove) {
  if (stove.efficiency == null) return { prose: "HHV efficiency not listed by EPA", title: "HHV not listed by EPA" };
  const number = digits(stove.efficiency, 2);
  return { prose: `${number} percent HHV`, title: `${number}% HHV` };
}

function offlineHeat(stove) {
  const low = stove.btuLow;
  const high = stove.btuHigh;
  let range = null;
  if (low != null || high != null) {
    if (low != null && high != null && low !== high) range = `${btu(low)}–${btu(high)} BTU/hr`;
    else range = `${btu(low ?? high)} BTU/hr`;
  }
  const max = stove.btuMax == null ? null : btu(stove.btuMax);
  if (!range && max == null) return "heat output not listed by EPA";
  if (range && max == null) return range;
  if (!range) return `${max} BTU/hr maximum`;
  const single = low != null && low === high ? btu(low) : null;
  if (single != null && single === max) return range;
  return `${range} (maximum ${max} BTU/hr)`;
}

function blankKind(stove) {
  if (stove.emission == null) return "emission";
  if (stove.efficiency == null) return "efficiency";
  if (stove.btuLow == null && stove.btuHigh == null && stove.btuMax == null) return "heat";
  return "";
}

function assertFigures(stove, label) {
  const sentences = modelCertificationSentences(stove, date);
  const sentence = sentences[0];
  const title = heads.get(stove.id).title;
  const description = heads.get(stove.id).description;
  const emission = offlineEmission(stove);
  const efficiency = offlineEfficiency(stove);
  const heat = offlineHeat(stove);
  const status = certificationStatus(stove);
  assert.ok(sentences.length >= 2 && sentences.length <= 3, `${label} sentences`);
  assert.equal(sentence, certificationSentence(stove, date));
  assert.match(sentence, new RegExp(`^As of ${date}, EPA lists `));
  assert.ok(sentence.includes(status), sentence);
  assert.ok(sentence.includes(emission.prose), `${label} emission ${sentence}`);
  assert.ok(sentence.includes(efficiency.prose), `${label} efficiency ${sentence}`);
  assert.ok(sentence.includes(heat), `${label} heat ${sentence}`);
  assert.ok(title.includes(status), title);
  assert.ok(hasToken(title, emission.title) || title.includes(emission.title), `${label} title emission ${title}`);
  assert.ok(title.includes(efficiency.title), `${label} title efficiency ${title}`);
  assert.ok(title.includes(heat), `${label} title heat ${title}`);
  assert.ok(description.includes(emission.prose), `${label} description emission ${description}`);
  assert.ok(description.includes(efficiency.prose), `${label} description efficiency ${description}`);
  assert.ok(description.includes(heat), `${label} description heat ${description}`);
  assert.ok(description.includes(date), description);
  assert.equal(banned.test(sentence), false, sentence);
  assert.equal(banned.test(title), false, title);
  assert.equal(banned.test(description), false, description);
  if (stove.emission == null) {
    assert.equal(/\b0 g\/hr\b/.test(title), false, title);
    assert.equal(/\b0 lb\/mmBTU\b/.test(title), false, title);
    assert.equal(sentence.includes("0 grams per hour"), false, sentence);
    assert.equal(sentence.includes("0 pounds per million BTU"), false, sentence);
  }
  if (stove.efficiency == null) {
    assert.equal(/\b0% HHV\b/.test(title), false, title);
    assert.equal(sentence.includes("0 percent HHV"), false, sentence);
  }
  if (stove.btuLow == null && stove.btuHigh == null && stove.btuMax == null) {
    assert.equal(sentence.includes("BTU/hr"), false, sentence);
    assert.equal(title.includes("BTU/hr"), false, title);
  }
  if (stove.emission === 0) assert.ok(hasToken(sentence, emission.prose), sentence);
  for (const value of [stove.btuLow, stove.btuHigh, stove.btuMax]) {
    if (value == null) continue;
    assert.ok(hasToken(sentence, btu(value)), `${label} ${btu(value)} ${sentence}`);
    assert.ok(hasToken(title, btu(value)), `${label} ${btu(value)} ${title}`);
    assert.ok(hasToken(description, btu(value)), `${label} ${btu(value)} ${description}`);
  }
}

test("answer box and title numbers match an offline recompute of the committed rows", () => {
  const current = stoves.find((stove) => stove.indexable && stove.current && stove.emissionUnit === "g/hr" && stove.emission != null && stove.efficiency != null && stove.btuLow != null && stove.btuHigh != null && stove.btuLow !== stove.btuHigh);
  const previous = stoves.find((stove) => stove.indexable && !stove.current && stove.emissionUnit === "g/hr" && stove.emission != null && stove.efficiency != null && stove.btuLow != null && stove.btuHigh != null);
  const blank = stoves.find((stove) => stove.indexable && blankKind(stove));
  const zero = stoves.find((stove) => stove.emission === 0 || stove.btuLow === 0 || stove.btuHigh === 0 || stove.btuMax === 0);
  assert.ok(current, "currently certified sample");
  assert.ok(previous, "previously certified sample");
  assert.ok(blank, "blank-field sample");
  assert.ok(zero, "published-zero sample");
  assert.notEqual(blankKind(current), blankKind(blank));
  assertFigures(current, current.id);
  assertFigures(previous, previous.id);
  assertFigures(blank, blank.id);
  assertFigures(zero, zero.id);
  assert.ok(certificationSentence(blank, date).includes("not listed by EPA"));
  assert.equal(/\b0(?:\.0+)? (?:grams per hour|percent HHV|BTU\/hr)\b/.test(certificationSentence(blank, date).replace(offlineHeat(blank), "")), false);

  for (const stove of stoves) {
    assertFigures(stove, stove.id);
    const own = modelCertificationTitle(stove);
    const title = heads.get(stove.id).title;
    assert.ok(title.endsWith(own.slice(own.indexOf(" — "))) || title.includes(offlineHeat(stove)), title);
    const lead = `${offlineEmission(stove).title}, ${offlineEfficiency(stove).title}, ${certificationStatus(stove)}`;
    const model = String(stove.model).replace(/\s+/g, " ").trim();
    if (`${model} — ${lead}`.length <= 60 && !title.includes("(")) {
      assert.ok(title.startsWith(`${model} — `), title);
    }
  }
});

test("model page sitemap membership stays the committed model lines", () => {
  const hidden = new Set(noindex);
  const lastmods = buildSitemapLastmodsFromDates(new Map(), { shallow: true, snapshotDate: date });
  const listed = [...lastmods.keys()].filter((path) => path.startsWith("/stoves/")).sort();
  const expected = stoves.map((stove) => stove.url).sort();
  assert.deepEqual(listed, expected);
  const published = listed.filter((path) => !hidden.has(path));
  const indexable = stoves.filter((stove) => stove.indexable).map((stove) => stove.url).sort();
  assert.deepEqual(published, indexable);
  assert.deepEqual(readdirSync(join(root, "src/pages/stoves/[manufacturer]")), ["[model].astro"]);
});

test("the model page keeps the neighbor table and does not add a schema type", () => {
  const page = readFileSync(join(root, "src/pages/stoves/[manufacturer]/[model].astro"), "utf8");
  assert.match(page, /modelCertificationSentences\(stove, catalog\.meta\.snapshotDate\)/);
  assert.match(page, /<Answer sentences=\{sentences\} \/>/);
  assert.match(page, /<CurrentNeighbors stove=\{stove\} \/>/);
  assert.match(page, /<h1>\{stove\.model\}<\/h1>/);
  assert.doesNotMatch(page, /modelSentences|Product|Review|AggregateRating|FAQPage/);
  const answerAt = page.indexOf("<Answer");
  const neighborsAt = page.indexOf("<CurrentNeighbors");
  const tableAt = page.indexOf('id="specs"');
  assert.ok(answerAt > 0 && answerAt < neighborsAt && neighborsAt < tableAt);
});

test("a short model title can stay within 60 characters before the site suffix", () => {
  const stove = {
    id: "tiny",
    indexable: true,
    current: true,
    model: "S1",
    manufacturer: "Acme",
    emission: 1.2,
    emissionUnit: "g/hr",
    efficiency: 70,
    btuLow: 8000,
    btuHigh: 8000,
    btuMax: null,
    tests: [],
    rowCount: 1,
  };
  const title = modelCertificationTitle(stove);
  assert.ok(title.length <= 60, title);
  assert.equal(title.includes("StoveRatings"), false);
  assert.ok(title.startsWith("S1 — "));
  assert.ok(title.includes("1.2 g/hr"));
  assert.ok(title.includes("70% HHV"));
  assert.ok(title.includes("currently certified"));
  assert.ok(title.includes("8,000 BTU/hr"));
  const description = modelPageDescription(stove, date);
  assert.ok(description.length <= 180, description.length);
  assert.ok(description.includes("1.2 grams per hour"));
  assert.ok(description.includes("70 percent HHV"));
  assert.ok(description.includes("8,000 BTU/hr"));
  assert.ok(description.includes(date));
});
