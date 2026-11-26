// Answer, title, and filters for the existing wood-stove emission list.
// Heat, firebox, and subtype filters follow the HHV efficiency list
// (src/lib/efficiency-finder.js): a heat range matches on overlap, a
// firebox matches inside the ends, and a blank filtered field is not zero.
// Figures come from the committed catalog. This module does not fetch EPA.
import {
  compareEfficiencyRows,
  efficiencyRecord,
  efficiencyStatusText,
  partitionEfficiencyRows,
  placeEfficiencyRow,
} from "./efficiency-finder.js";
import { emissionText, emissionUnitShort, formatCount, formatNumber, metaDescription, pageTitle, shortModel } from "./format.js";
import {
  BLANK_SUBTYPE,
  SORT_MODES,
  compareInsertRows,
  fieldCoverage,
  filterFlags,
  subtypeOptions,
} from "./insert-finder.js";
import { excludedEmission, rankByEmission } from "./lists.js";

export const EMISSION_SORT = "emission-asc";
export const EMISSION_TITLE_LIMIT = 60;
export const EMISSION_LEAD_SLOTS = 3;

export { efficiencyStatusText as emissionStatusText, placeEfficiencyRow as placeEmissionRow };

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

function joinAnd(parts) {
  if (parts.length <= 1) return parts[0] || "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

export function emissionRows(stoves) {
  return rankByEmission(stoves, "Wood Stove").map((stove, index) => efficiencyRecord(stove, index));
}

export function emissionFlags(rows) {
  return filterFlags(rows);
}

export function emissionSubtypeOptions(rows) {
  return subtypeOptions(rows).map((option) => {
    if (option.value !== BLANK_SUBTYPE) return option;
    return { ...option, label: option.label.replace(/^Not listed,/, "Not reported,") };
  });
}

export function emissionSortModes() {
  const preferred = ["emission-asc", "emission-desc"];
  const first = preferred.map((value) => SORT_MODES.find((mode) => mode.value === value)).filter(Boolean);
  const rest = SORT_MODES.filter((mode) => !preferred.includes(mode.value));
  return [...first, ...rest];
}

// Lowest published emission first. The same emission rate keeps the higher
// HHV efficiency first, then the model name. EPA does not define that tie break.
export function compareEmissionRows(left, right, mode = EMISSION_SORT) {
  const parsed = /^([a-z]+)-(asc|desc)$/.exec(mode || "");
  const key = parsed ? parsed[1] : "emission";
  const dir = parsed ? parsed[2] : "asc";
  if (key === "emission") {
    const emission = compareNumber(left.emission, right.emission, dir);
    if (emission) return emission;
    const efficiency = compareNumber(left.efficiency, right.efficiency, "desc");
    if (efficiency) return efficiency;
    return left.model.localeCompare(right.model);
  }
  if (key === "efficiency") return compareEfficiencyRows(left, right, `${key}-${dir}`);
  return compareInsertRows(left, right, `${key}-${dir}`);
}

export function partitionEmissionRows(rows, filters) {
  return partitionEfficiencyRows(rows, filters);
}

export function emissionCaption(mode) {
  if (!mode || mode === "emission-asc") {
    return "Currently certified wood stoves ordered by emission rate, lowest first";
  }
  if (mode === "emission-desc") {
    return "Currently certified wood stoves ordered by emission rate, highest first";
  }
  const found = SORT_MODES.find((item) => item.value === mode);
  const caption = found ? found.caption : "lowest emission rate first";
  return `Currently certified wood stoves with an emission rate listed, ${caption}`;
}

export function emissionFilterHelp(flags) {
  const parts = ["The table starts with every currently certified wood-stove model line that lists an emission rate. Filters narrow it in your browser."];
  if (flags?.heat) parts.push("Heat output matches when the listed range overlaps the minimum and maximum.");
  if (flags?.firebox) parts.push("Firebox volume matches when the listed cubic feet are inside the minimum and maximum, including the ends.");
  if (flags?.subtype) parts.push("Subtype is the EPA subtype cell: catalytic, non-catalytic, or hybrid, not a word in the model name.");
  parts.push("A blank cell does not match a number and is not zero. Model lines with that field blank stay under Not reported.");
  return parts.join(" ");
}

export function emissionFinderHeading(flags) {
  if (flags?.subtype) return "Filter by heat output, firebox, or subtype";
  if (flags?.heat && flags?.firebox) return "Filter by heat output and firebox";
  if (flags?.heat) return "Filter by heat output";
  if (flags?.firebox) return "Filter by firebox";
  return "Sort the emission list";
}

function listedRows(rows) {
  return (rows || []).filter((row) => row?.test?.emission != null);
}

function lowestListed(rows) {
  const listed = listedRows(rows);
  if (!listed.length) return null;
  const emission = Math.min(...listed.map((row) => row.test.emission));
  const sample = listed.find((row) => row.test.emission === emission);
  const unit = sample?.test?.emissionUnit || sample?.stove?.emissionUnit || "g/hr";
  return { emission, unit, count: listed.length };
}

export function emissionListTitle(rows) {
  const lowest = lowestListed(rows);
  if (!lowest) return "Wood stoves by emission rate";
  const figure = `${formatNumber(lowest.emission, 3)} ${emissionUnitShort(lowest.unit) || lowest.unit}`;
  const count = formatCount(lowest.count);
  const candidates = [
    `${count} certified wood stoves, lowest ${figure}`,
    `${count} wood stoves, lowest ${figure}`,
    `Lowest ${figure}, ${count} listed`,
  ];
  const fit = candidates.find((title) => title.length <= EMISSION_TITLE_LIMIT);
  return fit || pageTitle(candidates.at(-1), EMISSION_TITLE_LIMIT);
}

function modelLabel(item, crowded) {
  const name = shortModel(item.model);
  if (crowded && item.manufacturer) return `${name} (${shortModel(item.manufacturer, 48)})`;
  return name;
}

function groupPhrase(group) {
  const figure = emissionText(group.emission, group.unit);
  const names = group.models.map((item) => shortModel(item.model));
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
  const labels = group.models.map((item) => modelLabel(item, (counts.get(shortModel(item.model)) || 0) > 1));
  return `${figure} on ${joinAnd(labels)}`;
}

// The first `slots` model lines in emission order, plus every other model
// line that publishes the same grams-per-hour figure as the last of those.
export function emissionLeadGroups(rows, slots = EMISSION_LEAD_SLOTS) {
  const ranked = listedRows(rows);
  if (!ranked.length || slots < 1) return [];
  const cutoff = ranked[Math.min(slots, ranked.length) - 1].test.emission;
  const groups = [];
  for (const row of ranked) {
    if (row.test.emission > cutoff) break;
    const item = {
      model: row.stove?.model || "",
      manufacturer: row.stove?.manufacturer || "",
    };
    const unit = row.test.emissionUnit || row.stove?.emissionUnit || "g/hr";
    const last = groups.at(-1);
    if (!last || last.emission !== row.test.emission || last.unit !== unit) {
      groups.push({ emission: row.test.emission, unit, models: [item] });
    } else last.models.push(item);
  }
  return groups;
}

function leadSentence(rows, snapshotDate) {
  const count = listedRows(rows).length;
  const groups = emissionLeadGroups(rows);
  const lineWord = count === 1 ? "model line" : "model lines";
  const listed = `${formatCount(count)} currently certified wood-stove ${lineWord}`;
  const rates = groups.length === 1 ? "rate is" : "rates are";
  return `Among ${listed} in the snapshot dated ${snapshotDate}, the lowest published emission ${rates} ${joinAnd(groups.map(groupPhrase))}.`;
}

function excludedBit(excluded, listed) {
  if (excluded === 0) {
    if (listed === 0) return "no currently certified wood-stove model line was left out for a blank emission rate";
    return "every currently certified wood-stove model line lists an emission rate, so none were left out of this order";
  }
  const noun = excluded === 1 ? "model line has" : "model lines have";
  const pronoun = excluded === 1 ? "it is" : "they are";
  return `${formatCount(excluded)} currently certified wood-stove ${noun} no emission rate listed, so ${pronoun} left out of this order`;
}

function coverageSentence(rows, excluded) {
  const coverage = fieldCoverage(rows);
  const covered = coverage.rows
    ? `EPA lists heat output on ${formatCount(coverage.heat)} of ${formatCount(coverage.rows)}, firebox volume on ${formatCount(coverage.firebox)} of ${formatCount(coverage.rows)}, and a subtype on ${formatCount(coverage.subtype)} of ${formatCount(coverage.rows)}`
    : "EPA lists no heat output, firebox volume, or subtype on a model line in this order";
  return `${covered}; ${excludedBit(excluded, coverage.rows)}, and a blank emission rate is not listed by EPA and is not zero.`;
}

export function emissionFinderSentences(stoves, snapshotDate) {
  const rows = emissionRows(stoves);
  const excluded = excludedEmission(stoves, "Wood Stove");
  if (!rows.length) {
    return [
      `EPA lists no currently certified wood-stove model line with an emission rate in the snapshot dated ${snapshotDate}.`,
      `${coverageSentence(rows, excluded)}`,
    ];
  }
  const third = `The table orders model lines by the emission rate EPA reported, lowest first, where ties are ordered by a higher HHV efficiency, then by model name, a tie break that EPA does not define, using the EPA Certified Wood Heater Database, snapshot ${snapshotDate}.`;
  return [leadSentence(rows, snapshotDate), coverageSentence(rows, excluded), third];
}

export function emissionMetaDescription(stoves, snapshotDate) {
  const sentences = emissionFinderSentences(stoves, snapshotDate);
  const text = metaDescription(sentences);
  const lowest = lowestListed(emissionRows(stoves));
  if (!lowest) return text;
  const figure = emissionText(lowest.emission, lowest.unit);
  const count = formatCount(lowest.count);
  if (text.includes(figure) && text.includes(count)) return text;
  const short = `${count} currently certified wood-stove model lines. Lowest published emission rate ${figure}. Snapshot ${snapshotDate}.`;
  return short.length <= 180 ? short : metaDescription([short]);
}

export function woodTestsOnOtherLines(stoves) {
  let count = 0;
  for (const stove of stoves || []) {
    if (stove?.type === "Wood Stove") continue;
    for (const test of stove?.tests || []) {
      if (test?.current === true && test.type === "Wood Stove") count += 1;
    }
  }
  return count;
}

export function emissionListNotes(stoves) {
  const notes = [
    "People search this topic as cleanest-burning wood stoves. The order is EPA's grams-per-hour result only.",
    "A blank emission rate is not listed by EPA. It is not zero, and that model line is left out of this order.",
    "Pellet stoves use the same grams-per-hour unit and are not in this table.",
    "The order uses the primary EPA row for each model line. A line with two rows keeps the current row with the lower emission rate as its primary row.",
    "Previously certified model lines are not in this table.",
    "The filter and the column sort run in the browser. Without that script, the table lists every model line in the emission-rate order.",
    "A blank heat output, firebox volume, or subtype is not reported. It is not estimated, and it is not zero. When a heat or firebox filter is on, a model line with that field blank stays under Not reported.",
  ];
  const elsewhere = woodTestsOnOtherLines(stoves);
  if (elsewhere) {
    const noun = elsewhere === 1 ? "row sits" : "rows sit";
    const pronoun = elsewhere === 1 ? "it is" : "they are";
    notes.push(
      `${formatCount(elsewhere)} currently certified wood-stove test ${noun} on a model line whose primary row is not a wood stove, so ${pronoun} not in this table.`,
    );
  }
  return notes;
}
