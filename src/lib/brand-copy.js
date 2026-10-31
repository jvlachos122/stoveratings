import { countNoun, emissionText, formatCount, formatNumber } from "./format.js";

// Counts are model lines. Ranges and medians use EPA rows that list the figure.
// A blank stays blank: the sentence says it is not listed by EPA, and it is not zero.

const KIND_FORMS = [
  ["catalytic wood stove", "catalytic wood stoves"],
  ["non-catalytic wood stove", "non-catalytic wood stoves"],
  ["hybrid wood stove", "hybrid wood stoves"],
  ["wood stove with no subtype listed by EPA", "wood stoves with no subtype listed by EPA"],
  ["catalytic pellet stove", "catalytic pellet stoves"],
  ["non-catalytic pellet stove", "non-catalytic pellet stoves"],
  ["hybrid pellet stove", "hybrid pellet stoves"],
  ["pellet stove with no subtype listed by EPA", "pellet stoves with no subtype listed by EPA"],
  ["hydronic heater", "hydronic heaters"],
  ["forced-air furnace", "forced-air furnaces"],
];

const CURRENT_ROWS = { singular: "currently certified row", plural: "currently certified rows" };
const PREVIOUS_ROWS = { singular: "previously certified row", plural: "previously certified rows" };

function joinList(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function endSentence(text) {
  const trimmed = String(text).trim();
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  if (!count) return null;
  const mid = Math.floor(count / 2);
  if (count % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function epaRows(stove) {
  if (Array.isArray(stove.tests) && stove.tests.length) {
    return stove.tests.map((test) => ({
      current: Boolean(test.current),
      emission: test.emission,
      emissionUnit: test.emissionUnit || stove.emissionUnit,
      efficiency: test.efficiency,
    }));
  }
  return [
    {
      current: Boolean(stove.current),
      emission: stove.emission,
      emissionUnit: stove.emissionUnit,
      efficiency: stove.efficiency,
    },
  ];
}

function applianceKind(stove) {
  const type = stove.type;
  const subtype = stove.subtype;
  if (type === "Wood Stove" || type === "Pellet Stove") {
    const fuel = type === "Wood Stove" ? "wood stove" : "pellet stove";
    if (subtype === "Catalytic Stove") return `catalytic ${fuel}`;
    if (subtype === "Non-Catalytic Stove") return `non-catalytic ${fuel}`;
    if (subtype === "Hybrid") return `hybrid ${fuel}`;
    return `${fuel} with no subtype listed by EPA`;
  }
  if (type === "Hydronic Heater") return "hydronic heater";
  if (type === "Forced Air Furnace") return "forced-air furnace";
  return String(type || "heater").toLowerCase();
}

function rateText(emission, unit) {
  if (unit === "g/hr") return `${formatNumber(emission, 3)} g/hr`;
  return emissionText(emission, unit);
}

function measurePhrase(value, unit) {
  const digits = unit === "percent" ? 2 : 3;
  const number = formatNumber(value, digits);
  if (unit === "percent") return `${number} percent`;
  if (unit === "g/hr") return Number(value) === 1 ? `${number} gram per hour` : `${number} grams per hour`;
  if (unit === "lb/mmBTU") {
    return Number(value) === 1 ? `${number} pound per million BTU` : `${number} pounds per million BTU`;
  }
  return `${number} ${unit}`;
}

function rangeUnit(min, max, unit) {
  if (unit === "percent") return "percent";
  const singular = Number(min) === 1 && Number(max) === 1;
  if (unit === "g/hr") return singular ? "gram per hour" : "grams per hour";
  if (unit === "lb/mmBTU") return singular ? "pound per million BTU" : "pounds per million BTU";
  return unit;
}

function rangeSentence(noun, singular, values, scope, unit) {
  const count = values.length;
  if (!count) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[count - 1];
  if (count === 1) {
    return `EPA lists one ${singular} for ${scope.plural}: ${measurePhrase(min, unit)} (n=1).`;
  }
  const nText = formatCount(count);
  const medianText = measurePhrase(median(sorted), unit);
  const listed = `${scope.plural} that list one`;
  if (min === max) {
    return `EPA lists ${noun} of ${measurePhrase(min, unit)} for all ${nText} ${listed}. The median is ${medianText} (n=${nText}).`;
  }
  const minNumber = formatNumber(min, unit === "percent" ? 2 : 3);
  const maxNumber = formatNumber(max, unit === "percent" ? 2 : 3);
  return `EPA lists ${noun} from ${minNumber} to ${maxNumber} ${rangeUnit(min, max, unit)} for the ${listed}. The median is ${medianText} (n=${nText}).`;
}

function blankSentence(count, scope, subject) {
  if (!count) return null;
  const noun = count === 1 ? scope.singular : scope.plural;
  return `${subject} is not listed by EPA for ${formatCount(count)} ${noun}.`;
}

function emissionSentences(rows, scope) {
  const sentences = [];
  const byUnit = new Map();
  let blank = 0;
  for (const row of rows) {
    if (row.emission == null) {
      blank += 1;
      continue;
    }
    const unit = row.emissionUnit || "listed unit";
    const values = byUnit.get(unit) || [];
    values.push(row.emission);
    byUnit.set(unit, values);
  }
  const units = [...byUnit.keys()].sort((a, b) => {
    const rank = (unit) => (unit === "g/hr" ? 0 : unit === "lb/mmBTU" ? 1 : 2);
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  for (const unit of units) {
    const sentence = rangeSentence("emission rates", "emission rate", byUnit.get(unit), scope, unit);
    if (sentence) sentences.push(sentence);
  }
  const missing = blankSentence(blank, scope, "An emission rate");
  if (missing) sentences.push(missing);
  return sentences;
}

function efficiencySentences(rows, scope) {
  const listed = [];
  let blank = 0;
  for (const row of rows) {
    if (row.efficiency == null) blank += 1;
    else listed.push(row.efficiency);
  }
  const sentences = [];
  const range = rangeSentence("HHV efficiency", "HHV efficiency", listed, scope, "percent");
  if (range) sentences.push(range);
  const missing = blankSentence(blank, scope, "HHV efficiency");
  if (missing) sentences.push(missing);
  return sentences;
}

function typeSentence(lines) {
  const counts = new Map();
  for (const stove of lines) {
    const kind = applianceKind(stove);
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  const used = new Set();
  const parts = [];
  for (const [singular, plural] of KIND_FORMS) {
    const count = counts.get(singular);
    if (!count) continue;
    used.add(singular);
    parts.push(countNoun(count, singular, plural));
  }
  for (const singular of [...counts.keys()].filter((kind) => !used.has(kind)).sort()) {
    parts.push(countNoun(counts.get(singular), singular));
  }
  return `The model lines on this hub are ${joinList(parts)}.`;
}

function insertSentence(lines) {
  const inserts = lines.filter((stove) => stove.insertFlag);
  if (!inserts.length) return null;
  const current = inserts.filter((stove) => stove.current).length;
  const lead = `EPA lists ${countNoun(inserts.length, "model line")} whose name indicates an insert`;
  if (current === 0) {
    return inserts.length === 1
      ? `${lead}. That line is not listed as currently certified in this snapshot.`
      : `${lead}. None of those lines are listed as currently certified in this snapshot.`;
  }
  if (current === inserts.length) {
    return inserts.length === 1
      ? `${lead}. That line is listed as currently certified in this snapshot.`
      : `${lead}. All of those lines are listed as currently certified in this snapshot.`;
  }
  return `${lead}, ${countNoun(current, "of them listed as currently certified", "of them listed as currently certified")}.`;
}

function lowestSentences(lines) {
  const units = [];
  for (const stove of lines) {
    if (!stove.current || stove.emission == null) continue;
    const unit = stove.emissionUnit || "listed unit";
    if (!units.includes(unit)) units.push(unit);
  }
  units.sort((a, b) => {
    const rank = (unit) => (unit === "g/hr" ? 0 : unit === "lb/mmBTU" ? 1 : 2);
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  const sentences = [];
  for (const unit of units) {
    const pool = lines.filter((stove) => stove.current && stove.emission != null && (stove.emissionUnit || "listed unit") === unit);
    pool.sort((a, b) => a.emission - b.emission || a.model.localeCompare(b.model));
    const stove = pool[0];
    const rate = unit === "g/hr" ? `${formatNumber(stove.emission, 3)} g/hr` : rateText(stove.emission, unit);
    sentences.push(`EPA lists ${stove.model} at ${rate}.`);
    const currentRates = epaRows(stove)
      .filter((row) => row.current && row.emission != null)
      .map((row) => rateText(row.emission, row.emissionUnit));
    const distinct = [...new Set(currentRates)];
    if (distinct.length > 1) {
      sentences.push(
        `EPA lists ${countNoun(currentRates.length, "row")} for this model line, with emission rates of ${joinList(distinct)}.`,
      );
    }
  }
  return sentences;
}

function crosswalkSentence(brand, lines) {
  const names = [];
  const seen = new Set();
  for (const stove of lines) {
    const name = stove.manufacturer ? stove.manufacturer : "a blank manufacturer cell";
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  names.sort((a, b) => {
    if (a === "a blank manufacturer cell") return 1;
    if (b === "a blank manufacturer cell") return -1;
    return a.localeCompare(b);
  });
  if (names.length === 1 && names[0] === brand.name) return null;
  const subject = lines.length === 1 ? "This model line is" : "These model lines are";
  return endSentence(`${subject} listed in EPA's file under ${joinList(names)}`);
}

function thinLineSentences(stove) {
  const status = stove.current ? "currently certified" : "previously certified";
  const kind = applianceKind(stove);
  const insert = stove.insertFlag ? " whose name indicates an insert" : "";
  const rows = epaRows(stove);
  const listed = rows.filter((row) => row.emission != null);
  const blank = rows.length - listed.length;
  const sentences = [];
  if (!listed.length) {
    sentences.push(`EPA lists ${stove.model} as a ${status} ${kind}${insert}. The emission rate is not listed by EPA.`);
  } else {
    const parts = listed.map((row) => rateText(row.emission, row.emissionUnit));
    const unique = [...new Set(parts)];
    if (unique.length === 1 && blank === 0) {
      sentences.push(`EPA lists ${stove.model} at ${unique[0]} as a ${status} ${kind}${insert}.`);
      if (listed.length > 1) {
        sentences.push(`EPA lists ${countNoun(listed.length, "row")} for this model line, each at ${unique[0]}.`);
      }
    } else {
      let sentence = `EPA lists ${stove.model} as a ${status} ${kind}${insert}, with emission rates of ${joinList(parts)}.`;
      if (blank) {
        sentence += ` An emission rate is not listed by EPA for ${formatCount(blank)} ${blank === 1 ? "row" : "rows"} on this model line.`;
      }
      sentences.push(sentence);
    }
  }
  const efficiencies = rows.filter((row) => row.efficiency != null).map((row) => formatNumber(row.efficiency, 2));
  const efficiencyBlank = rows.length - efficiencies.length;
  const uniqueEfficiency = [...new Set(efficiencies)];
  if (uniqueEfficiency.length === 1) {
    sentences.push(endSentence(`EPA lists HHV efficiency of ${uniqueEfficiency[0]} percent for ${stove.model}`));
  } else if (uniqueEfficiency.length > 1) {
    sentences.push(
      endSentence(`EPA lists HHV efficiency of ${joinList(uniqueEfficiency.map((value) => `${value} percent`))} for ${stove.model}`),
    );
  }
  if (efficiencyBlank && uniqueEfficiency.length === 0) {
    sentences.push(endSentence(`HHV efficiency is not listed by EPA for ${stove.model}`));
  } else if (efficiencyBlank) {
    sentences.push(
      endSentence(
        `HHV efficiency is not listed by EPA for ${formatCount(efficiencyBlank)} ${efficiencyBlank === 1 ? "row" : "rows"} on ${stove.model}`,
      ),
    );
  }
  return sentences;
}

function thinProse(brand, lines) {
  const sentences = [];
  const ordered = [...lines].sort((a, b) => Number(b.current) - Number(a.current) || a.model.localeCompare(b.model));
  for (const stove of ordered) sentences.push(...thinLineSentences(stove));
  const crosswalk = crosswalkSentence(brand, lines);
  if (crosswalk) sentences.push(crosswalk);
  return sentences;
}

function fullProse(brand, lines) {
  const current = [];
  const previous = [];
  for (const stove of lines) {
    for (const row of epaRows(stove)) {
      if (row.current) current.push(row);
      else previous.push(row);
    }
  }
  const sentences = [typeSentence(lines)];
  const inserts = insertSentence(lines);
  if (inserts) sentences.push(inserts);
  if (current.length) {
    sentences.push(...emissionSentences(current, CURRENT_ROWS));
    sentences.push(...efficiencySentences(current, CURRENT_ROWS));
  }
  if (previous.length) {
    sentences.push(...emissionSentences(previous, PREVIOUS_ROWS));
    sentences.push(...efficiencySentences(previous, PREVIOUS_ROWS));
  }
  sentences.push(...lowestSentences(lines));
  const crosswalk = crosswalkSentence(brand, lines);
  if (crosswalk) sentences.push(crosswalk);
  return sentences;
}

export function brandAnswer(brand, lines, snapshotDate) {
  const current = lines.filter((stove) => stove.current).length;
  const previous = lines.length - current;
  const where = brand.role === "alias" ? `with ${brand.name} in the EPA text` : `for ${brand.name}`;
  return [
    endSentence(
      `EPA lists ${countNoun(current, "model line")} as currently certified on ${snapshotDate} and lists ${countNoun(previous, "previously certified model line")} ${where}`,
    ),
    `Source: EPA Certified Wood Heater Database, snapshot ${snapshotDate}.`,
  ];
}

export function brandProse(brand, lines) {
  if (!lines.length) return [];
  if (lines.length <= 2) return thinProse(brand, lines);
  return fullProse(brand, lines);
}
