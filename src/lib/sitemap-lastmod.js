// Lastmod is the newest commit that changes a page's main content.
//
// Counted for each URL:
// - that page's own source file (a shared route template counts for every URL it renders)
// - content modules and components that render its copy, lists, or tools
// - client scripts the page loads from public/scripts
// - data files it renders: catalog JSON, the brand crosswalk and other editorial
//   inputs behind those JSON files, and the raw EPA snapshot files for pages
//   that render stove rows
// - the EPA snapshot date, and only when it is later than those commits
//
// Not counted (a commit that only touches these leaves every lastmod unchanged):
// - layouts, the shared header, footer, and breadcrumbs
// - global CSS, fonts, favicons, the web manifest, robots.txt, the OG image,
//   and brand-mark assets
// - src/lib/schema.js, which only builds JSON-LD. A new export there is not
//   the page body (the changelog helper used to date every brand hub)
// - relatedLists from src/lib/lists.js. That helper only adds cross-links,
//   the same class of change as a footer link. List pages that render a list
//   from lists.js still use the module as list source
//
// Nothing here uses the build clock. A full git history is required for
// accurate dates (actions/checkout fetch-depth: 0). A shallow checkout still
// builds: files this checkout cannot date fall back to the EPA snapshot date.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import redirects from "../../data/brand-redirects.json" with { type: "json" };
import brands from "../../data/brands.json" with { type: "json" };
import meta from "../../data/meta.json" with { type: "json" };
import stoves from "../../data/stoves.json" with { type: "json" };
import { compareRedirects, selectComparePairs } from "./compare-pairs.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const IGNORED_PREFIXES = ["src/layouts/", "src/styles/", "public/fonts/", "public/brand/"];
const IGNORED_FILES = new Set([
  "src/components/Header.astro",
  "src/components/Footer.astro",
  "src/components/Breadcrumbs.astro",
  "src/lib/schema.js",
  "public/favicon.ico",
  "public/favicon.svg",
  "public/apple-touch-icon.png",
  "public/icon-192.png",
  "public/icon-512.png",
  "public/icon-maskable-512.png",
  "public/og-image.png",
  "public/site.webmanifest",
  "public/robots.txt",
]);

const EPA_RAW_FILES = [
  "data/raw/SNAPSHOT_DATE",
  "data/raw/rh_all.csv",
  "data/raw/rh_inprod.csv",
  "data/raw/wh_all.csv",
  "data/raw/wh_inprod.csv",
];
const CATALOG_DATA = [
  {
    pattern: /catalog\.stoves|stovesForBrand|stoveById/,
    files: ["data/stoves.json", "data/insert-overrides.csv", ...EPA_RAW_FILES],
  },
  {
    pattern: /catalog\.brands|brandBySlug/,
    files: ["data/brands.json", "data/brand-crosswalk.csv"],
  },
  { pattern: /catalog\.stats/, files: ["data/stats.json"] },
  { pattern: /catalog\.firewood/, files: ["data/firewood.json", "data/firewood.csv"] },
  { pattern: /catalog\.fuelHeat/, files: ["data/fuel-heat.json", "data/fuel-heat.csv"] },
  { pattern: /catalog\.fuelPrices/, files: ["data/fuel-prices.json", "data/fuel-prices.csv"] },
  { pattern: /catalog\.changes/, files: ["data/changes.json"] },
  {
    pattern: /catalog\.redirects/,
    files: ["data/brand-redirects.json", "data/brand-redirects.csv"],
  },
];
const SNAPSHOT_FILES = new Set(["SNAPSHOT_DATE", "rh_all.csv", "rh_inprod.csv", "wh_all.csv", "wh_inprod.csv"]);
const EDITORIAL_FILES = new Set(["brand-redirects.csv", "insert-overrides.csv", "brand-crosswalk.csv"]);
const STOVE_TEMPLATE = "src/pages/stoves/[manufacturer]/[model].astro";
const BRAND_TEMPLATE = "src/pages/brands/[brand].astro";
const COMPARE_TEMPLATE = "src/pages/compare/[pair].astro";
const NAV_ONLY_LIST_EXPORTS = new Set(["relatedLists"]);

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
  let shallow = false;
  let sawShallowProbe = false;
  try {
    const probe = execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    sawShallowProbe = true;
    shallow = probe === "true";
  } catch {
    shallow = true;
  }
  let log = "";
  try {
    log = execFileSync("git", ["log", "--format=%cI", "--name-only"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (sawShallowProbe && !shallow) throw error;
    shallow = true;
    log = "";
  }
  if (shallow) {
    console.warn(
      "sitemap lastmod: git history is shallow or unavailable. Files missing from this checkout fall back to the EPA snapshot date. actions/checkout fetch-depth: 0 keeps per-page dates accurate.",
    );
  }
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
  return { dates, shallow };
}

function isIgnoredInput(rel) {
  if (!rel || rel.endsWith(".css")) return true;
  if (IGNORED_FILES.has(rel)) return true;
  return IGNORED_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

function importedSpecs(source) {
  const specs = new Set();
  const pattern = /(?:import|export)\s+(?:[\s\S]*?\sfrom\s+)?["'](\.[^"']+)["']/g;
  for (const match of source.matchAll(pattern)) specs.add(match[1]);
  for (const match of source.matchAll(/import\(\s*["'](\.[^"']+)["']\s*\)/g)) specs.add(match[1]);
  return specs;
}

function namedImports(source, filename) {
  const names = [];
  let saw = false;
  const pattern = /import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const spec = match[2];
    if (spec !== filename && !spec.endsWith(`/${filename}`)) continue;
    saw = true;
    const brace = match[1].match(/\{([^}]*)\}/);
    if (!brace) {
      names.push("*");
      continue;
    }
    for (const part of brace[1].split(",")) {
      let name = part.trim().replace(/^type\s+/, "");
      if (!name) continue;
      name = name.split(/\s+as\s+/)[0].trim();
      if (name) names.push(name);
    }
  }
  return saw ? names : null;
}

