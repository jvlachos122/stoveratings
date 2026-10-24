export function formatNumber(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const numeric = Number(value);
  const text = String(Number(numeric.toFixed(digits)));
  return text;
}

export function formatCount(value) {
  return Number(value).toLocaleString("en-US");
}

export function formatBtu(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Math.round(Number(value)).toLocaleString("en-US");
}

export function btuRange(low, high) {
  if (low == null && high == null) return null;
  if (low != null && high != null && low !== high) {
    return `${formatBtu(low)}–${formatBtu(high)} BTU/hr`;
  }
  const single = low ?? high;
  return `${formatBtu(single)} BTU/hr`;
}

export function emissionText(value, unit) {
  const number = formatNumber(value, 3);
  if (number == null) return null;
  if (unit === "g/hr") return `${number} grams per hour`;
  if (unit === "lb/mmBTU") return `${number} pounds per million BTU`;
  return `${number} ${unit}`;
}

export function emissionUnitShort(unit) {
  if (unit === "g/hr") return "g/hr";
  if (unit === "lb/mmBTU") return "lb/mmBTU";
  return unit || "";
}

export function efficiencyText(value) {
  const number = formatNumber(value, 2);
  if (number == null) return null;
  return `${number} percent`;
}

export function countNoun(count, singular, plural = `${singular}s`) {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}

export function kindLabel(stove) {
  const type = stove.type || "heater";
  const subtype = stove.subtype || "";
  if (type === "Wood Stove" && subtype === "Catalytic Stove") return "catalytic wood stove";
  if (type === "Wood Stove" && subtype === "Non-Catalytic Stove") return "non-catalytic wood stove";
  if (type === "Wood Stove" && subtype === "Hybrid") return "hybrid wood stove";
  if (type === "Pellet Stove" && subtype === "Hybrid") return "hybrid pellet stove";
  if (type === "Pellet Stove" && subtype === "Catalytic Stove") return "catalytic pellet stove";
  if (type === "Pellet Stove") return "pellet stove";
  if (type === "Hydronic Heater") return "hydronic heater";
  if (type === "Forced Air Furnace") return "forced-air furnace";
  if (type === "Wood Stove") return "wood stove";
  return type.toLowerCase();
}

export function statusLabel(current) {
  return current ? "Currently certified" : "Previously certified";
}

export function shortModel(model, limit = 72) {
  const clean = String(model || "").replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 1).trim()}…`;
}

export function pageTitle(text, limit = 90) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 3).trim()}...`;
}

export function metaDescription(sentences) {
  const text = sentences.join(" ").replaceAll('"', "").replace(/\s+/g, " ").trim();
  if (text.length <= 180) return text;
  return `${text.slice(0, 177).trim()}...`;
}

export function fireboxText(stove) {
  if (stove.fireboxStatus === "not_applicable") return "Not applicable";
  if (stove.firebox == null) return "Not listed";
  return `${formatNumber(stove.firebox, 3)} cu ft`;
}

export function heatText(stove) {
  const range = btuRange(stove.btuLow, stove.btuHigh);
  if (range) return range;
  if (stove.btuMax != null) return `${formatBtu(stove.btuMax)} BTU/hr maximum`;
  return "Not listed";
}

export function displayValue(value, suffix = "") {
  if (value == null || value === "") return "Not listed";
  return `${value}${suffix}`;
}
