// Room-heater wood-stove rows with a listed firebox volume at or under 1 cubic foot.
// Figures come from the committed catalog. This module does not fetch EPA.
import { btuRange, formatBtu, formatCount, formatNumber, shortModel } from "./format.js";

export const SMALL_FIREBOX_MAX = 1;
export const NOT_LISTED_BY_EPA = "not listed by EPA";
export const SIZING_CAVEAT = "Firebox volume and heat output are EPA test-report figures, not a sizing guarantee.";

const SUBTYPE_LABELS = {
  "Catalytic Stove": "Catalytic",
  "Non-Catalytic Stove": "Non-catalytic",
  Hybrid: "Hybrid",
};

export function fireboxVolumePhrase(value) {
  const number = formatNumber(value, 3);
  if (number == null) return NOT_LISTED_BY_EPA;
  const unit = Number(value) === 1 ? "cubic foot" : "cubic feet";
  return `${number} ${unit}`;
}

export function fireboxLimitPhrase() {
  return fireboxVolumePhrase(SMALL_FIREBOX_MAX);
}

/** Listed cubic feet at or under the limit, including a listed zero. Null means not in the list. */
export function listedSmallFirebox(test) {
  if (!test || test.fireboxStatus !== "listed") return null;
  if (typeof test.firebox !== "number" || !Number.isFinite(test.firebox)) return null;
  if (test.firebox > SMALL_FIREBOX_MAX) return null;
  return test.firebox;
}

export function isSmallWoodTest(stove, test) {
  if (!stove || stove.category !== "room") return false;
  if (!test || test.type !== "Wood Stove") return false;
  return listedSmallFirebox(test) !== null;
}

export function compareSmallWoodRows(left, right) {
  if (left.firebox !== right.firebox) return left.firebox - right.firebox;
  const model = left.stove.model.localeCompare(right.stove.model);
  if (model) return model;
  const maker = String(left.stove.manufacturer || "").localeCompare(String(right.stove.manufacturer || ""));
  if (maker) return maker;
  return left.index - right.index;
}

export function smallWoodRows(stoves) {
  const rows = [];
  for (const stove of stoves) {
    if (!stove || stove.category !== "room" || !Array.isArray(stove.tests)) continue;
    stove.tests.forEach((test, index) => {
      const firebox = test?.type === "Wood Stove" ? listedSmallFirebox(test) : null;
      if (firebox === null) return;
      rows.push({
        stove,
        test,
        index,
        firebox,
        current: test.current === true,
      });
    });
  }
  rows.sort(compareSmallWoodRows);
  return rows;
}

export function splitSmallWoodRows(stoves) {
  const rows = smallWoodRows(stoves);
  return {
    current: rows.filter((row) => row.current),
    previous: rows.filter((row) => !row.current),
  };
}

export function modelLineCount(rows) {
  return new Set(rows.map((row) => row.stove.id)).size;
}

export function linesInBoth(current, previous) {
  const previousIds = new Set(previous.map((row) => row.stove.id));
  const both = new Set(current.map((row) => row.stove.id).filter((id) => previousIds.has(id)));
  return both.size;
}

export function smallestRows(rows) {
  if (!rows.length) return [];
  const min = Math.min(...rows.map((row) => row.firebox));
  return rows.filter((row) => row.firebox === min);
}

export function heatHighs(rows) {
  const listed = [];
  let missing = 0;
  for (const row of rows) {
    const high = row.test.btuHigh;
    if (typeof high !== "number" || !Number.isFinite(high)) missing += 1;
    else listed.push(high);
  }
  return { listed, missing };
}

function roomTests(stoves, type) {
  const tests = [];
  for (const stove of stoves) {
    if (!stove || stove.category !== "room" || !Array.isArray(stove.tests)) continue;
    for (const test of stove.tests) {
      if (test?.type === type) tests.push(test);
    }
  }
  return tests;
}

export function pelletRoomFirebox(stoves) {
  const tests = roomTests(stoves, "Pellet Stove");
  let notApplicable = 0;
  let notListed = 0;
  let listed = 0;
  for (const test of tests) {
    if (test.fireboxStatus === "not_applicable") notApplicable += 1;
    else if (test.fireboxStatus === "listed" && typeof test.firebox === "number") listed += 1;
    else notListed += 1;
  }
  return { rows: tests.length, notApplicable, notListed, listed };
}

export function woodRoomFirebox(stoves) {
  const tests = roomTests(stoves, "Wood Stove");
  let notApplicable = 0;
  let notListed = 0;
  let listed = 0;
  for (const test of tests) {
    if (test.fireboxStatus === "not_applicable") notApplicable += 1;
    else if (test.fireboxStatus === "listed" && typeof test.firebox === "number") listed += 1;
    else notListed += 1;
  }
  return { rows: tests.length, notApplicable, notListed, listed };
}