function listsImportIsNavOnly(source, spec) {
  if (spec !== "lists.js" && !spec.endsWith("/lists.js")) return false;
  const names = namedImports(source, "lists.js");
  return Boolean(names?.length) && names.every((name) => NAV_ONLY_LIST_EXPORTS.has(name));
}

function scriptAssets(source) {
  const assets = [];
  for (const match of source.matchAll(/\ssrc=["'](\/scripts\/[^"']+)["']/g)) {
    assets.push(`public${match[1]}`);
  }
  return assets;
}

function resolveSpec(fromRel, spec, exists) {
  if (!spec.startsWith(".")) return null;
  const base = normalize(join(dirname(fromRel), spec)).replaceAll("\\", "/");
  const candidates = [base, `${base}.js`, `${base}.mjs`, `${base}.astro`, `${base}.json`];
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

function contentInputs(entryRel, env) {
  const files = new Set();
  let useSnapshot = false;
  let useChangelog = false;
  const seen = new Set();
  const stack = [entryRel];
  while (stack.length) {
    const rel = stack.pop();
    if (!rel || seen.has(rel) || isIgnoredInput(rel)) continue;
    seen.add(rel);
    if (rel === "src/lib/catalog.js") continue;
    files.add(rel);
    if (rel === "src/lib/epa-snapshots.js") useChangelog = true;
    if (rel.endsWith(".json") || rel.endsWith(".csv")) continue;
    const source = env.readFile(rel);
    if (/from\s+["'][^"']*\/catalog\.js["']/.test(source)) {
      if (/catalog\.meta\b/.test(source)) useSnapshot = true;
      for (const rule of CATALOG_DATA) {
        if (!rule.pattern.test(source)) continue;
        for (const file of rule.files) {
          if (env.exists(file)) files.add(file);
        }
      }
    }
    for (const asset of scriptAssets(source)) {
      if (!isIgnoredInput(asset) && env.exists(asset)) files.add(asset);
    }
    for (const spec of importedSpecs(source)) {
      if (listsImportIsNavOnly(source, spec)) continue;
      const resolved = resolveSpec(rel, spec, env.exists);
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
    if (date && isChangelogInput(file)) dates.push(date);
  }
  return dates;
}

function dateFor(file, env) {
  const date = env.fileDates.get(file);
  if (date) return date;
  if (env.shallow) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(env.snapshotDate)) {
      throw new Error(`EPA snapshot date is not YYYY-MM-DD: ${env.snapshotDate}`);
    }
    return env.snapshotDate;
  }
  throw new Error(`No git commit date for ${file}. Checkout needs fetch-depth: 0.`);
}

function lastmodFor(entryRel, env) {
  const inputs = contentInputs(entryRel, env);
  const dates = [];
  for (const file of inputs.files) dates.push(dateFor(file, env));
  if (inputs.useSnapshot) dates.push(env.snapshotDate);
  if (inputs.useChangelog) dates.push(...changelogDates(env.fileDates));
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

function discoverEntries() {
  const entries = [];
  for (const rel of walkPages(join(root, "src/pages"))) {
    if (rel.includes("[") || rel.endsWith("/404.astro")) continue;
    entries.push({ rel, paths: [pathnameForPage(rel)] });
  }
  entries.push({ rel: STOVE_TEMPLATE, paths: stoves.map((stove) => stove.url) });
  const brandPaths = brands.map((brand) => brand.url);
  for (const redirect of redirects) brandPaths.push(redirect.url);
  entries.push({ rel: BRAND_TEMPLATE, paths: brandPaths });
  const pairs = selectComparePairs(stoves, { brandBySlug: new Map(brands.map((brand) => [brand.slug, brand])) });
  const comparePaths = pairs.map((pair) => pair.url);
  for (const redirect of compareRedirects(pairs)) comparePaths.push(redirect.url);
  entries.push({ rel: COMPARE_TEMPLATE, paths: comparePaths });
  return entries;
}

function repoEnv(fileDates, options) {
  return {
    fileDates,
    snapshotDate: options.snapshotDate || meta.snapshotDate,
    shallow: options.shallow === true,
    readFile: (rel) => readFileSync(join(root, rel), "utf8"),
    exists: (rel) => {
      const full = join(root, rel);
      return existsSync(full) && statSync(full).isFile();
    },
  };
}

export function lastmodsFromEntries(entries, env) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(env.snapshotDate)) {
    throw new Error(`EPA snapshot date is not YYYY-MM-DD: ${env.snapshotDate}`);
  }
  const map = new Map();
  const cache = new Map();
  for (const entry of entries) {
    let lastmod = cache.get(entry.rel);
    if (!lastmod) {
      lastmod = lastmodFor(entry.rel, env);
      cache.set(entry.rel, lastmod);
    }
    for (const pathname of entry.paths) assign(map, pathname, lastmod);
  }
  return map;
}

export function buildSitemapLastmodsFromDates(fileDates, options = {}) {
  return lastmodsFromEntries(discoverEntries(), repoEnv(fileDates, options));
}

export function buildSitemapLastmods() {
  const { dates, shallow } = gitFileDates();
  return buildSitemapLastmodsFromDates(dates, { shallow });
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
