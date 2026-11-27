// Answer, title, and meta description for one stove model page.
//
// The first sentence answers "Is this model EPA certified?" from the committed
// snapshot: currently certified or previously certified, the snapshot date, and
// the emission rate, HHV efficiency, and heat output on the model line. A blank
// cell is "not listed by EPA". A published zero stays zero.
//
// Titles keep those same figures. The layout appends " · StoveRatings". The
// model name is shortened only when status, emission, and efficiency would
// otherwise start past about 60 characters. The figures themselves are not cut.
import { btuRange, countNoun, formatBtu, formatNumber, metaDescription, pageTitle } from "./format.js";

export const MODEL_TITLE_TARGET = 60;
const TITLE_SEPARATOR = " — ";

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function certificationStatus(stove) {
  return stove?.current ? "currently certified" : "previously certified";
}

function plainNumber(value, digits) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return formatNumber(value, digits);
}

export function emissionProse(stove) {
  const number = plainNumber(stove?.emission, 3);
  if (number == null) return "an emission rate not listed by EPA";
  if (stove.emissionUnit === "g/hr") return `${number} grams per hour`;
  if (stove.emissionUnit === "lb/mmBTU") return `${number} pounds per million BTU`;
  if (!stove.emissionUnit) return `${number}, unit not listed by EPA`;
  return `${number} ${stove.emissionUnit}`;
}

export function emissionTitle(stove) {
  const number = plainNumber(stove?.emission, 3);
  if (number == null) return "emission not listed by EPA";
  if (stove.emissionUnit === "g/hr") return `${number} g/hr`;
  if (stove.emissionUnit === "lb/mmBTU") return `${number} lb/mmBTU`;
  if (!stove.emissionUnit) return `${number}, unit not listed by EPA`;
  return `${number} ${stove.emissionUnit}`;
}

export function efficiencyProse(stove) {
  const number = plainNumber(stove?.efficiency, 2);
  if (number == null) return "HHV efficiency not listed by EPA";
  return `${number} percent HHV`;
}

export function efficiencyTitle(stove) {
  const number = plainNumber(stove?.efficiency, 2);
  if (number == null) return "HHV not listed by EPA";
  return `${number}% HHV`;
}

export function heatProse(stove) {
  const range = btuRange(stove?.btuLow, stove?.btuHigh);
  const max = plainNumber(stove?.btuMax, 0) == null ? null : formatBtu(stove.btuMax);
  if (!range && max == null) return "heat output not listed by EPA";
  if (range && max == null) return range;
  if (!range) return `${max} BTU/hr maximum`;
  const single = stove.btuLow != null && stove.btuLow === stove.btuHigh ? formatBtu(stove.btuLow) : null;
  if (single != null && single === max) return range;
  return `${range} (maximum ${max} BTU/hr)`;
}

function whoClause(stove) {
  const manufacturer = clean(stove?.manufacturer);
  if (!manufacturer) return " with the manufacturer cell left blank";
  return ` under ${manufacturer}`;
}

export function certificationSentence(stove, snapshotDate) {
  const model = clean(stove?.model) || "this model line";
  return `As of ${snapshotDate}, EPA lists ${model}${whoClause(stove)} as ${certificationStatus(stove)}: ${emissionProse(stove)}, ${efficiencyProse(stove)}, and ${heatProse(stove)}.`;
}

function figureKey(row) {
  return [row?.emission, row?.emissionUnit, row?.efficiency, row?.btuLow, row?.btuHigh, row?.btuMax].join("\u0000");
}

function rowSentence(stove) {
  const tests = Array.isArray(stove?.tests) ? stove.tests : [];
  const count = tests.length > 1 ? tests.length : Number(stove?.rowCount) > 1 ? Number(stove.rowCount) : 0;
  if (count < 2) return "";
  if (tests.length < 2) {
    return `EPA lists ${countNoun(count, "row")} for this model line. The table below copies every row.`;
  }
  const same = new Set(tests.map(figureKey)).size === 1;
  if (same) {
    return `EPA lists ${countNoun(tests.length, "row")} for this model line. Those rows list the same emission rate, HHV efficiency, and heat output.`;
  }
  return `EPA lists ${countNoun(tests.length, "row")} for this model line. The table below copies every row, including rows whose emission rate, HHV efficiency, or heat output differs.`;
}

export function modelCertificationSentences(stove, snapshotDate) {
  const sentences = [certificationSentence(stove, snapshotDate)];
  const extra = rowSentence(stove);
  if (extra) sentences.push(extra);
  sentences.push(`Source: EPA Certified Wood Heater Database, snapshot ${snapshotDate}.`);
  return sentences;
}

export function modelCertificationTitle(stove) {
  const model = clean(stove?.model) || "Model line";
  const lead = `${emissionTitle(stove)}, ${efficiencyTitle(stove)}, ${certificationStatus(stove)}`;
  const tail = `${lead}, ${heatProse(stove)}`;
  const full = `${model}${TITLE_SEPARATOR}${tail}`;
  if (full.length <= MODEL_TITLE_TARGET) return full;
  if (`${model}${TITLE_SEPARATOR}${lead}`.length <= MODEL_TITLE_TARGET) return full;
  const room = MODEL_TITLE_TARGET - TITLE_SEPARATOR.length - lead.length;
  if (room >= 12) return `${pageTitle(model, room)}${TITLE_SEPARATOR}${tail}`;
  return `${pageTitle(model, 32)}${TITLE_SEPARATOR}${tail}`;
}

function descriptionFacts(stove, snapshotDate) {
  return `${certificationStatus(stove)} as of ${snapshotDate}: ${emissionProse(stove)}, ${efficiencyProse(stove)}, and ${heatProse(stove)}.`;
}

function descriptionWithModel(facts, stove, includeManufacturer) {
  const model = clean(stove?.model) || "this model line";
  const manufacturer = includeManufacturer ? clean(stove?.manufacturer) : "";
  const who = manufacturer ? ` under ${manufacturer}` : "";
  const overhead = `${facts} EPA lists ${who}.`.length;
  const room = 180 - overhead;
  const modelText = room >= model.length ? model : room >= 8 ? pageTitle(model, room) : "";
  if (!modelText) return "";
  const sentence = `${facts} EPA lists ${modelText}${who}`;
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

export function modelPageDescription(stove, snapshotDate) {
  const sentence = certificationSentence(stove, snapshotDate);
  if (sentence.length <= 180) return metaDescription([sentence]);
  const facts = descriptionFacts(stove, snapshotDate);
  return metaDescription([
    descriptionWithModel(facts, stove, true)
    || descriptionWithModel(facts, stove, false)
    || facts,
  ]);
}
