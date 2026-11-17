// Currently certified wood-stove insert rows from the committed catalog.
// EPA's export has no insert field. This module does not fetch EPA.
import { formatCount, formatNumber, btuRange } from "./format.js";
import { inserts } from "./lists.js";

export const BLANK_SUBTYPE = "__blank__";
export const DEFAULT_SORT = "emission-asc";

const SUBTYPE_LABELS = {
  "Catalytic Stove": "Catalytic",
  "Non-Catalytic Stove": "Non-catalytic",
  Hybrid: "Hybrid",
};

const SUBTYPE_WORDS = [
  ["Catalytic Stove", "catalytic"],
  ["Non-Catalytic Stove", "non-catalytic"],
  ["Hybrid", "hybrid"],
];

export const SORT_MODES = [
  { value: "emission-asc", label: "Emission, lowest first", caption: "lowest emission rate first" },
  { value: "emission-desc", label: "Emission, highest first", caption: "highest emission rate first" },
  { value: "efficiency-desc", label: "HHV efficiency, highest first", caption: "highest HHV efficiency first" },
  { value: "efficiency-asc", label: "HHV efficiency, lowest first", caption: "lowest HHV efficiency first" },
  { value: "heat-desc", label: "Heat output, highest first", caption: "highest listed heat output first" },
  { value: "heat-asc", label: "Heat output, lowest first", caption: "lowest listed heat output first" },
  { value: "firebox-asc", label: "Firebox, smallest first", caption: "smallest listed firebox first" },
  { value: "firebox-desc", label: "Firebox, largest first", caption: "largest listed firebox first" },
  { value: "name-asc", label: "Model name, A to Z", caption: "model name A to Z" },
  { value: "name-desc", label: "Model name, Z to A", caption: "model name Z to A" },
];

