import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { LOGOX_PLACEMENTS } from "../src/lib/affiliates.js";
import { formatCount } from "../src/lib/format.js";
import { mountInsertFinder } from "../src/lib/insert-finder-ui.js";
import {
  BLANK_SUBTYPE,
  compareInsertRows,
  currentInsertRows,
  fieldCoverage,
  filterFlags,
  filterHelp,
  filterInsertRows,
  finderStatusText,
  flatInsertRow,
  insertFinderNotes,
  insertFinderSentences,
  insertRowView,
  matchesInsertFilters,
  previousInsertRows,
  previousSectionLead,
  readBound,
  rowAttributes,
} from "../src/lib/insert-finder.js";
import { inserts } from "../src/lib/lists.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const banned = /\b(best|top-rated|recommend\w*|rankings?|scores?)\b/i;
const INSERT_RE = /insert|\b-I\b/i;
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

function readOverrides() {
  const text = read("data/insert-overrides.csv").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.length);
  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (quoted) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else if (char === '"') quoted = false;
        else current += char;
      } else if (char === '"') quoted = true;
      else if (char === ",") {
        cells.push(current);
        current = "";
      } else current += char;
    }
    cells.push(current);
    const [manufacturer, model, insert] = cells;
    rows.push({ manufacturer, model, insert });
  }
  return rows;
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
  if (!text) return null;
  if (text.toLowerCase() === "not applicable") return null;
  return parseNumber(text);
}

function insertFlags() {
  const flags = new Map();
  for (const row of readOverrides()) {
    flags.set(`${row.manufacturer}\n${row.model}`, row.insert === "yes");
  }
  return flags;
}

function offlineCurrentRows() {
  const all = parseCsv(read("data/raw/rh_all.csv"));
  const currentRows = parseCsv(read("data/raw/rh_inprod.csv"));
  const currentCounts = new Map();
  for (const row of currentRows) {
    const key = signature(row);
    currentCounts.set(key, (currentCounts.get(key) || 0) + 1);
  }
  const overrides = insertFlags();
  const seen = new Map();
  const rows = [];
  for (const row of all) {
    const key = signature(row);
    const used = seen.get(key) || 0;
    const current = used < (currentCounts.get(key) || 0);
    if (current) seen.set(key, used + 1);
    if (!current) continue;
    if ((row.Type || "").trim() !== "Wood Stove") continue;
    const manufacturer = (row.Manufacturer || "").trim();
    const model = (row.Model || "").trim();
    const override = overrides.get(`${manufacturer}\n${model}`);
    const insert = override == null ? INSERT_RE.test(model) : override;
    if (!insert) continue;
    const [btuLow, btuHigh] = parseBtu(row["Heat Output (BTUs)"]);
    rows.push({
      manufacturer,
      model,
      subtype: (row.Subtype || "").trim(),
      emission: parseNumber(row["Emission Rate (grams/hr)"]),
      efficiency: parseNumber(row["Overall Efficiency-HHV (%)"]),
      btuLow,
      btuHigh,
      firebox: parseFirebox(row["Firebox Volume (Cubic Feet)"]),
    });
  }
  return rows;
}

function rowKey(row) {
  const num = (value) => (value == null ? "" : String(Math.round(value * 1e6) / 1e6));
  return [row.manufacturer, row.model, row.subtype, num(row.emission), num(row.efficiency), num(row.btuLow), num(row.btuHigh), num(row.firebox)].join("\0");
}

