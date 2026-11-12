import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import noindex from "../data/noindex-paths.json" with { type: "json" };
import {
  buildSitemapLastmods,
  buildSitemapLastmodsFromDates,
  chooseLastmod,
  isSitemapLastmod,
  isW3cDateTime,
  lastmodsFromEntries,
  rewriteSitemapLastmods,
} from "../src/lib/sitemap-lastmod.js";

const BASE = "2026-01-01T00:00:00Z";
const FOOTER_COMMIT = "2026-11-08T02:24:44-06:00";
const PAGE_COMMIT = "2026-11-09T02:27:14-06:00";
const DATA_COMMIT = "2026-11-01T15:00:00Z";
const SNAPSHOT = "2026-10-23";
const SITEMAP_URLS = 1111;
const SITEMAP_URL_HASH = "d106f63a753be8a0de9c965330cd233524c885c865aea41fbb2c068a1a17ab1a";

class FallbackDates extends Map {
  constructor(fallback, entries) {
    super(entries);
    this.fallback = fallback;
  }

  get(key) {
    return super.has(key) ? super.get(key) : this.fallback;
  }
}

function changedPaths(before, after) {
  const changed = [];
  for (const [path, date] of after) {
    if (before.get(path) !== date) changed.push(path);
  }
  for (const path of before.keys()) {
    if (!after.has(path)) changed.push(path);
  }
  return changed.sort();
}

test("sitemap datetimes match the W3C forms Google documents", () => {
  assert.equal(isW3cDateTime("2026-10-23"), true);
  assert.equal(isSitemapLastmod("2026-10-23"), true);
  assert.equal(isW3cDateTime("2026-11-08T02:24:44-06:00"), true);
  assert.equal(isSitemapLastmod("2026-11-08T02:24:44-06:00"), true);
  assert.equal(isW3cDateTime("2026-11-08T08:24:44Z"), true);
  assert.equal(isW3cDateTime("2026-10-23T00:00:00.000Z"), true);
  assert.equal(isSitemapLastmod("2026-10-23T00:00:00.000Z"), false);
  assert.equal(isSitemapLastmod("2026-10-23T00:00:00"), false);
  assert.equal(isW3cDateTime("2026-02-31"), false);
  assert.equal(isSitemapLastmod("10/23/2026"), false);
});

test("snapshot date is the fallback only when it is the latest real candidate", () => {
  assert.equal(chooseLastmod(["2026-10-23"]), "2026-10-23");
  assert.equal(
    chooseLastmod(["2026-10-23", "2026-11-08T02:24:44-06:00"]),
    "2026-11-08T02:24:44-06:00",
  );
  assert.equal(
    chooseLastmod(["2026-10-23T22:12:24-05:00", "2026-10-23"]),
    "2026-10-23T22:12:24-05:00",
  );
});

test("page lastmods follow content commits and not one shared clock", () => {
  const lastmods = buildSitemapLastmods();
  const pellet = lastmods.get("/cleanest-burning-pellet-stoves/");
  const contact = lastmods.get("/contact/");
  const privacy = lastmods.get("/privacy/");
  const stove = lastmods.get("/stoves/ac-component-specialists/620-9-and-620-10/");
  const brand = lastmods.get("/brands/509-fabrications-inc/");
  const compare = lastmods.get("/compare/");
  const tool = lastmods.get("/tools/stove-size-calculator/");
  for (const value of [pellet, contact, privacy, stove, brand, compare, tool]) {
    assert.ok(isW3cDateTime(value), value);
    assert.ok(isSitemapLastmod(value), value);
    assert.ok(Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value) <= Date.now() + 60_000, value);
  }
  assert.ok(pellet.slice(0, 10) > "2026-10-23", pellet);
  assert.equal(contact.slice(0, 10), "2026-10-23");
  assert.equal(privacy.slice(0, 10), "2026-10-23");
  assert.notEqual(pellet, contact);
  assert.notEqual(stove.slice(0, 10), "2026-11-08", stove);
  assert.ok(tool.slice(0, 10) > "2026-10-23", tool);
  const distinct = new Set([contact, brand, compare, stove, tool]);
  assert.ok(distinct.size >= 4, [...distinct].join(" | "));
});

