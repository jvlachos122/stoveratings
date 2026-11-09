// Lastmod is the newest git commit that touched a page's source, template, or
// rendered data. Header, footer, and the base layout are chrome, not inputs.
// Stove and other EPA pages also consider the snapshot date; it wins only when
// it is later than those commits. Nothing here uses the build clock.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import redirects from "../../data/brand-redirects.json" with { type: "json" };
import brands from "../../data/brands.json" with { type: "json" };
import meta from "../../data/meta.json" with { type: "json" };
import stoves from "../../data/stoves.json" with { type: "json" };
import { compareRedirects, selectComparePairs } from "./compare-pairs.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CHROME = new Set([
  "src/layouts/Base.astro",
  "src/components/Header.astro",
  "src/components/Footer.astro",
  "src/components/Breadcrumbs.astro",
]);
const CATALOG_DATA = [
  { pattern: /catalog\.stoves|stovesForBrand|stoveById/, file: "data/stoves.json" },
  { pattern: /catalog\.brands|brandBySlug/, file: "data/brands.json" },
  { pattern: /catalog\.stats/, file: "data/stats.json" },
  { pattern: /catalog\.firewood/, file: "data/firewood.json" },
  { pattern: /catalog\.fuelHeat/, file: "data/fuel-heat.json" },
  { pattern: /catalog\.fuelPrices/, file: "data/fuel-prices.json" },
  { pattern: /catalog\.changes/, file: "data/changes.json" },
  { pattern: /catalog\.redirects/, file: "data/brand-redirects.json" },
];
const SNAPSHOT_FILES = new Set(["SNAPSHOT_DATE", "rh_all.csv", "rh_inprod.csv", "wh_all.csv", "wh_inprod.csv"]);
const EDITORIAL_FILES = new Set(["brand-redirects.csv", "insert-overrides.csv", "brand-crosswalk.csv"]);
const STOVE_TEMPLATE = "src/pages/stoves/[manufacturer]/[model].astro";
const BRAND_TEMPLATE = "src/pages/brands/[brand].astro";
const COMPARE_TEMPLATE = "src/pages/compare/[pair].astro";

const SITEMAP_LASTMOD = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2}))?$/;

