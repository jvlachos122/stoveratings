import { formatNumber } from "./format.js";
import {
  cordHeatText,
  costsForFuel,
  deliveredMmbtuFromSize,
  formatPlainNumber,
  formatUsd,
  fuelUnits,
  heatingCostSearch,
  pelletBtuPerShortTon,
} from "./heating-cost.js";
import { EXAMPLE_BAND_ID, EXAMPLE_SQFT, bandById } from "./stove-size.js";

/** Example duration only. The heating cost calculator does not default the hours. */
export const EXAMPLE_HOURS = 1000;
export const EXAMPLE_END = "low";
export const EXAMPLE_SPECIES = "Oaks: red oak family";
export const EXAMPLE_PELLET_HEAT_ID = "pellets-east";
export const EXAMPLE_PELLET_PRICE_ID = "pellets-domestic";
export const UNIT_DIGITS = 4;

export const COST_CAVEAT = "These are estimates, not a quote. Real costs vary with burn habits, wood moisture, and the installation.";

export const SEASON_FORMULA = "Fuel energy in million BTU = delivered million BTU ÷ (efficiency ÷ 100). Units burned = fuel energy ÷ million BTU in one unit of that fuel. Season cost = units × price per unit. When a cordwood species lists a range, both ends are calculated. More BTU per unit means fewer units.";

function retrievedDate(note) {
  const match = String(note || "").match(/retrieved (\d{4}-\d{2}-\d{2})/i);
  return match ? match[1] : null;
}

function latestIso(dates) {
  const valid = dates.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")));
  if (!valid.length) throw new Error("missing a retrieved date for the season comparison");
  return valid.sort()[valid.length - 1];
}

function unitPhrase(units) {
  const low = formatPlainNumber(units.unitsLow, UNIT_DIGITS);
  const high = formatPlainNumber(units.unitsHigh, UNIT_DIGITS);
  if (low === high) return low;
  return `${low} to ${high}`;
}

function fractionText(efficiency) {
  return formatPlainNumber(efficiency / 100, 6);
}

function equation(delivered, btuMillion, efficiency, units) {
  return `${formatPlainNumber(delivered, 4)} ÷ (${formatPlainNumber(btuMillion, 4)} × ${fractionText(efficiency)}) = ${formatPlainNumber(units, UNIT_DIGITS)}`;
}

function unitsCell(delivered, lowMillion, highMillion, efficiency, units, noun, unitName) {
  const fewer = `${equation(delivered, highMillion, efficiency, units.unitsLow)} ${noun} at ${formatPlainNumber(highMillion, 4)} million BTU per ${unitName}`;
  if (formatPlainNumber(lowMillion, 4) === formatPlainNumber(highMillion, 4)) {
    return `${equation(delivered, highMillion, efficiency, units.unitsLow)} ${noun}`;
  }
  const more = `${equation(delivered, lowMillion, efficiency, units.unitsHigh)} ${noun} at ${formatPlainNumber(lowMillion, 4)} million BTU per ${unitName}`;
  return `${fewer}. ${more}.`;
}

function pricePolicy(row) {
  if (row.prefill) return "The heating cost calculator prefills this average.";
  return "The heating cost calculator leaves this average empty, because it mixes retail and wholesale sales.";
}

function eia63cTable(url) {
  const match = String(url || "").match(/EIA_63C_Table_(\d+)/);
  if (!match) throw new Error(`pellet source is not an EIA-63C table URL: ${url}`);
  return `Table ${match[1]}`;
}