function finite(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function joinAnd(parts) {
  if (parts.length <= 1) return parts[0] || "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

function isWoodInsert(stove) {
  return Boolean(stove && stove.insertFlag === true && stove.category === "room" && stove.type === "Wood Stove" && Array.isArray(stove.tests));
}

export function subtypeLabel(subtype) {
  if (!subtype) return "Not listed";
  return SUBTYPE_LABELS[subtype] || String(subtype);
}

export function flatInsertRow(row) {
  const test = row.test || {};
  const firebox = test.fireboxStatus === "listed" ? finite(test.firebox) : null;
  return {
    id: row.stove?.id || "",
    model: row.stove?.model || "",
    manufacturer: row.stove?.manufacturer || "",
    emission: finite(test.emission),
    efficiency: finite(test.efficiency),
    btuLow: finite(test.btuLow),
    btuHigh: finite(test.btuHigh),
    firebox,
    subtype: test.subtype || "",
    index: row.index || 0,
  };
}

export function rowAttributes(flat) {
  const text = (value) => (value == null ? "" : String(value));
  return {
    "data-id": text(flat.id),
    "data-model": text(flat.model),
    "data-manufacturer": text(flat.manufacturer),
    "data-emission": text(flat.emission),
    "data-efficiency": text(flat.efficiency),
    "data-heat-low": text(flat.btuLow),
    "data-heat-high": text(flat.btuHigh),
    "data-firebox": text(flat.firebox),
    "data-subtype": text(flat.subtype),
    "data-index": text(flat.index),
  };
}

function compareNumber(left, right, dir) {
  const leftMissing = left == null;
  const rightMissing = right == null;
  if (leftMissing || rightMissing) {
    if (leftMissing && rightMissing) return 0;
    return leftMissing ? 1 : -1;
  }
  if (left === right) return 0;
  const base = left < right ? -1 : 1;
  return dir === "desc" ? -base : base;
}

function heatParts(row) {
  if (row.btuLow == null && row.btuHigh == null) return null;
  return {
    high: row.btuHigh ?? row.btuLow,
    low: row.btuLow ?? row.btuHigh,
  };
}

function compareHeat(left, right, dir) {
  const a = heatParts(left);
  const b = heatParts(right);
  if (!a || !b) {
    if (!a && !b) return 0;
    return a ? -1 : 1;
  }
  const high = compareNumber(a.high, b.high, dir);
  if (high) return high;
  return compareNumber(a.low, b.low, dir);
}

export function compareInsertRows(left, right, mode = DEFAULT_SORT) {
  const parsed = /^([a-z]+)-(asc|desc)$/.exec(mode || "");
  const key = parsed ? parsed[1] : "emission";
  const dir = parsed ? parsed[2] : "asc";
  let diff = 0;
  if (key === "name") {
    diff = left.model.localeCompare(right.model);
    if (dir === "desc") diff = -diff;
  } else if (key === "heat") diff = compareHeat(left, right, dir);
  else if (key === "efficiency" || key === "firebox" || key === "emission") diff = compareNumber(left[key], right[key], dir);
  else diff = compareNumber(left.emission, right.emission, "asc");
  if (diff) return diff;
  const model = left.model.localeCompare(right.model);
  if (model) return model;
  const maker = String(left.manufacturer || "").localeCompare(String(right.manufacturer || ""));
  if (maker) return maker;
  const id = String(left.id || "").localeCompare(String(right.id || ""));
  if (id) return id;
  return (left.index || 0) - (right.index || 0);
}

export function readBound(value) {
  if (value == null) return null;
  const text = String(value).trim().replaceAll(",", "");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function filtersFromInputs(values) {
  return {
    subtype: values?.subtype || "",
    heatMin: readBound(values?.heatMin),
    heatMax: readBound(values?.heatMax),
    fireboxMin: readBound(values?.fireboxMin),
    fireboxMax: readBound(values?.fireboxMax),
  };
}

export function matchesInsertFilters(row, filters) {
  const subtype = filters?.subtype || "";
  if (subtype === BLANK_SUBTYPE) {
    if (row.subtype) return false;
  } else if (subtype && row.subtype !== subtype) return false;

  const heatMin = filters?.heatMin ?? null;
  const heatMax = filters?.heatMax ?? null;
  if (heatMin != null || heatMax != null) {
    if (row.btuLow == null && row.btuHigh == null) return false;
    const low = row.btuLow ?? row.btuHigh;
    const high = row.btuHigh ?? row.btuLow;
    if (heatMin != null && high < heatMin) return false;
    if (heatMax != null && low > heatMax) return false;
  }

  const fireboxMin = filters?.fireboxMin ?? null;
  const fireboxMax = filters?.fireboxMax ?? null;
  if (fireboxMin != null || fireboxMax != null) {
    if (row.firebox == null) return false;
    if (fireboxMin != null && row.firebox < fireboxMin) return false;
    if (fireboxMax != null && row.firebox > fireboxMax) return false;
  }
  return true;
}

function brandFor(stove, brandBySlug) {
  const brand = brandBySlug?.get?.(stove.primarySlug);
  if (brand?.name && brand.url) return { name: brand.name, url: brand.url };
  if (stove.manufacturer) return { name: stove.manufacturer, url: null };
  return { name: "Not listed", url: null };
}

function collectRows(stoves, brandBySlug, current) {
  const rows = [];
  for (const stove of stoves || []) {
    if (!isWoodInsert(stove)) continue;
    stove.tests.forEach((test, index) => {
      if (!test || test.type !== "Wood Stove") return;
      if (current === true && test.current !== true) return;
      if (current === false && test.current === true) return;
      rows.push({ stove, test, index, brand: brandFor(stove, brandBySlug) });
    });
  }
  return rows;
}

export function currentInsertRows(stoves, brandBySlug) {
  const rows = collectRows(stoves, brandBySlug, true);
  rows.sort((left, right) => compareInsertRows(flatInsertRow(left), flatInsertRow(right), DEFAULT_SORT));
  return rows;
}

export function previousInsertRows(stoves) {
  return collectRows(stoves, null, false);
}

export function fieldCoverage(rows) {
  const coverage = { rows: rows.length, heat: 0, firebox: 0, emission: 0, efficiency: 0, subtype: 0 };
  for (const row of rows) {
    const flat = flatInsertRow(row);
    if (flat.btuLow != null || flat.btuHigh != null) coverage.heat += 1;
    if (flat.firebox != null) coverage.firebox += 1;
    if (flat.emission != null) coverage.emission += 1;
    if (flat.efficiency != null) coverage.efficiency += 1;
    if (flat.subtype) coverage.subtype += 1;
  }
  return coverage;
}

export function subtypeOptions(rows) {
  const counts = new Map();
  let blank = 0;
  for (const row of rows) {
    const subtype = row.test?.subtype || "";
    if (!subtype) blank += 1;
    else counts.set(subtype, (counts.get(subtype) || 0) + 1);
  }
  const options = [];
  for (const [subtype] of SUBTYPE_WORDS) {
    if (!counts.has(subtype)) continue;
    options.push({
      value: subtype,
      label: `${subtypeLabel(subtype)}, ${formatCount(counts.get(subtype))}`,
    });
    counts.delete(subtype);
  }
  for (const subtype of [...counts.keys()].sort((a, b) => a.localeCompare(b))) {
    options.push({ value: subtype, label: `${subtype}, ${formatCount(counts.get(subtype))}` });
  }
  if (blank) options.push({ value: BLANK_SUBTYPE, label: `Not listed, ${formatCount(blank)}` });
  return options;
}

export function filterFlags(rows) {
  const coverage = fieldCoverage(rows);
  return {
    heat: coverage.heat > 0,
    firebox: coverage.firebox > 0,
    subtype: subtypeOptions(rows).length > 0,
    coverage,
  };
}

export function filterInsertRows(rows, filters) {
  return rows.filter((row) => matchesInsertFilters(flatInsertRow(row), filters));
}

export function emissionHeader(rows) {
  const units = new Set();
  for (const row of rows) {
    if (row.test?.emission == null) continue;
    units.add(row.test.emissionUnit || "");
  }
  if (units.size === 1 && units.has("g/hr")) return "Emission (g/hr)";
  return "Emission";
}

function emissionCell(test) {
  const value = finite(test?.emission);
  if (value == null) return "Not listed";
  const number = formatNumber(value, 3);
  if (!test.emissionUnit) return `${number}, unit not listed by EPA`;
  return `${number} ${test.emissionUnit}`;
}

export function insertRowView(row) {
  const flat = flatInsertRow(row);
  const efficiency = flat.efficiency == null ? "Not listed" : `${formatNumber(flat.efficiency, 2)}%`;
  const firebox = flat.firebox == null ? "Not listed" : `${formatNumber(flat.firebox, 3)} cu ft`;
  return {
    model: row.stove.model,
    modelUrl: row.stove.url,
    brand: row.brand?.name || "Not listed",
    brandUrl: row.brand?.url || null,
    emission: emissionCell(row.test),
    efficiency,
    heat: btuRange(flat.btuLow, flat.btuHigh) || "Not listed",
    firebox,
    subtype: subtypeLabel(flat.subtype),
    attrs: rowAttributes(flat),
  };
}

export function finderCaption(mode) {
  const found = SORT_MODES.find((item) => item.value === mode) || SORT_MODES[0];
  return `Currently certified wood-stove rows whose model names indicate an insert, ${found.caption}`;
}

export function finderStatusText(shown, total) {
  const noun = total === 1 ? "row" : "rows";
  if (shown === total) return `${formatCount(total)} currently certified ${noun}.`;
  return `Showing ${formatCount(shown)} of ${formatCount(total)} currently certified ${noun}.`;
}

function splitClause(rows) {
  const counts = new Map();
  let blank = 0;
  for (const row of rows) {
    const subtype = row.test?.subtype || "";
    if (!subtype) blank += 1;
    else counts.set(subtype, (counts.get(subtype) || 0) + 1);
  }
  const parts = [];
  for (const [subtype, word] of SUBTYPE_WORDS) {
    if (!counts.has(subtype)) continue;
    const count = counts.get(subtype);
    parts.push(`${formatCount(count)} ${count === 1 ? "is" : "are"} ${word}`);
    counts.delete(subtype);
  }
  for (const subtype of [...counts.keys()].sort((a, b) => a.localeCompare(b))) {
    const count = counts.get(subtype);
    parts.push(`${formatCount(count)} ${count === 1 ? "is" : "are"} ${subtype}`);
  }
  if (blank) parts.push(`${formatCount(blank)} ${blank === 1 ? "has" : "have"} no subtype listed by EPA`);
  return joinAnd(parts);
}

function coverageSentence(coverage) {
  if (!coverage.rows) return "No currently certified row is available to measure.";
  const keys = ["heat", "firebox", "emission", "efficiency", "subtype"];
  const complete = keys.every((key) => coverage[key] === coverage.rows);
  if (complete) {
    const noun = coverage.rows === 1 ? "row lists" : "rows list";
    return `All ${formatCount(coverage.rows)} ${noun} a heat output, a firebox volume, an emission rate, an HHV efficiency, and a subtype.`;
  }
  const bits = [
    `heat output on ${formatCount(coverage.heat)} of ${formatCount(coverage.rows)}`,
    `firebox volume on ${formatCount(coverage.firebox)} of ${formatCount(coverage.rows)}`,
    `an emission rate on ${formatCount(coverage.emission)} of ${formatCount(coverage.rows)}`,
    `an HHV efficiency on ${formatCount(coverage.efficiency)} of ${formatCount(coverage.rows)}`,
    `a subtype on ${formatCount(coverage.subtype)} of ${formatCount(coverage.rows)}`,
  ];
  return `EPA lists ${joinAnd(bits)}, and a blank cell is not listed by EPA and is not zero.`;
}

export function insertFinderSentences(stoves, snapshotDate) {
  const rows = currentInsertRows(stoves);
  const lines = new Set(rows.map((row) => row.stove.id)).size;
  const dated = `in the snapshot dated ${snapshotDate}`;
  let first;
  if (!rows.length) {
    first = `EPA lists no currently certified wood-stove row whose model name indicates an insert ${dated}.`;
  } else if (lines === rows.length) {
    const noun = rows.length === 1 ? "row" : "rows";
    const name = rows.length === 1 ? "name indicates" : "names indicate";
    first = `EPA lists ${formatCount(rows.length)} currently certified wood-stove ${noun} whose model ${name} an insert ${dated}: ${splitClause(rows)}.`;
  } else {
    const lineNoun = lines === 1 ? "model line" : "model lines";
    const rowNoun = rows.length === 1 ? "row" : "rows";
    first = `EPA lists ${formatCount(lines)} currently certified wood-stove ${lineNoun} and ${formatCount(rows.length)} currently certified ${rowNoun} whose model names indicate an insert ${dated}: ${splitClause(rows)}.`;
  }
  return [
    first,
    coverageSentence(fieldCoverage(rows)),
    `Source: EPA Certified Wood Heater Database, snapshot ${snapshotDate}, which has no insert field.`,
  ];
}

export function filterHelp(flags) {
  const parts = ["The table starts with every currently certified row. Filters narrow it in your browser."];
  if (flags?.heat) parts.push("Heat output matches when the listed range overlaps the minimum and maximum.");
  if (flags?.firebox) parts.push("Firebox volume matches when the listed cubic feet are inside the minimum and maximum, including the ends.");
  if (flags?.subtype) parts.push("Subtype is the EPA subtype cell, not a word in the model name.");
  parts.push("A blank cell does not match a number and is not zero.");
  return parts.join(" ");
}

export function previousSectionLead(stoves) {
  const groups = inserts(stoves, "Wood Stove");
  const lines = groups.previous;
  const covered = lines.reduce((sum, stove) => sum + stove.tests.filter((test) => !test.current).length, 0);
  const both = groups.current.filter((stove) => stove.tests.some((test) => !test.current));
  let text;
  if (!lines.length) {
    text = "No previously certified wood-stove model line in this snapshot has a name that indicates an insert.";
  } else {
    const lineNoun = lines.length === 1 ? "model line is" : "model lines are";
    const rowNoun = covered === 1 ? "row" : "rows";
    text = `${formatCount(lines.length)} previously certified ${lineNoun} listed below, covering ${formatCount(covered)} previously certified ${rowNoun}.`;
  }
  if (both.length === 1) {
    text = `${text} 1 model line also has a previously certified row beside its currently certified row. That row is not repeated below.`;
  } else if (both.length > 1) {
    text = `${text} ${formatCount(both.length)} model lines also have a previously certified row beside a currently certified row. Those rows are not repeated below.`;
  }
  return text;
}

export function insertFinderNotes(stoves) {
  const notes = [
    "The filter table is one row per currently certified EPA result. Sorting that table follows the EPA column you choose.",
  ];
  const previous = fieldCoverage(previousInsertRows(stoves));
  if (previous.rows) {
    notes.push(
      `Of ${formatCount(previous.rows)} previously certified wood-stove insert rows, ${formatCount(previous.heat)} list a heat output and ${formatCount(previous.firebox)} list a firebox volume. A blank is not zero.`,
    );
  }
  return notes;
}
