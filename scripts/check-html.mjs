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
