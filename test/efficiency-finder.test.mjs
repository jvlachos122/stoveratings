import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { LOGOX_PLACEMENTS } from "../src/lib/affiliates.js";
import { formatCount, formatNumber } from "../src/lib/format.js";
import { mountEfficiencyFinder } from "../src/lib/efficiency-finder-ui.js";
import {
  compareEfficiencyRows,
  efficiencyFilterHelp,
  efficiencyFinderHeading,
  efficiencyFinderNotes,
  efficiencyFinderSentences,
  efficiencyFireboxCell,
  efficiencyFlags,
  efficiencyHeatCell,
  efficiencyRecord,
  efficiencyRows,
  efficiencyStatusText,
  partitionEfficiencyRows,
  placeEfficiencyRow,
} from "../src/lib/efficiency-finder.js";
import { BLANK_SUBTYPE, fieldCoverage, flatInsertRow, rowAttributes } from "../src/lib/insert-finder.js";
import { excludedEfficiency, rankByEfficiency } from "../src/lib/lists.js";

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
  for (const [id, tests] of grouped) {
    if (!tests.some((test) => test.current)) continue;
    const primary = choosePrimary(tests);
    if (primary.type !== "Wood Stove") continue;
    if (primary.efficiency == null) {
      excluded += 1;
      continue;
    }
    const [manufacturer, model] = id.split("\0");
    listed.push({
      manufacturer,
      model,
      subtype: primary.subtype,
      emission: primary.emission,
      efficiency: primary.efficiency,
      btuLow: primary.btuLow,
      btuHigh: primary.btuHigh,
      firebox: primary.fireboxStatus === "listed" ? primary.firebox : null,
      fuel: primary.fuel,
    });
  }
  return { listed, excluded };
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

// Independent of placeEfficiencyRow. A listed heat range overlaps the entered
// bounds. A listed firebox is kept when it sits inside the bounds, including the ends.
// A blank filtered field is not zero and is not estimated into the range.
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

function listPages(dir, prefix = "") {
  const names = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) names.push(...listPages(join(dir, entry.name), rel));
    else if (entry.name.endsWith(".astro")) names.push(rel);
  }
  return names;
}

const stoves = readJson("data/stoves.json");
const meta = readJson("data/meta.json");
const rows = efficiencyRows(stoves);
const flats = rows.map((row) => flatInsertRow(row));
const offline = offlineLines();
const offlineFlats = offline.listed;

