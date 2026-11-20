// Filters for the existing HHV efficiency list. Figures come from the
// committed catalog. This module does not fetch EPA.
import { formatCount, formatNumber, heatText } from "./format.js";
import {
  BLANK_SUBTYPE,
  SORT_MODES,
  compareInsertRows,
  fieldCoverage,
  filterFlags,
  flatInsertRow,
  matchesInsertFilters,
  rowAttributes,
  subtypeLabel,
  subtypeOptions,
} from "./insert-finder.js";
import { excludedEfficiency, rankByEfficiency } from "./lists.js";

export const EFFICIENCY_SORT = "efficiency-desc";

function finite(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function heatEnds(stove) {
  const low = finite(stove?.btuLow);
  const high = finite(stove?.btuHigh);
  if (low != null || high != null) return { btuLow: low, btuHigh: high };
  const max = finite(stove?.btuMax);
  if (max == null) return { btuLow: null, btuHigh: null };
  return { btuLow: max, btuHigh: max };
}

export function efficiencyRecord(stove, index) {
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

export function efficiencyRows(stoves) {
  return rankByEfficiency(stoves, "Wood Stove").map((stove, index) => efficiencyRecord(stove, index));
}

export function efficiencyFlags(rows) {
  return filterFlags(rows);
}

export function efficiencySubtypeOptions(rows) {
  return subtypeOptions(rows).map((option) => {
    if (option.value !== BLANK_SUBTYPE) return option;
    return { ...option, label: option.label.replace(/^Not listed,/, "Not reported,") };
  });
}

export function efficiencySortModes() {
  const preferred = ["efficiency-desc", "efficiency-asc"];
  const first = preferred.map((value) => SORT_MODES.find((mode) => mode.value === value)).filter(Boolean);
  const rest = SORT_MODES.filter((mode) => !preferred.includes(mode.value));
  return [...first, ...rest];
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

function emissionTie(left, right) {
  const a = left.emission == null ? 999 : left.emission;
  const b = right.emission == null ? 999 : right.emission;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function compareEfficiencyRows(left, right, mode = EFFICIENCY_SORT) {
  const parsed = /^([a-z]+)-(asc|desc)$/.exec(mode || "");
  const key = parsed ? parsed[1] : "efficiency";
  const dir = parsed ? parsed[2] : "desc";
  if (key === "efficiency") {
    const eff = compareNumber(left.efficiency, right.efficiency, dir);
    if (eff) return eff;
    const emission = emissionTie(left, right);
    if (emission) return emission;
    return left.model.localeCompare(right.model);
  }
  return compareInsertRows(left, right, `${key}-${dir}`);
}

export function placeEfficiencyRow(flat, filters) {
  const heatActive = filters?.heatMin != null || filters?.heatMax != null;
  const boxActive = filters?.fireboxMin != null || filters?.fireboxMax != null;
  const heatMissing = flat.btuLow == null && flat.btuHigh == null;
  const boxMissing = flat.firebox == null;
  const relaxed = {
    subtype: filters?.subtype || "",
    heatMin: heatActive && heatMissing ? null : (filters?.heatMin ?? null),
    heatMax: heatActive && heatMissing ? null : (filters?.heatMax ?? null),
    fireboxMin: boxActive && boxMissing ? null : (filters?.fireboxMin ?? null),
    fireboxMax: boxActive && boxMissing ? null : (filters?.fireboxMax ?? null),
  };
  if (!matchesInsertFilters(flat, relaxed)) return "hide";
  if ((heatActive && heatMissing) || (boxActive && boxMissing)) return "unreported";
  return "match";
}

export function partitionEfficiencyRows(rows, filters) {
  const match = [];
  const unreported = [];
  for (const row of rows) {
    const place = placeEfficiencyRow(flatInsertRow(row), filters);
    if (place === "match") match.push(row);
    else if (place === "unreported") unreported.push(row);
  }
  return { match, unreported };
}

export function efficiencyHeatCell(stove) {
  const text = heatText(stove);
  return text === "Not listed" ? "Not reported" : text;
}

export function efficiencyFireboxCell(stove) {
  if (stove?.fireboxStatus === "not_applicable") return "Not applicable";
  const firebox = finite(stove?.firebox);
  if (stove?.fireboxStatus !== "listed" || firebox == null) return "Not reported";
  return `${formatNumber(firebox, 3)} cu ft`;
}

export function efficiencyRowView(row) {
  const flat = flatInsertRow(row);
  const stove = row.stove;
  return {
    model: stove.model,
    modelUrl: stove.url,
    insertFlag: stove.insertFlag === true,
    manufacturer: stove.manufacturer || "Not reported",
    emission: flat.emission == null ? "Not reported" : formatNumber(flat.emission, 3),
    efficiency: flat.efficiency == null ? "Not reported" : `${formatNumber(flat.efficiency, 2)}%`,
    heat: efficiencyHeatCell(stove),
    firebox: efficiencyFireboxCell(stove),
    subtype: flat.subtype ? subtypeLabel(flat.subtype) : "Not reported",
    fuel: stove.fuel || "Not reported",
    attrs: rowAttributes(flat),
  };
}

export function efficiencyCaption(mode) {
  if (!mode || mode === "efficiency-desc") {
    return "Currently certified wood stoves ordered by HHV efficiency, highest first";
  }
  if (mode === "efficiency-asc") {
    return "Currently certified wood stoves ordered by HHV efficiency, lowest first";
  }
  const found = SORT_MODES.find((item) => item.value === mode);
  const caption = found ? found.caption : "highest HHV efficiency first";
  return `Currently certified wood stoves with an HHV efficiency listed, ${caption}`;
}

export function efficiencyStatusText(shown, total, unreported = 0) {
  const noun = total === 1 ? "model line" : "model lines";
  const base = shown === total
    ? `${formatCount(total)} currently certified ${noun}.`
    : `Showing ${formatCount(shown)} of ${formatCount(total)} currently certified ${noun}.`;
  if (!unreported) return base;
  const extra = unreported === 1 ? "model line is" : "model lines are";
  return `${base} ${formatCount(unreported)} ${extra} under Not reported because a filtered field is blank.`;
}

export function efficiencyFilterHelp(flags) {
  const parts = ["The table starts with every currently certified wood-stove model line that lists an HHV efficiency. Filters narrow it in your browser."];
  if (flags?.heat) parts.push("Heat output matches when the listed range overlaps the minimum and maximum.");
  if (flags?.firebox) parts.push("Firebox volume matches when the listed cubic feet are inside the minimum and maximum, including the ends.");
  if (flags?.subtype) parts.push("Subtype is the EPA subtype cell, not a word in the model name.");
  parts.push("A blank cell does not match a number and is not zero. Model lines with that field blank stay under Not reported.");
  return parts.join(" ");
}

export function efficiencyFinderHeading(flags) {
  if (flags?.subtype) return "Filter by heat output, firebox, or subtype";
  if (flags?.heat && flags?.firebox) return "Filter by heat output and firebox";
  if (flags?.heat) return "Filter by heat output";
  if (flags?.firebox) return "Filter by firebox";
  return "Sort the HHV efficiency list";
}

function excludedClause(excluded, listed) {
  if (excluded === 0) {
    if (listed === 0) return "no currently certified wood-stove model line was left out for a blank HHV efficiency";
    return "every currently certified wood-stove model line lists an HHV efficiency, so none were left out of this order";
  }
  const noun = excluded === 1 ? "model line has" : "model lines have";
  const pronoun = excluded === 1 ? "it is" : "they are";
  return `${formatCount(excluded)} currently certified wood-stove ${noun} no HHV efficiency listed, so ${pronoun} left out of this order`;
}

export function efficiencyFinderSentences(stoves, snapshotDate) {
  const rows = efficiencyRows(stoves);
  const excluded = excludedEfficiency(stoves, "Wood Stove");
  const coverage = fieldCoverage(rows);
  const count = rows.length;
  const lineWord = count === 1 ? "model line" : "model lines";
  let first;
  if (!count) {
    first = `EPA lists no currently certified wood-stove model line with an HHV efficiency in the snapshot dated ${snapshotDate}.`;
  } else {
    const values = rows.map((row) => row.test.efficiency);
    const low = Math.min(...values);
    const high = Math.max(...values);
    if (low === high) {
      first = `EPA lists ${formatCount(count)} currently certified wood-stove ${lineWord} with an HHV efficiency of ${formatNumber(low, 2)} percent in the snapshot dated ${snapshotDate}.`;
    } else {
      first = `EPA lists ${formatCount(count)} currently certified wood-stove ${lineWord} with an HHV efficiency in the snapshot dated ${snapshotDate}, from ${formatNumber(low, 2)} to ${formatNumber(high, 2)} percent.`;
    }
  }
  const covered = coverage.rows
    ? `EPA lists heat output on ${formatCount(coverage.heat)} of ${formatCount(coverage.rows)}, firebox volume on ${formatCount(coverage.firebox)} of ${formatCount(coverage.rows)}, and a subtype on ${formatCount(coverage.subtype)} of ${formatCount(coverage.rows)}; `
    : "";
  const second = `${covered}${excludedClause(excluded, count)}, and a blank cell is not reported by EPA and is not zero.`;
  const third = `The table orders model lines by the HHV efficiency EPA reported, highest first, then by a lower emission rate, then by model name, a tie break that EPA does not define, from the EPA Certified Wood Heater Database, snapshot ${snapshotDate}.`;
  return [first, second, third];
}

export function efficiencyFinderNotes() {
  return [
    "The order uses the primary EPA row for each model line. A line with two rows keeps the current row with the lower emission rate as its primary row.",
    "Previously certified model lines are not in this table.",
    "The filter and the column sort run in the browser. Without that script, the table lists every model line in the HHV efficiency order.",
    "A blank heat output, firebox volume, emission rate, fuel, or subtype is not reported. It is not estimated, and it is not zero. When a heat or firebox filter is on, a model line with that field blank stays under Not reported.",
  ];
}
