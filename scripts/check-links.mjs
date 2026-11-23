import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homeBrandHubs } from "../src/lib/brand-hubs.js";
import { catalog, stovesForBrand } from "../src/lib/catalog.js";
import { currentInsertRows } from "../src/lib/insert-finder.js";
import { efficiencyRows } from "../src/lib/efficiency-finder.js";
import { centralKind, inserts, pelletStoves, rankByEfficiency, rankByEmission, relatedLists, woodSubtype } from "../src/lib/lists.js";
import { brandModelLabel, neighborSections } from "../src/lib/model-neighbors.js";
import { splitSmallWoodRows } from "../src/lib/small-wood-stoves.js";
import { isSitemapLastmod, isW3cDateTime, lastmodInstant } from "../src/lib/sitemap-lastmod.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const site = "https://stoveratings.com";
const hidden = new Set(JSON.parse(readFileSync(join(root, "data/noindex-paths.json"), "utf8")));
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

function decodeAttr(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function attrs(tag) {
  const found = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*"([^"]*)"/g)) found[match[1]] = decodeAttr(match[2]);
  return found;
}

function pageUrl(file) {
  const rel = normalize(file.slice(dist.length)).replaceAll("\\", "/");
  if (rel === "/index.html") return "/";
  if (rel.endsWith("/index.html")) return rel.slice(0, -"index.html".length);
  return rel;
}

function fileForPath(urlPath) {
  const path = urlPath.split("#")[0].split("?")[0];
  if (path === "/" || path === "") return join(dist, "index.html");
  if (path.endsWith(".html") || path.includes(".")) return join(dist, path);
  return join(dist, path.replace(/\/$/, ""), "index.html");
}

function idsIn(html) {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
}

const files = walk(dist);
const htmlByFile = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
const linksFrom = new Map();