test("currently certified efficiency rows match an offline recompute of the committed files", () => {
  assert.ok(rows.length > 0);
  assert.equal(offline.excluded, excludedEfficiency(stoves, "Wood Stove"));
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
  assert.deepEqual(rows.map((row) => row.stove.id), rankByEfficiency(stoves, "Wood Stove").map((stove) => stove.id));
  const sorted = [...flats].sort((left, right) => compareEfficiencyRows(left, right, "efficiency-desc"));
  assert.deepEqual(sorted.map((row) => row.id), flats.map((row) => row.id));
  const coverage = fieldCoverage(rows);
  assert.equal(coverage.rows, offlineFlats.length);
  assert.equal(coverage.heat, offlineFlats.filter((row) => row.btuLow != null || row.btuHigh != null).length);
  assert.equal(coverage.firebox, offlineFlats.filter((row) => row.firebox != null).length);
  assert.equal(coverage.efficiency, offlineFlats.filter((row) => row.efficiency != null).length);
  assert.equal(coverage.subtype, offlineFlats.filter((row) => row.subtype).length);
  const flags = efficiencyFlags(rows);
  assert.equal(flags.heat, coverage.heat > 0);
  assert.equal(flags.firebox, coverage.firebox > 0);
  assert.equal(flags.subtype, coverage.subtype > 0 || offlineFlats.some((row) => !row.subtype));
  for (let index = 1; index < flats.length; index += 1) {
    assert.ok(compareEfficiencyRows(flats[index - 1], flats[index], "efficiency-desc") <= 0);
  }
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
    const part = partitionEfficiencyRows(rows, filters);
    const expected = tally(offlineFlats, filters);
    const fromFlats = tally(flats, filters);
    assert.equal(part.match.length, expected.match, JSON.stringify(filters));
    assert.equal(part.unreported.length, expected.unreported, JSON.stringify(filters));
    assert.equal(part.match.length, fromFlats.match, JSON.stringify(filters));
    assert.equal(part.unreported.length, fromFlats.unreported, JSON.stringify(filters));
  }
  const blank = { subtype: "", emission: 1, efficiency: 70, btuLow: null, btuHigh: null, firebox: null, model: "Blank", manufacturer: "M", id: "blank", index: 0 };
  const zero = { ...blank, btuLow: 0, btuHigh: 0, firebox: 0, model: "Zero", id: "zero" };
  const listed = { ...blank, btuLow: 10000, btuHigh: 20000, firebox: 2, subtype: "Hybrid", model: "Listed", id: "listed" };
  const heatOnly = { ...blank, btuLow: 100, btuHigh: 200, model: "Heat", id: "heat" };
  assert.equal(specPlace(blank, { heatMin: 1 }), "unreported");
  assert.equal(placeEfficiencyRow(blank, { heatMin: 1 }), "unreported");
  assert.equal(specPlace(zero, { heatMax: 0, fireboxMax: 0 }), "match");
  assert.equal(placeEfficiencyRow(zero, { heatMax: 0, fireboxMax: 0 }), "match");
  assert.equal(specPlace(listed, { heatMin: 15000, heatMax: 18000 }), "match");
  assert.equal(placeEfficiencyRow(listed, { heatMin: 15000, heatMax: 18000 }), "match");
  assert.equal(placeEfficiencyRow(listed, { heatMin: 50000 }), "hide");
  assert.equal(placeEfficiencyRow(heatOnly, { heatMin: 1000, fireboxMin: 1 }), "hide");
  assert.equal(placeEfficiencyRow(blank, { heatMin: 1, fireboxMin: 1 }), "unreported");
  assert.equal(placeEfficiencyRow(blank, {}), "match");
  const maximum = efficiencyRecord({
    id: "max",
    model: "Maximum",
    manufacturer: "M",
    efficiency: 70,
    emission: 1,
    btuMax: 5000,
    firebox: null,
    fireboxStatus: "not_listed",
    url: "/stoves/m/maximum/",
  }, 0);
  assert.equal(maximum.test.btuLow, 5000);
  assert.equal(maximum.test.btuHigh, 5000);
  assert.equal(placeEfficiencyRow(flatInsertRow(maximum), { heatMin: 5000, heatMax: 5000 }), "match");
  assert.equal(efficiencyHeatCell(maximum.stove), "5,000 BTU/hr maximum");
  assert.equal(efficiencyHeatCell({ btuLow: null, btuHigh: null }), "Not reported");
  assert.equal(efficiencyFireboxCell({ fireboxStatus: "not_applicable", firebox: null }), "Not applicable");
  assert.equal(efficiencyFireboxCell({ fireboxStatus: "not_listed", firebox: null }), "Not reported");
  assert.equal(efficiencyFireboxCell({ fireboxStatus: "listed", firebox: 0 }), "0 cu ft");
  const tied = [
    { efficiency: 80, emission: 2, model: "Later", manufacturer: "", id: "a", index: 0 },
    { efficiency: 80, emission: 1, model: "Earlier", manufacturer: "", id: "b", index: 1 },
    { efficiency: null, emission: 0, model: "Missing", manufacturer: "", id: "c", index: 2 },
  ];
  const ordered = [...tied].sort((left, right) => compareEfficiencyRows(left, right, "efficiency-desc"));
  assert.deepEqual(ordered.map((row) => row.id), ["b", "a", "c"]);
});