function nameList(rows) {
  const names = rows.map((row) => shortModel(row.stove.model, 140));
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

export function pelletExclusionSentence(stoves, snapshotDate) {
  const pellet = pelletRoomFirebox(stoves);
  const applicable = `${formatCount(pellet.notApplicable)} room-heater pellet ${pellet.notApplicable === 1 ? "row lists" : "rows list"} firebox volume as not applicable`;
  const blank = `${formatCount(pellet.notListed)} room-heater pellet ${pellet.notListed === 1 ? "row leaves" : "rows leave"} the cell blank`;
  const listed = pellet.listed === 0
    ? "No room-heater pellet row lists a cubic-foot volume."
    : `${formatCount(pellet.listed)} room-heater pellet ${pellet.listed === 1 ? "row lists" : "rows list"} a cubic-foot volume. ${pellet.listed === 1 ? "That row stays" : "Those rows stay"} out of this table.`;
  return `Pellet-stove rows are excluded. In the ${snapshotDate} snapshot, ${applicable}, and ${blank}. ${listed} A pellet hopper is not the cordwood firebox this table uses.`;
}

function heatHighSentence(rows) {
  const { listed, missing } = heatHighs(rows);
  const blank = "A blank heat-output cell is not listed by EPA and is not zero.";
  if (!listed.length) {
    return `EPA does not list a heat-output high on the currently certified rows in this list. ${blank}`;
  }
  const low = Math.min(...listed);
  const high = Math.max(...listed);
  const span = low === high
    ? `The high end of the listed heat output on those rows is ${formatBtu(low)} BTU/hr.`
    : `The high end of the listed heat output on those rows runs from ${formatBtu(low)} to ${formatBtu(high)} BTU/hr.`;
  if (!missing) {
    const verb = rows.length === 1 ? "has" : "have";
    return `${span} All ${formatCount(rows.length)} currently certified ${rows.length === 1 ? "row" : "rows"} ${verb} a heat-output high listed by EPA. ${blank}`;
  }
  const verb = missing === 1 ? "has" : "have";
  const pronoun = missing === 1 ? "that row is" : "those rows are";
  return `${span} ${formatCount(missing)} currently certified ${missing === 1 ? "row" : "rows"} ${verb} no heat-output high listed by EPA, so ${pronoun} left out of this span. ${blank}`;
}

export function smallWoodSentences(stoves, snapshotDate) {
  const { current } = splitSmallWoodRows(stoves);
  const lines = modelLineCount(current);
  const lineWord = lines === 1 ? "model line" : "model lines";
  const rowWord = current.length === 1 ? "row" : "rows";
  const sentences = [
    `EPA lists ${formatCount(lines)} currently certified ${lineWord} and ${formatCount(current.length)} currently certified room-heater ${rowWord} with a listed wood-stove firebox volume of ${fireboxLimitPhrase()} or less, in the snapshot dated ${snapshotDate}.`,
  ];
  const smallest = smallestRows(current);
  if (smallest.length) {
    sentences.push(`The smallest listed firebox on those rows is ${fireboxVolumePhrase(smallest[0].firebox)}, on ${nameList(smallest)}.`);
  } else {
    sentences.push("No currently certified row in this snapshot lists a wood-stove firebox volume in that range. A blank firebox cell is not listed by EPA and is not zero.");
  }
  sentences.push(heatHighSentence(current));
  sentences.push(`Source: EPA Certified Wood Heater Database, snapshot ${snapshotDate}.`);
  return sentences;
}

export function currentCaption() {
  return `Currently certified wood-stove rows with a listed firebox of ${fireboxLimitPhrase()} or less, smallest firebox first`;
}

export function previousCaption() {
  return `Wood-stove rows that are not currently certified, with a listed firebox of ${fireboxLimitPhrase()} or less, smallest firebox first`;
}

export function previousLead(stoves) {
  const { current, previous } = splitSmallWoodRows(stoves);
  const verb = previous.length === 1 ? "lists" : "list";
  const are = previous.length === 1 ? "is" : "are";
  const lead = `${formatCount(previous.length)} wood-stove ${previous.length === 1 ? "row" : "rows"} ${verb} a firebox of ${fireboxLimitPhrase()} or less and ${are} not currently certified.`;
  const both = linesInBoth(current, previous);
  if (!both) return lead;
  const extra = both === 1
    ? "1 model line has both a currently certified row and a row that is not currently certified, so that line is in both tables."
    : `${formatCount(both)} model lines have both a currently certified row and a row that is not currently certified, so those lines are in both tables.`;
  return `${lead} ${extra}`;
}

export function smallWoodFaqs(stoves, snapshotDate) {
  const pellet = pelletExclusionSentence(stoves, snapshotDate);
  return [
    {
      question: "Which EPA rows are on this list?",
      answer: `Room-heater rows whose EPA type is Wood Stove and whose listed firebox volume is ${fireboxLimitPhrase()} or less. The first table is currently certified rows from the ${snapshotDate} snapshot saved on this site. The second table is rows that are not currently certified. A blank firebox cell is not listed by EPA and is not treated as zero, so those rows are left out. Central heaters are not in either table.`,
    },
    {
      question: "Are pellet stoves included?",
      answer: `No. ${pellet}`,
    },
    {
      question: `Does a firebox of ${fireboxLimitPhrase()} or less mean the stove heats a small cabin?`,
      answer: `No. ${SIZING_CAVEAT} People also search this as a tiny-house wood stove or a wood stove for a small cabin. The stove size calculator turns a heated floor area into a planning BTU/hr range and lists currently certified model lines whose EPA heat-output range overlaps that range. Snapshot ${snapshotDate}.`,
    },
  ];
}

function mixedPelletLines(rows) {
  const seen = new Set();
  const lines = [];
  for (const row of rows) {
    if (seen.has(row.stove.id)) continue;
    if (!row.stove.tests.some((test) => test.type === "Pellet Stove")) continue;
    seen.add(row.stove.id);
    lines.push(row);
  }
  return lines;
}

export function smallWoodNotes(stoves, snapshotDate) {
  const { current, previous } = splitSmallWoodRows(stoves);
  const rows = [...current, ...previous];
  const wood = woodRoomFirebox(stoves);
  const notes = [
    "Each table row is one EPA room-heater result. Figures are copied from that row. A model line with two qualifying rows appears twice. This order is not a StoveRatings score.",
    SIZING_CAVEAT,
    "A blank emission rate, HHV efficiency, heat output, manufacturer, or subtype cell is not listed by EPA. It is not shown as zero.",
    `Of ${formatCount(wood.rows)} room-heater wood-stove rows in this snapshot, ${formatCount(wood.notListed)} leave the firebox cell blank and ${formatCount(wood.notApplicable)} list it as not applicable. Those rows are not in the tables. A blank is not zero.`,
  ];
  const zeros = rows.filter((row) => row.firebox === 0);
  if (zeros.length) {
    const verb = zeros.length === 1 ? "lists" : "list";
    notes.push(`${formatCount(zeros.length)} ${zeros.length === 1 ? "row" : "rows"} ${verb} a firebox volume of 0 cubic feet. That is the number EPA published in the cell. Rows with a blank firebox cell are left out, and a blank is not shown as zero.`);
  }
  const mixed = mixedPelletLines(rows);
  if (mixed.length) {
    const verb = mixed.length === 1 ? "has" : "have";
    const pellet = mixed.length === 1 ? "The pellet-stove row on that line is not in the table." : "The pellet-stove rows on those lines are not in the table.";
    notes.push(`${formatCount(mixed.length)} ${mixed.length === 1 ? "model line" : "model lines"} in this list also ${verb} a pellet-stove row. ${pellet} The wood-stove row is included: ${nameList(mixed)}.`);
  }
  notes.push(`The second table is rows that are not currently certified in the ${snapshotDate} snapshot. Currently certified means the row was in EPA's in-production result on that date.`);
  return notes;
}

export function fireboxCell(value) {
  if (value == null || value === "") return NOT_LISTED_BY_EPA;
  const number = formatNumber(value, 3);
  if (number == null) return NOT_LISTED_BY_EPA;
  return `${number} cu ft`;
}

export function heatCell(test) {
  const range = btuRange(test?.btuLow, test?.btuHigh);
  return range || NOT_LISTED_BY_EPA;
}

export function emissionCell(test) {
  if (test?.emission == null || test.emission === "") return NOT_LISTED_BY_EPA;
  const number = formatNumber(test.emission, 3);
  if (number == null) return NOT_LISTED_BY_EPA;
  if (test.emissionUnit === "g/hr") return `${number} g/hr`;
  if (!test.emissionUnit) return `${number}, unit not listed by EPA`;
  return `${number} ${test.emissionUnit}`;
}

export function efficiencyCell(value) {
  if (value == null || value === "") return NOT_LISTED_BY_EPA;
  const number = formatNumber(value, 2);
  if (number == null) return NOT_LISTED_BY_EPA;
  return `${number}%`;
}

export function subtypeCell(subtype) {
  if (subtype == null || String(subtype).trim() === "") return NOT_LISTED_BY_EPA;
  return SUBTYPE_LABELS[subtype] || String(subtype);
}

export function manufacturerCell(stove) {
  if (stove?.manufacturer == null || String(stove.manufacturer).trim() === "") return NOT_LISTED_BY_EPA;
  return String(stove.manufacturer);
}

export function smallWoodRowView(row) {
  return {
    href: row.stove.url,
    model: row.stove.model,
    insert: row.stove.insertFlag === true,
    manufacturer: manufacturerCell(row.stove),
    firebox: fireboxCell(row.firebox),
    heat: heatCell(row.test),
    emission: emissionCell(row.test),
    efficiency: efficiencyCell(row.test.efficiency),
    subtype: subtypeCell(row.test.subtype),
  };
}

export function currentTableLead() {
  return "Ordered by listed firebox volume, smallest first. A lower volume is the order of this table. It is not a StoveRatings score.";
}