export function seasonComparison({ firewood, heat, prices, woodMedian, pelletMedian, snapshotDate }) {
  if (woodMedian?.efficiencyMedian == null || !(woodMedian.efficiencyMedian > 0)) {
    throw new Error("missing wood HHV median");
  }
  if (pelletMedian?.efficiencyMedian == null || !(pelletMedian.efficiencyMedian > 0)) {
    throw new Error("missing pellet HHV median");
  }
  const species = firewood.find((row) => row.species === EXAMPLE_SPECIES);
  if (!species) throw new Error(`missing species ${EXAMPLE_SPECIES}`);
  const pelletHeat = heat.find((row) => row.id === EXAMPLE_PELLET_HEAT_ID);
  const pelletPrice = prices.find((row) => row.id === EXAMPLE_PELLET_PRICE_ID);
  if (!pelletHeat) throw new Error(`missing pellet heat row ${EXAMPLE_PELLET_HEAT_ID}`);
  if (!pelletPrice) throw new Error(`missing pellet price row ${EXAMPLE_PELLET_PRICE_ID}`);
  const pelletHeatTable = eia63cTable(pelletHeat.sourceUrl);
  const pelletPriceTable = eia63cTable(pelletPrice.sourceUrl);
  if (!/559/.test(String(species.sourceNote || ""))) {
    throw new Error("cord heat source does not cite USDA Forest Service Leaflet 559");
  }
  const band = bandById(EXAMPLE_BAND_ID);
  if (!band) throw new Error(`missing band ${EXAMPLE_BAND_ID}`);
  const factor = EXAMPLE_END === "high" ? band.high : band.low;
  const delivered = deliveredMmbtuFromSize(EXAMPLE_SQFT, factor, EXAMPLE_HOURS);
  if (delivered == null) throw new Error("example season heat did not compute");

  const woodUnits = fuelUnits({
    deliveredMmbtu: delivered,
    btuLow: species.btuLow * 1_000_000,
    btuHigh: species.btuHigh * 1_000_000,
    efficiencyPercent: woodMedian.efficiencyMedian,
  });
  if (!woodUnits.ok) throw new Error("wood units did not compute");

  const perTon = pelletBtuPerShortTon(pelletHeat.btuText || pelletHeat.btuPerUnit);
  if (perTon == null) throw new Error("pellet heat did not convert to a short ton");
  const pelletUnits = fuelUnits({
    deliveredMmbtu: delivered,
    btuLow: perTon,
    btuHigh: perTon,
    efficiencyPercent: pelletMedian.efficiencyMedian,
  });
  if (!pelletUnits.ok) throw new Error("pellet units did not compute");

  const pelletCost = costsForFuel({
    price: pelletPrice.priceText,
    btuLow: perTon,
    btuHigh: perTon,
    efficiencyPercent: pelletMedian.efficiencyMedian,
    deliveredMmbtu: delivered,
  });
  if (!pelletCost.ok || pelletCost.seasonLow == null) throw new Error("pellet cost did not compute");

  const woodEff = woodMedian.efficiencyMedian;
  const pelletEff = pelletMedian.efficiencyMedian;
  const search = heatingCostSearch({
    sqft: EXAMPLE_SQFT,
    band: EXAMPLE_BAND_ID,
    end: EXAMPLE_END,
    hours: EXAMPLE_HOURS,
    species: species.species,
    woodEffText: String(woodEff),
    region: pelletHeat.id,
    pelletPriceText: pelletPrice.priceText,
    pelletEffText: String(pelletEff),
  });
  const href = `/tools/heating-cost-calculator/?${search}`;
  const woodRetrieved = retrievedDate(species.sourceNote);
  const lastUpdated = latestIso([
    snapshotDate,
    woodRetrieved,
    pelletHeat.retrieved,
    pelletPrice.retrieved,
  ]);
  const policy = pricePolicy(pelletPrice);
  const deliveredText = formatPlainNumber(delivered, 4);
  const areaText = formatPlainNumber(EXAMPLE_SQFT, 0);
  const hoursText = formatPlainNumber(EXAMPLE_HOURS, 0);
  const woodCount = unitPhrase(woodUnits);
  const pelletCount = unitPhrase(pelletUnits);
  const pelletCostText = formatUsd(pelletCost.seasonLow);
  const perTonMillion = perTon / 1_000_000;

  const sentences = [
    `For ${areaText} square feet, using the ${band.label.toLowerCase()} band low factor of ${factor} BTU per hour per square foot over ${hoursText} hours, the season heat is ${deliveredText} million BTU delivered.`,
    `At the median HHV efficiency of currently certified rows in the snapshot dated ${snapshotDate}, that heat uses ${woodCount} cords of ${species.species} and ${pelletCount} short tons of ${pelletHeat.label}.`,
    `The pellet figure in the table is ${pelletCostText}, using the cited domestic sales average of $${pelletPrice.priceText} per ton for ${pelletPrice.periodLabel}. ${policy} Cord wood has no price in this snapshot, so its season cost is that cord count times the price you pay.`,
  ];

  const rows = [
    {
      label: "Season heat delivered",
      wood: `${deliveredText} million BTU`,
      pellet: `${deliveredText} million BTU`,
    },
    {
      label: "Appliance efficiency",
      wood: `${formatNumber(woodEff, 2)} percent, median HHV of ${formatPlainNumber(woodMedian.efficiencyN, 0)} currently certified wood-stove rows`,
      pellet: `${formatNumber(pelletEff, 2)} percent, median HHV of ${formatPlainNumber(pelletMedian.efficiencyN, 0)} currently certified pellet-stove rows`,
    },
    {
      label: "Fuel energy",
      wood: `${deliveredText} ÷ ${fractionText(woodEff)} = ${formatPlainNumber(woodUnits.fuelMmbtu, 3)} million BTU`,
      pellet: `${deliveredText} ÷ ${fractionText(pelletEff)} = ${formatPlainNumber(pelletUnits.fuelMmbtu, 3)} million BTU`,
    },
    {
      label: "Heat in one unit",
      wood: cordHeatText(species.btuLow, species.btuHigh),
      pellet: `${formatPlainNumber(perTonMillion, 4)} million BTU per short ton`,
    },
    {
      label: "Units for the season",
      wood: unitsCell(delivered, species.btuLow, species.btuHigh, woodEff, woodUnits, "cords", "cord"),
      pellet: unitsCell(delivered, perTonMillion, perTonMillion, pelletEff, pelletUnits, "short tons", "short ton"),
    },
    {
      label: "Price",
      wood: "No price in this snapshot. Enter the price you pay per cord.",
      pellet: `$${pelletPrice.priceText} per short ton. Cited domestic sales average, ${pelletPrice.periodLabel}. ${policy}`,
    },
    {
      label: "Season cost",
      wood: "Not calculated. Season cost = cords × the price you pay per cord.",
      pellet: `${pelletCostText}. ${deliveredText} ÷ (${formatPlainNumber(perTonMillion, 4)} × ${fractionText(pelletEff)}) × ${pelletPrice.priceText} = ${pelletCostText}.`,
    },
  ];

  return {
    delivered,
    factor,
    band,
    species,
    pelletHeat,
    pelletHeatTable,
    pelletPrice,
    pelletPriceTable,
    woodEff,
    pelletEff,
    woodUnits,
    pelletUnits,
    pelletCost,
    perTon,
    href,
    sentences,
    rows,
    policy,
    snapshotDate,
    woodRetrieved,
    lastUpdated,
    caption: `Worked season comparison for ${areaText} square feet using the ${band.label.toLowerCase()} band low factor over ${hoursText} example hours`,
    linkLead: "Open this example in the heating cost calculator.",
    linkRest: `The link fills the season inputs, ${species.species}, both median efficiencies, ${pelletHeat.label}, and the cited pellet price of $${pelletPrice.priceText} per ton. It does not fill a cord price. You can replace any of those fields. The table above is in the page HTML and does not need that script.`,
  };
}

