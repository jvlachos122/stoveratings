import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HtmlValidate } from "html-validate";
import { LOGOX, LOGOX_DESTINATIONS, LOGOX_PLACEMENTS, affiliateMarkupProblems } from "../src/lib/affiliates.js";
import { formatCount } from "../src/lib/format.js";
import { glossaryParts, glossaryVisibleText, assertGlossaryCopy } from "../src/lib/glossary.js";
import {
  COST_CAVEAT,
  SEASON_FORMULA,
  seasonComparison,
  seasonCostFaqs,
  seasonCostNotes,
} from "../src/lib/pellet-wood-cost.js";
import {
  COMMON_SIZES,
  SIZE_TABLE_CAPTION,
  commonSizeRows,
  exampleAnswer,
  excludedHeatCount,
  excludedSentence,
  planningSentence,
  planningSpan,
  sizeAnchor,
  sizeFaqs,
  bandById,
  EXAMPLE_SQFT,
} from "../src/lib/stove-size.js";
import {
  LENGTH_TABLE_CAPTION,
  VOLUME_TABLE_CAPTION,
  exampleCaption,
  exampleRows,
  logAnswer,
  logFaqs,
  logSources,
  standardLengthRows,
  volumeTableRows,
} from "../src/lib/firebox-log-length.js";
import {
  MOISTURE_RETRIEVED,
  SIGN_CAPTION,
  SEASON_CAPTION,
  TARGET_CAPTION,
  assertMoistureCopy,
  moistureFaqs,
  moistureParts,
  moistureSources,
  moistureVisibleText,
} from "../src/lib/firewood-moisture.js";
import {
  GRADE_CAPTION,
  GRADES_RETRIEVED,
  assertGradeCopy,
  gradeParts,
  gradeVisibleText,
} from "../src/lib/pellet-fuel-grades.js";
import {
  AIRNOW_URL,
  BURN_RULES_CAPTION,
  BURN_WISE_URL,
  LINKS_CHECKED,
  assertBurnCopy,
  burnRuleParts,
  burnRuleVisibleText,
  isOfficialBurnUrl,
} from "../src/lib/burn-rules.js";
import { catalog, stovesForBrand } from "../src/lib/catalog.js";
import { brandHubAnswer, brandHubDescription, brandHubTitle } from "../src/lib/brand-hub-facts.js";
import { site as siteMeta } from "../src/lib/site.js";
import {
  currentInsertRows,
  insertFinderSentences,
  insertRowView,
} from "../src/lib/insert-finder.js";
import {
  efficiencyFinderSentences,
  efficiencyRowView,
  efficiencyRows,
} from "../src/lib/efficiency-finder.js";
import {
  emissionFinderSentences,
  emissionListTitle,
  emissionMetaDescription,
  emissionRows,
} from "../src/lib/emission-finder.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const site = "https://stoveratings.com";
const hidden = new Set(JSON.parse(readFileSync(join(root, "data/noindex-paths.json"), "utf8")));
const redirects = JSON.parse(readFileSync(join(root, "data/brand-redirects.json"), "utf8"));
const compareRedirects = JSON.parse(readFileSync(join(root, "data/compare-redirects.json"), "utf8"));
const redirectCanonical = new Map(
  [...redirects, ...compareRedirects].map((row) => [row.url, new URL(row.targetUrl, site).href]),
);
const errors = [];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (entry.endsWith(".html")) files.push(path);
  }
  return files;
}

function expectedCanonical(file) {
  const rel = file.slice(dist.length).replaceAll("\\", "/");
  const pagePath = pathFor(file);
  if (redirectCanonical.has(pagePath)) return redirectCanonical.get(pagePath);
  if (rel === "/404.html") return `${site}/404.html`;
  if (rel === "/finder/index.html") return `${site}/`;
  if (rel === "/compare/tool/index.html") return `${site}/compare/`;
  if (rel === "/index.html") return `${site}/`;
  if (rel.endsWith("/index.html")) return site + rel.slice(0, -"index.html".length);
  return site + rel;
}

function pathFor(file) {
  const rel = file.slice(dist.length).replaceAll("\\", "/");
  if (rel === "/404.html") return "/404.html";
  if (rel === "/index.html") return "/";
  if (rel.endsWith("/index.html")) return rel.slice(0, -"index.html".length);
  return rel;
}

const validator = new HtmlValidate({
  extends: ["html-validate:recommended"],
  elements: ["html5"],
  rules: {
    "long-title": "off",
    "no-trailing-whitespace": "off",
    "void-style": "off",
    "tel-non-breaking": "off",
    "prefer-native-element": "off",
    "no-inline-style": "off",
    "svg-focusable": "off",
    "script-type": "off",
    "wcag/h63": "off",
    "input-missing-label": "error",
  },
});

const files = walk(dist);
let logoxBlocks = 0;
let sponsoredRels = 0;
for (const file of files) {
  const html = readFileSync(file, "utf8");
  const rel = file.slice(dist.length);
  const pagePath = pathFor(file);
  if (!html.startsWith("<!DOCTYPE html>")) errors.push(`${rel}: missing doctype`);
  if (!/<html[^>]*\slang="en"/.test(html)) errors.push(`${rel}: missing lang`);
  const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)];
  if (titles.length !== 1 || !titles[0][1].trim()) errors.push(`${rel}: title`);
  else if (/^\/compare\/[^/]+\/$/.test(pagePath) && pagePath !== "/compare/tool/" && !hidden.has(pagePath)) {
    if (titles[0][1].length > 65) errors.push(`${rel}: compare title length ${titles[0][1].length}`);
  }
  const descriptions = [...html.matchAll(/<meta name="description" content="([^"]*)"/g)];
  if (descriptions.length !== 1 || descriptions[0][1].trim().length < 40) errors.push(`${rel}: description`);
  const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]+)"/g)];
  if (canonicals.length !== 1 || canonicals[0][1] !== expectedCanonical(file)) {
    errors.push(`${rel}: canonical ${canonicals[0]?.[1] ?? "missing"} != ${expectedCanonical(file)}`);
  }
  const h1 = html.match(/<h1\b/g) || [];
  if (h1.length !== 1) errors.push(`${rel}: ${h1.length} h1`);
  if (!html.includes('id="main"')) errors.push(`${rel}: main`);
  const noindex = html.includes('content="noindex"');
  const shouldHide = pagePath === "/404.html" || hidden.has(pagePath);
  if (shouldHide && !noindex) errors.push(`${rel}: expected noindex`);
  if (!shouldHide && noindex) errors.push(`${rel}: unexpected noindex`);
  if (/<(?:script|link)\b[^>]*(?:src|href)="https?:\/\/(?!stoveratings\.com)/.test(html)) {
    errors.push(`${rel}: off-site script or stylesheet`);
  }
  for (const problem of affiliateMarkupProblems(html)) errors.push(`${rel}: ${problem}`);
  logoxBlocks += (html.match(/data-affiliate="logox"/g) || []).length;
  sponsoredRels += (html.match(/rel="sponsored/g) || []).length;
}
const expectedLogoxBlocks = LOGOX.enabled ? LOGOX_PLACEMENTS.length : 0;
if (logoxBlocks !== expectedLogoxBlocks) errors.push(`LogOX blocks ${logoxBlocks} != ${expectedLogoxBlocks}`);
if (sponsoredRels !== expectedLogoxBlocks) errors.push(`rel=sponsored ${sponsoredRels} != ${expectedLogoxBlocks}`);
if (LOGOX.enabled) {
  const disclosureHtml = readFileSync(join(dist, "disclosure/index.html"), "utf8");
  const aboutHtml = readFileSync(join(dist, "about/index.html"), "utf8");
  if (!disclosureHtml.includes("Awin") || !disclosureHtml.includes("LogOX") || !disclosureHtml.includes(LOGOX.disclosure)) {
    errors.push("disclosure: missing Awin, LogOX, or the on-page disclosure sentence");
  }
  if (!aboutHtml.includes("Awin") || !aboutHtml.includes("LogOX")) errors.push("about: missing Awin or LogOX");
  for (const placement of LOGOX_PLACEMENTS) {
    const destination = LOGOX_DESTINATIONS[placement.destinationId].url;
    if (!disclosureHtml.includes(placement.path) || !disclosureHtml.includes(destination)) {
      errors.push(`disclosure: missing ${placement.path}`);
    }
  }
}

function collectTypes(node, found) {
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, found);
    return;
  }
  if (!node || typeof node !== "object") return;
  const value = node["@type"];
  if (typeof value === "string") found.add(value);
  if (Array.isArray(value)) {
    for (const item of value) if (typeof item === "string") found.add(item);
  }
  for (const child of Object.values(node)) collectTypes(child, found);
}