for (const [file, html] of htmlByFile) {
  const ids = idsIn(html);
  if (ids.size !== [...html.matchAll(/\sid="([^"]+)"/g)].length) errors.push(`${file}: duplicate id`);
  const tags = html.match(/<(?:a|link|script|img|form)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attributes = attrs(tag);
    const raw = attributes.href || attributes.src || attributes.action;
    if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;
    let url;
    if (raw.startsWith(site)) url = new URL(raw);
    else if (raw.startsWith("/")) url = new URL(raw, site);
    else if (raw.startsWith("#")) url = new URL(pageUrl(file) + raw, site);
    else if (/^https?:\/\//.test(raw)) continue;
    else {
      errors.push(`${file}: relative URL ${raw}`);
      continue;
    }
    if (url.origin !== new URL(site).origin) continue;
    const target = fileForPath(url.pathname);
    if (!existsSync(target)) {
      errors.push(`${file}: missing ${url.pathname}`);
      continue;
    }
    if (/^<a\b/i.test(tag)) {
      const from = pageUrl(file);
      let dest = url.pathname === "/index.html" ? "/" : url.pathname;
      if (dest !== "/" && !dest.endsWith("/") && !dest.includes(".")) dest = `${dest}/`;
      if (!linksFrom.has(from)) linksFrom.set(from, new Set());
      linksFrom.get(from).add(dest);
    }
    if (url.hash) {
      const id = decodeURIComponent(url.hash.slice(1));
      const targetHtml = htmlByFile.get(resolve(target)) || readFileSync(target, "utf8");
      if (!idsIn(targetHtml).has(id)) errors.push(`${file}: missing #${id} on ${url.pathname}`);
    }
  }
}

for (const required of [
  "data/current.json",
  "data/historical.json",
  "data/names.json",
  "favicon.svg",
  "favicon.ico",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "site.webmanifest",
  "og-image.png",
  "robots.txt",
  "CNAME",
  "llms.txt",
  "fonts/ibm-plex-sans-latin-400-normal.woff2",
  "data/heating-cost.json",
]) {
  if (!existsSync(join(dist, required))) errors.push(`missing dist/${required}`);
}

const cname = readFileSync(join(dist, "CNAME"), "utf8").trim();
if (cname !== "stoveratings.com") errors.push(`CNAME is ${cname}`);

const sitemapFiles = readdirSync(dist).filter((name) => name.startsWith("sitemap") && name.endsWith(".xml"));
if (!sitemapFiles.length) errors.push("missing sitemap");
const seen = new Set();
for (const name of sitemapFiles) {
  const xml = readFileSync(join(dist, name), "utf8");
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = new URL(match[1]);
    seen.add(url.pathname);
    if (url.origin !== site) errors.push(`sitemap off-site ${match[1]}`);
    if (url.pathname.includes("404")) errors.push(`sitemap includes 404 ${match[1]}`);
    if (hidden.has(url.pathname)) errors.push(`sitemap includes noindex ${url.pathname}`);
    const target = fileForPath(url.pathname);
    if (!existsSync(target)) errors.push(`sitemap missing ${url.pathname}`);
  }
}
const indexable = new Set();
for (const file of files) {
  const path = pageUrl(file);
  if (path === "/404.html" || path.includes("/404")) continue;
  if (hidden.has(path)) continue;
  indexable.add(path);
}
for (const path of indexable) {
  if (!seen.has(path)) errors.push(`indexable page missing from sitemap ${path}`);
}
for (const path of seen) {
  if (path.endsWith(".xml")) continue;
  if (!indexable.has(path)) errors.push(`sitemap URL is not an indexable page ${path}`);
}

const heatingPath = join(dist, "tools/heating-cost-calculator/index.html");
const heatingHtml = htmlByFile.get(heatingPath) || "";
const heatingBytes = Buffer.byteLength(heatingHtml);
if (heatingBytes > 100_000) errors.push(`heating cost HTML is ${heatingBytes} bytes`);
if (heatingHtml.includes('id="heating-data"')) errors.push("heating cost still inlines heating-data");
const heatingJsonPath = join(dist, "data/heating-cost.json");
if (existsSync(heatingJsonPath)) {
  const heatingJson = JSON.parse(readFileSync(heatingJsonPath, "utf8"));
  if (heatingJson.models?.length !== catalog.stoves.length) {
    errors.push(`heating-cost.json models ${heatingJson.models?.length} != ${catalog.stoves.length}`);
  }
  if (!heatingHtml.includes('class="answer"') || !heatingHtml.includes("<table")) {
    errors.push("heating cost page is missing the server-rendered answer or table");
  }
}

for (const brand of catalog.brands) {
  const html = htmlByFile.get(resolve(fileForPath(brand.url))) || "";
  if (!html) {
    errors.push(`missing brand hub ${brand.url}`);
    continue;
  }
  for (const stove of stovesForBrand(brand.slug)) {
    if (!html.includes(`href="${stove.url}"`)) errors.push(`${brand.url} does not link to ${stove.url}`);
  }
}
for (const stove of catalog.stoves) {
  if (!stove.indexable || hidden.has(stove.url)) continue;
  const html = htmlByFile.get(resolve(fileForPath(stove.url))) || "";
  if (!html) {
    errors.push(`missing stove page ${stove.url}`);
    continue;
  }
  const brand = catalog.brandBySlug.get(stove.primarySlug);
  if (!brand || !html.includes(`href="${brand.url}"`)) errors.push(`${stove.url} does not link to its brand`);
  for (const list of relatedLists(stove)) {
    if (!html.includes(`href="${list.href}"`)) errors.push(`${stove.url} does not link to ${list.href}`);
  }
}

const MAX_CLICKS = 3;
const depth = new Map([["/", 0]]);
const queue = ["/"];
while (queue.length) {
  const current = queue.shift();
  const hops = depth.get(current);
  if (hops >= MAX_CLICKS) continue;
  for (const next of linksFrom.get(current) || []) {
    if (depth.has(next)) continue;
    depth.set(next, hops + 1);
    queue.push(next);
  }
}
const directFromHome = [
  "/tools/heating-cost-calculator/",
  "/lookup/",
  "/compare/",
  "/most-efficient-wood-stoves/",
  "/most-efficient-pellet-stoves/",
  "/cleanest-burning-wood-stoves/",
  "/cleanest-burning-pellet-stoves/",
  "/wood-stove-tax-credit/",
  "/brands/",
  ...homeBrandHubs().map((brand) => brand.url),
];
for (const href of directFromHome) {
  if (depth.get(href) !== 1) errors.push(`home does not link directly to ${href} (depth ${depth.get(href) ?? "none"})`);
}
const homeHtml = htmlByFile.get(join(dist, "index.html")) || "";
if (!homeHtml.includes(">Browse all brands<")) errors.push("home is missing the footer link Browse all brands");
let beyond = 0;
for (const pathname of seen) {
  if (pathname.endsWith(".xml")) continue;
  const hops = depth.get(pathname);
  if (hops == null || hops > MAX_CLICKS) {
    beyond += 1;
    if (beyond <= 15) errors.push(`sitemap URL not within ${MAX_CLICKS} clicks of home: ${pathname} (${hops ?? "unreachable"})`);
  }
}
if (beyond > 15) errors.push(`${beyond} sitemap URLs are beyond ${MAX_CLICKS} clicks`);

for (const rankedPath of [
  "/most-efficient-wood-stoves/",
  "/most-efficient-pellet-stoves/",
  "/cleanest-burning-wood-stoves/",
  "/cleanest-burning-pellet-stoves/",
]) {
  if (!seen.has(rankedPath)) errors.push(`sitemap missing ${rankedPath}`);
}
if (!seen.has("/tools/stove-size-calculator/")) errors.push("sitemap missing stove size calculator");
if (!seen.has("/")) errors.push("sitemap missing home");
if (!seen.has("/compare/")) errors.push("sitemap missing compare index");
if (seen.has("/compare/tool/")) errors.push("sitemap includes compare tool");
const comparePairs = [...seen].filter((pathname) => /^\/compare\/[^/]+\/$/.test(pathname) && pathname !== "/compare/tool/");
const compareRedirects = JSON.parse(readFileSync(join(root, "data/compare-redirects.json"), "utf8"));
const compareTargets = new Set(compareRedirects.map((row) => row.targetUrl));
if (comparePairs.length !== compareTargets.size) errors.push(`sitemap compare pairs ${comparePairs.length}`);
for (const pathname of comparePairs) {
  if (!compareTargets.has(pathname)) errors.push(`sitemap unexpected compare ${pathname}`);
}
const redirects = JSON.parse(readFileSync(join(root, "data/brand-redirects.json"), "utf8"));
for (const redirect of redirects) {
  if (!seen.has(redirect.targetUrl)) errors.push(`sitemap missing redirect target ${redirect.targetUrl}`);
  if (seen.has(redirect.url)) errors.push(`sitemap includes redirected hub ${redirect.url}`);
  const page = fileForPath(redirect.url);
  if (!existsSync(page)) {
    errors.push(`missing redirect page ${redirect.url}`);
    continue;
  }
  const html = readFileSync(page, "utf8");
  if (!html.includes(`http-equiv="refresh" content="0;url=${redirect.targetUrl}"`)) {
    errors.push(`${redirect.url} does not refresh to ${redirect.targetUrl}`);
  }
  if (!html.includes(`rel="canonical" href="https://stoveratings.com${redirect.targetUrl}"`)) {
    errors.push(`${redirect.url} canonical is not ${redirect.targetUrl}`);
  }
}
for (const redirect of compareRedirects) {
  if (!seen.has(redirect.targetUrl)) errors.push(`sitemap missing compare target ${redirect.targetUrl}`);
  if (seen.has(redirect.url)) errors.push(`sitemap includes redirected compare ${redirect.url}`);
  const page = fileForPath(redirect.url);
  if (!existsSync(page)) {
    errors.push(`missing compare redirect page ${redirect.url}`);
    continue;
  }
  const html = readFileSync(page, "utf8");
  if (!html.includes(`http-equiv="refresh" content="0;url=${redirect.targetUrl}"`)) {
    errors.push(`${redirect.url} does not refresh to ${redirect.targetUrl}`);
  }
  if (!html.includes(`rel="canonical" href="https://stoveratings.com${redirect.targetUrl}"`)) {
    errors.push(`${redirect.url} canonical is not ${redirect.targetUrl}`);
  }
  if (!html.includes('content="noindex"')) errors.push(`${redirect.url} is indexed`);
  if (!html.includes(redirect.heading)) errors.push(`${redirect.url} missing heading`);
}

const childMax = new Map();
let pelletLastmod = "";
let newestLastmod = "";
for (const name of sitemapFiles) {
  const xml = readFileSync(join(dist, name), "utf8");
  if (!xml.includes("<urlset")) continue;
  let max = "";
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]*)<\/lastmod>/g)) {
    const loc = match[1];
    const lastmod = match[2];
    if (!isW3cDateTime(lastmod) || !isSitemapLastmod(lastmod)) {
      errors.push(`invalid sitemap lastmod ${lastmod} for ${loc}`);
      continue;
    }
    if (!max || lastmodInstant(lastmod) > lastmodInstant(max)) max = lastmod;
    if (new URL(loc).pathname === "/cleanest-burning-pellet-stoves/") {
      pelletLastmod = lastmod;
      if (lastmod.slice(0, 10) <= "2026-10-23") {
        errors.push(`/cleanest-burning-pellet-stoves/ lastmod ${lastmod} is not after 2026-10-23`);
      }
    }
  }
  if (!max) errors.push(`${name} has no URL lastmod`);
  else childMax.set(name, max);
}
if (!pelletLastmod) errors.push("sitemap missing lastmod for /cleanest-burning-pellet-stoves/");
for (const lastmod of childMax.values()) {
  if (!newestLastmod || lastmodInstant(lastmod) > lastmodInstant(newestLastmod)) newestLastmod = lastmod;
}
const indexXml = sitemapFiles.includes("sitemap-index.xml") ? readFileSync(join(dist, "sitemap-index.xml"), "utf8") : "";
if (!indexXml.includes("<sitemapindex")) errors.push("missing sitemap-index.xml");
let newestIndex = "";
for (const match of indexXml.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]*)<\/lastmod>/g)) {
  const loc = match[1];
  const lastmod = match[2];
  if (!isW3cDateTime(lastmod) || !isSitemapLastmod(lastmod)) {
    errors.push(`invalid sitemap index lastmod ${lastmod}`);
    continue;
  }
  const child = decodeURIComponent(new URL(loc).pathname).split("/").pop();
  const childNewest = childMax.get(child);
  if (!childNewest) errors.push(`sitemap index lists ${loc} without a child lastmod`);
  else if (lastmodInstant(lastmod) < lastmodInstant(childNewest)) {
    errors.push(`sitemap index lastmod ${lastmod} is older than newest URL lastmod ${childNewest} in ${child}`);
  }
  if (!newestIndex || lastmodInstant(lastmod) > lastmodInstant(newestIndex)) newestIndex = lastmod;
}
if (newestLastmod && (!newestIndex || lastmodInstant(newestIndex) < lastmodInstant(newestLastmod))) {
  errors.push(`sitemap index lastmod ${newestIndex || "missing"} is older than newest URL lastmod ${newestLastmod}`);
}

