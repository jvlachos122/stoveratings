/** Shared heating-cost math. The page and the unit tests both use this file. */

export const SHORT_TON_POUNDS = 2000;

export const SIZE_BANDS = [
  { id: "mild", label: "Mild", low: 20, high: 30 },
  { id: "moderate", label: "Moderate", low: 30, high: 45 },
  { id: "cold", label: "Cold", low: 45, high: 60 },
  { id: "severe", label: "Severe", low: 60, high: 75 },
];

export const EFFICIENCY_MISSING = "Enter efficiency. A blank is not zero.";
export const PRICE_MISSING = "Enter a price above zero.";
export const HEAT_MISSING = "Choose a cited heat content.";
export const SEASON_MISSING = "Enter season heat.";

export function readNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value == null) return null;
  const text = String(value).trim().replace(/[$,]/g, "").replace(/%$/, "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function deliveredMmbtuFromSize(sqft, factor, hours) {
  const area = readNumber(sqft);
  const band = readNumber(factor);
  const duration = readNumber(hours);
  if (area == null || band == null || duration == null) return null;
  if (!(area > 0) || !(band > 0) || !(duration > 0)) return null;
  return (area * band * duration) / 1_000_000;
}

export function costPerMmbtuDelivered(pricePerUnit, btuPerUnit, efficiencyPercent) {
  const price = readNumber(pricePerUnit);
  const btu = readNumber(btuPerUnit);
  const efficiency = readNumber(efficiencyPercent);
  if (price == null || btu == null || efficiency == null) return null;
  if (!(price > 0) || !(btu > 0) || !(efficiency > 0)) return null;
  const mmbtuPerUnit = btu / 1_000_000;
  return price / (mmbtuPerUnit * (efficiency / 100));
}

/** BTU per short ton from a per-pound figure, using exact decimal digits when the input is a simple decimal. */
export function pelletBtuPerShortTon(btuPerPound) {
  const text = String(btuPerPound).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const scale = 10 ** frac.length;
  const digits = Number(whole) * scale + Number(frac || "0");
  return (digits * SHORT_TON_POUNDS) / scale;
}

/**
 * Cost at both ends of a heat-content range.
 * perMmbtuLow is the lower cost (higher BTU per unit). A blank or non-positive
 * efficiency returns no numeric cost.
 */
export function costsForFuel({ price, btuLow, btuHigh, efficiencyPercent, deliveredMmbtu }) {
  const efficiency = readNumber(efficiencyPercent);
  if (efficiency == null || !(efficiency > 0)) {
    return { ok: false, reason: "efficiency", perMmbtuLow: null, perMmbtuHigh: null, seasonLow: null, seasonHigh: null };
  }
  const unitPrice = readNumber(price);
  if (unitPrice == null || !(unitPrice > 0)) {
    return { ok: false, reason: "price", perMmbtuLow: null, perMmbtuHigh: null, seasonLow: null, seasonHigh: null };
  }
  const low = readNumber(btuLow);
  const high = readNumber(btuHigh == null ? btuLow : btuHigh);
  if (low == null || high == null || !(low > 0) || high < low) {
    return { ok: false, reason: "heat", perMmbtuLow: null, perMmbtuHigh: null, seasonLow: null, seasonHigh: null };
  }
  const perMmbtuLow = costPerMmbtuDelivered(unitPrice, high, efficiency);
  const perMmbtuHigh = costPerMmbtuDelivered(unitPrice, low, efficiency);
  const heat = readNumber(deliveredMmbtu);
  const seasonOk = heat != null && heat > 0;
  return {
    ok: true,
    reason: null,
    perMmbtuLow,
    perMmbtuHigh,
    seasonLow: seasonOk ? perMmbtuLow * heat : null,
    seasonHigh: seasonOk ? perMmbtuHigh * heat : null,
  };
}

/**
 * Fuel units for a delivered heat load.
 * unitsLow uses the higher BTU per unit (fewer units). A blank or non-positive
 * efficiency returns no numeric count and is not treated as zero.
 */