const heating = files.find((file) => file.endsWith("/tools/heating-cost-calculator/index.html"));
if (!heating) errors.push("missing heating cost calculator page");
else {
  const html = readFileSync(heating, "utf8");
  if (!html.includes('class="answer"')) errors.push("heating cost: answer box");
  const answer = html.match(/<div class="answer">([\s\S]*?)<\/div>/);
  const paragraphs = answer ? answer[1].match(/<p>/g) : [];
  if (!paragraphs || paragraphs.length < 1 || paragraphs.length > 3) errors.push("heating cost: answer box sentences");
  const h1 = html.match(/<h1\b/g) || [];
  if (h1.length !== 1) errors.push(`heating cost: ${h1.length} h1`);
  if (!html.includes('rel="canonical" href="https://stoveratings.com/tools/heating-cost-calculator/"')) {
    errors.push("heating cost: canonical");
  }
  const descriptions = [...html.matchAll(/<meta name="description" content="([^"]*)"/g)];
  if (descriptions.length !== 1 || descriptions[0][1].trim().length < 40) errors.push("heating cost: description");
  const scripts = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scripts.length !== 1) errors.push(`heating cost: ${scripts.length} json-ld scripts`);
  else {
    let data;
    try {
      data = JSON.parse(scripts[0][1]);
    } catch {
      errors.push("heating cost: json-ld parse");
      data = null;
    }
    if (data) {
      const types = new Set();
      collectTypes(data, types);
      for (const required of ["BreadcrumbList", "WebApplication"]) {
        if (!types.has(required)) errors.push(`heating cost: missing ${required}`);
      }
      for (const banned of ["Product", "Review", "AggregateRating", "FAQPage"]) {
        if (types.has(banned)) errors.push(`heating cost: forbidden ${banned}`);
      }
      const graph = Array.isArray(data["@graph"]) ? data["@graph"] : [];
      const app = graph.find((node) => node["@type"] === "WebApplication");
      if (!app || app.creator?.["@type"] !== "Organization" || app.publisher?.["@type"] !== "Organization") {
        errors.push("heating cost: WebApplication creator and publisher must be Organization");
      }
    }
  }
  if (!html.includes('href="/pellet-stove-vs-wood-stove/#cost-per-season"')) {
    errors.push("heating cost: season comparison link");
  }
}

function decodeHtml(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

const seasonPage = files.find((file) => file.endsWith("/pellet-stove-vs-wood-stove/index.html"));
if (!seasonPage) errors.push("missing pellet and wood page");
else if (files.some((file) => file.includes("/tools/pellet-vs-wood-cost/"))) {
  errors.push("pellet vs wood cost: duplicate tool page");
} else {
  const html = decodeHtml(readFileSync(seasonPage, "utf8"));
  const meta = JSON.parse(readFileSync(join(root, "data/meta.json"), "utf8"));
  const stats = JSON.parse(readFileSync(join(root, "data/stats.json"), "utf8"));
  const view = seasonComparison({
    firewood: JSON.parse(readFileSync(join(root, "data/firewood.json"), "utf8")),
    heat: JSON.parse(readFileSync(join(root, "data/fuel-heat.json"), "utf8")),
    prices: JSON.parse(readFileSync(join(root, "data/fuel-prices.json"), "utf8")),
    woodMedian: stats.medians.currentWood,
    pelletMedian: stats.medians.currentPellet,
    snapshotDate: meta.snapshotDate,
  });
  const faqs = seasonCostFaqs(view);
  const notes = seasonCostNotes(view);
  if (!html.includes('class="answer"')) errors.push("pellet vs wood: answer box");
  if (!html.includes('id="cost-per-season"')) errors.push("pellet vs wood: cost section");
  if (!html.includes(view.caption)) errors.push("pellet vs wood: worked example caption");
  if (!html.includes(SEASON_FORMULA)) errors.push("pellet vs wood: formula");
  if (!html.includes(COST_CAVEAT)) errors.push("pellet vs wood: caveat");
  if (!html.includes(view.href)) errors.push("pellet vs wood: calculator link");
  if (!html.includes(`Last updated ${view.lastUpdated}`)) errors.push("pellet vs wood: last updated");
  for (const sentence of view.sentences) {
    if (!html.includes(sentence)) errors.push("pellet vs wood: worked sentence missing");
  }
  for (const row of view.rows) {
    if (!html.includes(row.wood) || !html.includes(row.pellet)) errors.push(`pellet vs wood: missing ${row.label}`);
  }
  for (const faq of faqs) {
    if (!html.includes(faq.question) || !html.includes(faq.answer)) errors.push(`pellet vs wood: FAQ missing ${faq.question}`);
  }
  for (const note of notes) {
    if (!html.includes(note)) errors.push("pellet vs wood: data note missing");
  }
  const mainStart = html.indexOf("<main");
  const mainEnd = html.indexOf("</main>");
  const main = mainStart >= 0 && mainEnd > mainStart ? html.slice(mainStart, mainEnd) : "";
  if (/\b(best|top-rated|recommend\w*)\b/i.test(main)) errors.push("pellet vs wood: banned wording");
  const scripts = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scripts.length !== 1) errors.push(`pellet vs wood: ${scripts.length} json-ld scripts`);
  else {
    let data;
    try {
      data = JSON.parse(scripts[0][1]);
    } catch {
      errors.push("pellet vs wood: json-ld parse");
      data = null;
    }
    if (data) {
      const types = new Set();
      collectTypes(data, types);
      for (const required of ["BreadcrumbList", "Article", "FAQPage"]) {
        if (!types.has(required)) errors.push(`pellet vs wood: missing ${required}`);
      }
      for (const banned of ["Product", "Review", "AggregateRating", "WebApplication"]) {
        if (types.has(banned)) errors.push(`pellet vs wood: forbidden ${banned}`);
      }
      const graph = Array.isArray(data["@graph"]) ? data["@graph"] : [];
      const faq = graph.find((node) => node["@type"] === "FAQPage");
      const questions = faq?.mainEntity || [];
      if (questions.length !== faqs.length) errors.push("pellet vs wood: FAQ count");
      for (const item of faqs) {
        const match = questions.find((question) => question.name === item.question);
        if (!match || match.acceptedAnswer?.text !== item.answer) errors.push(`pellet vs wood: FAQ JSON-LD ${item.question}`);
      }
    }
  }
}

