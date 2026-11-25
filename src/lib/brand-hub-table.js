// Model-line table for one brand hub.
//
// Heat, firebox, and subtype filters follow the HHV efficiency list
// (src/lib/efficiency-finder.js and src/lib/insert-finder.js): a heat
// range matches on overlap, a firebox matches inside the ends, and a
// blank filtered field is not zero. Those modules are not imported here.
// Importing them would also import src/lib/lists.js, and a later list
// edit would restamp every brand URL even when this table did not change.
// A test checks this copy against those functions.
//
// Figures come from the committed catalog. This module does not fetch EPA.
import { fireboxText, formatCount, formatNumber, heatText, statusLabel } from "./format.js";

export const BRAND_HUB_SORT = "emission-asc";
const BLANK_SUBTYPE = "__blank__";

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

const SORT_MODES = [
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

function joinOr(parts) {
  if (parts.length <= 1) return parts[0] || "";
  if (parts.length === 2) return `${parts[0]} or ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, or ${parts.at(-1)}`;
}

function heatEnds(stove) {
  const low = finite(stove?.btuLow);
  const high = finite(stove?.btuHigh);
  if (low != null || high != null) return { btuLow: low, btuHigh: high };
  const max = finite(stove?.btuMax);
  if (max == null) return { btuLow: null, btuHigh: null };
  return { btuLow: max, btuHigh: max };
}

function brandRecord(stove, index) {
  const heat = heatEnds(stove);
  const firebox = finite(stove?.firebox);
  const listed = stove?.fireboxStatus === "listed" && firebox != null;
  return {
    stove,
    index,
    test: {
      emission: finite(stove?.emission),
      emissionUnit: stove?.emissionUnit || "",
      efficiency: finite(stove?.efficiency),
      btuLow: heat.btuLow,
      btuHigh: heat.btuHigh,
      firebox: listed ? firebox : null,
      fireboxStatus: listed ? "listed" : "not_listed",
      subtype: stove?.subtype || "",
    },
  };
}

function flatRow(row) {
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
    current: row.stove?.current === true,
  };
}

