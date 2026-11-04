import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homeBrandHubs } from "../src/lib/brand-hubs.js";
import { catalog, stovesForBrand } from "../src/lib/catalog.js";
import { relatedLists } from "../src/lib/lists.js";

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

function attrs(tag) {
  const found = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*"([^"]*)"/g)) found[match[1]] = match[2];
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

const robots = readFileSync(join(dist, "robots.txt"), "utf8");
if (!robots.includes("User-agent: *") || !robots.includes("Allow: /")) errors.push("robots.txt must allow all");
if (robots.includes("Disallow")) errors.push("robots.txt must not disallow");
if (!robots.includes("https://stoveratings.com/sitemap-index.xml")) errors.push("robots.txt sitemap URL");

if (errors.length) {
  console.error(errors.slice(0, 40).join("\n"));
  console.error(`${errors.length} link errors`);
  process.exit(1);
}
console.log(`Links OK across ${files.length} HTML files. Sitemap URLs: ${seen.size}. All sitemap URLs are within ${MAX_CLICKS} clicks of home. Heating cost HTML: ${heatingBytes} bytes.`);