const calculator = files.find((file) => file.endsWith("/tools/stove-size-calculator/index.html"));
if (!calculator) errors.push("missing stove size calculator page");
else {
  const html = readFileSync(calculator, "utf8").replaceAll("&#39;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
  const stoves = JSON.parse(readFileSync(join(root, "data/stoves.json"), "utf8"));
  const meta = JSON.parse(readFileSync(join(root, "data/meta.json"), "utf8"));
  if (!html.includes('class="answer"')) errors.push("stove size: answer box");
  const answer = html.match(/<div class="answer">([\s\S]*?)<\/div>/);
  const paragraphs = answer ? answer[1].match(/<p>/g) : [];
  if (!paragraphs || paragraphs.length !== 3) errors.push("stove size: answer box sentences");
  for (const sentence of exampleAnswer(stoves, meta.snapshotDate)) {
    if (!html.includes(sentence)) errors.push("stove size: answer sentence missing");
  }
  const exampleBand = bandById("moderate");
  if (!html.includes(planningSentence(EXAMPLE_SQFT, exampleBand))) errors.push("stove size: worked example");
  if (!html.includes(excludedSentence(excludedHeatCount(stoves)))) errors.push("stove size: excluded count");
  if (!html.includes("not listed by EPA") || !html.includes("not zero")) errors.push("stove size: blank wording");
  if (!html.includes("lab test range") || !html.includes("not a sizing guarantee")) errors.push("stove size: overlap caveat");
  const h1 = html.match(/<h1\b/g) || [];
  if (h1.length !== 1) errors.push(`stove size: ${h1.length} h1`);
  if (html.includes("/scripts/calculator.js")) errors.push("stove size: old calculator script");
  const scripts = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scripts.length !== 1) errors.push(`stove size: ${scripts.length} json-ld scripts`);
  else {
    let data;
    try {
      data = JSON.parse(scripts[0][1]);
    } catch {
      errors.push("stove size: json-ld parse");
      data = null;
    }
    if (data) {
      const types = new Set();
      collectTypes(data, types);
      for (const required of ["BreadcrumbList", "WebApplication", "FAQPage"]) {
        if (!types.has(required)) errors.push(`stove size: missing ${required}`);
      }
      for (const banned of ["Product", "Review", "AggregateRating"]) {
        if (types.has(banned)) errors.push(`stove size: forbidden ${banned}`);
      }
    }
  }
  for (const faq of sizeFaqs(stoves, meta.snapshotDate)) {
    if (!html.includes(faq.question) || !html.includes(faq.answer)) errors.push(`stove size: FAQ missing ${faq.question}`);
  }
  const tableMatch = html.match(/<table id="size-table">[\s\S]*?<\/table>/);
  if (!tableMatch) errors.push("stove size: common size table");
  else {
    const flat = tableMatch[0].replace(/<[^>]+>/g, "").replace(/\s+/g, "");
    if (!flat.includes(SIZE_TABLE_CAPTION.replace(/\s+/g, ""))) errors.push("stove size: size caption");
    const rows = commonSizeRows(stoves);
    const renderedRows = tableMatch[0].match(/<tr\b/g) || [];
    if (renderedRows.length !== rows.length + 1) errors.push(`stove size: ${renderedRows.length} table rows`);
    for (const row of rows) {
      const bit = `${row.band.label}${planningSpan(row.range)}${formatCount(row.wood)}${formatCount(row.pellet)}`;
      if (!flat.includes(bit)) errors.push(`stove size: missing ${row.sqft} ${row.band.id}`);
    }
    for (const sqft of COMMON_SIZES) {
      if (!tableMatch[0].includes(`id="${sizeAnchor(sqft)}"`)) errors.push(`stove size: missing #${sizeAnchor(sqft)}`);
    }
  }
  const mainStart = html.indexOf("<main");
  const mainEnd = html.indexOf("</main>");
  const main = mainStart >= 0 && mainEnd > mainStart ? html.slice(mainStart, mainEnd) : "";
  const prose = main.replace(/<tbody id="overlap-rows">[\s\S]*?<\/tbody>/, "");
  if (/\bbest\b/i.test(prose) || /\bright size\b/i.test(prose) || /\bscores?\b/i.test(prose)) {
    errors.push("stove size: banned wording");
  }
  const sources = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1]);
  const fetched = sources.some((src) => {
    const file = join(dist, src.replace(/^\//, "").split("?")[0]);
    return existsSync(file) && readFileSync(file, "utf8").includes("/data/size-overlap.json");
  });
  if (!fetched) errors.push("stove size: page script does not fetch /data/size-overlap.json");
  const overlapFile = join(dist, "data/size-overlap.json");
  if (!existsSync(overlapFile)) errors.push("stove size: missing size-overlap.json");
  else {
    const payload = JSON.parse(readFileSync(overlapFile, "utf8"));
    if (payload.snapshot !== meta.snapshotDate) errors.push("stove size: json snapshot");
    if (payload.excluded !== excludedHeatCount(stoves)) errors.push("stove size: json excluded count");
    if (!Array.isArray(payload.models) || payload.models.some((model) => model.lo == null || model.hi == null)) {
      errors.push("stove size: json heat output");
    }
  }
}

const logLength = files.find((file) => file.endsWith("/tools/firebox-log-length/index.html"));
if (!logLength) errors.push("missing firebox log length page");
else {
  const html = decodeHtml(readFileSync(logLength, "utf8"));
  const stoves = JSON.parse(readFileSync(join(root, "data/stoves.json"), "utf8"));
  const meta = JSON.parse(readFileSync(join(root, "data/meta.json"), "utf8"));
  if (!html.includes('class="answer"')) errors.push("log length: answer box");
  const answer = html.match(/<div class="answer">([\s\S]*?)<\/div>/);
  const paragraphs = answer ? answer[1].match(/<p>/g) : [];
  if (!paragraphs || paragraphs.length !== 3) errors.push("log length: answer box sentences");
  for (const sentence of logAnswer(stoves, meta.snapshotDate)) {
    if (!html.includes(sentence)) errors.push("log length: answer sentence missing");
  }
  if (!html.includes(exampleCaption())) errors.push("log length: example caption");
  for (const row of exampleRows()) {
    if (!html.includes(row.measured) || !html.includes(row.log)) errors.push(`log length: example ${row.side}`);
  }
  if (!html.includes(LENGTH_TABLE_CAPTION)) errors.push("log length: measures caption");
  for (const row of standardLengthRows()) {
    if (!html.includes(row.statement)) errors.push(`log length: measure ${row.measure}`);
  }
  const tableMatch = html.match(/<table id="volume-bands">[\s\S]*?<\/table>/);
  if (!tableMatch) errors.push("log length: volume table");
  else if (!tableMatch[0].includes(VOLUME_TABLE_CAPTION)) errors.push("log length: volume caption");
  else {
    for (const row of volumeTableRows(stoves)) {
      if (!tableMatch[0].includes(`id="band-${row.id}"`)) errors.push(`log length: missing #band-${row.id}`);
      if (!tableMatch[0].includes(`>${formatCount(row.count)}<`)) errors.push(`log length: count ${row.id}`);
      if (!tableMatch[0].includes(`href="${row.href}"`)) errors.push(`log length: link ${row.id}`);
    }
  }
  for (const faq of logFaqs(stoves, meta.snapshotDate)) {
    if (!html.includes(faq.question) || !html.includes(faq.answer)) errors.push(`log length: FAQ missing ${faq.question}`);
  }
  for (const source of logSources(meta.snapshotDate)) {
    if (!html.includes(source.href) || !html.includes(`Retrieved ${source.retrieved}`)) {
      errors.push(`log length: citation ${source.href}`);
    }
    if (source.href.includes("cfpub.epa.gov")) errors.push("log length: EPA application host");
  }
  const scripts = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scripts.length !== 1) errors.push(`log length: ${scripts.length} json-ld scripts`);
  else {
    let data;
    try {
      data = JSON.parse(scripts[0][1]);
    } catch {
      errors.push("log length: json-ld parse");
      data = null;
    }
    if (data) {
      const types = new Set();
      collectTypes(data, types);
      for (const required of ["BreadcrumbList", "WebApplication", "FAQPage"]) {
        if (!types.has(required)) errors.push(`log length: missing ${required}`);
      }
      for (const banned of ["Product", "Review", "AggregateRating"]) {
        if (types.has(banned)) errors.push(`log length: forbidden ${banned}`);
      }
      const faqs = logFaqs(stoves, meta.snapshotDate);
      const questions = data["@graph"]?.find((item) => item["@type"] === "FAQPage")?.mainEntity || [];
      if (questions.length !== faqs.length) errors.push("log length: FAQ count");
      for (const item of faqs) {
        const match = questions.find((question) => question.name === item.question);
        if (!match || match.acceptedAnswer?.text !== item.answer) errors.push(`log length: FAQ JSON-LD ${item.question}`);
      }
    }
  }
  const mainStart = html.indexOf("<main");
  const mainEnd = html.indexOf("</main>");
  const main = mainStart >= 0 && mainEnd > mainStart ? html.slice(mainStart, mainEnd) : "";
  if (/\bbest\b/i.test(main)) errors.push("log length: banned wording");
  if (main.includes("cfpub.epa.gov")) errors.push("log length: EPA application host");
  if (!html.includes('href="/small-wood-stoves/"') || !html.includes('href="/tools/stove-size-calculator/"')) {
    errors.push("log length: missing related links");
  }
}

