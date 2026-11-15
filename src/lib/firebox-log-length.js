// Firebox volume comes from the committed EPA export. This module does not fetch EPA.
// The export column is Firebox Volume (Cubic Feet). It has no inside width, depth, or height.
// The 4-inch shorter cut is the figure both cited extension publications state.

import { formatCount, formatNumber } from "./format.js";
import { modelLineCount, splitSmallWoodRows } from "./small-wood-stoves.js";
import { site } from "./site.js";

export const LOG_PAGE = "/tools/firebox-log-length/";
export const FIREBOX_COLUMN = "Firebox Volume (Cubic Feet)";
export const LOG_RETRIEVED = "2026-11-15";
export const LOG_ALLOWANCE_INCHES = 4;
export const EXAMPLE_DEPTH = 16;
export const EXAMPLE_WIDTH = 18;

export const INPUT_ERROR = "Enter a depth and a width greater than 0 inches.";
export const DEPTH_ERROR = "Enter a depth greater than 0 inches.";
export const WIDTH_ERROR = "Enter a width greater than 0 inches.";
export const RESULT_PLACEHOLDER = "The example table uses 16 inches of depth and 18 inches of width. Enter the sides you measured, then choose Show log length.";
export const LINE_PLACEHOLDER = "Select a model line to read the EPA firebox volume. The volume is also written at the end of each option.";

export const FIELD_SENTENCE = `The committed EPA export has one firebox column, ${FIREBOX_COLUMN}, on the room-heater files and on the central-heater files. It has no inside width, depth, or height. This page does not invent those dimensions.`;
export const ALLOWANCE_SENTENCE = "The 4-inch subtraction is the shorter cut stated by University of Nebraska-Lincoln Extension NebGuide G1554 and by the 1979 University of Minnesota Extension bulletin. It is not a distance from a wall. The stove manual controls the length that belongs in the firebox.";
export const VOLUME_TABLE_CAPTION = "Currently certified wood-stove model lines by listed firebox volume. A line is counted in each band that contains a listed volume on a currently certified wood-stove row. Pellet-only lines and central heaters are not in this table.";
export const LENGTH_TABLE_CAPTION = "Firewood measures from the cited Forest Service and extension pages. These measures are not the length that fits one stove.";

const SOURCE_DEFS = [
  {
    id: "ne-g1554",
    href: "https://extension.illinois.edu/sites/default/files/nebraska_producing_harvesting_and_processing_firewood.pdf",
    label: "University of Nebraska-Lincoln Extension NebGuide G1554, Heating With Wood: Producing, Harvesting and Processing Firewood (2005), PDF on the University of Illinois Extension site",
    retrieved: LOG_RETRIEVED,
  },
  {
    id: "mn-1979",
    href: "http://hdl.handle.net/11299/169045",
    label: "University of Minnesota Agricultural Extension Service, Heating the home with wood (1979)",
    retrieved: LOG_RETRIEVED,
  },
  {
    id: "usfs-cord",
    href: "https://www.fs.usda.gov/sites/nfs/files/legacy-media/modoc/Measuring%20Your%20Firewood.pdf",
    label: "U.S. Forest Service, Modoc National Forest, Measuring your firewood",
    retrieved: LOG_RETRIEVED,
  },
  {
    id: "mu-g5451",
    href: "https://extension.missouri.edu/publications/g5451",
    label: "University of Missouri Extension G5451, Preparing Wood for Your Wood Stove, by Hank Stelzer",
    retrieved: LOG_RETRIEVED,
  },
];

export const VOLUME_BANDS = [
  {
    id: "to-1",
    label: "1 cubic foot or less",
    href: "/small-wood-stoves/",
    linkLabel: "Small firebox list",
  },
  {
    id: "1-to-2",
    label: "More than 1 cubic foot, up to 2",
    href: "/tools/stove-size-calculator/",
    linkLabel: "Stove size calculator",
  },
  {
    id: "2-to-3",
    label: "More than 2 cubic feet, up to 3",
    href: "/tools/stove-size-calculator/",
    linkLabel: "Stove size calculator",
  },
  {
    id: "over-3",
    label: "More than 3 cubic feet",
    href: "/tools/stove-size-calculator/",
    linkLabel: "Stove size calculator",
  },
];

