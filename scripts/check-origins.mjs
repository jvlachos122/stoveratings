import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const errors = [];
const blocked = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "googletagmanager.com",
  "google-analytics.com",
  "cdn.jsdelivr.net",
  "unpkg.com",
  "plausible.io",
  "cfpub.epa.gov",
];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (/\.(html|css|js|svg)$/.test(entry)) files.push(path);
  }
  return files;
}

for (const file of walk(dist)) {
  const text = readFileSync(file, "utf8");
  const rel = file.slice(dist.length);
  for (const host of blocked) {
    const pattern = new RegExp(`(?:https?:)?//(?:[a-z0-9-]+\\.)*${host.replaceAll(".", "\\.")}`, "i");
    if (pattern.test(text)) errors.push(`${rel} loads ${host}`);
  }
  for (const match of text.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const tag = match[0];
    const url = tag.match(/\b(?:src|href)\s*=\s*"([^"]+)"/i)?.[1];
    if (!url) continue;
    if (/^https?:\/\//.test(url) && !url.startsWith("https://stoveratings.com")) {
      errors.push(`${rel} off-site resource ${url}`);
    }
  }
  for (const match of text.matchAll(/url\(([^)]+)\)/gi)) {
    const url = match[1].replace(/["']/g, "");
    if (/^https?:\/\//.test(url)) errors.push(`${rel} css url ${url}`);
  }
}

if (errors.length) {
  console.error(errors.slice(0, 30).join("\n"));
  process.exit(1);
}
console.log("Origin check OK: no third-party scripts, fonts, or EPA fetches in the build.");