function multiset(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = rowKey(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

// Independent of matchesInsertFilters. A listed heat range overlaps the entered
// bounds. A listed firebox is kept when it sits inside the bounds, including the ends.
function specMatch(row, filters) {
  const subtype = filters.subtype || "";
  if (subtype === BLANK_SUBTYPE) {
    if (row.subtype) return false;
  } else if (subtype && row.subtype !== subtype) return false;
  if (filters.heatMin != null || filters.heatMax != null) {
    if (row.btuLow == null && row.btuHigh == null) return false;
    const low = row.btuLow ?? row.btuHigh;
    const high = row.btuHigh ?? row.btuLow;
    if (filters.heatMin != null && high < filters.heatMin) return false;
    if (filters.heatMax != null && low > filters.heatMax) return false;
  }
  if (filters.fireboxMin != null || filters.fireboxMax != null) {
    if (row.firebox == null) return false;
    if (filters.fireboxMin != null && row.firebox < filters.fireboxMin) return false;
    if (filters.fireboxMax != null && row.firebox > filters.fireboxMax) return false;
  }
  return true;
}

function listedNumbers(rows, pick) {
  return rows.map(pick).filter((value) => value != null).sort((a, b) => a - b);
}

const stoves = readJson("data/stoves.json");
const brands = new Map(readJson("data/brands.json").map((brand) => [brand.slug, brand]));
const meta = readJson("data/meta.json");
const rows = currentInsertRows(stoves, brands);
const offline = offlineCurrentRows();
const flats = rows.map(flatInsertRow);

test("currently certified insert rows match an offline recompute of the committed files", () => {
  assert.ok(rows.length > 0);
  assert.deepEqual(multiset(flats), multiset(offline));
  const groups = inserts(stoves, "Wood Stove");
  const fromLines = groups.current.reduce((sum, stove) => sum + stove.tests.filter((test) => test.current && test.type === "Wood Stove").length, 0);
  assert.equal(rows.length, fromLines);
  assert.equal(fieldCoverage(rows).rows, offline.length);
  const coverage = fieldCoverage(rows);
  const offlineCoverage = {
    heat: offline.filter((row) => row.btuLow != null || row.btuHigh != null).length,
    firebox: offline.filter((row) => row.firebox != null).length,
    emission: offline.filter((row) => row.emission != null).length,
    efficiency: offline.filter((row) => row.efficiency != null).length,
    subtype: offline.filter((row) => row.subtype).length,
  };
  assert.equal(coverage.heat, offlineCoverage.heat);
  assert.equal(coverage.firebox, offlineCoverage.firebox);
  assert.equal(coverage.emission, offlineCoverage.emission);
  assert.equal(coverage.efficiency, offlineCoverage.efficiency);
  assert.equal(coverage.subtype, offlineCoverage.subtype);
  const flags = filterFlags(rows);
  assert.equal(flags.heat, coverage.heat > 0);
  assert.equal(flags.firebox, coverage.firebox > 0);
  assert.equal(flags.subtype, coverage.subtype > 0 || offline.some((row) => !row.subtype));
  for (const row of rows) {
    assert.equal(row.stove.insertFlag, true);
    assert.equal(row.stove.type, "Wood Stove");
    assert.equal(row.test.current, true);
    const brand = brands.get(row.stove.primarySlug);
    if (brand) {
      assert.equal(row.brand.name, brand.name);
      assert.equal(row.brand.url, brand.url);
    } else assert.equal(row.brand.url, null);
    const view = insertRowView(row);
    assert.equal(view.modelUrl, row.stove.url);
    assert.match(view.modelUrl, /^\/stoves\/[^/]+\/[^/]+\/$/);
    if (row.test.emission != null) assert.match(view.emission, /g\/hr$/);
    if (row.test.firebox == null) assert.equal(view.firebox, "Not listed");
  }
  for (let index = 1; index < flats.length; index += 1) {
    assert.ok(compareInsertRows(flats[index - 1], flats[index], "emission-asc") <= 0);
  }
});

test("filter counts match an offline recompute and do not treat a blank as zero", () => {
  const subtypes = [...new Set(offline.map((row) => row.subtype).filter(Boolean))];
  const highs = listedNumbers(offline, (row) => row.btuHigh);
  const lows = listedNumbers(offline, (row) => row.btuLow);
  const volumes = listedNumbers(offline, (row) => row.firebox);
  assert.ok(subtypes.length > 0);
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
    const libCount = filterInsertRows(rows, filters).length;
    const specCount = flats.filter((row) => specMatch(row, filters)).length;
    const offlineCount = offline.filter((row) => specMatch(row, filters)).length;
    assert.equal(libCount, specCount, JSON.stringify(filters));
    assert.equal(libCount, offlineCount, JSON.stringify(filters));
    assert.equal(libCount, flats.filter((row) => matchesInsertFilters(row, filters)).length);
  }
  assert.equal(readBound(""), null);
  assert.equal(readBound("  "), null);
  assert.equal(readBound("10,000"), 10000);
  assert.equal(readBound("nope"), null);
  const blankHeat = { subtype: "", emission: 1, efficiency: 70, btuLow: null, btuHigh: null, firebox: 1, model: "A", manufacturer: "M", id: "a", index: 0 };
  const zeroBox = { ...blankHeat, btuLow: 1000, btuHigh: 2000, firebox: 0, id: "b" };
  const open = { ...blankHeat, btuLow: 8000, btuHigh: 20000, firebox: null, id: "c" };
  assert.equal(specMatch(blankHeat, { heatMin: 1 }), false);
  assert.equal(matchesInsertFilters(blankHeat, { heatMin: 1 }), false);
  assert.equal(specMatch(zeroBox, { fireboxMax: 0 }), true);
  assert.equal(matchesInsertFilters(zeroBox, { fireboxMax: 0 }), true);
  assert.equal(specMatch(open, { fireboxMin: 0 }), false);
  assert.equal(matchesInsertFilters(open, { heatMin: 15000, heatMax: 18000 }), true);
  assert.equal(matchesInsertFilters(open, { heatMin: 21000 }), false);
  const missing = [blankHeat, zeroBox, open].sort((a, b) => compareInsertRows(a, b, "heat-desc"));
  assert.equal(missing.at(-1).id, "a");
  const missingAsc = [blankHeat, zeroBox, open].sort((a, b) => compareInsertRows(a, b, "heat-asc"));
  assert.equal(missingAsc.at(-1).id, "a");
});

test("the answer box states computed counts, coverage, and the snapshot date", () => {
  const sentences = insertFinderSentences(stoves, meta.snapshotDate);
  assert.equal(sentences.length, 3);
  const text = sentences.join(" ");
  assert.match(text, new RegExp(meta.snapshotDate));
  assert.match(text, /no insert field/);
  assert.match(text, /EPA Certified Wood Heater Database/);
  const coverage = fieldCoverage(rows);
  const counts = new Map();
  for (const row of offline) counts.set(row.subtype || "", (counts.get(row.subtype || "") || 0) + 1);
  const words = new Map([
    ["Catalytic Stove", "catalytic"],
    ["Non-Catalytic Stove", "non-catalytic"],
    ["Hybrid", "hybrid"],
  ]);
  for (const [subtype, count] of counts) {
    if (!subtype) {
      assert.match(text, new RegExp(`${formatCount(count)} ${count === 1 ? "has" : "have"} no subtype listed by EPA`));
      continue;
    }
    const word = words.get(subtype) || subtype;
    const clause = `${formatCount(count)} ${count === 1 ? "is" : "are"} ${word}`;
    assert.match(text, new RegExp(clause.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  if (["heat", "firebox", "emission", "efficiency", "subtype"].every((key) => coverage[key] === coverage.rows)) {
    assert.match(sentences[1], new RegExp(`All ${formatCount(coverage.rows)}`));
    assert.match(sentences[1], /heat output/);
    assert.match(sentences[1], /firebox volume/);
  } else {
    assert.match(sentences[1], new RegExp(`${formatCount(coverage.heat)} of ${formatCount(coverage.rows)}`));
    assert.match(sentences[1], new RegExp(`${formatCount(coverage.firebox)} of ${formatCount(coverage.rows)}`));
    assert.match(sentences[1], /not zero/);
  }
  const previous = fieldCoverage(previousInsertRows(stoves));
  const notes = insertFinderNotes(stoves).join(" ");
  if (previous.rows) {
    assert.match(notes, new RegExp(`${formatCount(previous.heat)} list a heat output`));
    assert.match(notes, new RegExp(`${formatCount(previous.firebox)} list a firebox volume`));
    assert.match(notes, new RegExp(`Of ${formatCount(previous.rows)}`));
  }
  assert.match(previousSectionLead(stoves), /previously certified/);
  assert.equal(banned.test(`${text}\n${notes}\n${filterHelp(filterFlags(rows))}\n${previousSectionLead(stoves)}`), false);
  assert.equal(text.includes("cfpub.epa.gov"), false);
});

test("the inserts page keeps the finder on the existing URL and leaves LogOX alone", () => {
  const page = read("src/pages/wood-stove-inserts.astro");
  const component = read("src/components/InsertFinder.astro");
  const lib = read("src/lib/insert-finder.js");
  const ui = read("src/lib/insert-finder-ui.js");
  const text = [page, component, lib, ui].join("\n");
  assert.equal(banned.test(text), false);
  assert.equal(text.includes("cfpub.epa.gov"), false);
  assert.equal(page.includes('path="/wood-stove-inserts/"'), true);
  assert.equal((page.match(/path="\/wood-stove-inserts\/"/g) || []).length, 1);
  assert.equal(page.includes('href="/tools/stove-size-calculator/"'), true);
  assert.equal(page.includes('href="/tools/firebox-log-length/"'), true);
  assert.match(component, /rows\.map/);
  assert.match(component, /id="insert-finder-rows"/);
  assert.match(component, /mountInsertFinder/);
  assert.doesNotMatch(component, /<tbody id="insert-finder-rows">\s*<\/tbody>/);
  assert.match(page, /articleLd\(/);
  assert.match(page, /webAppLd\(/);
  assert.doesNotMatch(page, /Product|Review|AggregateRating|noindex/);
  const noindex = readJson("data/noindex-paths.json");
  assert.equal(noindex.includes("/wood-stove-inserts/"), false);
  const robots = read("public/robots.txt");
  assert.match(robots, /Allow:\s*\//);
  assert.doesNotMatch(robots, /Disallow:/);
  const placements = LOGOX_PLACEMENTS.filter((item) => item.path === "/wood-stove-inserts/");
  assert.equal(placements.length, 1);
  assert.equal(page.includes("/tools/insert-finder/"), false);
});

test("the browser filter hides and sorts the server-rendered rows", () => {
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
  const form = make("insert-finder");
  const body = make("insert-finder-rows");
  const table = make("insert-finder-table");
  const status = make("insert-finder-status");
  const empty = make("insert-finder-empty");
  const caption = make("insert-finder-caption");
  const sort = make("insert-sort");
  sort.value = "emission-asc";
  const subtype = make("insert-subtype");
  const heatMin = make("insert-heat-min");
  const heatMax = make("insert-heat-max");
  const fireboxMin = make("insert-firebox-min");
  const fireboxMax = make("insert-firebox-max");
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
  header("heat", "desc");
  for (const row of rows) {
    const tr = make("");
    tr.tag = "tr";
    tr.attrs = rowAttributes(flatInsertRow(row));
    body.appendChild(tr);
  }
  mountInsertFinder(doc);
  assert.equal(status.textContent, finderStatusText(rows.length, rows.length));
  assert.equal(body.children.filter((node) => node.tag === "tr" && !node.hidden).length, rows.length);
  const subtypeValue = flats.find((row) => row.subtype)?.subtype;
  assert.ok(subtypeValue);
  subtype.value = subtypeValue;
  subtype.dispatch("input");
  const expectedSubtype = flats.filter((row) => specMatch(row, { subtype: subtypeValue })).length;
  assert.equal(body.children.filter((node) => node.tag === "tr" && !node.hidden).length, expectedSubtype);
  assert.equal(status.textContent, finderStatusText(expectedSubtype, rows.length));
  subtype.value = "";
  heatMin.value = "10,000";
  heatMin.dispatch("change");
  const expectedHeat = flats.filter((row) => specMatch(row, { heatMin: 10000 })).length;
  assert.equal(body.children.filter((node) => node.tag === "tr" && !node.hidden).length, expectedHeat);
  heatMin.value = "";
  fireboxMax.value = "1";
  fireboxMax.dispatch("input");
  const expectedBox = flats.filter((row) => specMatch(row, { fireboxMax: 1 })).length;
  assert.equal(body.children.filter((node) => node.tag === "tr" && !node.hidden).length, expectedBox);
  const above = (listedNumbers(flats, (row) => row.firebox).at(-1) || 0) + 10;
  fireboxMax.value = String(above);
  heatMax.value = "1";
  heatMax.dispatch("input");
  const expectedCut = flats.filter((row) => specMatch(row, { heatMax: 1, fireboxMax: above })).length;
  assert.equal(body.children.filter((node) => node.tag === "tr" && !node.hidden).length, expectedCut);
  assert.equal(empty.hidden, expectedCut !== 0);
  heatMax.value = "";
  fireboxMax.value = "";
  sort.value = "firebox-asc";
  sort.dispatch("change");
  const visible = body.children.filter((node) => node.tag === "tr" && !node.hidden);
  const volumes = visible.map((node) => {
    const raw = node.getAttribute("data-firebox");
    return raw ? Number(raw) : null;
  }).filter((value) => value != null);
  for (let index = 1; index < volumes.length; index += 1) assert.ok(volumes[index - 1] <= volumes[index]);
  assert.match(caption.textContent, /smallest listed firebox first/);
  emissionButton.dispatch("click");
  assert.equal(sort.value, "emission-asc");
  emissionButton.dispatch("click");
  assert.equal(sort.value, "emission-desc");
  const prevented = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  form.dispatch("submit", prevented);
  assert.equal(prevented.defaultPrevented, true);
  assert.equal(body.querySelectorAll("tr").length, rows.length);
});