export function logSources(snapshotDate) {
  return [
    ...SOURCE_DEFS.map((source) => ({ ...source })),
    {
      id: "epa-database",
      href: site.epaDatabaseUrl,
      label: "EPA Certified Wood Heater Database",
      retrieved: snapshotDate,
    },
  ];
}

export function readInches(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
  }
  if (value == null) return null;
  const text = String(value).trim().replaceAll(",", "");
  if (!text || !/^\d+(\.\d+)?$/.test(text)) return null;
  const inches = Number(text);
  if (!Number.isFinite(inches) || inches <= 0) return null;
  return inches;
}

export function inchesPhrase(value) {
  const number = formatNumber(value, 2);
  if (number == null) return "";
  return `${number} ${Number(value) === 1 ? "inch" : "inches"}`;
}

export function fitLength(value, allowance = LOG_ALLOWANCE_INCHES) {
  const inches = readInches(value);
  if (inches == null) return { ok: false, inches: null, fit: null };
  const gap = Number(allowance);
  if (!Number.isFinite(gap) || gap < 0) return { ok: false, inches, fit: null };
  const fit = Math.round((inches - gap) * 100) / 100;
  if (!(fit > 0)) return { ok: true, inches, fit: null };
  return { ok: true, inches, fit };
}

export function measurementProblem(depth, width) {
  const depthOk = readInches(depth) != null;
  const widthOk = readInches(width) != null;
  if (!depthOk && !widthOk) return INPUT_ERROR;
  if (!depthOk) return DEPTH_ERROR;
  if (!widthOk) return WIDTH_ERROR;
  return "";
}

export function fitSentence(side, value) {
  const result = fitLength(value);
  if (!result.ok) return "";
  const measured = inchesPhrase(result.inches);
  if (result.fit == null) {
    return `The measured ${side} is ${measured}, which is not longer than ${inchesPhrase(LOG_ALLOWANCE_INCHES)}, so this page does not report a positive log length along that side.`;
  }
  return `The measured ${side} is ${measured}. The longest log this page reports along that side is ${inchesPhrase(result.fit)}, which is ${inchesPhrase(LOG_ALLOWANCE_INCHES)} shorter.`;
}

export function fitReport(depth, width) {
  const problem = measurementProblem(depth, width);
  if (problem) return problem;
  return `${fitSentence("depth", depth)} ${fitSentence("width", width)} Follow the stove manual.`;
}

export function exampleCaption() {
  return `Example subtraction for a firebox measured at ${inchesPhrase(EXAMPLE_DEPTH)} inside depth and ${inchesPhrase(EXAMPLE_WIDTH)} inside width. These inches are not an EPA figure.`;
}

export function exampleRows() {
  return [
    { side: "Depth", inches: EXAMPLE_DEPTH },
    { side: "Width", inches: EXAMPLE_WIDTH },
  ].map((row) => {
    const result = fitLength(row.inches);
    return {
      side: row.side,
      measured: inchesPhrase(result.inches),
      log: result.fit == null ? "No positive length" : inchesPhrase(result.fit),
    };
  });
}

