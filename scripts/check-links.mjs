import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
if (!seen.has("/")) errors.push("sitemap missing home");
if (seen.has("/compare/")) errors.push("sitemap includes compare");
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

const robots = readFileSync(join(dist, "robots.txt"), "utf8");
if (!robots.includes("User-agent: *") || !robots.includes("Allow: /")) errors.push("robots.txt must allow all");
if (robots.includes("Disallow")) errors.push("robots.txt must not disallow");
if (!robots.includes("https://stoveratings.com/sitemap-index.xml")) errors.push("robots.txt sitemap URL");

if (errors.length) {
  console.error(errors.slice(0, 40).join("\n"));
  console.error(`${errors.length} link errors`);
  process.exit(1);
}
console.log(`Links OK across ${files.length} HTML files. Sitemap URLs: ${seen.size}.`);