test("the answer box states the count, the efficiency range, coverage, and the snapshot date", () => {
  const sentences = efficiencyFinderSentences(stoves, meta.snapshotDate);
  assert.equal(sentences.length, 3);
  const text = sentences.join(" ");
  const values = offlineFlats.map((row) => row.efficiency);
  const low = Math.min(...values);
  const high = Math.max(...values);
  assert.match(sentences[0], new RegExp(formatCount(offlineFlats.length)));
  assert.match(sentences[0], new RegExp(meta.snapshotDate));
  if (low === high) assert.match(sentences[0], new RegExp(`${formatNumber(low, 2)} percent`));
  else {
    assert.match(sentences[0], new RegExp(`from ${formatNumber(low, 2)} to ${formatNumber(high, 2)} percent`));
  }
  const coverage = fieldCoverage(rows);
  assert.match(sentences[1], new RegExp(`heat output on ${formatCount(coverage.heat)} of ${formatCount(coverage.rows)}`));
  assert.match(sentences[1], new RegExp(`firebox volume on ${formatCount(coverage.firebox)} of ${formatCount(coverage.rows)}`));
  assert.match(sentences[1], new RegExp(`a subtype on ${formatCount(coverage.subtype)} of ${formatCount(coverage.rows)}`));
  assert.match(sentences[1], /not reported by EPA/);
  assert.match(sentences[1], /not zero/);
  if (offline.excluded === 0) assert.match(sentences[1], /none were left out of this order/);
  else assert.match(sentences[1], new RegExp(`${formatCount(offline.excluded)} currently certified`));
  assert.match(sentences[2], /HHV efficiency EPA reported/);
  assert.match(sentences[2], /lower emission rate/);
  assert.match(sentences[2], new RegExp(`snapshot ${meta.snapshotDate}`));
  assert.match(text, /EPA Certified Wood Heater Database/);
  const notes = efficiencyFinderNotes().join(" ");
  const help = efficiencyFilterHelp(efficiencyFlags(rows));
  assert.match(notes, /Not reported/);
  assert.match(help, /Not reported/);
  assert.equal(banned.test(`${text}\n${notes}\n${help}\n${efficiencyFinderHeading(efficiencyFlags(rows))}`), false);
  assert.equal(text.includes("cfpub.epa.gov"), false);
  const empty = efficiencyFinderSentences([], meta.snapshotDate).join(" ");
  assert.match(empty, /no currently certified wood-stove model line/);
  assert.equal(banned.test(empty), false);
});