const moistureFile = files.find((file) => file.endsWith("/firewood-moisture/index.html"));
if (!moistureFile) errors.push("missing firewood moisture page");
else {
  const html = decodeHtml(readFileSync(moistureFile, "utf8"));
  const parts = moistureParts();
  try {
    assertMoistureCopy(moistureVisibleText(parts));
  } catch (error) {
    errors.push(`firewood moisture: ${error.message}`);
  }
  if (!html.includes('class="answer"')) errors.push("firewood moisture: answer box");
  const answer = html.match(/<div class="answer">([\s\S]*?)<\/div>/);
  const paragraphs = answer ? answer[1].match(/<p>/g) : [];
  if (!paragraphs || paragraphs.length !== 3) errors.push("firewood moisture: answer box sentences");
  const answerAt = html.indexOf('class="answer"');
  const tableAt = html.indexOf("<table");
  if (answerAt < 0 || tableAt < 0 || answerAt > tableAt) errors.push("firewood moisture: answer box is not before the tables");
  for (const sentence of parts.sentences) {
    if (!html.includes(sentence)) errors.push("firewood moisture: answer sentence missing");
  }
  if (!html.includes(TARGET_CAPTION)) errors.push("firewood moisture: target caption");
  if (!html.includes(SEASON_CAPTION)) errors.push("firewood moisture: seasoning caption");
  if (!html.includes(SIGN_CAPTION)) errors.push("firewood moisture: sign caption");
  if (!html.includes(`Sources retrieved ${MOISTURE_RETRIEVED}`)) errors.push("firewood moisture: retrieved line");
  for (const row of parts.targets) {
    if (!html.includes(row.moisture) || !html.includes(row.basis) || !html.includes(row.retrieved)) {
      errors.push(`firewood moisture: target row ${row.id}`);
    }
  }
  for (const faq of moistureFaqs()) {
    if (!html.includes(faq.question) || !html.includes(faq.answer)) errors.push(`firewood moisture: FAQ missing ${faq.question}`);
  }
  for (const source of moistureSources()) {
    if (!html.includes(source.href) || !html.includes(`Retrieved ${source.retrieved}`)) {
      errors.push(`firewood moisture: citation ${source.href}`);
    }
    if (source.href.includes(["cf", "pub.epa.gov"].join(""))) errors.push("firewood moisture: EPA application host");
  }
  if (!html.includes('href="/glossary/#moisture-content"')) errors.push("firewood moisture: glossary anchor");
  if (!html.includes('href="/firewood-btu-chart/"')) errors.push("firewood moisture: heat chart link");
  if (!html.includes('href="/tools/heating-cost-calculator/"')) errors.push("firewood moisture: heating cost link");
  if (!html.includes('href="/tools/firebox-log-length/"')) errors.push("firewood moisture: log length link");
  if (html.includes('rel="sponsored') || html.includes("data-affiliate=")) errors.push("firewood moisture: affiliate link");
  const scripts = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scripts.length !== 1) errors.push(`firewood moisture: ${scripts.length} json-ld scripts`);
  else {
    let data;
    try {
      data = JSON.parse(scripts[0][1]);
    } catch {
      errors.push("firewood moisture: json-ld parse");
      data = null;
    }
    if (data) {
      const types = new Set();
      collectTypes(data, types);
      for (const required of ["BreadcrumbList", "Article", "FAQPage"]) {
        if (!types.has(required)) errors.push(`firewood moisture: missing ${required}`);
      }
      for (const banned of ["Product", "Review", "AggregateRating", "WebApplication", "Dataset"]) {
        if (types.has(banned)) errors.push(`firewood moisture: forbidden ${banned}`);
      }
      const questions = data["@graph"]?.find((item) => item["@type"] === "FAQPage")?.mainEntity || [];
      const faqs = moistureFaqs();
      if (questions.length !== faqs.length) errors.push("firewood moisture: FAQ count");
      for (const item of faqs) {
        const match = questions.find((question) => question.name === item.question);
        if (!match || match.acceptedAnswer?.text !== item.answer) errors.push(`firewood moisture: FAQ JSON-LD ${item.question}`);
      }
    }
  }
  const mainStart = html.indexOf("<main");
  const mainEnd = html.indexOf("</main>");
  const main = mainStart >= 0 && mainEnd > mainStart ? html.slice(mainStart, mainEnd).replace(/href="[^"]*"/g, "") : "";
  if (/\bbest\b/i.test(main)) errors.push("firewood moisture: banned wording");
  if (main.includes(["cf", "pub.epa.gov"].join(""))) errors.push("firewood moisture: EPA application host");
}

