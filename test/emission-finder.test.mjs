import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { LOGOX_PLACEMENTS } from "../src/lib/affiliates.js";
import { mountEmissionFinder } from "../src/lib/emission-finder-ui.js";
import {
  EMISSION_TITLE_LIMIT,
  compareEmissionRows,
  emissionFilterHelp,
  emissionFinderHeading,
  emissionFinderSentences,
  emissionFlags,
  emissionLeadGroups,
  emissionListNotes,
  emissionListTitle,
  emissionMetaDescription,
  emissionRows,
  emissionStatusText,
  partitionEmissionRows,
  placeEmissionRow,
  woodTestsOnOtherLines,
} from "../src/lib/emission-finder.js";
import { emissionText, formatCount, formatNumber, shortModel } from "../src/lib/format.js";
import { BLANK_SUBTYPE, fieldCoverage, flatInsertRow, rowAttributes } from "../src/lib/insert-finder.js";
import { excludedEmission, rankByEmission } from "../src/lib/lists.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const banned = /\b(best|top-rated|recommend\w*|rankings?|scores?)\b/i;
const ROOM_FIELDS = [
  "New",
  "Model",
  "Manufacturer",
  "Firebox Volume (Cubic Feet)",
  "Emission Rate (grams/hr)",
  "Heat Output (BTUs)",
  "Overall Efficiency-HHV (%)",
  "Type",
  "Subtype",
  "Certified Fuel Type",
  "Test Method",
  "CO (g/min)",
  "NSPS Compliance 2020",
];

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function readJson(path) {
  return JSON.parse(read(path));
}

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += char;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
      continue;
    }
    if (char !== "\r") field += char;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((cells) => cells.some((cell) => cell !== ""));
  return body.map((cells) => {
    const record = {};
    header.forEach((name, index) => {
      record[name] = cells[index] ?? "";
    });
    return record;
  });
}

function signature(row) {
  return ROOM_FIELDS.map((field) => (row[field] || "").trim()).join("\0");
}

function parseNumber(value) {
  const text = (value || "").trim();
  if (!text || ["not applicable", "n/a", "na"].includes(text.toLowerCase())) return null;
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error(`cannot parse number ${text}`);
  return Number(text);
}

function parseBtu(value) {
  const text = (value || "").trim();
  if (!text) return [null, null];
  const pair = text.match(/^(\d+)\s*-\s*(\d+)$/);
  if (pair) return [Number(pair[1]), Number(pair[2])];
  const single = text.match(/^(\d+)$/);
  if (single) return [Number(single[1]), Number(single[1])];
  throw new Error(`cannot parse BTU ${text}`);
}

function parseFirebox(value) {
  const text = (value || "").trim();
  if (!text) return { firebox: null, fireboxStatus: "not_listed" };
  if (text.toLowerCase() === "not applicable") return { firebox: null, fireboxStatus: "not_applicable" };
  return { firebox: parseNumber(text), fireboxStatus: "listed" };
}

function choosePrimary(tests) {
  const ordered = [...tests].sort((left, right) => {
    if ((left.emission == null) !== (right.emission == null)) return left.emission == null ? 1 : -1;
    if ((left.emission ?? 0) !== (right.emission ?? 0)) return (left.emission ?? 0) - (right.emission ?? 0);
    if ((left.efficiency ?? 0) !== (right.efficiency ?? 0)) return (left.efficiency ?? 0) - (right.efficiency ?? 0);
    return 0;
  });
  const pool = ordered.some((test) => test.current) ? ordered.filter((test) => test.current) : ordered;
  return [...pool].sort((left, right) => {
    if ((left.emission == null) !== (right.emission == null)) return left.emission == null ? 1 : -1;
    if ((left.emission ?? 0) !== (right.emission ?? 0)) return (left.emission ?? 0) - (right.emission ?? 0);
    if ((left.efficiency == null) !== (right.efficiency == null)) return left.efficiency == null ? 1 : -1;
    return 0;
  })[0];
}