const robots = readFileSync(join(dist, "robots.txt"), "utf8");
if (!robots.includes("User-agent: *") || !robots.includes("Allow: /")) errors.push("robots.txt must allow all");
if (robots.includes("Disallow")) errors.push("robots.txt must not disallow");
if (!robots.includes("https://stoveratings.com/sitemap-index.xml")) errors.push("robots.txt sitemap URL");

const inbound = new Map();
for (const [from, dests] of linksFrom) {
  for (const dest of dests) {
    if (!inbound.has(dest)) inbound.set(dest, new Set());
    inbound.get(dest).add(from);
  }
}
const neighborBanned = /\b(best|top-rated|recommend\w*|scores?|ratings?|safest|safer|popular|winners?|affiliate|sponsored|cleanest|better)\b/i;
let currentWithoutNonBrand = 0;
const nonBrandCounts = [];
for (const stove of catalog.stoves) {
  if (!stove.current || !stove.indexable || hidden.has(stove.url)) continue;
  const sources = inbound.get(stove.url) || new Set();
  const nonBrand = [...sources].filter((path) => !path.startsWith("/brands/"));
  nonBrandCounts.push(nonBrand.length);
  if (!nonBrand.length) {
    currentWithoutNonBrand += 1;
    if (currentWithoutNonBrand <= 15) errors.push(`current model has no non-brand inlink: ${stove.url}`);
  }
}
if (currentWithoutNonBrand) errors.push(`${currentWithoutNonBrand} current models have no non-brand inlink`);