const gradesFile = files.find((file) => file.endsWith("/pellet-fuel-grades/index.html"));
if (!gradesFile) errors.push("missing pellet fuel grades page");
else {
  const html = decodeHtml(readFileSync(gradesFile, "utf8"));
  const meta = JSON.parse(readFileSync(join(root, "data/meta.json"), "utf8"));
  const stoves = JSON.parse(readFileSync(join(root, "data/stoves.json"), "utf8"));
  const parts = gradeParts(stoves, meta.snapshotDate);
  try {
    assertGradeCopy(gradeVisibleText(parts));
  } catch (error) {
    errors.push(`pellet fuel grades: ${error.message}`);
  }
  if (!html.includes('class="answer"')) errors.push("pellet fuel grades: answer box");
  const answer = html.match(/<div class="answer">([\s\S]*?)<\/div>/);
  const paragraphs = answer ? answer[1].match(/<p>/g) : [];
  if (!paragraphs || paragraphs.length !== 3) errors.push("pellet fuel grades: answer box sentences");
  const answerAt = html.indexOf('class="answer"');
  const tableAt = html.indexOf("<table");
  if (answerAt < 0 || tableAt < 0 || answerAt > tableAt) errors.push("pellet fuel grades: answer box is not before the table");
  for (const sentence of parts.sentences) {
    if (!html.includes(sentence)) errors.push("pellet fuel grades: answer sentence missing");
  }
  if (!html.includes(GRADE_CAPTION)) errors.push("pellet fuel grades: caption");
  if ((html.match(/<table\b/g) || []).length < 1) errors.push("pellet fuel grades: table");
  if (!html.includes(`Standard and regulatory pages retrieved ${GRADES_RETRIEVED}`)) {
    errors.push("pellet fuel grades: retrieved line");
  }
  for (const row of parts.rows) {
    for (const cell of [row.property, row.premium, row.standard, row.utility, row.a1, row.a2, row.b]) {
      if (!html.includes(cell)) errors.push(`pellet fuel grades: table cell ${row.property}`);
    }
  }
  for (const faq of parts.faqs) {
    if (!html.includes(faq.question) || !html.includes(faq.answer)) errors.push(`pellet fuel grades: FAQ missing ${faq.question}`);
  }
  for (const source of parts.sources) {
    if (!html.includes(source.href) || !html.includes(`Retrieved ${source.retrieved}`)) {
      errors.push(`pellet fuel grades: citation ${source.href}`);
    }
    if (source.href.includes(["cf", "pub.epa.gov"].join(""))) errors.push("pellet fuel grades: EPA application host");
  }
  for (const href of [
    "/glossary/#pellet-fuel-grade",
    "/pellet-stoves/",
    "/most-efficient-pellet-stoves/",
    "/cleanest-burning-pellet-stoves/",
    "/pellet-stove-vs-wood-stove/",
    "/tools/heating-cost-calculator/",
  ]) {
    if (!html.includes(`href="${href}"`)) errors.push(`pellet fuel grades: missing ${href}`);
  }
  if (html.includes('rel="sponsored') || html.includes("data-affiliate=")) errors.push("pellet fuel grades: affiliate link");
  const scripts = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scripts.length !== 1) errors.push(`pellet fuel grades: ${scripts.length} json-ld scripts`);
  else {
    let data;
    try {
      data = JSON.parse(scripts[0][1]);
    } catch {
      errors.push("pellet fuel grades: json-ld parse");
      data = null;
    }
    if (data) {
      const types = new Set();
      collectTypes(data, types);
      for (const required of ["BreadcrumbList", "Article", "FAQPage"]) {
        if (!types.has(required)) errors.push(`pellet fuel grades: missing ${required}`);
      }
      for (const banned of ["Product", "Review", "AggregateRating", "WebApplication", "Dataset"]) {
        if (types.has(banned)) errors.push(`pellet fuel grades: forbidden ${banned}`);
      }
      const questions = data["@graph"]?.find((item) => item["@type"] === "FAQPage")?.mainEntity || [];
      if (questions.length !== parts.faqs.length) errors.push("pellet fuel grades: FAQ count");
      for (const item of parts.faqs) {
        const match = questions.find((question) => question.name === item.question);
        if (!match || match.acceptedAnswer?.text !== item.answer) errors.push(`pellet fuel grades: FAQ JSON-LD ${item.question}`);
      }
    }
  }
  const mainStart = html.indexOf("<main");
  const mainEnd = html.indexOf("</main>");
  const main = mainStart >= 0 && mainEnd > mainStart ? html.slice(mainStart, mainEnd).replace(/href="[^"]*"/g, "") : "";
  if (/\b(best|safe)\b/i.test(main)) errors.push("pellet fuel grades: banned wording");
  if (main.includes(["cf", "pub.epa.gov"].join(""))) errors.push("pellet fuel grades: EPA application host");
  if (String(parts.counts.currentRows) && !html.includes(String(parts.counts.currentRows))) {
    errors.push("pellet fuel grades: computed row count missing");
  }
}

const burnRulesFile = files.find((file) => file.endsWith("/burn-rules/index.html"));
if (!burnRulesFile) errors.push("missing burn rules page");
else {
  const html = decodeHtml(readFileSync(burnRulesFile, "utf8"));
  const parts = burnRuleParts();
  try {
    assertBurnCopy(burnRuleVisibleText(parts));
  } catch (error) {
    errors.push(`burn rules: ${error.message}`);
  }
  if (!html.includes('class="answer"')) errors.push("burn rules: answer box");
  const answer = html.match(/<div class="answer">([\s\S]*?)<\/div>/);
  const paragraphs = answer ? answer[1].match(/<p>/g) : [];
  if (!paragraphs || paragraphs.length !== 3) errors.push("burn rules: answer box sentences");
  const answerAt = html.indexOf('class="answer"');
  const tableAt = html.indexOf("<table");
  const sourcesAt = html.indexOf("<h2>Sources</h2>");
  if (answerAt < 0 || tableAt < 0 || sourcesAt < 0 || answerAt > tableAt || tableAt > sourcesAt) {
    errors.push("burn rules: answer box, table, and sources are out of order");
  }
  for (const sentence of parts.sentences) {
    if (!html.includes(sentence)) errors.push("burn rules: answer sentence missing");
  }
  if (!html.includes(BURN_RULES_CAPTION)) errors.push("burn rules: caption");
  if (!html.includes(`Links checked on ${LINKS_CHECKED}`)) errors.push("burn rules: check date");
  if ((html.match(/<tbody>[\s\S]*?<\/tbody>/g) || []).length < 1) errors.push("burn rules: table body");
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  const rowCount = body ? (body[1].match(/<tr>/g) || []).length : 0;
  if (rowCount !== parts.rows.length) errors.push(`burn rules: ${rowCount} rows != ${parts.rows.length}`);
  for (const row of parts.rows) {
    if (!html.includes(row.state) || !html.includes(row.agency) || !html.includes(`href="${row.href}"`)) {
      errors.push(`burn rules: row ${row.state}`);
    }
    if (!isOfficialBurnUrl(row.href)) errors.push(`burn rules: unofficial URL ${row.state}`);
    if (row.href.includes(["cf", "pub.epa.gov"].join(""))) errors.push(`burn rules: EPA application host ${row.state}`);
  }
  if (!html.includes('href="/certified-before-2020/"') || !html.includes('href="/glossary/#burn-rules"')) {
    errors.push("burn rules: missing certification or glossary link");
  }
  if (!html.includes(`href="${BURN_WISE_URL}"`) || !html.includes(`href="${AIRNOW_URL}"`)) {
    errors.push("burn rules: missing federal pointer");
  }
  for (const faq of parts.faqs) {
    if (!html.includes(faq.question) || !html.includes(faq.answer)) errors.push(`burn rules: FAQ missing ${faq.question}`);
  }
  for (const source of parts.sources) {
    if (!html.includes(source.href) || !html.includes(`Retrieved ${source.retrieved}`)) {
      errors.push(`burn rules: citation ${source.href}`);
    }
  }
  if (html.includes('rel="sponsored') || html.includes("data-affiliate=")) errors.push("burn rules: affiliate link");
  const scripts = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scripts.length !== 1) errors.push(`burn rules: ${scripts.length} json-ld scripts`);
  else {
    let data;
    try {
      data = JSON.parse(scripts[0][1]);
    } catch {
      errors.push("burn rules: json-ld parse");
      data = null;
    }
    if (data) {
      const types = new Set();
      collectTypes(data, types);
      for (const required of ["BreadcrumbList", "Article", "FAQPage"]) {
        if (!types.has(required)) errors.push(`burn rules: missing ${required}`);
      }
      for (const banned of ["Product", "Review", "AggregateRating", "WebApplication", "Dataset"]) {
        if (types.has(banned)) errors.push(`burn rules: forbidden ${banned}`);
      }
      const questions = data["@graph"]?.find((item) => item["@type"] === "FAQPage")?.mainEntity || [];
      if (questions.length !== parts.faqs.length) errors.push("burn rules: FAQ count");
      for (const item of parts.faqs) {
        const match = questions.find((question) => question.name === item.question);
        if (!match || match.acceptedAnswer?.text !== item.answer) errors.push(`burn rules: FAQ JSON-LD ${item.question}`);
      }
    }
  }
  const mainStart = html.indexOf("<main");
  const mainEnd = html.indexOf("</main>");
  const main = mainStart >= 0 && mainEnd > mainStart ? html.slice(mainStart, mainEnd).replace(/href="[^"]*"/g, "") : "";
  if (/\b(best|safe)\b/i.test(main)) errors.push("burn rules: banned wording");
  if (main.includes(["cf", "pub.epa.gov"].join(""))) errors.push("burn rules: EPA application host");
  if (html.includes('content="noindex"')) errors.push("burn rules: unexpected noindex");
}

