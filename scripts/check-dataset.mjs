import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const allowedPartyTypes = new Set(["Organization", "Person"]);

function walkFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walkFiles(path));
    else if (entry.endsWith(".html")) files.push(path);
  }
  return files;
}

function typeList(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return [];
  const value = node["@type"];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  return [];
}

function isHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function licenseOk(value) {
  if (isHttpUrl(value)) return true;
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && isHttpUrl(value.url));
}

function walkObjects(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walkObjects(item, visit);
    return;
  }
  if (!value || typeof value !== "object") return;
  visit(value);
  for (const child of Object.values(value)) walkObjects(child, visit);
}

function checkParty(issues, rel, field, value) {
  const parties = Array.isArray(value) ? value : [value];
  for (const party of parties) {
    const types = typeList(party);
    const allowed = types.length > 0 && types.every((type) => allowedPartyTypes.has(type));
    if (!allowed) issues.push(`${rel}: Dataset ${field} @type ${types.join(", ") || "missing"}`);
  }
}

export function datasetIssues(html, rel = "page") {
  const issues = [];
  let datasets = 0;
  const scripts = html.matchAll(/<script\b[^>]*\btype="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    let data;
    try {
      data = JSON.parse(match[1]);
    } catch {
      issues.push(`${rel}: JSON-LD did not parse`);
      continue;
    }
    walkObjects(data, (node) => {
      if (!typeList(node).includes("Dataset")) return;
      datasets += 1;
      if (typeof node.name !== "string" || !node.name.trim()) issues.push(`${rel}: Dataset name is missing`);
      if (typeof node.description !== "string" || node.description.length < 50 || node.description.length > 5000) {
        const length = typeof node.description === "string" ? node.description.length : "missing";
        issues.push(`${rel}: Dataset description length ${length}`);
      }
      if (!isHttpUrl(node.url)) issues.push(`${rel}: Dataset url is not an absolute URL`);
      if (!licenseOk(node.license)) issues.push(`${rel}: Dataset license is not an absolute URL`);
      if (typeof node.isAccessibleForFree !== "boolean") issues.push(`${rel}: Dataset isAccessibleForFree is not a boolean`);
      if (node.creator == null) issues.push(`${rel}: Dataset creator is missing`);
      else checkParty(issues, rel, "creator", node.creator);
      if (node.publisher != null) checkParty(issues, rel, "publisher", node.publisher);
    });
  }
  return { issues, datasets };
}

function main() {
  if (!existsSync(dist)) {
    console.error("dist/ is missing; run npm run build first.");
    process.exit(1);
  }
  const errors = [];
  const pages = [];
  for (const file of walkFiles(dist)) {
    const rel = file.slice(dist.length).replaceAll("\\", "/");
    const result = datasetIssues(readFileSync(file, "utf8"), rel);
    if (result.datasets) pages.push(rel);
    errors.push(...result.issues);
  }
  if (!pages.length) errors.push("no Dataset JSON-LD in the build");
  if (errors.length) {
    console.error(errors.slice(0, 40).join("\n"));
    console.error(`${errors.length} Dataset problems`);
    process.exit(1);
  }
  console.log(`Dataset schema OK on ${pages.length} pages: ${pages.join(", ")}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