function bothGroups(groups) {
  return [...groups.current, ...groups.previous];
}
function anchorTexts(html) {
  const map = new Map();
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = attrs(`<a ${match[1]}>`).href;
    if (!href || !href.startsWith("/")) continue;
    let path = href.split("#")[0].split("?")[0];
    if (path !== "/" && !path.endsWith("/") && !path.includes(".")) path = `${path}/`;
    const text = decodeAttr(match[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (!map.has(path)) map.set(path, []);
    map.get(path).push(text);
  }
  return map;
}
function expectRowLinks(path, stoves) {
  const html = htmlByFile.get(resolve(fileForPath(path))) || "";
  if (!html) {
    errors.push(`missing list page ${path}`);
    return;
  }
  const anchors = anchorTexts(html);
  const seenStoves = new Set();
  const brands = new Set();
  for (const stove of stoves) {
    if (!stove?.url || seenStoves.has(stove.url)) continue;
    seenStoves.add(stove.url);
    const brand = catalog.brandBySlug.get(stove.primarySlug);
    const label = brandModelLabel(brand?.name || stove.manufacturer, stove.model);
    const texts = anchors.get(stove.url) || [];
    if (!texts.includes(label)) errors.push(`${path} row for ${stove.url} is not linked as ${label}`);
    if (brand?.url && stove.manufacturer) brands.add(brand.url);
  }
  for (const url of brands) {
    if (!html.includes(`href="${url}"`)) errors.push(`${path} does not link brand hub ${url}`);
  }
}
const woodInserts = inserts(catalog.stoves, "Wood Stove");
const pelletInserts = inserts(catalog.stoves, "Pellet Stove");
const listPages = [
  ["/catalytic-wood-stoves/", bothGroups(woodSubtype(catalog.stoves, "Catalytic Stove"))],
  ["/non-catalytic-wood-stoves/", bothGroups(woodSubtype(catalog.stoves, "Non-Catalytic Stove"))],
  ["/hybrid-wood-stoves/", bothGroups(woodSubtype(catalog.stoves, "Hybrid"))],
  ["/pellet-stoves/", bothGroups(pelletStoves(catalog.stoves))],
  ["/most-efficient-wood-stoves/", efficiencyRows(catalog.stoves).map((row) => row.stove)],
  ["/most-efficient-pellet-stoves/", rankByEfficiency(catalog.stoves, "Pellet Stove")],
  ["/cleanest-burning-wood-stoves/", rankByEmission(catalog.stoves, "Wood Stove")],
  ["/cleanest-burning-pellet-stoves/", rankByEmission(catalog.stoves, "Pellet Stove")],
  ["/wood-stove-inserts/", [...currentInsertRows(catalog.stoves, catalog.brandBySlug).map((row) => row.stove), ...woodInserts.previous]],
  ["/pellet-stove-inserts/", bothGroups(pelletInserts)],
  ["/pellet-boilers/", bothGroups(centralKind(catalog.stoves, (stove) => stove.type === "Hydronic Heater" && stove.fuel === "Wood Pellets"))],
  ["/outdoor-wood-boilers/", bothGroups(centralKind(catalog.stoves, (stove) => stove.type === "Hydronic Heater" && stove.fuel !== "Wood Pellets"))],
  ["/wood-furnaces/", bothGroups(centralKind(catalog.stoves, (stove) => stove.type === "Forced Air Furnace"))],
  ["/small-wood-stoves/", [...splitSmallWoodRows(catalog.stoves).current, ...splitSmallWoodRows(catalog.stoves).previous].map((row) => row.stove)],
];
for (const [path, stoves] of listPages) expectRowLinks(path, stoves);

const stoveByUrl = new Map(catalog.stoves.map((stove) => [stove.url, stove]));
for (const stove of catalog.stoves) {
  const html = htmlByFile.get(resolve(fileForPath(stove.url))) || "";
  if (!html) continue;
  const sections = neighborSections(stove, catalog.stoves, catalog.brandBySlug, catalog.meta.snapshotDate);
  const block = html.match(/<section id="current-neighbors"[^>]*>[\s\S]*?<\/section>/);
  if (!sections.length) {
    if (block) errors.push(`${stove.url} renders an empty neighbor section`);
    continue;
  }
  if (!block) {
    errors.push(`${stove.url} is missing current-neighbor links`);
    continue;
  }
  if (block[0].includes("cfpub.epa.gov")) errors.push(`${stove.url} neighbor section names cfpub`);
  const copy = [
    ...block[0].matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g),
    ...block[0].matchAll(/<caption>([\s\S]*?)<\/caption>/g),
  ].map((match) => decodeAttr(match[1].replace(/<[^>]+>/g, "")));
  for (const text of copy) {
    if (neighborBanned.test(text)) errors.push(`${stove.url} neighbor copy: ${text.match(neighborBanned)[0]}`);
  }
  const expected = sections.flatMap((section) => section.rows.map((row) => row.href));
  if (expected.length > 6) errors.push(`${stove.url} has ${expected.length} neighbor links`);
  const found = [...block[0].matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((match) => ({
    href: decodeAttr(match[1]).split("#")[0].split("?")[0],
    text: decodeAttr(match[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim(),
  })).filter((item) => item.href.startsWith("/stoves/"));
  const expectedRows = sections.flatMap((section) => section.rows);
  if (found.map((item) => item.href).join("|") !== expected.join("|")) errors.push(`${stove.url} neighbor links do not match the EPA list`);
  for (const [index, row] of expectedRows.entries()) {
    if (found[index] && found[index].text !== row.label) errors.push(`${stove.url} neighbor label ${found[index]?.text} != ${row.label}`);
  }
  for (const href of expected) {
    const target = stoveByUrl.get(href);
    if (!target || !target.current || !target.indexable || hidden.has(href) || !seen.has(href)) {
      errors.push(`${stove.url} neighbor link is not a current indexable page: ${href}`);
    }
  }
}
nonBrandCounts.sort((left, right) => left - right);
const medianNonBrand = nonBrandCounts.length ? nonBrandCounts[Math.floor(nonBrandCounts.length / 2)] : 0;

if (errors.length) {
  console.error(errors.slice(0, 40).join("\n"));
  console.error(`${errors.length} link errors`);
  process.exit(1);
}
console.log(`Links OK across ${files.length} HTML files. Sitemap URLs: ${seen.size}. Newest lastmod: ${newestLastmod}. All sitemap URLs are within ${MAX_CLICKS} clicks of home. Heating cost HTML: ${heatingBytes} bytes. Current models with 0 non-brand inlinks: ${currentWithoutNonBrand}. Median non-brand inlinks: ${medianNonBrand}.`);