test("the efficiency page keeps the finder on the existing URL and adds no LogOX link", () => {
  const page = read("src/pages/most-efficient-wood-stoves.astro");
  const component = read("src/components/EfficiencyFinder.astro");
  const lib = read("src/lib/efficiency-finder.js");
  const ui = read("src/lib/efficiency-finder-ui.js");
  const shared = read("src/lib/insert-finder-ui.js");
  const text = [page, component, lib, ui, shared].join("\n");
  assert.equal(banned.test([page, component, lib, ui].join("\n")), false);
  assert.equal(text.includes("cfpub.epa.gov"), false);
  assert.equal(page.includes(`Logo${"x"}Note`), false);
  assert.equal(page.includes('rel="sponsored'), false);
  assert.equal(page.includes('href="/tools/stove-size-calculator/"'), true);
  assert.equal(page.includes(">Fits my space</a>"), true);
  assert.equal(page.includes('href="/tools/firebox-log-length/"'), true);
  assert.equal(page.includes('href="/most-efficient-pellet-stoves/"'), true);
  assert.match(component, /rows\.map/);
  assert.match(component, /id="efficiency-finder-rows"/);
  assert.match(component, /mountEfficiencyFinder/);
  assert.match(component, />Not reported</);
  assert.doesNotMatch(component, /<tbody id="efficiency-finder-rows">\s*<\/tbody>/);
  assert.match(page, /articleLd\(/);
  assert.match(page, /webAppLd\(/);
  assert.doesNotMatch(page, /Product|Review|AggregateRating|noindex|FAQPage/);
  assert.equal(existsSync(join(root, "src/pages/tools/efficiency-finder.astro")), false);
  assert.equal(listPages(join(root, "src/pages")).includes("most-efficient-wood-stoves.astro"), true);
  const noindex = readJson("data/noindex-paths.json");
  assert.equal(noindex.includes("/most-efficient-wood-stoves/"), false);
  const robots = read("public/robots.txt");
  assert.match(robots, /Allow:\s*\//);
  assert.doesNotMatch(robots, /Disallow:/);
  assert.equal(LOGOX_PLACEMENTS.filter((item) => item.path === "/most-efficient-wood-stoves/").length, 0);
  assert.equal(page.includes("/tools/efficiency-finder/"), false);
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
  const form = make("efficiency-finder");
  const body = make("efficiency-finder-rows");
  const table = make("efficiency-finder-table");
  const status = make("efficiency-finder-status");
  const empty = make("efficiency-finder-empty");
  const caption = make("efficiency-finder-caption");
  const sort = make("efficiency-sort");
  const unreportedBody = make("efficiency-finder-unreported-rows");
  const unreportedSection = make("efficiency-finder-unreported");
  unreportedSection.hidden = true;
  sort.value = "efficiency-desc";
  const subtype = make("efficiency-subtype");
  const heatMin = make("efficiency-heat-min");
  const heatMax = make("efficiency-heat-max");
  const fireboxMin = make("efficiency-firebox-min");
  const fireboxMax = make("efficiency-firebox-max");
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
  const efficiencyButton = header("efficiency", "desc");
  header("heat", "desc");
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
  mountEfficiencyFinder(doc);
  const visible = () => body.children.filter((node) => node.tag === "tr" && !node.hidden);
  const parked = () => unreportedBody.children.filter((node) => node.tag === "tr" && !node.hidden);
  assert.equal(visible().length, rows.length + 1);
  assert.equal(parked().length, 0);
  assert.equal(unreportedSection.hidden, true);
  assert.equal(status.textContent, efficiencyStatusText(rows.length + 1, rows.length + 1, 0));
  const subtypeValue = flats.find((row) => row.subtype)?.subtype;
  assert.ok(subtypeValue);
  subtype.value = subtypeValue;
  subtype.dispatch("input");
  const subtypeFilters = { subtype: subtypeValue };
  const expectedSubtype = tally([...flats, { subtype: "", btuLow: null, btuHigh: null, firebox: null }], subtypeFilters);
  assert.equal(visible().length, expectedSubtype.match);
  assert.equal(parked().length, expectedSubtype.unreported);
  subtype.value = "";
  heatMin.value = "10,000";
  heatMin.dispatch("change");
  const withBlank = [...flats, { subtype: "", btuLow: null, btuHigh: null, firebox: null }];
  const expectedHeat = tally(withBlank, { heatMin: 10000 });
  assert.equal(visible().length, expectedHeat.match);
  assert.equal(parked().length, expectedHeat.unreported);
  assert.equal(parked().some((node) => node.getAttribute("data-id") === "blank-row"), expectedHeat.unreported > 0);
  assert.equal(unreportedSection.hidden, expectedHeat.unreported === 0);
  assert.equal(status.textContent, efficiencyStatusText(expectedHeat.match, withBlank.length, expectedHeat.unreported));
  heatMin.value = "";
  fireboxMax.value = "1";
  fireboxMax.dispatch("input");
  const expectedBox = tally(withBlank, { fireboxMax: 1 });
  assert.equal(visible().length, expectedBox.match);
  assert.equal(parked().length, expectedBox.unreported);
  heatMax.value = "1";
  fireboxMax.value = "";
  heatMax.dispatch("input");
  const expectedCut = tally(withBlank, { heatMax: 1 });
  assert.equal(visible().length, expectedCut.match);
  assert.equal(empty.hidden, expectedCut.match !== 0);
  heatMax.value = "";
  sort.value = "firebox-asc";
  sort.dispatch("change");
  const volumes = visible().map((node) => {
    const raw = node.getAttribute("data-firebox");
    return raw ? Number(raw) : null;
  }).filter((value) => value != null);
  for (let index = 1; index < volumes.length; index += 1) assert.ok(volumes[index - 1] <= volumes[index]);
  assert.match(caption.textContent, /smallest listed firebox first/);
  efficiencyButton.dispatch("click");
  assert.equal(sort.value, "efficiency-desc");
  const efficiencies = visible().map((node) => Number(node.getAttribute("data-efficiency")));
  for (let index = 1; index < efficiencies.length; index += 1) assert.ok(efficiencies[index - 1] >= efficiencies[index]);
  efficiencyButton.dispatch("click");
  assert.equal(sort.value, "efficiency-asc");
  const prevented = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  form.dispatch("submit", prevented);
  assert.equal(prevented.defaultPrevented, true);
  assert.equal(body.querySelectorAll("tr").length + unreportedBody.querySelectorAll("tr").length, rows.length + 1);
});