function offlineLines() {
  const all = parseCsv(read("data/raw/rh_all.csv"));
  const currentRows = parseCsv(read("data/raw/rh_inprod.csv"));
  const currentCounts = new Map();
  for (const row of currentRows) {
    const key = signature(row);
    currentCounts.set(key, (currentCounts.get(key) || 0) + 1);
  }
  const seen = new Map();
  const grouped = new Map();
  for (const row of all) {
    const key = signature(row);
    const used = seen.get(key) || 0;
    const current = used < (currentCounts.get(key) || 0);
    if (current) seen.set(key, used + 1);
    const manufacturer = (row.Manufacturer || "").trim();
    const model = (row.Model || "").trim();
    const id = `${manufacturer}\0${model}`;
    const [btuLow, btuHigh] = parseBtu(row["Heat Output (BTUs)"]);
    const firebox = parseFirebox(row["Firebox Volume (Cubic Feet)"]);
    const testRow = {
      current,
      type: (row.Type || "").trim(),
      subtype: (row.Subtype || "").trim(),
      emission: parseNumber(row["Emission Rate (grams/hr)"]),
      emissionUnit: "g/hr",
      efficiency: parseNumber(row["Overall Efficiency-HHV (%)"]),
      btuLow,
      btuHigh,
      firebox: firebox.firebox,
      fireboxStatus: firebox.fireboxStatus,
      fuel: (row["Certified Fuel Type"] || "").trim(),
    };
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(testRow);
  }
  const listed = [];
  let excluded = 0;
  let elsewhere = 0;
  for (const [id, tests] of grouped) {
    if (!tests.some((test) => test.current)) continue;
    const primary = choosePrimary(tests);
    if (primary.type !== "Wood Stove") {
      elsewhere += tests.filter((test) => test.current && test.type === "Wood Stove").length;
      continue;
    }
    if (primary.emission == null) {
      excluded += 1;
      continue;
    }
    const [manufacturer, model] = id.split("\0");
    listed.push({
      manufacturer,
      model,
      subtype: primary.subtype,
      emission: primary.emission,
      emissionUnit: primary.emissionUnit,
      efficiency: primary.efficiency,
      btuLow: primary.btuLow,
      btuHigh: primary.btuHigh,
      firebox: primary.fireboxStatus === "listed" ? primary.firebox : null,
      fuel: primary.fuel,
    });
  }
  listed.sort((a, b) => a.emission - b.emission || (b.efficiency ?? -1) - (a.efficiency ?? -1) || a.model.localeCompare(b.model));
  return { listed, excluded, elsewhere };
}

function lineKey(row) {
  const num = (value) => (value == null ? "" : String(Math.round(value * 1e6) / 1e6));
  return [
    row.manufacturer,
    row.model,
    row.subtype,
    num(row.emission),
    num(row.efficiency),
    num(row.btuLow),
    num(row.btuHigh),
    num(row.firebox),
    row.fuel || "",
  ].join("\0");
}