test("sitemap URL set is the prior indexable set plus the small wood stoves page", () => {
  const hidden = new Set(noindex);
  const lastmods = buildSitemapLastmods();
  const urls = [...lastmods.keys()].filter((path) => !hidden.has(path) && !path.includes("404")).sort();
  assert.equal(urls.length, SITEMAP_URLS);
  assert.equal(urls.includes("/small-wood-stoves/"), true);
  assert.equal(createHash("sha256").update(urls.join("\n")).digest("hex"), SITEMAP_URL_HASH);
  const now = Date.now() + 60_000;
  for (const path of urls) {
    const lastmod = lastmods.get(path);
    assert.equal(isSitemapLastmod(lastmod), true, `${path} ${lastmod}`);
    assert.equal(isW3cDateTime(lastmod), true, `${path} ${lastmod}`);
    const instant = lastmod.length === 10 ? Date.parse(`${lastmod}T00:00:00Z`) : Date.parse(lastmod);
    assert.ok(instant <= now, `${path} ${lastmod}`);
  }
});

test("chrome, layout, and style commits do not move pages that import them", () => {
  const files = new Map([
    [
      "src/pages/contact.astro",
      [
        'import Base from "../layouts/Base.astro";',
        'import Footer from "../components/Footer.astro";',
        'import Header from "../components/Header.astro";',
        'import "../styles/global.css";',
        'import { site } from "../lib/site.js";',
        'import { datasetLd } from "../lib/schema.js";',
        "const email = site.legalName;",
        "const ld = datasetLd();",
      ].join("\n"),
    ],
    ["src/layouts/Base.astro", 'import "../styles/global.css";\nimport Footer from "../components/Footer.astro";\n'],
    ["src/components/Footer.astro", '<a href="/pellet-stoves/">Pellet stoves</a>\n'],
    ["src/components/Header.astro", "<header>StoveRatings</header>\n"],
    ["src/styles/global.css", "body { color: #1c1917; }\n"],
    ["src/lib/site.js", 'export const site = { legalName: "Three Pines Company LLC" };\n'],
    ["src/lib/schema.js", "export function datasetLd() { return {}; }\n"],
    ["public/favicon.svg", "<svg></svg>\n"],
    ["public/brand/stoveratings-mark.svg", "<svg></svg>\n"],
  ]);
  const entries = [{ rel: "src/pages/contact.astro", paths: ["/contact/"] }];
  const envFor = (overrides) => ({
    fileDates: new FallbackDates(BASE, overrides),
    snapshotDate: SNAPSHOT,
    shallow: false,
    readFile: (rel) => {
      if (!files.has(rel)) throw new Error(`missing fixture ${rel}`);
      return files.get(rel);
    },
    exists: (rel) => files.has(rel),
  });
  const baseline = lastmodsFromEntries(entries, envFor([]));
  const chrome = lastmodsFromEntries(entries, envFor([
    ["src/components/Footer.astro", FOOTER_COMMIT],
    ["src/components/Header.astro", FOOTER_COMMIT],
    ["src/layouts/Base.astro", FOOTER_COMMIT],
    ["src/styles/global.css", FOOTER_COMMIT],
    ["src/lib/schema.js", FOOTER_COMMIT],
    ["public/favicon.svg", FOOTER_COMMIT],
    ["public/brand/stoveratings-mark.svg", FOOTER_COMMIT],
  ]));
  assert.deepEqual(chrome, baseline);
  assert.equal(baseline.get("/contact/"), BASE);

  const pageEdit = lastmodsFromEntries(entries, envFor([
    ["src/pages/contact.astro", PAGE_COMMIT],
  ]));
  assert.equal(pageEdit.get("/contact/"), PAGE_COMMIT);
});