export function fuelUnits({ deliveredMmbtu, btuLow, btuHigh, efficiencyPercent }) {
  const efficiency = readNumber(efficiencyPercent);
  const heat = readNumber(deliveredMmbtu);
  const low = readNumber(btuLow);
  const high = readNumber(btuHigh == null ? btuLow : btuHigh);
  const empty = { ok: false, fuelMmbtu: null, unitsLow: null, unitsHigh: null };
  if (efficiency == null || !(efficiency > 0)) return { ...empty, reason: "efficiency" };
  if (low == null || high == null || !(low > 0) || high < low) return { ...empty, reason: "heat" };
  if (heat == null || !(heat > 0)) return { ...empty, reason: "season" };
  const fuelMmbtu = heat / (efficiency / 100);
  return {
    ok: true,
    reason: null,
    fuelMmbtu,
    unitsLow: fuelMmbtu / (high / 1_000_000),
    unitsHigh: fuelMmbtu / (low / 1_000_000),
  };
}

function searchParamsFrom(search) {
  if (search instanceof URLSearchParams) return search;
  let text = String(search ?? "");
  const query = text.indexOf("?");
  if (query >= 0) text = text.slice(query + 1);
  return new URLSearchParams(text);
}

/** A positive amount, or null. Zero and a blank are not a price or an efficiency. */
export function positiveAmountText(raw) {
  if (raw == null) return null;
  const value = readNumber(raw);
  if (value == null || !(value > 0)) return null;
  return String(raw).trim().replace(/[$,]/g, "").replace(/%$/, "").trim();
}

/**
 * Query string for the heating cost calculator.
 * A complete size query (sqft, band, end, hours) wins over a direct heat figure.
 * Prices and efficiencies are omitted when blank, zero, or negative.
 */
export function readHeatingCostQuery(search) {
  const params = searchParamsFrom(search);
  const band = String(params.get("band") || "").trim();
  const end = String(params.get("end") || "").trim();
  const sqftText = positiveAmountText(params.get("sqft"));
  const hoursText = positiveAmountText(params.get("hours"));
  const heatText = positiveAmountText(params.get("heat"));
  const bandOk = SIZE_BANDS.some((item) => item.id === band);
  const endOk = end === "low" || end === "high";
  const sizeOk = sqftText != null && hoursText != null && bandOk && endOk;
  const mode = sizeOk ? "size" : heatText != null ? "direct" : null;
  return {
    mode,
    sqftText: sizeOk ? sqftText : null,
    hoursText: sizeOk ? hoursText : null,
    band: sizeOk ? band : null,
    end: sizeOk ? end : null,
    heatText: mode === "direct" ? heatText : null,
    species: String(params.get("species") || "").trim(),
    woodPriceText: positiveAmountText(params.get("wood")),
    woodEffText: positiveAmountText(params.get("weff")),
    region: String(params.get("region") || "").trim(),
    pelletPriceText: positiveAmountText(params.get("pellet")),
    pelletEffText: positiveAmountText(params.get("peff")),
    model: String(params.get("model") || "").trim(),
  };
}

export function heatingCostSearch(fields) {
  const params = new URLSearchParams();
  const set = (key, value) => {
    if (value == null || value === "") return;
    params.set(key, String(value));
  };
  set("sqft", fields.sqft);
  set("band", fields.band);
  set("end", fields.end);
  set("hours", fields.hours);
  set("heat", fields.heat);
  set("species", fields.species);
  set("wood", fields.woodPriceText);
  set("weff", fields.woodEffText);
  set("region", fields.region);
  set("pellet", fields.pelletPriceText);
  set("peff", fields.pelletEffText);
  set("model", fields.model);
  return params.toString();
}

export function formatPlainNumber(value, maxDigits = 3) {
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: maxDigits });
}

