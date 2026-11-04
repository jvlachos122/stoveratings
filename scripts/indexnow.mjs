/**
 * IndexNow helpers.
 *
 * Builds a content-hash manifest of HTML pages in dist/, diffs against a
 * previous manifest, and POSTs added or changed URLs to api.indexnow.org.
 * Exits 1 when a submission is not fully accepted (every batch HTTP 200 or
 * 202) so the workflow does not promote the manifest. A failed ping does not
 * fail the deploy job: that job sets continue-on-error.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://stoveratings.com";
const HOST = "stoveratings.com";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS = 10_000;

function parseArgs(argv) {
  const args = {
    writeManifest: null,
    submit: false,
    manifest: null,
    previous: null,
    dist: join(root, "dist"),
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--write-manifest") args.writeManifest = argv[++i];
    else if (arg === "--submit") args.submit = true;
    else if (arg === "--manifest") args.manifest = argv[++i];
    else if (arg === "--previous") args.previous = argv[++i];
    else if (arg === "--dist") args.dist = argv[++i];
    else if (arg === "--dry-run") args.dryRun = true;
  }
  return args;
}

function walkHtml(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walkHtml(path));
    else if (entry.endsWith(".html")) files.push(path);
  }
  return files;
}

function pageUrl(dist, file) {
  const rel = normalize(file.slice(dist.length)).replaceAll("\\", "/");
  if (rel === "/index.html") return `${SITE}/`;
  if (rel.endsWith("/index.html")) return `${SITE}${rel.slice(0, -"index.html".length)}`;
  if (rel.endsWith(".html")) return `${SITE}${rel}`;
  return `${SITE}${rel}`;
}

function loadKey() {
  const publicDir = join(root, "public");
  for (const name of readdirSync(publicDir)) {
    if (!/^[a-f0-9]{32}\.txt$/i.test(name)) continue;
    const key = readFileSync(join(publicDir, name), "utf8").trim();
    if (key === name.slice(0, -4)) return key;
  }
  throw new Error("IndexNow key file not found in public/ (expected 32-hex key.txt)");
}

function buildManifest(dist) {
  if (!existsSync(dist)) throw new Error(`dist not found: ${dist}`);
  const urls = {};
  for (const file of walkHtml(dist)) {
    const url = pageUrl(dist, file);
    if (url.includes("/404")) continue;
    urls[url] = createHash("sha256").update(readFileSync(file)).digest("hex");
  }
  return {
    generatedAt: new Date().toISOString(),
    host: HOST,
    count: Object.keys(urls).length,
    urls,
  };
}

function readManifest(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function changedUrls(current, previous) {
  if (!previous?.urls) return Object.keys(current.urls).sort();
  const out = [];
  for (const [url, hash] of Object.entries(current.urls)) {
    if (previous.urls[url] !== hash) out.push(url);
  }
  return out.sort();
}

/** True when there is nothing to send, or every batch returned 200 or 202. */
export function indexNowAccepted(urlCount, statuses) {
  if (!urlCount) return true;
  return statuses.length > 0 && statuses.every((status) => status === 200 || status === 202);
}

function chunk(list, size) {
  const batches = [];
  for (let i = 0; i < list.length; i += size) batches.push(list.slice(i, i + size));
  return batches;
}

async function submitUrls(key, urlList, dryRun) {
  if (urlList.length === 0) {
    console.log("IndexNow: nothing to submit (no added or changed URLs).");
    return [];
  }
  const keyLocation = `${SITE}/${key}.txt`;
  const batches = chunk(urlList, MAX_URLS);
  const statuses = [];
  console.log(`IndexNow: submitting ${urlList.length} URL(s) in ${batches.length} request(s)${dryRun ? " [dry-run]" : ""}`);
  for (let i = 0; i < batches.length; i++) {
    const body = { host: HOST, key, keyLocation, urlList: batches[i] };
    if (dryRun) {
      console.log(`IndexNow batch ${i + 1}/${batches.length}: would POST ${batches[i].length} URLs`);
      continue;
    }
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(body),
      });
      const text = (await res.text()).slice(0, 500);
      statuses.push(res.status);
      if (res.status === 200 || res.status === 202) {
        console.log(`IndexNow batch ${i + 1}/${batches.length}: HTTP ${res.status} (ok) — ${batches[i].length} URLs`);
      } else {
        console.warn(`IndexNow batch ${i + 1}/${batches.length}: HTTP ${res.status} (not accepted) — ${text}`);
      }
    } catch (err) {
      statuses.push(0);
      console.warn(`IndexNow batch ${i + 1}/${batches.length}: request failed (not accepted) — ${err}`);
    }
  }
  return statuses;
}

async function main() {
  let submit = false;
  try {
    const args = parseArgs(process.argv.slice(2));
    submit = args.submit;
    if (args.writeManifest) {
      const manifest = buildManifest(args.dist);
      mkdirSync(dirname(args.writeManifest), { recursive: true });
      writeFileSync(args.writeManifest, `${JSON.stringify(manifest)}\n`);
      console.log(`Wrote manifest with ${manifest.count} URLs to ${args.writeManifest}`);
      return;
    }
    if (args.submit) {
      if (!args.manifest) throw new Error("--submit requires --manifest <path>");
      const current = readManifest(args.manifest);
      const previous = args.previous && existsSync(args.previous) ? readManifest(args.previous) : null;
      const urls = changedUrls(current, previous);
      if (!previous) console.log(`IndexNow: no previous manifest; submitting full set (${urls.length} URLs).`);
      else console.log(`IndexNow: previous=${previous.count} current=${current.count} changed=${urls.length}`);
      const statuses = await submitUrls(loadKey(), urls, args.dryRun);
      if (args.dryRun) return;
      if (!indexNowAccepted(urls.length, statuses)) {
        console.warn("IndexNow: not accepted (need HTTP 200 or 202 for every batch). Manifest was not promoted.");
        process.exitCode = 1;
      }
      return;
    }
    throw new Error("Specify --write-manifest <path> or --submit --manifest <path>");
  } catch (err) {
    console.warn(`IndexNow: ${err?.message || err}`);
    if (submit) {
      console.warn("IndexNow: manifest was not promoted.");
      process.exitCode = 1;
      return;
    }
    console.warn("IndexNow: warning only; exiting 0");
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) await main();
