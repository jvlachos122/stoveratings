import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ETSY,
  ETSY_PLACEMENTS,
  aboutAffiliateSentence,
  affiliateMarkupProblems,
  disclosureView,
  etsyNote,
  etsySearchDestination,
  rakutenHref,
} from "../src/lib/affiliates.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAKUTEN = "https://click.linksynergy.com/deeplink";
const EXAMPLE = "https://www.etsy.com/search?q=wood stove accessories";

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function pageFile(path) {
  return `src/pages${path.replace(/\/$/, "")}.astro`;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(path, out);
    } else if (entry.name.endsWith(".astro")) out.push(path);
  }
  return out;
}

function renderedNote(note) {
  const items = note.links
    .map((link) => {
      const href = link.href.replaceAll("&", "&amp;");
      return `<li><a href="${href}" rel="${note.rel}" target="${note.target}">${link.label}</a></li>`;
    })
    .join("");
  return `<div class="affiliate-note" data-affiliate="etsy"><p>${note.heading}</p><ul>${items}</ul><p class="affiliate-disclosure">${note.disclosure}</p></div>`;
}

test("Rakuten deeplinks single-encode an Etsy search, and decoding murl is that search", () => {
  assert.equal(ETSY.merchantId, "54027");
  assert.equal(ETSY.publisherId, "AseERiKMclc");
  assert.equal(ETSY.network, "Rakuten Advertising");
  assert.equal(ETSY.rel, "sponsored nofollow noopener");
  assert.equal(ETSY.heading, "Shop accessories on Etsy");
  assert.equal(ETSY.disclosure, "Affiliate link: we may earn a commission from Etsy purchases at no cost to you.");
  assert.equal(etsySearchDestination("wood stove accessories"), EXAMPLE);

  const href = rakutenHref(EXAMPLE);
  assert.equal(href, `${RAKUTEN}?id=AseERiKMclc&mid=54027&murl=${encodeURIComponent(EXAMPLE)}`);
  assert.equal(href.includes("%2520"), false);
  assert.equal(href.includes("wood%20stove%20accessories"), true);
  const murl = new URL(href).searchParams.get("murl");
  assert.equal(murl, EXAMPLE);
  const parsed = new URL(murl);
  assert.equal(parsed.protocol, "https:");
  assert.equal(parsed.hostname, "www.etsy.com");
  assert.equal(parsed.pathname, "/search");
  assert.equal(parsed.searchParams.get("q"), "wood stove accessories");
  assert.match(parsed.href, /^https:\/\/www\.etsy\.com\//);

  assert.throws(() => rakutenHref("https://www.etsy.com/search?q=wood%20stove%20accessories"), /pre-encoded/);
  assert.throws(() => rakutenHref("https://www.etsy.com/listing/1/wood-stove-fan"), /listing/);
  assert.throws(() => etsySearchDestination("best wood stove"), /rank or score/);
  assert.throws(() => etsySearchDestination("wood stove!"), /plain words/);
  const category = rakutenHref("https://www.etsy.com/c/home-and-living");
  assert.equal(new URL(category).searchParams.get("murl"), "https://www.etsy.com/c/home-and-living");
});

test("every placed Etsy link is a disclosed search, not a listing", () => {
  assert.equal(ETSY_PLACEMENTS.length > 0, true);
  const paths = ETSY_PLACEMENTS.map((item) => item.path);
  assert.equal(new Set(paths).size, paths.length);
  const component = read("src/components/EtsyNote.astro");
  assert.match(component, /data-affiliate="etsy"/);
  assert.match(component, /target=\{note\.target\}/);
  assert.match(component, /rel=\{note\.rel\}/);
  assert.doesNotMatch(component, /<script|Product|Review|AggregateRating/);

  const keptOff = [
    "/burn-rules/",
    "/firewood-moisture/",
    "/pellet-fuel-grades/",
    "/most-efficient-wood-stoves/",
    "/cleanest-burning-wood-stoves/",
    "/stoves/ac-component-specialists/620-9-and-620-10/",
  ];
  for (const path of keptOff) assert.equal(ETSY_PLACEMENTS.some((item) => item.path === path), false, path);
  assert.equal(read("src/pages/stoves/[manufacturer]/[model].astro").includes("EtsyNote"), false);

  const banned = /\b(best|top-rated|recommend\w*|scores?|ratings?|\$)\b/i;
  for (const placement of ETSY_PLACEMENTS) {
    assert.equal(placement.searches.length > 0, true, placement.path);
    const queries = placement.searches.map((search) => search.query);
    assert.equal(new Set(queries).size, queries.length, placement.path);
    const note = etsyNote(placement.path);
    assert.ok(note);
    assert.equal(note.heading, ETSY.heading);
    assert.equal(note.disclosure, ETSY.disclosure);
    assert.equal(note.rel, "sponsored nofollow noopener");
    assert.equal(note.target, "_blank");
    assert.equal(note.links.length, placement.searches.length);
    for (const link of note.links) {
      assert.equal(banned.test(link.label), false, link.label);
      const url = new URL(link.href);
      assert.equal(`${url.origin}${url.pathname}`, RAKUTEN);
      assert.equal(url.searchParams.get("id"), ETSY.publisherId);
      assert.equal(url.searchParams.get("mid"), ETSY.merchantId);
      assert.equal(link.href.includes("%2520"), false);
      const murl = url.searchParams.get("murl");
      const etsy = new URL(murl);
      assert.equal(etsy.protocol, "https:");
      assert.equal(etsy.hostname, "www.etsy.com");
      assert.equal(etsy.pathname, "/search");
      assert.equal(etsy.pathname.includes("/listing"), false);
      assert.equal(queries.includes(etsy.searchParams.get("q")), true);
      assert.equal(link.destination, murl);
    }
    assert.deepEqual(affiliateMarkupProblems(renderedNote(note)), []);
    const page = read(pageFile(placement.path));
    const marker = `<EtsyNote path="${placement.path}" />`;
    assert.equal(page.split(marker).length, 2, placement.path);
  }

  const noted = walk(join(root, "src/pages")).filter((file) => readFileSync(file, "utf8").includes("<EtsyNote "));
  assert.equal(noted.length, ETSY_PLACEMENTS.length);
  assert.equal(etsyNote("/pellet-stoves/"), null);
  assert.equal(etsyNote("/firewood-btu-chart/", { enabled: false }), null);
});

test("the disclosure names Etsy through Rakuten Advertising beside LogOX", () => {
  const view = disclosureView();
  const copy = `${view.description}\n${view.paragraphs.join("\n")}`;
  assert.match(copy, /Etsy/);
  assert.match(copy, /Rakuten Advertising/);
  assert.match(copy, /LogOX/);
  assert.match(copy, /Awin/);
  assert.match(copy, new RegExp(ETSY.disclosure.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(copy, /\b(best|top-rated|recommend\w*|scores?)\b/i);
  assert.equal(view.etsyPlacements.length, ETSY_PLACEMENTS.reduce((sum, item) => sum + item.searches.length, 0));
  for (const item of view.etsyPlacements) {
    const parsed = new URL(item.destination);
    assert.equal(parsed.protocol, "https:");
    assert.equal(parsed.hostname, "www.etsy.com");
    assert.equal(parsed.pathname, "/search");
  }
  assert.match(aboutAffiliateSentence(), /Etsy/);
  assert.match(aboutAffiliateSentence(), /Rakuten Advertising/);
  assert.match(aboutAffiliateSentence(), /LogOX/);
  assert.match(read("src/pages/disclosure.astro"), /etsyPlacements/);
  assert.match(read("src/pages/about.astro"), /aboutAffiliateSentence/);

  const hidden = disclosureView({ enabled: false, etsyEnabled: false });
  assert.equal(hidden.etsyPlacements.length, 0);
  assert.match(hidden.description, /no affiliate links/);
  const etsyOnly = disclosureView({ enabled: false });
  assert.equal(etsyOnly.placements.length, 0);
  assert.equal(etsyOnly.paragraphs.some((paragraph) => /Awin|LogOX|thelogox/.test(paragraph)), false);
  assert.match(etsyOnly.description, /Etsy/);
  assert.match(aboutAffiliateSentence({ enabled: false }), /Etsy/);
  assert.equal(aboutAffiliateSentence({ enabled: false, etsyEnabled: false }), "");

  const bare = '<a href="https://www.etsy.com/search?q=wood+stove+accessories">Shop accessories on Etsy</a>';
  assert.equal(affiliateMarkupProblems(bare).some((problem) => /outside an affiliate block/.test(problem)), true);
});