function multiset(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = lineKey(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function leadFromListed(listed, slots = 3) {
  if (!listed.length || slots < 1) return [];
  const cutoff = listed[Math.min(slots, listed.length) - 1].emission;
  const groups = [];
  for (const row of listed) {
    if (row.emission > cutoff) break;
    const item = { model: row.model, manufacturer: row.manufacturer };
    const last = groups.at(-1);
    if (!last || last.emission !== row.emission || last.unit !== row.emissionUnit) {
      groups.push({ emission: row.emission, unit: row.emissionUnit, models: [item] });
    } else last.models.push(item);
  }
  return groups;
}

function specPlace(row, filters) {
  const subtype = filters.subtype || "";
  if (subtype === BLANK_SUBTYPE) {
    if (row.subtype) return "hide";
  } else if (subtype && row.subtype !== subtype) return "hide";
  const heatActive = filters.heatMin != null || filters.heatMax != null;
  const boxActive = filters.fireboxMin != null || filters.fireboxMax != null;
  const heatMissing = row.btuLow == null && row.btuHigh == null;
  const boxMissing = row.firebox == null;
  if (heatActive && !heatMissing) {
    const low = row.btuLow ?? row.btuHigh;
    const high = row.btuHigh ?? row.btuLow;
    if (filters.heatMin != null && high < filters.heatMin) return "hide";
    if (filters.heatMax != null && low > filters.heatMax) return "hide";
  }
  if (boxActive && !boxMissing) {
    if (filters.fireboxMin != null && row.firebox < filters.fireboxMin) return "hide";
    if (filters.fireboxMax != null && row.firebox > filters.fireboxMax) return "hide";
  }
  if ((heatActive && heatMissing) || (boxActive && boxMissing)) return "unreported";
  return "match";
}

function tally(rows, filters) {
  const counts = { match: 0, unreported: 0, hide: 0 };
  for (const row of rows) counts[specPlace(row, filters)] += 1;
  return counts;
}

function listedNumbers(rows, pick) {
  return rows.map(pick).filter((value) => value != null).sort((a, b) => a - b);
}

function hasLiteral(source, token) {
  const escaped = String(token).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\d.])${escaped}(?![\\d])`).test(source);
}

function stove(partial) {
  return {
    id: partial.model,
    current: true,
    type: "Wood Stove",
    emissionUnit: "g/hr",
    manufacturer: "",
    efficiency: null,
    btuLow: null,
    btuHigh: null,
    btuMax: null,
    firebox: null,
    fireboxStatus: "not_listed",
    subtype: "",
    fuel: "",
    url: `/stoves/example/${partial.model}/`,
    ...partial,
  };
}

const stoves = readJson("data/stoves.json");
const meta = readJson("data/meta.json");
const rows = emissionRows(stoves);
const flats = rows.map((row) => flatInsertRow(row));
const offline = offlineLines();
const offlineFlats = offline.listed;

test("currently certified emission rows match an offline recompute of the committed files", () => {
  assert.ok(rows.length > 0);
  assert.equal(offline.excluded, excludedEmission(stoves, "Wood Stove"));
  assert.equal(offline.elsewhere, woodTestsOnOtherLines(stoves));
  const fromCatalog = rows.map((row) => ({
    manufacturer: row.stove.manufacturer || "",
    model: row.stove.model,
    subtype: row.test.subtype || "",
    emission: row.test.emission,
    efficiency: row.test.efficiency,
    btuLow: row.test.btuLow,
    btuHigh: row.test.btuHigh,
    firebox: row.test.firebox,
    fuel: row.stove.fuel || "",
  }));
  assert.deepEqual(multiset(fromCatalog), multiset(offlineFlats));
  assert.deepEqual(rows.map((row) => row.stove.id), rankByEmission(stoves, "Wood Stove").map((stove) => stove.id));
  const sorted = [...flats].sort((left, right) => compareEmissionRows(left, right, "emission-asc"));
  assert.deepEqual(sorted.map((row) => row.id), flats.map((row) => row.id));
  const coverage = fieldCoverage(rows);
  assert.equal(coverage.rows, offlineFlats.length);
  assert.equal(coverage.heat, offlineFlats.filter((row) => row.btuLow != null || row.btuHigh != null).length);
  assert.equal(coverage.firebox, offlineFlats.filter((row) => row.firebox != null).length);
  assert.equal(coverage.emission, offlineFlats.length);
  const flags = emissionFlags(rows);
  assert.equal(flags.heat, coverage.heat > 0);
  assert.equal(flags.firebox, coverage.firebox > 0);
  assert.equal(flags.subtype, coverage.subtype > 0 || offlineFlats.some((row) => !row.subtype));
  assert.equal(new Set(offlineFlats.map((row) => row.emissionUnit)).size, 1);
  assert.equal(offlineFlats[0].emissionUnit, "g/hr");
});

test("title and answer box use the offline lowest g/hr, the listed count, and the lead models", () => {
  const lowest = offlineFlats[0].emission;
  const count = offlineFlats.length;
  const figure = emissionText(lowest, "g/hr");
  const title = emissionListTitle(rows);
  const sentences = emissionFinderSentences(stoves, meta.snapshotDate);
  const description = emissionMetaDescription(stoves, meta.snapshotDate);
  const groups = leadFromListed(offlineFlats);
  assert.deepEqual(emissionLeadGroups(rows), groups);
  assert.equal(sentences.length, 3);
  assert.equal(title.includes(formatCount(count)), true, title);
  assert.equal(title.includes(`${formatNumber(lowest, 3)} g/hr`), true, title);
  assert.ok(title.length <= EMISSION_TITLE_LIMIT, title);
  assert.equal(description.includes(formatCount(count)), true, description);
  assert.equal(description.includes(figure), true, description);
  assert.ok(description.length <= 180, description.length);
  assert.equal(sentences[0].includes(formatCount(count)), true);
  assert.equal(sentences[0].includes(meta.snapshotDate), true);
  for (const group of groups) {
    assert.equal(sentences[0].includes(emissionText(group.emission, group.unit)), true, sentences[0]);
    for (const item of group.models) assert.equal(sentences[0].includes(shortModel(item.model)), true, item.model);
  }
  const cutoff = groups.at(-1).emission;
  const outside = offlineFlats.find((row) => row.emission > cutoff);
  assert.ok(outside);
  assert.equal(sentences[0].includes(shortModel(outside.model)), false, outside.model);
  assert.match(sentences[1], /not listed by EPA/);
  assert.match(sentences[1], /not zero/);
  if (offline.excluded === 0) assert.match(sentences[1], /none were left out of this order/);
  else assert.match(sentences[1], new RegExp(formatCount(offline.excluded)));
  assert.match(sentences[2], /ties are ordered by a higher HHV efficiency, then by model name/);
  assert.match(sentences[2], /EPA does not define/);
  assert.match(sentences[2], new RegExp(`snapshot ${meta.snapshotDate}`));
  const notes = emissionListNotes(stoves).join(" ");
  if (offline.elsewhere) assert.match(notes, new RegExp(formatCount(offline.elsewhere)));
  const text = [...sentences, notes, emissionFilterHelp(emissionFlags(rows)), emissionFinderHeading(emissionFlags(rows)), title].join("\n");
  assert.equal(banned.test(text), false, text.match(banned)?.[0]);
  assert.equal(text.includes("cfpub.epa.gov"), false);
  const sources = [
    read("src/pages/cleanest-burning-wood-stoves.astro"),
    read("src/lib/emission-finder.js"),
    read("src/lib/emission-finder-ui.js"),
    read("src/components/EmissionFinder.astro"),
  ].join("\n");
  assert.equal(hasLiteral(sources, formatNumber(lowest, 3)), false);
  assert.equal(hasLiteral(sources, formatCount(count)), false);
  assert.equal(sources.includes(title), false);
  assert.equal(sources.includes(figure), false);
});

test("lead names include every model at the cutoff figure and skip a higher one", () => {
  const tied = [
    stove({ model: "A", emission: 0.1, efficiency: 70 }),
    stove({ model: "B", emission: 0.2, efficiency: 70 }),
    stove({ model: "C", emission: 0.3, efficiency: 80 }),
    stove({ model: "D", emission: 0.3, efficiency: 60 }),
    stove({ model: "E", emission: 0.4, efficiency: 90 }),
    stove({ model: "Blank", emission: null, efficiency: 99 }),
    stove({ model: "Old", emission: 0.05, efficiency: 99, current: false }),
    stove({ model: "Pellet", emission: 0.01, efficiency: 99, type: "Pellet Stove" }),
  ];
  const text = emissionFinderSentences(tied, "2026-11-15")[0];
  assert.match(text, /0\.1 grams per hour on A/);
  assert.match(text, /0\.2 grams per hour on B/);
  assert.match(text, /0\.3 grams per hour on C and D/);
  assert.equal(text.includes("E"), false);
  assert.equal(text.includes("Blank"), false);
  assert.equal(text.includes("Old"), false);
  assert.equal(text.includes("Pellet"), false);
  assert.match(text, /5 currently certified/);
  const same = [
    stove({ model: "Later", emission: 0.2, efficiency: 10 }),
    stove({ model: "Higher", emission: 0.2, efficiency: 80 }),
    stove({ model: "Middle", emission: 0.2, efficiency: 40 }),
    stove({ model: "Fourth", emission: 0.2, efficiency: 20 }),
    stove({ model: "Higher figure", emission: 0.5, efficiency: 99 }),
  ];
  const sameText = emissionFinderSentences(same, "2026-11-15")[0];
  assert.match(sameText, /0\.2 grams per hour on Higher, Middle, Fourth, and Later/);
  assert.equal(sameText.includes("Higher figure"), false);
  const two = [stove({ model: "Only", emission: 1, efficiency: 50 }), stove({ model: "Second", emission: 2, efficiency: 40 })];
  const twoText = emissionFinderSentences(two, "2026-11-15")[0];
  assert.match(twoText, /2 currently certified wood-stove model lines/);
  assert.match(twoText, /1 grams per hour on Only/);
  assert.match(twoText, /2 grams per hour on Second/);
  const one = emissionFinderSentences([stove({ model: "Solo", emission: 0.4 })], "2026-11-15");
  assert.match(one[0], /1 currently certified wood-stove model line/);
  assert.match(one[0], /0\.4 grams per hour on Solo/);
  assert.equal(one.length <= 3, true);
  const empty = emissionFinderSentences([], "2026-11-15");
  assert.match(empty[0], /no currently certified wood-stove model line/);
  assert.equal(empty.length <= 3, true);
  assert.equal(emissionListTitle([]).includes("g/hr"), false);
  const collision = [
    stove({ model: "Twin", manufacturer: "Alpha", emission: 0.2, efficiency: 70 }),
    stove({ model: "Twin", manufacturer: "Beta", emission: 0.2, efficiency: 60 }),
    stove({ model: "Other", emission: 0.9, efficiency: 10 }),
  ];
  const collisionText = emissionFinderSentences(collision, "2026-11-15")[0];
  assert.match(collisionText, /Twin \(Alpha\)/);
  assert.match(collisionText, /Twin \(Beta\)/);
  const ordered = [...tied.filter((item) => item.current && item.type === "Wood Stove" && item.emission != null)]
    .map((item) => ({ emission: item.emission, efficiency: item.efficiency, model: item.model, manufacturer: "", id: item.model, index: 0 }))
    .sort((left, right) => compareEmissionRows(left, right, "emission-asc"));
  assert.deepEqual(ordered.map((item) => item.id), ["A", "B", "C", "D", "E"]);
});

test("filter counts match an offline recompute and a blank is not zero", () => {
  const subtypes = [...new Set(offlineFlats.map((row) => row.subtype).filter(Boolean))];
  const highs = listedNumbers(offlineFlats, (row) => row.btuHigh ?? row.btuLow);
  const lows = listedNumbers(offlineFlats, (row) => row.btuLow ?? row.btuHigh);
  const volumes = listedNumbers(offlineFlats, (row) => row.firebox);
  assert.ok(subtypes.length > 0);
  assert.ok(highs.length > 0);
  assert.ok(volumes.length > 0);
  const mid = (values) => values[Math.floor(values.length / 2)];
  const cases = [
    {},
    ...subtypes.map((subtype) => ({ subtype })),
    { subtype: BLANK_SUBTYPE },
    { heatMin: mid(highs) },
    { heatMax: mid(lows) },
    { heatMin: lows[0], heatMax: highs[highs.length - 1] },
    { heatMin: highs[highs.length - 1] + 1 },
    { fireboxMin: mid(volumes) },
    { fireboxMax: mid(volumes) },
    { fireboxMin: volumes[0], fireboxMax: volumes[volumes.length - 1] },
    { fireboxMin: volumes[volumes.length - 1] + 1 },
    { subtype: subtypes[0], fireboxMin: volumes[0], heatMax: highs[highs.length - 1] },
  ];
  for (const filters of cases) {
    const part = partitionEmissionRows(rows, filters);
    const expected = tally(offlineFlats, filters);
    assert.equal(part.match.length, expected.match, JSON.stringify(filters));
    assert.equal(part.unreported.length, expected.unreported, JSON.stringify(filters));
  }
  const blank = { subtype: "", emission: 1, efficiency: 70, btuLow: null, btuHigh: null, firebox: null, model: "Blank", manufacturer: "M", id: "blank", index: 0 };
  const zero = { ...blank, btuLow: 0, btuHigh: 0, firebox: 0, model: "Zero", id: "zero" };
  assert.equal(specPlace(blank, { heatMin: 1 }), "unreported");
  assert.equal(placeEmissionRow(blank, { heatMin: 1 }), "unreported");
  assert.equal(specPlace(zero, { heatMax: 0, fireboxMax: 0 }), "match");
  assert.equal(placeEmissionRow(zero, { heatMax: 0, fireboxMax: 0 }), "match");
  assert.equal(placeEmissionRow(blank, {}), "match");
});

test("the emission page keeps the finder on the existing URL", () => {
  const page = read("src/pages/cleanest-burning-wood-stoves.astro");
  const component = read("src/components/EmissionFinder.astro");
  const lib = read("src/lib/emission-finder.js");
  const ui = read("src/lib/emission-finder-ui.js");
  const text = [page, component, lib, ui].join("\n");
  assert.equal(banned.test([page, component, lib, ui].join("\n")), false);
  assert.equal(text.includes("cfpub.epa.gov"), false);
  assert.equal(page.includes(`Logo${"x"}Note`), false);
  assert.equal(page.includes('rel="sponsored'), false);
  assert.equal(page.includes('href="/cleanest-burning-pellet-stoves/"'), true);
  assert.match(component, /rows\.map/);
  assert.match(component, /id="emission-finder-rows"/);
  assert.match(component, /mountEmissionFinder/);
  assert.match(component, /<caption id="emission-finder-caption">/);
  assert.doesNotMatch(component, /<tbody id="emission-finder-rows">\s*<\/tbody>/);
  assert.match(page, /articleLd\(/);
  assert.match(page, /webAppLd\(/);
  assert.doesNotMatch(page, /Product|Review|AggregateRating|noindex|FAQPage/);
  assert.equal(existsSync(join(root, "src/pages/tools/emission-finder.astro")), false);
  assert.equal(existsSync(join(root, "src/pages/cleanest-burning-wood-stove-filters.astro")), false);
  const names = readdirSync(join(root, "src/pages")).filter((name) => name.startsWith("cleanest-burning-"));
  assert.deepEqual(names.sort(), ["cleanest-burning-pellet-stoves.astro", "cleanest-burning-wood-stoves.astro"]);
  const noindex = readJson("data/noindex-paths.json");
  assert.equal(noindex.includes("/cleanest-burning-wood-stoves/"), false);
  const robots = read("public/robots.txt");
  assert.match(robots, /Allow:\s*\//);
  assert.doesNotMatch(robots, /Disallow:/);
  assert.equal(LOGOX_PLACEMENTS.filter((item) => item.path === "/cleanest-burning-wood-stoves/").length, 0);
  const brandTable = read("src/lib/brand-hub-table.js");
  assert.equal(brandTable.includes("emission-finder"), false);
  assert.equal(read("src/pages/brands/[brand].astro").includes("emission-finder"), false);
  assert.equal(read("src/pages/brands/[brand].astro").includes("EmissionFinder"), false);
});

test("the browser filter hides, sorts, and parks blank rows under Not reported", () => {
  const elements = new Map();
  const listeners = new Map();
  function make(id, attrs = {}) {
    const node = {
      id,
      tag: "",
      value: "",
      textContent: "",
      hidden: false,
      children: [],
      parent: null,
      attrs: { ...attrs },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
      },
      setAttribute(name, value) {
        this.attrs[name] = String(value);
      },
      addEventListener(type, fn) {
        const list = listeners.get(this) || {};
        list[type] = fn;
        listeners.set(this, list);
      },
      dispatch(type, event = {}) {
        listeners.get(this)?.[type]?.(event);
      },
      appendChild(child) {
        if (child.parent) child.parent.children = child.parent.children.filter((item) => item !== child);
        child.parent = this;
        this.children.push(child);
        return child;
      },
      querySelectorAll(selector) {
        const found = [];
        const walk = (current) => {
          for (const child of current.children) {
            found.push(child);
            walk(child);
          }
        };
        walk(this);
        if (selector === "tr") return found.filter((node) => node.tag === "tr");
        if (selector === "th[data-sort-key]") return found.filter((node) => node.tag === "th" && node.getAttribute("data-sort-key"));
        if (selector === "[data-sort]") return found.filter((node) => node.getAttribute("data-sort"));
        return [];
      },
    };
    if (id) elements.set(id, node);
    return node;
  }
  const doc = { getElementById: (id) => elements.get(id) || null };
  const form = make("emission-finder");
  const body = make("emission-finder-rows");
  const table = make("emission-finder-table");
  make("emission-finder-status");
  const empty = make("emission-finder-empty");
  const caption = make("emission-finder-caption");
  const sort = make("emission-sort");
  const unreportedBody = make("emission-finder-unreported-rows");
  const unreportedSection = make("emission-finder-unreported");
  unreportedSection.hidden = true;
  sort.value = "emission-asc";
  const subtype = make("emission-subtype");
  const heatMin = make("emission-heat-min");
  make("emission-heat-max");
  make("emission-firebox-min");
  const fireboxMax = make("emission-firebox-max");
  table.appendChild(body);
  function header(key, fallback) {
    const cell = make("");
    cell.tag = "th";
    cell.attrs["data-sort-key"] = key;
    const button = make("");
    button.attrs["data-sort"] = key;
    button.attrs["data-default"] = fallback;
    cell.appendChild(button);
    table.appendChild(cell);
    return button;
  }
  const emissionButton = header("emission", "asc");
  header("firebox", "asc");
  for (const row of rows) {
    const tr = make("");
    tr.tag = "tr";
    tr.attrs = rowAttributes(flatInsertRow(row));
    body.appendChild(tr);
  }
  const blank = make("");
  blank.tag = "tr";
  blank.attrs = rowAttributes({
    id: "blank-row",
    model: "Blank",
    manufacturer: "M",
    emission: 1,
    efficiency: 60,
    btuLow: null,
    btuHigh: null,
    firebox: null,
    subtype: "",
    index: rows.length,
  });
  body.appendChild(blank);
  mountEmissionFinder(doc);
  const visible = () => body.children.filter((node) => node.tag === "tr" && !node.hidden);
  const parked = () => unreportedBody.children.filter((node) => node.tag === "tr" && !node.hidden);
  assert.equal(visible().length, rows.length + 1);
  assert.equal(parked().length, 0);
  const withBlank = [...flats, { subtype: "", emission: 1, efficiency: 60, btuLow: null, btuHigh: null, firebox: null }];
  const subtypeValue = flats.find((row) => row.subtype)?.subtype;
  assert.ok(subtypeValue);
  subtype.value = subtypeValue;
  subtype.dispatch("input");
  const expectedSubtype = tally(withBlank, { subtype: subtypeValue });
  assert.equal(visible().length, expectedSubtype.match);
  assert.equal(parked().length, expectedSubtype.unreported);
  subtype.value = "";
  heatMin.value = "10,000";
  heatMin.dispatch("change");
  const expectedHeat = tally(withBlank, { heatMin: 10000 });
  assert.equal(visible().length, expectedHeat.match);
  assert.equal(parked().length, expectedHeat.unreported);
  assert.equal(parked().some((node) => node.getAttribute("data-id") === "blank-row"), expectedHeat.unreported > 0);
  assert.equal(unreportedSection.hidden, expectedHeat.unreported === 0);
  assert.equal(statusText(expectedHeat, withBlank.length), doc.getElementById("emission-finder-status").textContent);
  heatMin.value = "";
  fireboxMax.value = "1";
  fireboxMax.dispatch("input");
  const expectedBox = tally(withBlank, { fireboxMax: 1 });
  assert.equal(visible().length, expectedBox.match);
  assert.equal(parked().length, expectedBox.unreported);
  fireboxMax.value = "";
  sort.value = "firebox-asc";
  sort.dispatch("change");
  const volumes = visible().map((node) => {
    const raw = node.getAttribute("data-firebox");
    return raw ? Number(raw) : null;
  }).filter((value) => value != null);
  for (let index = 1; index < volumes.length; index += 1) assert.ok(volumes[index - 1] <= volumes[index]);
  assert.match(caption.textContent, /smallest listed firebox first/);
  emissionButton.dispatch("click");
  assert.equal(sort.value, "emission-asc");
  const emissions = visible().map((node) => Number(node.getAttribute("data-emission")));
  for (let index = 1; index < emissions.length; index += 1) assert.ok(emissions[index - 1] <= emissions[index]);
  emissionButton.dispatch("click");
  assert.equal(sort.value, "emission-desc");
  const prevented = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  form.dispatch("submit", prevented);
  assert.equal(prevented.defaultPrevented, true);
  assert.equal(empty.hidden, visible().length !== 0);
});

function statusText(part, total) {
  return emissionStatusText(part.match, total, part.unreported);
}