test("mocked git dates move only the page or the data users", () => {
  const files = new Map([
    [
      "src/pages/contact.astro",
      'import { site } from "../lib/site.js";\nconst name = site.legalName;\n',
    ],
    [
      "src/pages/firewood-btu-chart.astro",
      'import { catalog } from "../lib/catalog.js";\nconst rows = catalog.firewood;\n',
    ],
    [
      "src/pages/pellet-stoves.astro",
      'import { catalog } from "../lib/catalog.js";\nimport { pelletStoves } from "../lib/lists.js";\nconst groups = pelletStoves(catalog.stoves);\n',
    ],
    [
      "src/pages/stoves/[manufacturer]/[model].astro",
      'import { catalog, stoveById } from "../../../lib/catalog.js";\nimport { relatedLists } from "../../../lib/lists.js";\nconst brand = catalog.brandBySlug;\nconst lists = relatedLists(stoveById);\nconst rows = catalog.stoves;\n',
    ],
    ["src/lib/site.js", "export const site = { legalName: \"Three Pines Company LLC\" };\n"],
    ["src/lib/catalog.js", "export const catalog = {};\nexport const stoveById = new Map();\n"],
    ["src/lib/lists.js", "export function pelletStoves() { return { current: [] }; }\nexport function relatedLists() { return []; }\n"],
    ["data/stoves.json", "[]\n"],
    ["data/firewood.json", "[]\n"],
    ["data/brands.json", "[]\n"],
  ]);
  const entries = [
    { rel: "src/pages/contact.astro", paths: ["/contact/"] },
    { rel: "src/pages/firewood-btu-chart.astro", paths: ["/firewood-btu-chart/"] },
    { rel: "src/pages/pellet-stoves.astro", paths: ["/pellet-stoves/"] },
    {
      rel: "src/pages/stoves/[manufacturer]/[model].astro",
      paths: ["/stoves/alpha/one/", "/stoves/beta/two/"],
    },
  ];
  const envFor = (overrides) => ({
    fileDates: new FallbackDates(BASE, overrides),
    snapshotDate: SNAPSHOT,
    shallow: false,
    readFile: (rel) => {
      if (!files.has(rel)) throw new Error(`missing fixture ${rel}`);
      return files.get(rel);
    },
    exists: (rel) => files.has(rel),
  });
  const baseline = lastmodsFromEntries(entries, envFor([]));
  assert.equal(baseline.get("/stoves/alpha/one/"), BASE);
  assert.equal(baseline.get("/pellet-stoves/"), BASE);

  const contactEdit = lastmodsFromEntries(entries, envFor([["src/pages/contact.astro", PAGE_COMMIT]]));
  assert.deepEqual(changedPaths(baseline, contactEdit), ["/contact/"]);
  assert.equal(contactEdit.get("/contact/"), PAGE_COMMIT);

  const stoveTemplate = lastmodsFromEntries(entries, envFor([
    ["src/pages/stoves/[manufacturer]/[model].astro", PAGE_COMMIT],
  ]));
  assert.deepEqual(changedPaths(baseline, stoveTemplate), ["/stoves/alpha/one/", "/stoves/beta/two/"]);

  const stoveData = lastmodsFromEntries(entries, envFor([["data/stoves.json", DATA_COMMIT]]));
  assert.deepEqual(changedPaths(baseline, stoveData), [
    "/pellet-stoves/",
    "/stoves/alpha/one/",
    "/stoves/beta/two/",
  ]);
  assert.equal(stoveData.get("/contact/"), BASE);
  assert.equal(stoveData.get("/firewood-btu-chart/"), BASE);

  const firewoodData = lastmodsFromEntries(entries, envFor([["data/firewood.json", DATA_COMMIT]]));
  assert.deepEqual(changedPaths(baseline, firewoodData), ["/firewood-btu-chart/"]);

  const listSource = lastmodsFromEntries(entries, envFor([["src/lib/lists.js", PAGE_COMMIT]]));
  assert.deepEqual(changedPaths(baseline, listSource), ["/pellet-stoves/"]);
  assert.equal(listSource.get("/stoves/alpha/one/"), BASE);
  assert.equal(listSource.get("/contact/"), BASE);
});

test("real pages ignore chrome and a related-list edit, and follow their own data", () => {
  const baseline = buildSitemapLastmodsFromDates(new FallbackDates(BASE));
  const stove = "/stoves/ac-component-specialists/620-9-and-620-10/";
  const brand = "/brands/509-fabrications-inc/";
  const chrome = buildSitemapLastmodsFromDates(new FallbackDates(BASE, [
    ["src/components/Footer.astro", FOOTER_COMMIT],
    ["src/components/Header.astro", FOOTER_COMMIT],
    ["src/components/Breadcrumbs.astro", FOOTER_COMMIT],
    ["src/layouts/Base.astro", FOOTER_COMMIT],
    ["src/styles/global.css", FOOTER_COMMIT],
    ["src/lib/schema.js", FOOTER_COMMIT],
    ["public/favicon.svg", FOOTER_COMMIT],
    ["public/apple-touch-icon.png", FOOTER_COMMIT],
    ["public/og-image.png", FOOTER_COMMIT],
    ["public/brand/stoveratings-mark.svg", FOOTER_COMMIT],
    ["public/fonts/ibm-plex-sans-latin-400-normal.woff2", FOOTER_COMMIT],
    ["public/robots.txt", FOOTER_COMMIT],
  ]));
  assert.equal(changedPaths(baseline, chrome).length, 0);
  assert.equal(chrome.get(brand), baseline.get(brand));

  const contactEdit = buildSitemapLastmodsFromDates(new FallbackDates(BASE, [
    ["src/pages/contact.astro", PAGE_COMMIT],
  ]));
  assert.deepEqual(changedPaths(baseline, contactEdit), ["/contact/"]);

  const stoveData = buildSitemapLastmodsFromDates(new FallbackDates(BASE, [
    ["data/stoves.json", DATA_COMMIT],
  ]));
  const stoveChanges = changedPaths(baseline, stoveData);
  assert.ok(stoveChanges.includes(stove));
  assert.ok(stoveChanges.includes("/pellet-stoves/"));
  assert.ok(stoveChanges.includes(brand));
  assert.ok(!stoveChanges.includes("/contact/"));
  assert.ok(!stoveChanges.includes("/privacy/"));
  assert.ok(!stoveChanges.includes("/firewood-btu-chart/"));

  const firewoodData = buildSitemapLastmodsFromDates(new FallbackDates(BASE, [
    ["data/firewood.json", DATA_COMMIT],
  ]));
  const firewoodChanges = changedPaths(baseline, firewoodData);
  assert.deepEqual(firewoodChanges, [
    "/firewood-btu-chart/",
    "/pellet-stove-vs-wood-stove/",
    "/tools/heating-cost-calculator/",
  ]);

  const lists = buildSitemapLastmodsFromDates(new FallbackDates(BASE, [
    ["src/lib/lists.js", PAGE_COMMIT],
  ]));
  const listChanges = changedPaths(baseline, lists);
  assert.ok(listChanges.includes("/pellet-stoves/"));
  assert.ok(listChanges.includes("/cleanest-burning-pellet-stoves/"));
  assert.ok(!listChanges.includes(stove));
  assert.ok(!listChanges.includes("/contact/"));
  assert.ok(!listChanges.includes(brand));

  const lookupScript = buildSitemapLastmodsFromDates(new FallbackDates(BASE, [
    ["public/scripts/lookup.js", PAGE_COMMIT],
  ]));
  assert.deepEqual(changedPaths(baseline, lookupScript), ["/lookup/"]);
});

