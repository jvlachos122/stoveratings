import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SNAPSHOT_FILE_SPECS,
  buildReport,
  parseCrosswalk,
  parseOverrides,
  parseRedirects,
  parseSnapshot,
  recordedHubMerges,
} from "./snapshot-diff.js";

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EDITORIAL_FILES = ["brand-redirects.csv", "insert-overrides.csv", "brand-crosswalk.csv"];

function readSnapshotFiles(dir) {
  const files = {};
  for (const spec of SNAPSHOT_FILE_SPECS) {
    const path = join(dir, spec.name);
    if (!existsSync(path)) throw new Error(`missing committed snapshot file ${path}`);
    files[spec.name] = readFileSync(path, "utf8");
  }
  return files;
}

function hashFiles(files) {
  const hash = createHash("sha256");
  for (const spec of SNAPSHOT_FILE_SPECS) hash.update(spec.name).update("\0").update(files[spec.name]).update("\0");
  return hash.digest("hex");
}

function readEditorial(dir) {
  if (!EDITORIAL_FILES.every((name) => existsSync(join(dir, name)))) return null;
  return {
    redirects: parseRedirects(readFileSync(join(dir, "brand-redirects.csv"), "utf8")),
    overrides: parseOverrides(readFileSync(join(dir, "insert-overrides.csv"), "utf8")),
    crosswalk: parseCrosswalk(readFileSync(join(dir, "brand-crosswalk.csv"), "utf8")),
  };
}

export function loadCommittedSnapshots(root = defaultRoot) {
  const rawDir = join(root, "data/raw");
  const date = readFileSync(join(rawDir, "SNAPSHOT_DATE"), "utf8").trim();
  if (!DATE_RE.test(date)) throw new Error(`bad SNAPSHOT_DATE ${date}`);
  const currentFiles = readSnapshotFiles(rawDir);
  const current = parseSnapshot({ date, files: currentFiles });
  current.editorial = readEditorial(join(root, "data"));
  const currentHash = hashFiles(currentFiles);

  const archived = [];
  const archiveRoot = join(root, "data/snapshots");
  if (existsSync(archiveRoot)) {
    for (const entry of readdirSync(archiveRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !DATE_RE.test(entry.name)) continue;
      const dir = join(archiveRoot, entry.name);
      const files = readSnapshotFiles(dir);
      const hash = hashFiles(files);
      if (entry.name === date) {
        if (hash !== currentHash) {
          throw new Error(`data/snapshots/${date} does not match data/raw for ${date}`);
        }
        continue;
      }
      const snapshot = parseSnapshot({ date: entry.name, files });
      snapshot.editorial = readEditorial(dir);
      archived.push(snapshot);
    }
  }
  return [...archived, current].sort((left, right) => left.date.localeCompare(right.date));
}

export function loadRecordedMerges(root = defaultRoot) {
  const historyPath = join(root, "data/brand-slug-history.json");
  const redirectsPath = join(root, "data/brand-redirects.json");
  if (!existsSync(historyPath) || !existsSync(redirectsPath)) return [];
  const history = JSON.parse(readFileSync(historyPath, "utf8"));
  const redirects = JSON.parse(readFileSync(redirectsPath, "utf8"));
  if (!history?.slugs || !Array.isArray(redirects)) return [];
  return recordedHubMerges(history.slugs, redirects);
}

export function loadChangelog(root = defaultRoot) {
  return buildReport(loadCommittedSnapshots(root), loadRecordedMerges(root));
}
