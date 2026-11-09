import { btuRange, emissionUnitShort, formatCount, formatNumber } from "./format.js";
import { SIZE_BANDS } from "./heating-cost.js";

export { SIZE_BANDS };

/** Closed-interval overlap of EPA low/high with a planning range. Null is missing, not zero. */
export const NOT_LISTED_BY_EPA = "not listed by EPA";

export const COMMON_SIZES = [500, 1000, 1500, 2000, 2500, 3000];
export const EXAMPLE_SQFT = 2000;
export const EXAMPLE_BAND_ID = "moderate";
export const AREA_ERROR = "Enter a floor area of at least 1 square foot.";
export const EMPTY_OVERLAP = "No currently certified wood-stove or pellet-stove model line in this filter lists a heat-output range that overlaps this planning range.";

export const SIZE_TABLE_CAPTION = "Planning BTU/hr for 500, 1,000, 1,500, 2,000, 2,500, and 3,000 square feet at each StoveRatings band, with the count of currently certified wood-stove and pellet-stove model lines whose EPA heat-output range overlaps";

/** Temperature descriptions already published on the calculator. */
export const BAND_NOTES = {
  mild: "Winters usually stay above about 20°F",
  moderate: "Winters often fall between 0°F and 20°F",
  cold: "Winters often fall below 0°F",
  severe: "Long stretches well below 0°F, or a drafty building",
};

const DASH = "\u2013";

export function bandById(id) {
  return SIZE_BANDS.find((band) => band.id === id) || null;
}

export function bandNote(id) {
  const note = BAND_NOTES[id];
  if (!note) throw new Error(`missing band note for ${id}`);
  return note;
}

export function sizeAnchor(sqft) {
  return `sqft-${sqft}`;
}

export function readArea(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 1) return null;
    return value;
  }
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const sqft = Number(text);
  if (!Number.isFinite(sqft) || sqft < 1) return null;
  return sqft;
}

export function planningRange(sqft, band) {
  const area = Number(sqft);
  return {
    low: Math.round(area * band.low),
    high: Math.round(area * band.high),
  };
}

export function planningSpan(range) {
  return `${formatCount(range.low)}${DASH}${formatCount(range.high)}`;
}

export function rangesOverlap(lowA, highA, lowB, highB) {
  if (lowA == null || highA == null || lowB == null || highB == null) return false;
  const a0 = Number(lowA);
  const a1 = Number(highA);
  const b0 = Number(lowB);
  const b1 = Number(highB);
  if (!Number.isFinite(a0) || !Number.isFinite(a1) || !Number.isFinite(b0) || !Number.isFinite(b1)) return false;
  if (a1 < a0 || b1 < b0) return false;
  return a0 <= b1 && b0 <= a1;
}

export function hasHeatRange(stove) {
  return rangesOverlap(stove.btuLow, stove.btuHigh, stove.btuLow, stove.btuHigh);
}

/** Currently certified room stoves. Furnaces and hydronic heaters stay on their own pages. */
export function isSizingModel(stove) {
  return stove.current === true && (stove.type === "Wood Stove" || stove.type === "Pellet Stove");
}

export function heatEnds(model) {
  const low = Object.hasOwn(model, "lo") ? model.lo : model.btuLow;
  const high = Object.hasOwn(model, "hi") ? model.hi : model.btuHigh;
  return { low: low ?? null, high: high ?? null };
}

export function modelSide(model) {
  if (model.t === "p" || model.type === "Pellet Stove") return "pellet";
  return "wood";
}

export function isInsert(model) {
  if (Object.hasOwn(model, "i")) return model.i === 1 || model.i === true;
  return model.insertFlag === true;
}

