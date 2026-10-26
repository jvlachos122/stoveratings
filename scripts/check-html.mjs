import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HtmlValidate } from "html-validate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const site = "https://stoveratings.com";
const hidden = new Set(JSON.parse(readFileSync(join(root, "data/noindex-paths.json"), "utf8")));
const redirects = JSON.parse(readFileSync(join(root, "data/brand-redirects.json"), "utf8"));
const redirectCanonical = new Map(redirects.map((row) => [row.url, new URL(row.targetUrl, site).href]));
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
for (const file of files) {
  const html = readFileSync(file, "utf8");
  const rel = file.slice(dist.length);
  const pagePath = pathFor(file);
  if (!html.startsWith("<!DOCTYPE html>")) errors.push(`${rel}: missing doctype`);
  if (!/<html[^>]*\slang="en"/.test(html)) errors.push(`${rel}: missing lang`);
  const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)];
  if (titles.length !== 1 || !titles[0][1].trim()) errors.push(`${rel}: title`);
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