function rowAttributes(flat) {
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
    "data-current": flat.current ? "true" : "false",
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

function emissionTie(left, right) {
  const a = left.emission == null ? 999 : left.emission;
  const b = right.emission == null ? 999 : right.emission;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compareListed(left, right, mode) {
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

export function compareBrandRows(left, right, mode = BRAND_HUB_SORT) {
  const parsed = /^([a-z]+)-(asc|desc)$/.exec(mode || "");
  const key = parsed ? parsed[1] : "efficiency";
  const dir = parsed ? parsed[2] : "desc";
  if (key === "efficiency") {
    const efficiency = compareNumber(left.efficiency, right.efficiency, dir);
    if (efficiency) return efficiency;
    const emission = emissionTie(left, right);
    if (emission) return emission;
    return left.model.localeCompare(right.model);
  }
  return compareListed(left, right, `${key}-${dir}`);
}

function readBound(value) {
  if (value == null) return null;
  const text = String(value).trim().replaceAll(",", "");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function brandFiltersFromInputs(values) {
  return {
    subtype: values?.subtype || "",
    heatMin: readBound(values?.heatMin),
    heatMax: readBound(values?.heatMax),
    fireboxMin: readBound(values?.fireboxMin),
    fireboxMax: readBound(values?.fireboxMax),
    status: values?.status || "",
  };
}

function matchesFilters(row, filters) {
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

export function placeBrandRow(row, filters) {
  const status = filters?.status || "";
  if (status === "current" && row.current !== true) return "hide";
  if (status === "previous" && row.current === true) return "hide";
  const heatActive = filters?.heatMin != null || filters?.heatMax != null;
  const boxActive = filters?.fireboxMin != null || filters?.fireboxMax != null;
  const heatMissing = row.btuLow == null && row.btuHigh == null;
  const boxMissing = row.firebox == null;
  const relaxed = {
    subtype: filters?.subtype || "",
    heatMin: heatActive && heatMissing ? null : (filters?.heatMin ?? null),
    heatMax: heatActive && heatMissing ? null : (filters?.heatMax ?? null),
    fireboxMin: boxActive && boxMissing ? null : (filters?.fireboxMin ?? null),
    fireboxMax: boxActive && boxMissing ? null : (filters?.fireboxMax ?? null),
  };
  if (!matchesFilters(row, relaxed)) return "hide";
  if ((heatActive && heatMissing) || (boxActive && boxMissing)) return "unreported";
  return "match";
}

export function brandHubRows(lines) {
  const rows = (lines || []).map((stove, index) => brandRecord(stove, index));
  rows.sort((left, right) => compareBrandRows(flatRow(left), flatRow(right), BRAND_HUB_SORT));
  return rows;
}

function fieldCoverage(rows) {
  const coverage = { rows: rows.length, heat: 0, firebox: 0, emission: 0, efficiency: 0, subtype: 0 };
  for (const row of rows) {
    const flat = flatRow(row);
    if (flat.btuLow != null || flat.btuHigh != null) coverage.heat += 1;
    if (flat.firebox != null) coverage.firebox += 1;
    if (flat.emission != null) coverage.emission += 1;
    if (flat.efficiency != null) coverage.efficiency += 1;
    if (flat.subtype) coverage.subtype += 1;
  }
  return coverage;
}

export function brandSubtypeOptions(rows) {
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
      label: `${SUBTYPE_LABELS[subtype] || subtype}, ${formatCount(counts.get(subtype))}`,
    });
    counts.delete(subtype);
  }
  for (const subtype of [...counts.keys()].sort((a, b) => a.localeCompare(b))) {
    options.push({ value: subtype, label: `${subtype}, ${formatCount(counts.get(subtype))}` });
  }
  if (blank) options.push({ value: BLANK_SUBTYPE, label: `Not listed, ${formatCount(blank)}` });
  return options;
}

export function brandHubFlags(rows) {
  const coverage = fieldCoverage(rows);
  const units = new Set();
  for (const row of rows) {
    if (row.test?.emission == null) continue;
    units.add(row.test.emissionUnit || "");
  }
  return {
    heat: coverage.heat > 0,
    firebox: coverage.firebox > 0,
    subtype: brandSubtypeOptions(rows).length > 0,
    status: rows.length > 0,
    mixedEmission: units.size > 1,
    coverage,
  };
}

export function brandHubSortModes() {
  const preferred = [BRAND_HUB_SORT, "efficiency-desc"];
  const first = preferred.map((value) => SORT_MODES.find((mode) => mode.value === value)).filter(Boolean);
  const rest = SORT_MODES.filter((mode) => !preferred.includes(mode.value));
  return [...first, ...rest];
}

export function brandEmissionHeader(rows) {
  const units = new Set();
  for (const row of rows) {
    if (row.test?.emission == null) continue;
    units.add(row.test.emissionUnit || "");
  }
  if (units.size === 1 && units.has("g/hr")) return "Emission (g/hr)";
  if (units.size === 1 && units.has("lb/mmBTU")) return "Emission (lb/mmBTU)";
  return "Emission";
}

function subtypeText(subtype) {
  if (!subtype) return "Not listed";
  return SUBTYPE_LABELS[subtype] || String(subtype);
}

export function brandHubRowView(row, bareEmission = false) {
  const flat = flatRow(row);
  const stove = row.stove;
  let emission = "Not listed";
  if (flat.emission != null) {
    const number = formatNumber(flat.emission, 3);
    if (bareEmission) emission = number;
    else if (stove.emissionUnit) emission = `${number} ${stove.emissionUnit}`;
    else emission = `${number}, unit not listed by EPA`;
  }
  return {
    model: stove.model,
    modelUrl: stove.url,
    insertFlag: stove.insertFlag === true,
    manufacturer: stove.manufacturer || "Not listed",
    status: statusLabel(stove.current),
    current: stove.current === true,
    emission,
    efficiency: flat.efficiency == null ? "Not listed" : `${formatNumber(flat.efficiency, 2)}%`,
    heat: heatText(stove),
    firebox: fireboxText(stove),
    subtype: subtypeText(flat.subtype),
    fuel: stove.fuel || "Not listed",
    attrs: rowAttributes(flat),
  };
}

export function brandHubCaption(name, mode = BRAND_HUB_SORT) {
  const found = SORT_MODES.find((item) => item.value === mode) || SORT_MODES.find((item) => item.value === BRAND_HUB_SORT);
  return `${name} model lines, ${found.caption}`;
}

export function brandHubStatusText(shown, total, unreported = 0) {
  const noun = total === 1 ? "model line" : "model lines";
  const base = shown === total
    ? `${formatCount(total)} ${noun}.`
    : `Showing ${formatCount(shown)} of ${formatCount(total)} ${noun}.`;
  if (!unreported) return base;
  const extra = unreported === 1 ? "model line is" : "model lines are";
  return `${base} ${formatCount(unreported)} ${extra} under Not listed because a filtered field is blank.`;
}

export function brandHubFilterHelp(flags) {
  const parts = ["The table lists every model line on this hub. Filters narrow it in your browser."];
  parts.push("Certification status is currently certified or previously certified.");
  if (flags?.heat) parts.push("Heat output matches when the listed range overlaps the minimum and maximum.");
  if (flags?.firebox) parts.push("Firebox volume matches when the listed cubic feet are inside the minimum and maximum, including the ends.");
  if (flags?.subtype) parts.push("Subtype is the EPA subtype cell, not a word in the model name.");
  parts.push("A blank cell does not match a number and is not zero. Model lines with that field blank stay under Not listed.");
  if (flags?.mixedEmission) {
    parts.push("The emission sort uses the listed number. It does not convert g/hr and lb/mmBTU.");
  }
  return parts.join(" ");
}

export function brandHubHeading(flags) {
  const parts = [];
  if (flags?.heat) parts.push("heat output");
  if (flags?.firebox) parts.push("firebox");
  if (flags?.subtype) parts.push("subtype");
  parts.push("certification status");
  if (parts.length === 1) return "Filter by certification status";
  return `Filter by ${joinOr(parts)}`;
}