export function standardLengthRows() {
  return [
    {
      measure: "Cord",
      statement: "128 cubic feet, measured as a pile 8 feet long, 4 feet high, and 4 feet wide",
      source: "U.S. Forest Service, Modoc National Forest, Measuring your firewood",
    },
    {
      measure: "Cord",
      statement: "128 cubic feet, a stack 4 feet tall, 8 feet wide, and 4 feet deep",
      source: "University of Nebraska-Lincoln Extension NebGuide G1554",
    },
    {
      measure: "Piece length",
      statement: "16 inches, plus or minus 2 inches, is a popular length that will fit most stoves. Large-diameter pieces should average 16 inches in length.",
      source: "University of Missouri Extension G5451",
    },
    {
      measure: "Piece length",
      statement: "16 to 24 inches is generally standard",
      source: "University of Minnesota Agricultural Extension Service, 1979",
    },
    {
      measure: "Shorter than the firebox",
      statement: "Cut the wood about 4 inches shorter than the length of the firebox",
      source: "University of Nebraska-Lincoln Extension NebGuide G1554",
    },
    {
      measure: "Shorter than the firebox",
      statement: "Cut wood 4 inches shorter than the firebox",
      source: "University of Minnesota Agricultural Extension Service, 1979",
    },
  ];
}

function usableVolume(test) {
  if (!test || test.fireboxStatus !== "listed") return null;
  if (typeof test.firebox !== "number" || !Number.isFinite(test.firebox) || test.firebox < 0) return null;
  return test.firebox;
}

export function currentWoodLines(stoves) {
  const lines = [];
  for (const stove of stoves || []) {
    if (!stove || stove.category !== "room" || !Array.isArray(stove.tests)) continue;
    const tests = stove.tests.filter((test) => test && test.type === "Wood Stove" && test.current === true);
    if (!tests.length) continue;
    lines.push({ stove, tests });
  }
  return lines;
}

export function listedVolumes(line) {
  const volumes = [];
  for (const test of line.tests) {
    const volume = usableVolume(test);
    if (volume == null || volumes.includes(volume)) continue;
    volumes.push(volume);
  }
  volumes.sort((left, right) => left - right);
  return volumes;
}

export function inBand(id, volume) {
  const value = Number(volume);
  if (!Number.isFinite(value) || value < 0) return false;
  if (id === "to-1") return value <= 1;
  if (id === "1-to-2") return value > 1 && value <= 2;
  if (id === "2-to-3") return value > 2 && value <= 3;
  if (id === "over-3") return value > 3;
  return false;
}

export function volumeSummary(stoves) {
  const lines = currentWoodLines(stoves);
  const bands = VOLUME_BANDS.map((band) => ({ ...band, lines: 0 }));
  let listed = 0;
  let notListed = 0;
  let notApplicable = 0;
  for (const line of lines) {
    const volumes = listedVolumes(line);
    if (volumes.length) {
      listed += 1;
      for (const band of bands) {
        if (volumes.some((volume) => inBand(band.id, volume))) band.lines += 1;
      }
      continue;
    }
    if (line.tests.every((test) => test.fireboxStatus === "not_applicable")) notApplicable += 1;
    else notListed += 1;
  }
  return { lines: lines.length, listed, notListed, notApplicable, bands };
}

export function volumeTableRows(stoves) {
  const summary = volumeSummary(stoves);
  return [
    ...summary.bands.map((band) => ({
      id: band.id,
      label: band.label,
      count: band.lines,
      href: band.href,
      linkLabel: band.linkLabel,
    })),
    {
      id: "not-listed",
      label: "No listed volume (a blank is not zero)",
      count: summary.notListed,
      href: "/glossary/#firebox-volume",
      linkLabel: "Firebox volume",
    },
    {
      id: "not-applicable",
      label: "Listed as not applicable",
      count: summary.notApplicable,
      href: "/glossary/#not-listed",
      linkLabel: "Not listed and not applicable",
    },
  ];
}

function volumeWords(volumes) {
  return volumes.map((volume) => {
    const number = formatNumber(volume, 3);
    const unit = Number(volume) === 1 ? "cubic foot" : "cubic feet";
    return `${number} ${unit}`;
  }).join(" and ");
}

function lineStatus(line, volumes) {
  if (volumes.length) return "listed";
  if (line.tests.every((test) => test.fireboxStatus === "not_applicable")) return "not_applicable";
  return "not_listed";
}