export function seasonCostFaqs(view) {
  const wood = view.species;
  const price = view.pelletPrice;
  return [
    {
      question: "How is the season heat in the example calculated?",
      answer: `${formatPlainNumber(EXAMPLE_SQFT, 0)} square feet × ${view.factor} BTU per hour per square foot × ${formatPlainNumber(EXAMPLE_HOURS, 0)} hours ÷ 1,000,000 = ${formatPlainNumber(view.delivered, 4)} million BTU delivered. The factor ${view.factor} is the low end of the ${view.band.label.toLowerCase()} band on the stove size calculator. The ${formatPlainNumber(EXAMPLE_HOURS, 0)} hours are an example duration. The heating cost calculator does not supply a default number of hours.`,
    },
    {
      question: "Why is there no cord wood price?",
      answer: "This snapshot has no cited residential price per cord. The heating cost calculator leaves that field empty. Season cost for cord wood is the cord count times the price you pay.",
    },
    {
      question: "What pellet price is in the example?",
      answer: `$${price.priceText} per short ton, the U.S. total domestic sales average from EIA Form EIA-63C ${eia63cTable(price.sourceUrl)} for ${price.periodLabel}, retrieved ${price.retrieved}. ${price.sourceNote} ${view.policy}`,
    },
    {
      question: "Does wood moisture change this cord count?",
      answer: `The cord heat for ${wood.species} is ${cordHeatText(wood.btuLow, wood.btuHigh)}. ${wood.sourceNote} That table does not publish a moisture percent this page can apply. Wetter wood changes the heat in a real cord. The cord count here uses the published cord values.`,
    },
  ];
}

export function seasonCostNotes(view) {
  return [
    "The hour count in the example is not a default. The heating cost calculator does not fill hours.",
    "The stove-size factors are StoveRatings planning factors for an 8-foot ceiling, not EPA figures.",
    view.policy,
    "Cord wood price is the price you pay. No residential cord price is committed in this snapshot.",
  ];
}

export function seasonCostCopy(view, faqs, notes) {
  return [
    ...view.sentences,
    view.caption,
    view.linkLead,
    view.linkRest,
    SEASON_FORMULA,
    COST_CAVEAT,
    ...view.rows.flatMap((row) => [row.label, row.wood, row.pellet]),
    ...faqs.flatMap((faq) => [faq.question, faq.answer]),
    ...notes,
  ].join("\n");
}