export function formatUsd(value) {
  return Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatUsdRange(low, high) {
  const cheaper = formatUsd(low);
  const dearer = formatUsd(high);
  if (cheaper === dearer) return cheaper;
  return `${cheaper} to ${dearer}`;
}

export function perMmbtuText(result) {
  if (!result.ok) {
    if (result.reason === "price") return PRICE_MISSING;
    if (result.reason === "heat") return HEAT_MISSING;
    return EFFICIENCY_MISSING;
  }
  return formatUsdRange(result.perMmbtuLow, result.perMmbtuHigh);
}

export function seasonText(result) {
  if (!result.ok) return perMmbtuText(result);
  if (result.seasonLow == null || result.seasonHigh == null) return SEASON_MISSING;
  return formatUsdRange(result.seasonLow, result.seasonHigh);
}

export function cordHeatText(lowMillion, highMillion) {
  const low = formatPlainNumber(lowMillion, 1);
  const high = formatPlainNumber(highMillion, 1);
  if (low === high) return `${low} million BTU per cord`;
  return `${low} to ${high} million BTU per cord`;
}

export function heatContentText(row) {
  const raw = row.btuText || row.btuPerUnit;
  const shown = formatPlainNumber(raw, 3);
  const noun = row.unit === "pound" ? "pound" : row.unit;
  let text = `${shown} BTU per ${noun}`;
  if (row.unit === "pound") {
    const perTon = pelletBtuPerShortTon(raw);
    if (perTon != null) text += ` (${formatPlainNumber(perTon / 1_000_000, 4)} million BTU per short ton)`;
  }
  return text;
}

export function formatPriceInput(raw, unit) {
  const amount = readNumber(raw);
  if (amount == null || !(amount > 0)) return null;
  const text = String(raw).trim().replace(/[$,]/g, "");
  return `$${text} per ${unit}`;
}

export function applianceSide(stove) {
  const fuel = String(stove.fuel || "");
  const type = String(stove.type || "");
  if (/pellet/i.test(fuel) || /pellet/i.test(type)) return "pellet";
  return "wood";
}

export function efficiencyVaries(tests) {
  const values = (tests || []).map((test) => test.efficiency);
  const listed = values.filter((value) => value != null);
  if (!listed.length) return false;
  if (listed.length !== values.length) return true;
  return new Set(listed).size > 1;
}

export function heatingModels(stoves) {
  return stoves.map((stove) => ({
    id: stove.id,
    model: stove.model,
    mfr: stove.manufacturer || "",
    type: stove.type || "",
    eff: stove.efficiency,
    url: stove.url,
    side: applianceSide(stove),
    current: Boolean(stove.current),
    varied: efficiencyVaries(stove.tests),
  }));
}

/** Static file the calculator fetches. Same fields the page used to inline. */
export function heatingCostPayload({ snapshotDate, firewood, heat, stoves }) {
  const species = [...firewood].sort((a, b) => a.species.localeCompare(b.species, "en"));
  return {
    snapshotDate,
    bands: SIZE_BANDS,
    firewood: species.map((row) => ({
      species: row.species,
      btuLow: row.btuLow,
      btuHigh: row.btuHigh,
    })),
    heat,
    models: heatingModels(stoves),
  };
}

export function efficiencyNote(model, snapshotDate) {
  if (!model) return "";
  if (model.eff == null) {
    return `Not listed by EPA. EPA does not list an HHV efficiency for this model line. Enter a percent. A blank is not zero. Snapshot ${snapshotDate}.`;
  }
  const figure = formatPlainNumber(model.eff, 2);
  const extra = model.varied ? " Other rows on this model line do not all list this figure." : "";
  return `EPA lists ${figure} percent in Overall Efficiency-HHV (%) on the primary row.${extra} Snapshot ${snapshotDate}. You can replace the number.`;
}

export function sourceIssues(row) {
  const issues = [];
  const source = String(row.sourceUrl || row.source_url || "").trim();
  if (!source.startsWith("https://")) issues.push("source_url");
  if (source.includes("cfpub.epa.gov")) issues.push("cfpub");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.retrieved || "").trim())) issues.push("retrieved");
  if (!String(row.period || "").trim()) issues.push("period");
  if (!String(row.periodLabel || row.period_label || "").trim()) issues.push("period_label");
  if (!String(row.sourceNote || row.source_note || "").trim()) issues.push("source_note");
  return issues;
}

export function heatingSentences({ gas, oil, propane, electricity, pelletSales, firewoodRetrieved, fuelRetrieved }) {
  if (oil.periodLabel !== propane.periodLabel) {
    throw new Error("heating oil and propane periods differ");
  }
  return [
    "This calculator reports dollars per million BTU of heat delivered, and the dollars for the heating season you enter, from a fuel price and an appliance efficiency.",
    `Heat contents and the prefilled prices were retrieved ${fuelRetrieved}: cordwood from the University of Arkansas extension table (retrieved ${firewoodRetrieved}), pellets from EIA Form EIA-63C for July 2026, and natural gas, propane, heating oil, and electricity from EIA (natural gas ${gas.periodLabel}, heating oil and propane ${oil.periodLabel}, electricity ${electricity.periodLabel}).`,
    `Cord wood has no prefilled price. The pellet price starts empty because EIA's domestic sales average of $${pelletSales.priceText} per ton for ${pelletSales.periodLabel} mixes retail and wholesale sales.`,
  ];
}

export function sharedRetrieved(rows) {
  const dates = [...new Set(rows.map((row) => row.retrieved))];
  if (dates.length !== 1 || !dates[0]) return null;
  return dates[0];
}