export function modelName(model) {
  const value = Object.hasOwn(model, "n") ? model.n : model.model;
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function modelUrl(model) {
  const value = Object.hasOwn(model, "u") ? model.u : model.url;
  return String(value || "");
}

export function coverageShare(low, high, planLow, planHigh) {
  if (!rangesOverlap(low, high, planLow, planHigh)) return 0;
  const width = Number(planHigh) - Number(planLow);
  if (!(width > 0)) return 0;
  const overlap = Math.min(Number(high), Number(planHigh)) - Math.max(Number(low), Number(planLow));
  if (!(overlap > 0)) return 0;
  return overlap / width;
}

export function compareOverlap(a, b, planLow, planHigh) {
  const aEnds = heatEnds(a);
  const bEnds = heatEnds(b);
  const coverA = coverageShare(aEnds.low, aEnds.high, planLow, planHigh);
  const coverB = coverageShare(bEnds.low, bEnds.high, planLow, planHigh);
  if (coverA !== coverB) return coverB - coverA;
  const midA = (Number(aEnds.low) + Number(aEnds.high)) / 2;
  const midB = (Number(bEnds.low) + Number(bEnds.high)) / 2;
  if (midA !== midB) return midB - midA;
  return modelName(a).localeCompare(modelName(b), "en");
}

export function selectOverlaps(models, planLow, planHigh, side = "all", insertsOnly = false) {
  const matched = [];
  for (const model of models) {
    const { low, high } = heatEnds(model);
    if (!rangesOverlap(low, high, planLow, planHigh)) continue;
    const kind = modelSide(model);
    if (side === "wood" && kind !== "wood") continue;
    if (side === "pellet" && kind !== "pellet") continue;
    if (insertsOnly && !isInsert(model)) continue;
    matched.push(model);
  }
  matched.sort((a, b) => compareOverlap(a, b, planLow, planHigh));
  return matched;
}

export function overlapModels(stoves, planLow, planHigh) {
  return selectOverlaps(
    stoves.filter((stove) => isSizingModel(stove) && hasHeatRange(stove)),
    planLow,
    planHigh,
  );
}

export function countBySide(models) {
  let wood = 0;
  let pellet = 0;
  for (const model of models) {
    if (modelSide(model) === "pellet") pellet += 1;
    else wood += 1;
  }
  return { wood, pellet, total: wood + pellet };
}

export function excludedHeatCount(stoves) {
  return stoves.filter((stove) => isSizingModel(stove) && !hasHeatRange(stove)).length;
}

export function commonSizeRows(stoves) {
  const rows = [];
  for (const sqft of COMMON_SIZES) {
    for (const band of SIZE_BANDS) {
      const range = planningRange(sqft, band);
      const counts = countBySide(overlapModels(stoves, range.low, range.high));
      rows.push({ sqft, band, range, wood: counts.wood, pellet: counts.pellet });
    }
  }
  return rows;
}

function compactModel(stove) {
  return {
    u: stove.url,
    n: stove.model,
    m: stove.manufacturer || "",
    t: stove.type === "Pellet Stove" ? "p" : "w",
    i: stove.insertFlag === true ? 1 : 0,
    lo: stove.btuLow,
    hi: stove.btuHigh,
    eff: stove.efficiency ?? null,
    em: stove.emission ?? null,
    eu: stove.emissionUnit || "",
  };
}

export function sizeOverlapPayload(stoves, snapshotDate) {
  const population = stoves.filter(isSizingModel);
  const models = population
    .filter(hasHeatRange)
    .map(compactModel)
    .sort((a, b) => a.u.localeCompare(b.u) || a.n.localeCompare(b.n));
  return {
    snapshot: snapshotDate,
    excluded: population.length - models.length,
    models,
  };
}

export function efficiencyLabel(value) {
  if (value == null || value === "") return NOT_LISTED_BY_EPA;
  const number = formatNumber(value, 2);
  if (number == null) return NOT_LISTED_BY_EPA;
  return `${number}%`;
}

export function emissionLabel(value, unit) {
  if (value == null || value === "") return NOT_LISTED_BY_EPA;
  const number = formatNumber(value, 3);
  if (number == null) return NOT_LISTED_BY_EPA;
  const short = emissionUnitShort(unit);
  if (!short) return `${number}, unit not listed by EPA`;
  return `${number} ${short}`;
}

export function heatLabel(low, high) {
  if (low == null || high == null) return NOT_LISTED_BY_EPA;
  return btuRange(low, high) || NOT_LISTED_BY_EPA;
}

export function listedManufacturer(model) {
  const value = Object.hasOwn(model, "m") ? model.m : model.manufacturer;
  if (value == null || String(value).trim() === "") return NOT_LISTED_BY_EPA;
  return String(value);
}

export function overlapRowView(model) {
  const { low, high } = heatEnds(model);
  const unit = Object.hasOwn(model, "eu") ? model.eu : model.emissionUnit;
  const efficiency = Object.hasOwn(model, "eff") ? model.eff : model.efficiency;
  const emission = Object.hasOwn(model, "em") ? model.em : model.emission;
  return {
    href: modelUrl(model),
    model: modelName(model),
    manufacturer: listedManufacturer(model),
    type: modelSide(model) === "pellet" ? "Pellet stove" : "Wood stove",
    insert: isInsert(model),
    heat: heatLabel(low, high),
    efficiency: efficiencyLabel(efficiency),
    emission: emissionLabel(emission, unit),
  };
}

export function planningSentence(sqft, band) {
  const range = planningRange(sqft, band);
  const area = formatCount(sqft);
  return `${area} sq ft × ${band.low} = ${formatCount(range.low)} BTU/hr, and ${area} sq ft × ${band.high} = ${formatCount(range.high)} BTU/hr. That is StoveRatings' planning range for this band, not an EPA figure.`;
}

export function overlapCaption(sqft, band) {
  const range = planningRange(sqft, band);
  return `Currently certified wood and pellet stoves whose EPA heat-output range overlaps ${formatCount(sqft)} sq ft in the ${band.label.toLowerCase()} band (${planningSpan(range)} BTU/hr). Sorted by how much of that planning range the EPA range covers, highest first, then by the midpoint of the EPA low and high, highest first, then by model name.`;
}

function kindPair(side, insertsOnly) {
  if (insertsOnly && side === "wood") {
    return ["wood-stove model line whose name indicates an insert", "wood-stove model lines whose names indicate an insert"];
  }
  if (insertsOnly && side === "pellet") {
    return ["pellet-stove model line whose name indicates an insert", "pellet-stove model lines whose names indicate an insert"];
  }
  if (insertsOnly) {
    return ["model line whose name indicates an insert", "model lines whose names indicate an insert"];
  }
  if (side === "wood") return ["wood-stove model line", "wood-stove model lines"];
  if (side === "pellet") return ["pellet-stove model line", "pellet-stove model lines"];
  return ["wood-stove or pellet-stove model line", "wood-stove and pellet-stove model lines"];
}

export function overlapStatus(count, range, { side = "all", insertsOnly = false } = {}) {
  const span = `${planningSpan(range)} BTU/hr`;
  const [singular, plural] = kindPair(side, insertsOnly);
  const noun = `${formatCount(count)} ${count === 1 ? singular : plural}`;
  const verb = count === 1 ? "lists" : "list";
  return `${noun} ${verb} an EPA heat-output range that overlaps ${span}.`;
}

export function excludedSentence(count) {
  const blank = "A blank heat-output cell is not listed by EPA and is not zero.";
  if (count === 0) {
    return `0 currently certified wood-stove and pellet-stove model lines are missing an EPA heat-output low and high, so none are left out of the list. ${blank}`;
  }
  const noun = `${formatCount(count)} ${count === 1 ? "currently certified wood-stove or pellet-stove model line" : "currently certified wood-stove and pellet-stove model lines"}`;
  const verb = count === 1 ? "has" : "have";
  const pronoun = count === 1 ? "it is" : "they are";
  return `${noun} ${verb} no EPA heat-output low and high, so ${pronoun} left out of the list. ${blank}`;
}

export function exampleAnswer(stoves, snapshotDate) {
  const band = bandById(EXAMPLE_BAND_ID);
  const range = planningRange(EXAMPLE_SQFT, band);
  const counts = countBySide(overlapModels(stoves, range.low, range.high));
  const area = formatCount(EXAMPLE_SQFT);
  const wood = `${formatCount(counts.wood)} ${counts.wood === 1 ? "currently certified wood-stove model line" : "currently certified wood-stove model lines"}`;
  const pellet = `${formatCount(counts.pellet)} ${counts.pellet === 1 ? "currently certified pellet-stove model line" : "currently certified pellet-stove model lines"}`;
  return [
    `For ${area} square feet in the moderate band, ${area} times ${band.low} is ${formatCount(range.low)} BTU/hr and ${area} times ${band.high} is ${formatCount(range.high)} BTU/hr.`,
    `${wood} and ${pellet} list an EPA heat-output range that overlaps that span in the ${snapshotDate} snapshot.`,
    "Those factors are StoveRatings planning factors for an 8-foot ceiling, not EPA figures. EPA heat output is a lab test range, not delivered room heat, and an overlap is a starting list, not a sizing guarantee.",
  ];
}

export function btuQuestion(sqft) {
  return `How many BTU to heat ${formatCount(sqft)} sq ft?`;
}

export function btuAnswer(stoves, sqft, snapshotDate) {
  const bandBits = SIZE_BANDS.map((band) => {
    const range = planningRange(sqft, band);
    return `${band.label} is ${planningSpan(range)} BTU/hr, from factors ${band.low} and ${band.high}`;
  });
  const moderate = bandById(EXAMPLE_BAND_ID);
  const range = planningRange(sqft, moderate);
  const counts = countBySide(overlapModels(stoves, range.low, range.high));
  const wood = `${formatCount(counts.wood)} ${counts.wood === 1 ? "currently certified wood-stove model line" : "currently certified wood-stove model lines"}`;
  const pellet = `${formatCount(counts.pellet)} ${counts.pellet === 1 ? "currently certified pellet-stove model line" : "currently certified pellet-stove model lines"}`;
  return `For ${formatCount(sqft)} sq ft, multiply the floor area by the StoveRatings band factor. ${bandBits.join(". ")}. Those factors are for an 8-foot ceiling. They are not EPA figures and they are not a room-by-room heat-loss calculation. In the ${snapshotDate} snapshot, ${wood} and ${pellet} list a heat-output range that overlaps the moderate band. EPA heat output is a lab test range, not delivered room heat, and that overlap is a starting list, not a recommendation or a sizing guarantee.`;
}

export function sizeFaqs(stoves, snapshotDate) {
  return [
    { question: btuQuestion(2000), answer: btuAnswer(stoves, 2000, snapshotDate) },
    { question: btuQuestion(1000), answer: btuAnswer(stoves, 1000, snapshotDate) },
    {
      question: "What does an overlapping EPA heat-output range mean?",
      answer: `EPA lists a heat-output low and high from a lab test. That range is not the heat delivered to a room. This page lists a currently certified wood-stove or pellet-stove model line when that lab range overlaps the planning range. The overlap is a starting list, not a recommendation or a sizing guarantee. A blank heat-output cell is not listed by EPA and is not treated as zero. Model lines with no heat-output low and high are left out, and the page states how many. Snapshot ${snapshotDate}.`,
    },
  ];
}
