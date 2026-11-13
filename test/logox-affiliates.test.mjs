import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  LOGOX,
  LOGOX_DESTINATIONS,
  LOGOX_PLACEMENTS,
  aboutAffiliateSentence,
  affiliateMarkupProblems,
  disclosureView,
  logoxNote,
} from "../src/lib/affiliates.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function pageFile(path) {
  return `src/pages${path.replace(/\/$/, "")}.astro`;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(path, out);
    } else out.push(path);
  }
  return out;
}

function renderedNote(note) {
  const href = note.href.replaceAll("&", "&amp;");
  return `<aside class="affiliate-note" data-affiliate="logox">\n  <p><a href="${href}" rel="${note.rel}">${note.label}</a></p>\n  <p class="affiliate-disclosure">${note.disclosure}</p>\n</aside>`;
}

test("every LogOX link is an Awin deep link beside the disclosure", () => {
  assert.equal(LOGOX.merchantId, "94859");
  assert.equal(LOGOX.publisherId, "3131988");
  assert.equal(LOGOX.rel, "sponsored nofollow noopener");
  assert.match(LOGOX.disclosure, /^Affiliate link:/);
  assert.equal(LOGOX_PLACEMENTS.length > 0, true);

  const component = read("src/components/LogoxNote.astro");
  assert.match(
    component,
    /<aside class="affiliate-note" data-affiliate="logox">\s*<p><a href=\{note\.href\} rel=\{note\.rel\}>\{note\.label\}<\/a><\/p>\s*<p class="affiliate-disclosure">\{note\.disclosure\}<\/p>\s*<\/aside>/,
  );
  assert.doesNotMatch(component, /\btarget=/);

  const seenDestinations = new Set();
  for (const placement of LOGOX_PLACEMENTS) {
    const destination = LOGOX_DESTINATIONS[placement.destinationId];
    assert.ok(destination, placement.destinationId);
    assert.match(destination.verifiedTitle, /\S/);
    seenDestinations.add(destination.url);
    const note = logoxNote(placement.path);
    assert.ok(note);
    const url = new URL(note.href);
    assert.equal(`${url.origin}${url.pathname}`, "https://www.awin1.com/cread.php");
    assert.equal(url.searchParams.get("awinmid"), "94859");
    assert.equal(url.searchParams.get("awinaffid"), "3131988");
    assert.equal(url.searchParams.get("ued"), destination.url);
    assert.equal(note.rel, "sponsored nofollow noopener");
    assert.match(note.rel, /\bsponsored\b/);
    assert.equal(note.disclosure, LOGOX.disclosure);
    assert.equal(note.label, "Firewood tools from LogOX");
    const problems = affiliateMarkupProblems(renderedNote(note));
    assert.deepEqual(problems, [], problems.join("; "));

    const page = read(pageFile(placement.path));
    const marker = `<LogoxNote path="${placement.path}" />`;
    assert.equal(page.includes(marker), true, placement.path);
    assert.equal(page.split(marker).length, 2, placement.path);
  }

  assert.equal(logoxNote("/pellet-stoves/"), null);
  assert.equal(logoxNote("/firewood-btu-chart/", { enabled: false }), null);
  assert.equal(aboutAffiliateSentence({ enabled: false }), "");
  const hidden = disclosureView({ enabled: false });
  assert.equal(hidden.placements.length, 0);
  assert.match(hidden.description, /no affiliate links/);
  assert.equal(hidden.paragraphs.some((paragraph) => /Awin|LogOX/.test(paragraph)), false);
});

test("LogOX merchant URLs stay in the helper, and the disclosure names Awin and LogOX", () => {
  const component = "src/components/LogoxNote.astro";
  const placed = new Set(LOGOX_PLACEMENTS.map((item) => pageFile(item.path)));
  const skip = new Set([
    join(root, "src/lib/affiliates.js"),
    join(root, "test/logox-affiliates.test.mjs"),
  ]);
  for (const file of walk(root)) {
    if (skip.has(file)) continue;
    const rel = file.slice(root.length + 1).replaceAll("\\", "/");
    if (!/\.(astro|js|mjs|html|css|txt|md)$/.test(rel)) continue;
    const text = readFileSync(file, "utf8");
    assert.equal(/thelogox\.com|awin1\.com|awinmid|awinaffid/.test(text), false, rel);
    if (rel === component || rel === "src/styles/global.css" || placed.has(rel)) continue;
    assert.equal(text.includes("LogoxNote"), false, rel);
    assert.equal(text.includes("affiliate-note"), false, rel);
  }

  const view = disclosureView();
  const about = read("src/pages/about.astro");
  const disclosure = read("src/pages/disclosure.astro");
  assert.match(about, /aboutAffiliateSentence/);
  assert.match(disclosure, /disclosureView/);
  assert.match(aboutAffiliateSentence(), /LogOX/);
  assert.match(aboutAffiliateSentence(), /Awin/);
  const copy = `${view.description}\n${view.paragraphs.join("\n")}`;
  assert.match(copy, /Awin/);
  assert.match(copy, /LogOX/);
  assert.match(copy, new RegExp(LOGOX.disclosure.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(copy, /\b(best|top-rated|recommend\w*|scores?)\b/i);
  assert.equal(view.placements.length, LOGOX_PLACEMENTS.length);
  assert.match(disclosure, /item\.destination/);
  for (const item of view.placements) {
    assert.match(item.destination, /^https:\/\/www\.thelogox\.com\//);
    assert.equal(view.placements.filter((row) => row.path === item.path).length, 1);
  }
});

test("a LogOX anchor outside the disclosed aside is rejected", () => {
  const bare = '<a href="https://www.thelogox.com/collections/tools">Firewood tools from LogOX</a>';
  const problems = affiliateMarkupProblems(bare);
  assert.equal(problems.length > 0, true);
  const note = logoxNote("/firewood-btu-chart/");
  const href = note.href.replaceAll("&", "&amp;");
  const missingRel = `<aside class="affiliate-note" data-affiliate="logox"><p><a href="${href}">${note.label}</a></p><p class="affiliate-disclosure">${note.disclosure}</p></aside>`;
  assert.equal(affiliateMarkupProblems(missingRel).some((problem) => /sponsored|rel/.test(problem)), true);
});
