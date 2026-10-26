import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { modelSentences } from "../src/lib/answers.js";
import { datasetIssues } from "../scripts/check-dataset.mjs";
import { faqLd } from "../src/lib/schema.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(name) {
  return JSON.parse(readFileSync(join(root, "data", name), "utf8"));
}

function csvRows(name) {
  const text = readFileSync(join(root, "data/raw", name), "utf8").replace(/\n$/, "");
  return text.split("\n").length - 1;
}

test("launch snapshot row counts match the committed exports", () => {
  const stats = readJson("stats.json");
  const meta = readJson("meta.json");
  assert.equal(meta.snapshotDate, "2026-10-23");
  assert.equal(stats.rows.roomAll, 1444);
  assert.equal(stats.rows.roomCurrent, 265);
  assert.equal(stats.rows.centralAll, 192);
  assert.equal(stats.rows.centralCurrent, 41);
  assert.equal(stats.rows.roomAll, csvRows("rh_all.csv"));
  assert.equal(stats.rows.roomCurrent, csvRows("rh_inprod.csv"));
  assert.equal(stats.rows.centralAll, csvRows("wh_all.csv"));
  assert.equal(stats.rows.centralCurrent, csvRows("wh_inprod.csv"));
  assert.equal(readFileSync(join(root, "data/raw/SNAPSHOT_DATE"), "utf8").trim(), "2026-10-23");
});

test("blank EPA cells stay null and current rows use the right units", () => {
  const stoves = readJson("stoves.json");
  const tests = stoves.flatMap((stove) => stove.tests);
  assert.equal(tests.filter((row) => row.current && row.emissionUnit === "g/hr").length, 265);
  assert.equal(tests.filter((row) => row.current && row.emissionUnit === "lb/mmBTU").length, 41);
  for (const row of tests) {
    for (const key of ["emission", "efficiency", "co", "firebox"]) {
      assert.ok(row[key] === null || typeof row[key] === "number", key);
    }
    if (row.fireboxStatus === "not_listed") assert.equal(row.firebox, null);
  }
});

test("Drolet is only the model line whose EPA text says Drolet", () => {
  const stoves = readJson("stoves.json");
  const drolet = stoves.filter((stove) => stove.brandSlugs.includes("drolet"));
  assert.equal(drolet.length, 1);
  assert.match(drolet[0].model, /Drolet/);
  assert.equal(drolet[0].manufacturer, "Stove Builder International, Inc.");
  const escape = stoves.find((stove) => stove.model.includes("Escape 1500"));
  assert.ok(escape);
  assert.equal(escape.brandSlugs.includes("drolet"), false);
});

test("every firewood row cites an https source", () => {
  const firewood = readJson("firewood.json");
  assert.ok(firewood.length >= 13);
  for (const row of firewood) {
    assert.match(row.sourceUrl, /^https:\/\//);
    assert.ok(row.btuLow > 0 && row.btuHigh >= row.btuLow);
    assert.equal(row.sourceUrl.includes("uaex.uada.edu"), true);
  }
});

test("the 1.4 Series Osburn answer uses EPA numbers and the snapshot date", () => {
  const stoves = readJson("stoves.json");
  const stove = stoves.find((item) => item.model.startsWith("1.4 Series (Osburn 950"));
  assert.ok(stove);
  const text = modelSentences(stove, "2026-10-23").join(" ");
  assert.match(text, /1\.8 grams per hour/);
  assert.match(text, /74 percent/);
  assert.match(text, /currently certified/);
  assert.match(text, /Stove Builder International, Inc\./);
  assert.match(text, /snapshot 2026-10-23/);
  assert.doesNotMatch(text, /\bstar\b|best stove|our score/i);
});

test("Dataset creator and publisher types must be Organization or Person", () => {
  function page(creatorType, publisherType) {
    const data = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Dataset",
          name: "EPA Certified Wood Heater Database snapshot",
          description: "x".repeat(80),
          url: "https://stoveratings.com/methodology/",
          license: "https://www.usa.gov/government-works",
          isAccessibleForFree: true,
          creator: {
            "@type": creatorType,
            name: "U.S. Environmental Protection Agency",
            url: "https://www.epa.gov/",
          },
          publisher: { "@type": publisherType, name: "StoveRatings", url: "https://stoveratings.com" },
        },
        { "@type": "Article", publisher: { "@type": "GovernmentOrganization", name: "Ignored outside Dataset" } },
      ],
    };
    return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  }

  const good = datasetIssues(page("Organization", "Person"), "/index.html");
  assert.equal(good.datasets, 1);
  assert.deepEqual(good.issues, []);

  const badCreator = datasetIssues(page("GovernmentOrganization", "Organization"), "/index.html");
  assert.ok(badCreator.issues.some((issue) => issue.includes("creator") && issue.includes("GovernmentOrganization")));

  const badPublisher = datasetIssues(page("Organization", "GovernmentOrganization"), "/methodology/index.html");
  assert.ok(badPublisher.issues.some((issue) => issue.includes("publisher") && issue.includes("GovernmentOrganization")));
});

test("schema helpers do not emit review or product types", () => {
  const faq = JSON.stringify(faqLd([{ question: "Q?", answer: "A." }]));
  assert.match(faq, /FAQPage/);
  assert.doesNotMatch(faq, /AggregateRating|Review|Product/);
});

test("workflows do not schedule a fetch and do not name the EPA application host", () => {
  const dir = join(root, ".github/workflows");
  const files = readdirSync(dir).filter((name) => name.endsWith(".yml"));
  assert.deepEqual(files.sort(), ["deploy.yml", "refresh.yml"]);
  for (const name of files) {
    const text = readFileSync(join(dir, name), "utf8");
    assert.equal(text.includes("schedule:"), false, name);
    assert.equal(text.includes("cfpub.epa.gov"), false, name);
    assert.equal(/cron:/i.test(text), false, name);
  }
  const refresh = readFileSync(join(dir, "refresh.yml"), "utf8");
  assert.match(refresh, /workflow_dispatch/);
  const deploy = readFileSync(join(dir, "deploy.yml"), "utf8");
  assert.match(deploy, /actions\/deploy-pages/);
  assert.match(deploy, /api\.indexnow\.org\/indexnow|scripts\/indexnow\.mjs/);
});

test("robots allows all and the CNAME is the apex domain", () => {
  const robots = readFileSync(join(root, "public/robots.txt"), "utf8");
  assert.match(robots, /User-agent:\s*\*/);
  assert.match(robots, /Allow:\s*\//);
  assert.doesNotMatch(robots, /Disallow:/);
  assert.match(robots, /Sitemap: https:\/\/stoveratings.com\/sitemap-index\.xml/);
  assert.equal(readFileSync(join(root, "public/CNAME"), "utf8").trim(), "stoveratings.com");
});