export function isSitemapLastmod(value) {
  const match = SITEMAP_LASTMOD.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  if (match[4] == null) return true;
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (hour > 23 || minute > 59 || second > 60) return false;
  if (match[7] !== "Z") {
    const offsetHour = Number(match[7].slice(1, 3));
    const offsetMinute = Number(match[7].slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }
  return true;
}

export function isW3cDateTime(value) {
  if (isSitemapLastmod(value)) return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;
  const normalized = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? "00"}${match[8]}`;
  return isSitemapLastmod(normalized);
}

export function lastmodInstant(value) {
  if (!isW3cDateTime(value)) throw new Error(`invalid lastmod ${value}`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return Date.parse(`${value}T00:00:00Z`);
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new Error(`invalid lastmod ${value}`);
  return time;
}

export function laterLastmod(left, right) {
  return lastmodInstant(left) >= lastmodInstant(right) ? left : right;
}

export function chooseLastmod(dates) {
  const present = dates.filter(Boolean);
  if (!present.length) throw new Error("no lastmod candidates");
  return present.reduce(laterLastmod);
}

function gitFileDates() {
  const shallow = execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (shallow === "true") {
    throw new Error("Shallow git history cannot date sitemap lastmod. Set actions/checkout fetch-depth: 0.");
  }
  const log = execFileSync("git", ["log", "--format=%cI", "--name-only"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const dates = new Map();
  let current = "";
  for (const line of log.split("\n")) {
    if (!line) continue;
    if (/^\d{4}-\d{2}-\d{2}T/.test(line)) {
      current = line.trim();
      continue;
    }
    const file = line.replaceAll("\\", "/");
    if (!current || dates.has(file)) continue;
    dates.set(file, current);
  }
  return dates;
}

function importedSpecs(source) {
  const specs = new Set();
  const pattern = /(?:import|export)\s+(?:[\s\S]*?\sfrom\s+)?["'](\.[^"']+)["']/g;
  for (const match of source.matchAll(pattern)) specs.add(match[1]);
  for (const match of source.matchAll(/import\(\s*["'](\.[^"']+)["']\s*\)/g)) specs.add(match[1]);
  return specs;
}

function resolveSpec(fromRel, spec) {
  const base = join(root, dirname(fromRel), spec);
  const candidates = [base, `${base}.js`, `${base}.mjs`, `${base}.astro`, `${base}.json`];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return relative(root, candidate).replaceAll("\\", "/");
  }
  return null;
}

function contentInputs(entryRel) {
  const files = new Set();
  let useSnapshot = false;
  let useChangelog = false;
  const seen = new Set();
  const stack = [entryRel];
  while (stack.length) {
    const rel = stack.pop();
    if (!rel || seen.has(rel) || CHROME.has(rel) || rel.endsWith(".css")) continue;
    seen.add(rel);
    if (rel === "src/lib/catalog.js") continue;
    files.add(rel);
    if (rel === "src/lib/epa-snapshots.js") useChangelog = true;
    if (rel.endsWith(".json") || rel.endsWith(".csv")) continue;
    const source = readFileSync(join(root, rel), "utf8");
    if (/from\s+["'][^"']*\/catalog\.js["']/.test(source)) {
      if (/catalog\.meta\b/.test(source)) useSnapshot = true;
      for (const rule of CATALOG_DATA) {
        if (rule.pattern.test(source)) files.add(rule.file);
      }
    }
    for (const spec of importedSpecs(source)) {
      const resolved = resolveSpec(rel, spec);
      if (resolved) stack.push(resolved);
    }
  }
  return { files, useSnapshot, useChangelog };
}

function isChangelogInput(file) {
  const name = file.slice(file.lastIndexOf("/") + 1);
  if (file.startsWith("data/raw/") && SNAPSHOT_FILES.has(name)) return true;
  if (file.startsWith("data/snapshots/") && (SNAPSHOT_FILES.has(name) || EDITORIAL_FILES.has(name))) return true;
  if (file === "data/brand-slug-history.json" || file === "data/brand-redirects.json") return true;
  return file.startsWith("data/") && !file.includes("/", 5) && EDITORIAL_FILES.has(name);
}

function changelogDates(fileDates) {
  const dates = [];
  for (const [file, date] of fileDates) {
    if (isChangelogInput(file)) dates.push(date);
  }
  return dates;
}

function lastmodFor(entryRel, fileDates, snapshotDate) {
  const inputs = contentInputs(entryRel);
  const dates = [];
  for (const file of inputs.files) {
    const date = fileDates.get(file);
    if (!date) throw new Error(`No git commit date for ${file}. Checkout needs fetch-depth: 0.`);
    dates.push(date);
  }
  if (inputs.useSnapshot) dates.push(snapshotDate);
  if (inputs.useChangelog) dates.push(...changelogDates(fileDates));
  return chooseLastmod(dates);
}

function pathnameForPage(rel) {
  let path = rel.slice("src/pages/".length).replace(/\.astro$/, "");
  if (path.endsWith("/index")) path = path.slice(0, -"/index".length);
  else if (path === "index") path = "";
  return path ? `/${path}/` : "/";
}

function walkPages(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkPages(full, out);
    else if (entry.name.endsWith(".astro")) out.push(relative(root, full).replaceAll("\\", "/"));
  }
  return out;
}

function assign(map, pathname, lastmod) {
  const existing = map.get(pathname);
  if (existing && existing !== lastmod) throw new Error(`conflicting lastmod for ${pathname}: ${existing} vs ${lastmod}`);
  map.set(pathname, lastmod);
}

export function buildSitemapLastmods() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.snapshotDate)) {
    throw new Error(`EPA snapshot date is not YYYY-MM-DD: ${meta.snapshotDate}`);
  }
  const fileDates = gitFileDates();
  const map = new Map();
  for (const rel of walkPages(join(root, "src/pages"))) {
    if (rel.includes("[") || rel.endsWith("/404.astro")) continue;
    assign(map, pathnameForPage(rel), lastmodFor(rel, fileDates, meta.snapshotDate));
  }
  const stoveLastmod = lastmodFor(STOVE_TEMPLATE, fileDates, meta.snapshotDate);
  for (const stove of stoves) assign(map, stove.url, stoveLastmod);
  const brandLastmod = lastmodFor(BRAND_TEMPLATE, fileDates, meta.snapshotDate);
  for (const brand of brands) assign(map, brand.url, brandLastmod);
  for (const redirect of redirects) assign(map, redirect.url, brandLastmod);
  const compareLastmod = lastmodFor(COMPARE_TEMPLATE, fileDates, meta.snapshotDate);
  const pairs = selectComparePairs(stoves, { brandBySlug: new Map(brands.map((brand) => [brand.slug, brand])) });
  for (const pair of pairs) assign(map, pair.url, compareLastmod);
  for (const redirect of compareRedirects(pairs)) assign(map, redirect.url, compareLastmod);
  return map;
}

export function rewriteSitemapLastmods(distDir, lastmods) {
  const names = readdirSync(distDir).filter((name) => name.startsWith("sitemap-") && name.endsWith(".xml"));
  const indexName = names.find((name) => name.endsWith("-index.xml"));
  if (!indexName) throw new Error("sitemap-index.xml was not written");
  const childMax = new Map();
  for (const name of names) {
    if (name === indexName) continue;
    const path = join(distDir, name);
    let xml = readFileSync(path, "utf8");
    let maxValue = "";
    let urls = 0;
    if (!/<loc>[^<]+<\/loc>\s*<lastmod>/.test(xml)) throw new Error(`${name} has no lastmod tags to replace`);
    xml = xml.replace(/<loc>([^<]+)<\/loc>(\s*)<lastmod>[^<]*<\/lastmod>/g, (full, loc, space) => {
      const pathname = decodeURIComponent(new URL(loc).pathname);
      const lastmod = lastmods.get(pathname);
      if (!lastmod) throw new Error(`No content lastmod for ${loc}`);
      if (!isSitemapLastmod(lastmod)) throw new Error(`lastmod ${lastmod} for ${loc} is not a sitemap datetime`);
      if (!maxValue || lastmodInstant(lastmod) > lastmodInstant(maxValue)) maxValue = lastmod;
      urls += 1;
      return `<loc>${loc}</loc>${space}<lastmod>${lastmod}</lastmod>`;
    });
    if (!urls || !maxValue) throw new Error(`${name} has no sitemap URLs`);
    writeFileSync(path, xml);
    childMax.set(name, maxValue);
  }
  const indexPath = join(distDir, indexName);
  let indexXml = readFileSync(indexPath, "utf8");
  indexXml = indexXml.replace(/<loc>([^<]+)<\/loc>(\s*)<lastmod>[^<]*<\/lastmod>/g, (full, loc, space) => {
    const name = decodeURIComponent(new URL(loc).pathname).split("/").pop();
    const lastmod = childMax.get(name);
    if (!lastmod) throw new Error(`sitemap index lists unknown child ${loc}`);
    return `<loc>${loc}</loc>${space}<lastmod>${lastmod}</lastmod>`;
  });
  writeFileSync(indexPath, indexXml);
  return childMax;
}