function volumeLabel(volumes, status) {
  if (volumes.length) return volumes.map((volume) => `${formatNumber(volume, 3)} cu ft`).join(" and ");
  if (status === "not_applicable") return "not applicable";
  return "not listed by EPA";
}

export function woodLineOptions(stoves) {
  const options = currentWoodLines(stoves).map((line) => {
    const volumes = listedVolumes(line);
    const status = lineStatus(line, volumes);
    const manufacturer = String(line.stove.manufacturer || "").trim();
    const model = String(line.stove.model || "").trim();
    return {
      id: line.stove.id,
      url: line.stove.url,
      manufacturer,
      model,
      volumes,
      status,
      volumeLabel: volumeLabel(volumes, status),
      label: `${manufacturer} — ${model} — ${volumeLabel(volumes, status)}`,
    };
  });
  options.sort((left, right) => (
    left.manufacturer.localeCompare(right.manufacturer, "en")
    || left.model.localeCompare(right.model, "en")
    || left.id.localeCompare(right.id)
  ));
  return options;
}

export function lineVolumeSentence({ manufacturer, model, volumes, status }) {
  const name = [manufacturer, model].filter(Boolean).join(" ") || "This model line";
  const manual = "The export does not list inside depth or width. Measure the firebox or check the manual. This page does not convert cubic feet into a log length.";
  if (volumes?.length) {
    return `EPA lists a firebox volume of ${volumeWords(volumes)} on a currently certified wood-stove row for ${name}. ${manual}`;
  }
  if (status === "not_applicable") {
    return `EPA lists firebox volume as not applicable on the currently certified wood-stove row for ${name}. Not applicable is text EPA printed, not zero. ${manual}`;
  }
  return `EPA does not list a firebox volume on a currently certified wood-stove row for ${name}. A blank is not listed by EPA and is not zero. ${manual}`;
}

export function smallBandSentence(stoves) {
  const summary = volumeSummary(stoves);
  const band = summary.bands.find((item) => item.id === "to-1");
  const current = splitSmallWoodRows(stoves).current;
  const lines = modelLineCount(current);
  const rows = current.length;
  const bandCount = formatCount(band?.lines || 0);
  if (band && band.lines === lines && rows === lines) {
    return `The 1-cubic-foot-or-less band counts ${bandCount} model lines. The small-firebox list's currently certified table has the same ${formatCount(lines)} model lines and ${formatCount(rows)} rows in this snapshot.`;
  }
  return `The 1-cubic-foot-or-less band counts ${bandCount} model lines. The small-firebox list's currently certified table has ${formatCount(lines)} model lines and ${formatCount(rows)} rows.`;
}

export function mixedFuelNote(stoves) {
  const mixed = currentWoodLines(stoves).filter((line) => (
    line.stove.tests.some((test) => test && test.current === true && test.type !== "Wood Stove")
  ));
  if (!mixed.length) {
    return "No currently certified wood-stove model line in this snapshot also has another currently certified row.";
  }
  const names = mixed.map((line) => {
    const others = line.stove.tests
      .filter((test) => test && test.current === true && test.type !== "Wood Stove")
      .map((test) => {
        let volume = "not listed by EPA";
        if (test.fireboxStatus === "not_applicable") volume = "not applicable";
        else if (usableVolume(test) != null) volume = `${formatNumber(test.firebox, 3)} cu ft`;
        return `${test.type}, firebox ${volume}`;
      });
    const name = `${line.stove.manufacturer} ${line.stove.model}`.replace(/\s+/g, " ").trim();
    return `${name} (${others.join("; ")})`;
  });
  const noun = mixed.length === 1 ? "model line" : "model lines";
  const verb = mixed.length === 1 ? "has" : "have";
  return `${formatCount(mixed.length)} currently certified wood-stove ${noun} also ${verb} another currently certified row. The volume in this table is the wood-stove row. ${names.join("; ")}.`;
}