const glossaryFile = files.find((file) => file.endsWith("/glossary/index.html"));
if (!glossaryFile) errors.push("missing glossary page");
else {
  const html = decodeHtml(readFileSync(glossaryFile, "utf8"));
  const meta = JSON.parse(readFileSync(join(root, "data/meta.json"), "utf8"));
  const stoves = JSON.parse(readFileSync(join(root, "data/stoves.json"), "utf8"));
  const glossary = glossaryParts(stoves, meta.snapshotDate);
  try {
    assertGlossaryCopy(glossaryVisibleText(glossary));
  } catch (error) {
    errors.push(`glossary: ${error.message}`);
  }
  if (!html.includes('class="answer"')) errors.push("glossary: answer box");
  const answer = html.match(/<div class="answer">([\s\S]*?)<\/div>/);
  const paragraphs = answer ? answer[1].match(/<p>/g) : [];
  if (!paragraphs || paragraphs.length !== 3) errors.push("glossary: answer box sentences");
  for (const sentence of glossary.sentences) {
    if (!html.includes(sentence)) errors.push("glossary: answer sentence missing");
  }
  for (const item of glossary.terms) {
    if (!html.includes(`id="${item.id}"`)) errors.push(`glossary: missing #${item.id}`);
    for (const sentence of item.sentences) {
      if (!html.includes(sentence)) errors.push(`glossary: missing sentence for ${item.id}`);
    }
  }
  for (const group of glossary.groups) {
    if (!html.includes(`id="${group.id}"`)) errors.push(`glossary: missing #${group.id}`);
  }
  for (const faq of glossary.faqs) {
    if (!html.includes(faq.question) || !html.includes(faq.answer)) errors.push(`glossary: FAQ missing ${faq.question}`);
  }
  for (const source of glossary.sources) {
    if (!html.includes(source.href) || !html.includes(`Retrieved ${source.retrieved}`)) {
      errors.push(`glossary: citation ${source.href}`);
    }
  }
  const scripts = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scripts.length !== 1) errors.push(`glossary: ${scripts.length} json-ld scripts`);
  else {
    let data;
    try {
      data = JSON.parse(scripts[0][1]);
    } catch {
      errors.push("glossary: json-ld parse");
      data = null;
    }
    if (data) {
      const types = new Set();
      collectTypes(data, types);
      for (const required of ["BreadcrumbList", "Article", "FAQPage"]) {
        if (!types.has(required)) errors.push(`glossary: missing ${required}`);
      }
      for (const banned of ["Product", "Review", "AggregateRating", "DefinedTerm", "DefinedTermSet", "WebApplication"]) {
        if (types.has(banned)) errors.push(`glossary: forbidden ${banned}`);
      }
    }
  }
  const mainStart = html.indexOf("<main");
  const mainEnd = html.indexOf("</main>");
  const main = mainStart >= 0 && mainEnd > mainStart ? html.slice(mainStart, mainEnd).replace(/href="[^"]*"/g, "") : "";
  if (/\bbest\b/i.test(main)) errors.push("glossary: banned wording");
  if (main.includes("cfpub.epa.gov")) errors.push("glossary: EPA application host");
}

const insertsFile = files.find((file) => file.endsWith("/wood-stove-inserts/index.html"));
if (!insertsFile) errors.push("missing wood stove inserts page");
else {
  const html = decodeHtml(readFileSync(insertsFile, "utf8"));
  const rows = currentInsertRows(catalog.stoves, catalog.brandBySlug);
  const sentences = insertFinderSentences(catalog.stoves, catalog.meta.snapshotDate);
  if (!html.includes('class="answer"')) errors.push("inserts: answer box");
  const answer = html.match(/<div class="answer">([\s\S]*?)<\/div>/);
  const paragraphs = answer ? answer[1].match(/<p>/g) : [];
  if (!paragraphs || paragraphs.length !== 3) errors.push("inserts: answer box sentences");
  for (const sentence of sentences) {
    if (!html.includes(sentence)) errors.push("inserts: answer sentence missing");
  }
  const answerAt = html.indexOf('class="answer"');
  const tableAt = html.indexOf('id="insert-finder-table"');
  if (answerAt < 0 || tableAt < answerAt) errors.push("inserts: answer box is not before the finder table");
  const table = html.match(/<table id="insert-finder-table">[\s\S]*?<\/table>/);
  if (!table) errors.push("inserts: finder table missing");
  else {
    const body = table[0].match(/<tbody id="insert-finder-rows">([\s\S]*?)<\/tbody>/);
    const rendered = body ? body[1].match(/<tr\b/g) || [] : [];
    if (rendered.length !== rows.length) errors.push(`inserts: ${rendered.length} table rows != ${rows.length}`);
    for (const row of rows) {
      const view = insertRowView(row);
      if (!table[0].includes(`href="${view.modelUrl}"`)) errors.push(`inserts: missing stove ${view.modelUrl}`);
      if (view.brandUrl && !table[0].includes(`href="${view.brandUrl}"`)) errors.push(`inserts: missing brand ${view.brandUrl}`);
      if (view.attrs["data-id"] && !table[0].includes(`data-id="${view.attrs["data-id"]}"`)) {
        errors.push(`inserts: missing row ${view.attrs["data-id"]}`);
      }
    }
  }
  if (!html.includes('href="/tools/stove-size-calculator/"') || !html.includes('href="/tools/firebox-log-length/"')) {
    errors.push("inserts: missing calculator links");
  }
  if (!html.includes('data-affiliate="logox"')) errors.push("inserts: LogOX block missing");
  const expectedSponsored = LOGOX.enabled
    ? LOGOX_PLACEMENTS.filter((item) => item.path === "/wood-stove-inserts/").length
    : 0;
  const sponsored = (html.match(/rel="sponsored/g) || []).length;
  if (sponsored !== expectedSponsored) errors.push(`inserts: rel=sponsored ${sponsored} != ${expectedSponsored}`);
  if ((html.match(/data-affiliate="logox"/g) || []).length !== expectedSponsored) {
    errors.push("inserts: LogOX block count");
  }
  if (html.includes("cfpub.epa.gov")) errors.push("inserts: EPA application host");
  const mainStart = html.indexOf("<main");
  const mainEnd = html.indexOf("</main>");
  const main = mainStart >= 0 && mainEnd > mainStart ? html.slice(mainStart, mainEnd) : "";
  if (/\bbest\b/i.test(main) || /\brankings?\b/i.test(main) || /\bscores?\b/i.test(main)) {
    errors.push("inserts: banned wording");
  }
  const scripts = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scripts.length !== 1) errors.push(`inserts: ${scripts.length} json-ld scripts`);
  else {
    let data;
    try {
      data = JSON.parse(scripts[0][1]);
    } catch {
      errors.push("inserts: json-ld parse");
      data = null;
    }
    if (data) {
      const types = new Set();
      collectTypes(data, types);
      for (const required of ["BreadcrumbList", "Article", "WebApplication"]) {
        if (!types.has(required)) errors.push(`inserts: missing ${required}`);
      }
      for (const banned of ["Product", "Review", "AggregateRating", "FAQPage"]) {
        if (types.has(banned)) errors.push(`inserts: forbidden ${banned}`);
      }
    }
  }
  if (html.includes('content="noindex"')) errors.push("inserts: unexpected noindex");
  const moduleScripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1]);
  if (!moduleScripts.some((src) => src.startsWith("/_astro/") || src.startsWith("/scripts/"))) {
    errors.push("inserts: missing first-party script");
  }
}

