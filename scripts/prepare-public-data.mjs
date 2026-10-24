import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
      url: stove.url,
      current: stove.current,
      mfr: stove.manufacturer,
      model: stove.model,
      type: stove.type,
    });
  }
}
names.sort((a, b) => a.q.localeCompare(b.q) || a.model.localeCompare(b.model));

const dir = join(root, "public/data");
mkdirSync(dir, { recursive: true });
const snapshot = meta.snapshotDate;
writeFileSync(join(dir, "current.json"), JSON.stringify({ snapshot, stoves: current }));
writeFileSync(join(dir, "historical.json"), JSON.stringify({ snapshot, stoves: historical }));
writeFileSync(join(dir, "names.json"), JSON.stringify({ snapshot, names }));
console.log(`Public data: ${current.length} current, ${historical.length} historical, ${names.length} names.`);
