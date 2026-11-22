import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { LOGOX_PLACEMENTS } from "../src/lib/affiliates.js";
import {
  AIRNOW_URL,
  BURN_RULES_CAPTION,
  BURN_RULES_PAGE,
  BURN_WISE_URL,
  LINKS_CHECKED,
  OFFICIAL_DOMAIN_EXCEPTIONS,
  assertBurnCopy,
  burnRuleCounts,
  burnRuleParts,
  burnRuleVisibleText,
  isOfficialBurnUrl,
} from "../src/lib/burn-rules.js";
import { glossaryParts } from "../src/lib/glossary.js";
import { faqLd } from "../src/lib/schema.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const banned = /\b(best|safe|safest|safer|top-rated|recommend\w*|scores?|ratings?|popular|winners?|affiliate|sponsored|cleanest|better)\b/i;
const epaAppHost = ["cf", "pub.epa.gov"].join("");
const jurisdictions = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "District of Columbia",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
];

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function readJson(path) {
  return JSON.parse(read(path));
}

function withoutUrls(text) {
  return text
    .replace(/const BANNED_COPY =[\s\S]*?;\n/, "")
    .replace(/https?:\/\/\S+/g, "");
}

const parts = burnRuleParts();
const text = burnRuleVisibleText(parts);
const page = read("src/pages/burn-rules.astro");
const lib = read("src/lib/burn-rules.js");
const counts = burnRuleCounts(parts.rows);

test("the page leads with the answer, then a 51-jurisdiction table and sources", () => {
  assertBurnCopy(text);
  assert.equal(banned.test(`${withoutUrls(text)}\n${page}\n${withoutUrls(lib)}`), false);
  assert.equal(`${lib}\n${page}\n${text}`.includes(epaAppHost), false);
  assert.equal(parts.sentences.length, 3);
  assert.equal(parts.faqs.length, 4);
  assert.equal(parts.rows.length, jurisdictions.length);
  assert.deepEqual(parts.rows.map((row) => row.state), jurisdictions);
  assert.equal(counts.states, parts.rows.length);
  assert.equal(counts.wood + counts.air + counts.unverified, counts.states);
  assert.equal(page.includes("<Answer"), true);
  const answerAt = page.indexOf("<Answer");
  const tableAt = page.indexOf("<table");
  const sourcesAt = page.indexOf("<h2>Sources</h2>");
  assert.ok(answerAt >= 0 && tableAt > answerAt && sourcesAt > tableAt);
  assert.match(page, /faqLd\(faqs\)/);
  assert.match(page, /articleLd\(/);
  assert.doesNotMatch(page, /webAppLd|datasetLd|Product|Review|AggregateRating/);
  assert.equal(page.includes(["Logox", "Note"].join("")), false);
  assert.equal(parts.caption, BURN_RULES_CAPTION);
  assert.match(text, new RegExp(`Links checked on ${LINKS_CHECKED}`));
  assert.match(text, /not legal advice/i);
  assert.match(text, /not verified/);
  assert.match(text, /does not restate/);
  assert.equal(page.includes("counts.wood"), false);
  assert.equal(page.includes("counts.air"), false);
});

test("every table URL is https on an official host, and unverified rows use Burn Wise", () => {
  const hrefs = new Set();
  for (const row of parts.rows) {
    assert.match(row.href, /^https:\/\//);
    assert.equal(row.href.includes(epaAppHost), false);
    assert.equal(isOfficialBurnUrl(row.href), true, row.state);
    const host = new URL(row.href).hostname.toLowerCase();
    const allowed = host.endsWith(".gov") || OFFICIAL_DOMAIN_EXCEPTIONS.includes(host);
    assert.equal(allowed, true, `${row.state} ${host}`);
    if (row.kind === "unverified") {
      assert.equal(row.agency, "not verified");
      assert.equal(row.href, BURN_WISE_URL);
      assert.equal(row.linkLabel, "not verified");
    } else if (row.kind === "wood") {
      assert.equal(row.linkLabel, "Wood-smoke page");
      assert.notEqual(row.href, BURN_WISE_URL);
      hrefs.add(row.href);
    } else if (row.kind === "air") {
      assert.equal(row.linkLabel, "Air-quality home page");
      assert.notEqual(row.href, BURN_WISE_URL);
      hrefs.add(row.href);
    } else {
      assert.fail(row.kind);
    }
  }
  assert.equal(hrefs.size, counts.wood + counts.air);
  assert.equal(parts.sources.filter((source) => source.href === AIRNOW_URL).length, 1);
  assert.equal(parts.sources.filter((source) => source.href === BURN_WISE_URL).length, 1);
  for (const source of parts.sources) {
    assert.match(source.href, /^https:\/\//);
    assert.equal(source.href.includes(epaAppHost), false);
    assert.equal(isOfficialBurnUrl(source.href), true);
    assert.equal(source.retrieved, LINKS_CHECKED);
    assert.match(text, new RegExp(source.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  const exceptionHosts = parts.rows
    .map((row) => new URL(row.href).hostname.toLowerCase())
    .filter((host) => !host.endsWith(".gov"));
  assert.deepEqual([...new Set(exceptionHosts)], OFFICIAL_DOMAIN_EXCEPTIONS);
});

test("the glossary, footer, and llms file link the page, and sponsored rels stay on the LogOX placements", () => {
  const stoves = readJson("data/stoves.json");
  const meta = readJson("data/meta.json");
  const glossary = glossaryParts(stoves, meta.snapshotDate);
  const term = glossary.terms.find((item) => item.id === "burn-rules");
  assert.ok(term);
  assert.equal(term.links.some((link) => link.href === BURN_RULES_PAGE), true);
  assert.match(page, /href="\/glossary\/#burn-rules"/);
  assert.match(page, /href="\/certified-before-2020\/"/);
  assert.match(page, /BURN_WISE_URL/);
  assert.match(page, /AIRNOW_URL/);
  assert.match(read("src/components/Footer.astro"), /href="\/burn-rules\/"/);
  assert.match(read("public/llms.txt"), /https:\/\/stoveratings\.com\/burn-rules\//);
  const noindex = readJson("data/noindex-paths.json");
  assert.equal(noindex.includes(BURN_RULES_PAGE), false);
  assert.equal(LOGOX_PLACEMENTS.some((item) => item.path === BURN_RULES_PAGE), false);
  assert.equal(page.includes("sponsored"), false);
  assert.equal(withoutUrls(lib).includes("sponsored"), false);
  const check = read("scripts/check-html.mjs");
  assert.match(check, /sponsoredRels !== expectedLogoxBlocks/);
  assert.match(check, /burn rules: affiliate link/);
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