const efficiencyFile = files.find((file) => file.endsWith("/most-efficient-wood-stoves/index.html"));
if (!efficiencyFile) errors.push("missing most efficient wood stoves page");
else if (files.some((file) => file.includes("/tools/efficiency-finder/") || file.includes("/most-efficient-wood-stove-filters/"))) {
  errors.push("efficiency: extra filter URL");
} else {
  const html = decodeHtml(readFileSync(efficiencyFile, "utf8"));
  const rows = efficiencyRows(catalog.stoves);
  const sentences = efficiencyFinderSentences(catalog.stoves, catalog.meta.snapshotDate);
  if (!html.includes('class="answer"')) errors.push("efficiency: answer box");
  const answer = html.match(/<div class="answer">([\s\S]*?)<\/div>/);
  const paragraphs = answer ? answer[1].match(/<p>/g) : [];
  if (!paragraphs || paragraphs.length !== 3) errors.push("efficiency: answer box sentences");
  for (const sentence of sentences) {
    if (!html.includes(sentence)) errors.push("efficiency: answer sentence missing");
  }
  const answerAt = html.indexOf('class="answer"');
  const tableAt = html.indexOf('id="efficiency-finder-table"');
  if (answerAt < 0 || tableAt < answerAt) errors.push("efficiency: answer box is not before the finder table");
  const table = html.match(/<table id="efficiency-finder-table">[\s\S]*?<\/table>/);
  if (!table) errors.push("efficiency: finder table missing");
  else {
    const body = table[0].match(/<tbody id="efficiency-finder-rows">([\s\S]*?)<\/tbody>/);
    const rendered = body ? body[1].match(/<tr\b/g) || [] : [];
    if (rendered.length !== rows.length) errors.push(`efficiency: ${rendered.length} table rows != ${rows.length}`);
    if (!rendered.length) errors.push("efficiency: no-JS list is empty");
    for (const row of rows) {
      const view = efficiencyRowView(row);
      if (!table[0].includes(`href="${view.modelUrl}"`)) errors.push(`efficiency: missing stove ${view.modelUrl}`);
      if (view.attrs["data-id"] && !table[0].includes(`data-id="${view.attrs["data-id"]}"`)) {
        errors.push(`efficiency: missing row ${view.attrs["data-id"]}`);
      }
    }
  }
  const unreported = html.match(/<tbody id="efficiency-finder-unreported-rows">([\s\S]*?)<\/tbody>/);
  const unreportedRows = unreported ? unreported[1].match(/<tr\b/g) || [] : [];
  if (!unreported || unreportedRows.length !== 0) errors.push("efficiency: unreported table is not an empty no-JS bucket");
  if (!html.includes(">Not reported<")) errors.push("efficiency: missing Not reported heading");
  if (!html.includes('href="/tools/stove-size-calculator/">Fits my space</a>')) errors.push("efficiency: fits my space link");
  if (!html.includes('href="/tools/firebox-log-length/"')) errors.push("efficiency: firebox log link");
  if (!html.includes("<noscript>")) errors.push("efficiency: noscript");
  const expectedSponsored = LOGOX.enabled
    ? LOGOX_PLACEMENTS.filter((item) => item.path === "/most-efficient-wood-stoves/").length
    : 0;
  const sponsored = (html.match(/rel="sponsored/g) || []).length;
  if (sponsored !== expectedSponsored) errors.push(`efficiency: rel=sponsored ${sponsored} != ${expectedSponsored}`);
  if ((html.match(/data-affiliate="logox"/g) || []).length !== expectedSponsored) errors.push("efficiency: LogOX block count");
  if (html.includes("cfpub.epa.gov")) errors.push("efficiency: EPA application host");
  const mainStart = html.indexOf("<main");
  const mainEnd = html.indexOf("</main>");
  const main = mainStart >= 0 && mainEnd > mainStart ? html.slice(mainStart, mainEnd) : "";
  const prose = main.replace(/<tbody[\s\S]*?<\/tbody>/g, "");
  if (/\bbest\b/i.test(prose) || /\brankings?\b/i.test(prose) || /\bscores?\b/i.test(prose) || /\btop-rated\b/i.test(prose) || /\brecommend/i.test(prose)) {
    errors.push("efficiency: banned wording");
  }
  const scripts = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scripts.length !== 1) errors.push(`efficiency: ${scripts.length} json-ld scripts`);
  else {
    let data;
    try {
      data = JSON.parse(scripts[0][1]);
    } catch {
      errors.push("efficiency: json-ld parse");
      data = null;
    }
    if (data) {
      const types = new Set();
      collectTypes(data, types);
      for (const required of ["BreadcrumbList", "Article", "WebApplication"]) {
        if (!types.has(required)) errors.push(`efficiency: missing ${required}`);
      }
      for (const banned of ["Product", "Review", "AggregateRating", "FAQPage"]) {
        if (types.has(banned)) errors.push(`efficiency: forbidden ${banned}`);
      }
    }
  }
  if (html.includes('content="noindex"')) errors.push("efficiency: unexpected noindex");
  const moduleScripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1]);
  if (!moduleScripts.some((src) => src.startsWith("/_astro/") || src.startsWith("/scripts/"))) {
    errors.push("efficiency: missing first-party script");
  }
  if (!moduleScripts.every((src) => src.startsWith("/") && !src.startsWith("//"))) {
    errors.push("efficiency: off-site script");
  }
}

