import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareRedirects, selectComparePairs } from "../src/lib/compare-pairs.js";
import { heatingCostPayload } from "../src/lib/heating-cost.js";
import { aliasSearchEntries, selectRetailAliases } from "../src/lib/retail-aliases.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stoves = JSON.parse(readFileSync(join(root, "data/stoves.json"), "utf8"));
const meta = JSON.parse(readFileSync(join(root, "data/meta.json"), "utf8"));

function compact(stove) {
  return {
    id: stove.id,
    url: stove.url,
    mfr: stove.manufacturer,
    model: stove.model,
    names: stove.retailNames,
    cat: stove.category,
    type: stove.type,
    sub: stove.subtype || "",
    fuel: stove.fuel || "",
    current: stove.current,
    insert: stove.insertFlag,
    nsps: stove.nsps2020 || "",
    em: stove.emission,
    emUnit: stove.emissionUnit,
    eff: stove.efficiency,
    btuLo: stove.btuLow,
    btuHi: stove.btuHigh,
    btuMax: stove.btuMax,
  };
}

const current = stoves.filter((stove) => stove.current).map(compact);
const historical = stoves.filter((stove) => !stove.current).map(compact);
const names = [];
for (const stove of stoves) {
  for (const name of stove.retailNames) {
    names.push({
      n: name,
      q: name.toLowerCase(),
      id: stove.id,
      url: `${stove.url}#retail-names`,
      current: stove.current,
      mfr: stove.manufacturer,
      model: stove.model,
      type: stove.type,
    });
  }
}
names.sort((a, b) => a.q.localeCompare(b.q) || a.model.localeCompare(b.model));
const brands = JSON.parse(readFileSync(join(root, "data/brands.json"), "utf8"));
const aliases = selectRetailAliases(stoves, brands);
names.push(...aliasSearchEntries(aliases));

const dir = join(root, "public/data");
mkdirSync(dir, { recursive: true });
const snapshot = meta.snapshotDate;
writeFileSync(join(dir, "current.json"), JSON.stringify({ snapshot, stoves: current }));
writeFileSync(join(dir, "historical.json"), JSON.stringify({ snapshot, stoves: historical }));
writeFileSync(join(dir, "names.json"), JSON.stringify({ snapshot, names }));
const firewood = JSON.parse(readFileSync(join(root, "data/firewood.json"), "utf8"));
const fuelHeat = JSON.parse(readFileSync(join(root, "data/fuel-heat.json"), "utf8"));
writeFileSync(join(dir, "heating-cost.json"), JSON.stringify(heatingCostPayload({
  snapshotDate: snapshot,
  firewood,
  heat: fuelHeat,
  stoves,
})));

const brandBySlug = new Map(brands.map((brand) => [brand.slug, brand]));
const redirects = compareRedirects(selectComparePairs(stoves, { brandBySlug }));
writeFileSync(join(root, "data/compare-redirects.json"), `${JSON.stringify(redirects, null, 2)}\n`);

const noindexPath = join(root, "data/noindex-paths.json");
const noindex = new Set(JSON.parse(readFileSync(noindexPath, "utf8")));
const targets = new Set(redirects.map((row) => row.targetUrl));
for (const row of redirects) {
  if (!targets.has(row.url)) noindex.add(row.url);
}
for (const target of targets) noindex.delete(target);
writeFileSync(noindexPath, `${JSON.stringify([...noindex].sort(), null, 2)}\n`);
console.log(`Public data: ${current.length} current, ${historical.length} historical, ${names.length} names. Compare redirects: ${redirects.length}.`);