export function logAnswer(stoves, snapshotDate) {
  const summary = volumeSummary(stoves);
  const third = summary.listed === summary.lines
    ? `In the snapshot dated ${snapshotDate}, all ${formatCount(summary.lines)} currently certified wood-stove model lines have a listed firebox volume, and the band table counts them.`
    : `In the snapshot dated ${snapshotDate}, ${formatCount(summary.listed)} of ${formatCount(summary.lines)} currently certified wood-stove model lines have a listed firebox volume, and the band table counts those lines without treating a blank as zero.`;
  return [
    "The EPA export on this site lists firebox size only as Firebox Volume (Cubic Feet) and has no inside width, depth, or height, so a cubic-foot volume is not turned into a log length.",
    "For a side measured in inches, the longest log this page reports is that measurement minus 4 inches, the shorter cut stated by University of Nebraska-Lincoln Extension NebGuide G1554 and by the 1979 University of Minnesota Extension bulletin.",
    third,
  ];
}

export function logFaqs(stoves, snapshotDate) {
  const summary = volumeSummary(stoves);
  const bandBits = summary.bands.map((band) => `${band.label} has ${formatCount(band.lines)}`).join("; ");
  return [
    {
      question: "What length of firewood fits a stove?",
      answer: "Measure the inside depth and the inside width in inches. This page subtracts 4 inches from each side because NebGuide G1554 says to cut the wood about 4 inches shorter than the length of the firebox, and the 1979 University of Minnesota Extension bulletin says to cut wood 4 inches shorter than the firebox. If a side is not longer than 4 inches, this page does not report a positive log length. The stove manual controls the length. The EPA volume is not a length.",
    },
    {
      question: "Does EPA list firebox depth and width?",
      answer: `No. The committed export has one firebox column, ${FIREBOX_COLUMN}, on room-heater and central-heater rows. It has no inside width, depth, or height. A blank cell is not listed by EPA and is not zero. Not applicable is text EPA printed. Measure the firebox or check the manual. Snapshot ${snapshotDate}.`,
    },
    {
      question: "Is 16-inch firewood a standard length?",
      answer: "University of Missouri Extension G5451 says 16 inches, plus or minus 2 inches, is a popular length that will fit most stoves, and that large-diameter pieces should average 16 inches in length. The Minnesota bulletin says 16 to 24 inches is generally standard. A cord is 128 cubic feet: the U.S. Forest Service Modoc sheet describes a pile 8 feet long, 4 feet high, and 4 feet wide, and NebGuide G1554 describes a stack 4 feet tall, 8 feet wide, and 4 feet deep. Those are firewood measures, not the length that fits one stove.",
    },
    {
      question: "What do the firebox volume bands count?",
      answer: `Each count is currently certified room-heater model lines whose EPA type on that row is Wood Stove and whose listed firebox volume falls in the band. ${bandBits}. ${formatCount(summary.notListed)} ${summary.notListed === 1 ? "line has" : "lines have"} no listed volume, and ${formatCount(summary.notApplicable)} ${summary.notApplicable === 1 ? "line is" : "lines are"} listed as not applicable. A blank volume is not zero. Pellet-only lines and central heaters are not in the table. The stove size calculator uses heat output, not this volume. Snapshot ${snapshotDate}.`,
    },
  ];
}

export function logNotes(stoves, snapshotDate) {
  return [
    FIELD_SENTENCE,
    ALLOWANCE_SENTENCE,
    "The firebox-volume glossary entry includes a recertification presumption about a change in firebox dimensions. That presumption is not the length subtracted here.",
    "A blank firebox cell is not listed by EPA. It is not zero. Not applicable is text EPA printed.",
    mixedFuelNote(stoves),
    "The 16-inch and 18-inch example is an illustration of the subtraction. It is not a measurement of a stove in the EPA export.",
    `Volume counts are copied from the snapshot dated ${snapshotDate} saved on this site.`,
    "The band order is listed cubic feet.",
  ];
}