const emissionFile = files.find((file) => file.endsWith("/cleanest-burning-wood-stoves/index.html"));
if (!emissionFile) errors.push("missing cleanest burning wood stoves page");
else if (files.some((file) => file.includes("/tools/emission-finder/") || file.includes("/cleanest-burning-wood-stove-filters/"))) {
  errors.push("emission: extra filter URL");
} else {
  const html = decodeHtml(readFileSync(emissionFile, "utf8"));
  const rows = emissionRows(catalog.stoves);
  const sentences = emissionFinderSentences(catalog.stoves, catalog.meta.snapshotDate);
  const title = `${emissionListTitle(rows)} · ${siteMeta.name}`;
  const description = emissionMetaDescription(catalog.stoves, catalog.meta.snapshotDate);
  if (!html.includes(`<title>${title}</title>`)) errors.push("emission: title");
  if (!html.includes(`content="${description}"`)) errors.push("emission: description");
  if (title.length > 60 + ` · ${siteMeta.name}`.length) errors.push(`emission: title length ${title.length}`);
  if (!html.includes('class="answer"')) errors.push("emission: answer box");
  const answer = html.match(/<div class="answer">([\s\S]*?)<\/div>/);
  const paragraphs = answer ? answer[1].match(/<p>/g) : [];
  if (!paragraphs || paragraphs.length < 1 || paragraphs.length > 3) errors.push("emission: answer box sentences");
  for (const sentence of sentences) {
    if (!html.includes(sentence)) errors.push("emission: answer sentence missing");
  }
  const answerAt = html.indexOf('class="answer"');
  const tableAt = html.indexOf('id="emission-finder-table"');
  if (answerAt < 0 || tableAt < answerAt) errors.push("emission: answer box is not before the finder table");
  const table = html.match(/<table id="emission-finder-table">[\s\S]*?<\/table>/);
  if (!table) errors.push("emission: finder table missing");
  else {
    if (!table[0].includes("<caption")) errors.push("emission: caption missing");
    const body = table[0].match(/<tbody id="emission-finder-rows">([\s\S]*?)<\/tbody>/);
    const rendered = body ? body[1].match(/<tr\b/g) || [] : [];
    if (rendered.length !== rows.length) errors.push(`emission: ${rendered.length} table rows != ${rows.length}`);
    if (!rendered.length) errors.push("emission: no-JS list is empty");
    for (const row of rows) {
      const view = efficiencyRowView(row);
      if (!table[0].includes(`href="${view.modelUrl}"`)) errors.push(`emission: missing stove ${view.modelUrl}`);
      if (view.attrs["data-id"] && !table[0].includes(`data-id="${view.attrs["data-id"]}"`)) {
        errors.push(`emission: missing row ${view.attrs["data-id"]}`);
      }
    }
  }
  const unreported = html.match(/<tbody id="emission-finder-unreported-rows">([\s\S]*?)<\/tbody>/);
  const unreportedRows = unreported ? unreported[1].match(/<tr\b/g) || [] : [];
  if (!unreported || unreportedRows.length !== 0) errors.push("emission: unreported table is not an empty no-JS bucket");
  if (!html.includes(">Not reported<")) errors.push("emission: missing Not reported heading");
  if (!html.includes("<noscript>")) errors.push("emission: noscript");
  if (!html.includes('href="/cleanest-burning-pellet-stoves/"')) errors.push("emission: pellet list link");
  const expectedSponsored = LOGOX.enabled
    ? LOGOX_PLACEMENTS.filter((item) => item.path === "/cleanest-burning-wood-stoves/").length
    : 0;
  const sponsored = (html.match(/rel="sponsored/g) || []).length;
  if (sponsored !== expectedSponsored) errors.push(`emission: rel=sponsored ${sponsored} != ${expectedSponsored}`);
  if ((html.match(/data-affiliate="logox"/g) || []).length !== expectedSponsored) errors.push("emission: LogOX block count");
  if (html.includes("cfpub.epa.gov")) errors.push("emission: EPA application host");
  const mainStart = html.indexOf("<main");
  const mainEnd = html.indexOf("</main>");
  const main = mainStart >= 0 && mainEnd > mainStart ? html.slice(mainStart, mainEnd) : "";
  const prose = main.replace(/<tbody[\s\S]*?<\/tbody>/g, "");
  if (/\bbest\b/i.test(prose) || /\brankings?\b/i.test(prose) || /\bscores?\b/i.test(prose) || /\btop-rated\b/i.test(prose) || /\brecommend/i.test(prose)) {
    errors.push("emission: banned wording");
  }
  const scripts = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scripts.length !== 1) errors.push(`emission: ${scripts.length} json-ld scripts`);
  else {
    let data;
    try {
      data = JSON.parse(scripts[0][1]);
    } catch {
      errors.push("emission: json-ld parse");
      data = null;
    }
    if (data) {
      const types = new Set();
      collectTypes(data, types);
      for (const required of ["BreadcrumbList", "Article", "WebApplication"]) {
        if (!types.has(required)) errors.push(`emission: missing ${required}`);
      }
      for (const banned of ["Product", "Review", "AggregateRating", "FAQPage"]) {
        if (types.has(banned)) errors.push(`emission: forbidden ${banned}`);
      }
    }
  }
  if (html.includes('content="noindex"')) errors.push("emission: unexpected noindex");
  const moduleScripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1]);
  if (!moduleScripts.some((src) => src.startsWith("/_astro/") || src.startsWith("/scripts/"))) {
    errors.push("emission: missing first-party script");
  }
  if (!moduleScripts.every((src) => src.startsWith("/") && !src.startsWith("//"))) {
    errors.push("emission: off-site script");
  }
}

const brandBanned = /\b(best|top-rated|recommend\w*|rankings?|scores?)\b/i;
for (const brand of catalog.brands) {
  const file = join(dist, brand.url.slice(1), "index.html");
  if (!existsSync(file)) {
    errors.push(`brand hub missing ${brand.url}`);
    continue;
  }
  const html = decodeHtml(readFileSync(file, "utf8"));
  const lines = stovesForBrand(brand.slug);
  const sentences = brandHubAnswer(brand, lines, catalog.meta.snapshotDate);
  const title = `${brandHubTitle(brand, lines)} · ${siteMeta.name}`;
  const description = brandHubDescription(brand, lines, catalog.meta.snapshotDate);
  if (!html.includes(`<title>${title}</title>`)) errors.push(`${brand.url}: title`);
  if (!html.includes(`content="${description}"`)) errors.push(`${brand.url}: description`);
  if (!html.includes('class="answer"')) errors.push(`${brand.url}: answer box`);
  const answer = html.match(/<div class="answer">([\s\S]*?)<\/div>/);
  const paragraphs = answer ? answer[1].match(/<p>/g) : [];
  if (!paragraphs || paragraphs.length < 1 || paragraphs.length > 3) errors.push(`${brand.url}: answer box sentences`);
  for (const sentence of sentences) {
    if (!html.includes(sentence)) errors.push(`${brand.url}: answer sentence missing`);
  }
  if (answer && brandBanned.test(answer[1])) errors.push(`${brand.url}: banned wording`);
  const answerAt = html.indexOf('class="answer"');
  const tableAt = html.indexOf('id="brand-hub-finder-table"');
  if (answerAt < 0 || tableAt < answerAt) errors.push(`${brand.url}: answer box is not before the table`);
  const table = html.match(/<table id="brand-hub-finder-table"[\s\S]*?<\/table>/);
  if (!table) errors.push(`${brand.url}: table missing`);
  else if (!table[0].includes("<caption")) errors.push(`${brand.url}: caption missing`);
  const body = html.match(/<tbody id="brand-hub-finder-rows">([\s\S]*?)<\/tbody>/);
  const rendered = body ? body[1].match(/<tr\b/g) || [] : [];
  if (rendered.length !== lines.length) errors.push(`${brand.url}: ${rendered.length} table rows != ${lines.length}`);
  for (const stove of lines) {
    if (!html.includes(`href="${stove.url}"`)) errors.push(`${brand.url}: missing ${stove.url}`);
  }
  const unreported = html.match(/<tbody id="brand-hub-finder-unreported-rows">([\s\S]*?)<\/tbody>/);
  const unreportedRows = unreported ? unreported[1].match(/<tr\b/g) || [] : [];
  if (!unreported || unreportedRows.length !== 0) errors.push(`${brand.url}: unreported table is not an empty no-JS bucket`);
  if (!html.includes("<noscript>")) errors.push(`${brand.url}: noscript`);
  if (!html.includes('id="brand-hub-certification"')) errors.push(`${brand.url}: certification filter`);
  if (html.includes("cfpub.epa.gov")) errors.push(`${brand.url}: EPA application host`);
  if (html.includes('content="noindex"')) errors.push(`${brand.url}: unexpected noindex`);
  const scripts = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  if (scripts.length !== 1) errors.push(`${brand.url}: ${scripts.length} json-ld scripts`);
  else {
    let data;
    try {
      data = JSON.parse(scripts[0][1]);
    } catch {
      errors.push(`${brand.url}: json-ld parse`);
      data = null;
    }
    if (data) {
      const types = new Set();
      collectTypes(data, types);
      for (const required of ["BreadcrumbList", "Dataset"]) {
        if (!types.has(required)) errors.push(`${brand.url}: missing ${required}`);
      }
      for (const banned of ["Product", "Review", "AggregateRating", "FAQPage"]) {
        if (types.has(banned)) errors.push(`${brand.url}: forbidden ${banned}`);
      }
    }
  }
}

let reported = 0;
for (const file of files) {
  const report = await validator.validateFile(file);
  if (report.valid) continue;
  for (const result of report.results) {
    for (const message of result.messages) {
      if (message.severity < 2) continue;
      reported += 1;
      if (reported <= 40) errors.push(`${file.slice(dist.length)}:${message.line} ${message.ruleId} ${message.message}`);
    }
  }
}

if (errors.length) {
  console.error(errors.slice(0, 40).join("\n"));
  console.error(`${errors.length} HTML problems`);
  process.exit(1);
}
console.log(`HTML OK across ${files.length} files.`);