test("shallow history falls back to the snapshot date without inventing a newer one", () => {
  const files = new Map([
    ["src/pages/contact.astro", 'import { site } from "../lib/site.js";\nconst name = site.legalName;\n'],
    ["src/lib/site.js", "export const site = { legalName: \"Three Pines Company LLC\" };\n"],
  ]);
  const entries = [{ rel: "src/pages/contact.astro", paths: ["/contact/"] }];
  const env = {
    snapshotDate: SNAPSHOT,
    readFile: (rel) => files.get(rel),
    exists: (rel) => files.has(rel),
  };
  assert.throws(
    () => lastmodsFromEntries(entries, { ...env, fileDates: new Map(), shallow: false }),
    /No git commit date for src\/pages\/contact\.astro/,
  );
  const shallow = lastmodsFromEntries(entries, { ...env, fileDates: new Map(), shallow: true });
  assert.equal(shallow.get("/contact/"), SNAPSHOT);
  const partial = lastmodsFromEntries(entries, {
    ...env,
    shallow: true,
    fileDates: new Map([["src/pages/contact.astro", PAGE_COMMIT]]),
  });
  assert.equal(partial.get("/contact/"), PAGE_COMMIT);
});

test("sitemap index lastmod is the newest URL in that child", () => {
  const dir = mkdtempSync(join(tmpdir(), "sitemap-lastmod-"));
  try {
    writeFileSync(
      join(dir, "sitemap-0.xml"),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<urlset>",
        "<url><loc>https://stoveratings.com/contact/</loc><lastmod>2020-01-01</lastmod></url>",
        "<url><loc>https://stoveratings.com/privacy/</loc><lastmod>2020-01-01</lastmod></url>",
        "</urlset>",
      ].join(""),
    );
    writeFileSync(
      join(dir, "sitemap-index.xml"),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<sitemapindex>",
        "<sitemap><loc>https://stoveratings.com/sitemap-0.xml</loc><lastmod>2020-01-01</lastmod></sitemap>",
        "</sitemapindex>",
      ].join(""),
    );
    const lastmods = new Map([
      ["/contact/", PAGE_COMMIT],
      ["/privacy/", SNAPSHOT],
    ]);
    const childMax = rewriteSitemapLastmods(dir, lastmods);
    assert.equal(childMax.get("sitemap-0.xml"), PAGE_COMMIT);
    const index = readFileSync(join(dir, "sitemap-index.xml"), "utf8");
    assert.match(index, new RegExp(`<loc>https://stoveratings.com/sitemap-0.xml</loc><lastmod>${PAGE_COMMIT}</lastmod>`));
    const child = readFileSync(join(dir, "sitemap-0.xml"), "utf8");
    assert.match(child, new RegExp(`<loc>https://stoveratings.com/privacy/</loc><lastmod>${SNAPSHOT}</lastmod>`));
    assert.doesNotMatch(child, /2020-01-01/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
