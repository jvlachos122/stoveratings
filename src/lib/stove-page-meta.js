// Document <title> and meta description for a stove model line.
//
// The title is the EPA manufacturer (unless the model text already starts with
// that name), the model, the product type, and a fixed EPA context. The layout
// adds the site suffix (" · StoveRatings"). Product type is the EPA Type value.
// Wood Stove and Pellet Stove lines flagged from the model name use the same
// insert label as the insert lists. This does not rename Hydronic Heater or
// Forced Air Furnace; those strings are the type cells in the export.
//
// Indexed pages that would still share a title or a meta description get a
// deterministic qualifier from real fields, in this order: certification
// status, product type, emission rate, HHV efficiency, model slug, stove id.
import { modelSentences } from "./answers.js";
import { efficiencyText, emissionText, metaDescription, pageTitle, statusLabel } from "./format.js";

export const STOVE_TITLE_CONTEXT = "EPA Emissions & Efficiency";

// The model cell is shortened so the manufacturer, product type, and EPA
// context stay in the title. The full model line stays in the heading.
export const STOVE_MODEL_TITLE_LIMIT = 80;

const EPA_TYPES = new Set(["Wood Stove", "Pellet Stove", "Hydronic Heater", "Forced Air Furnace"]);
const TITLE_MARK = ` — ${STOVE_TITLE_CONTEXT}`;
const MAX_QUALIFIER_LEVEL = 6;
let headCache = null;

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizePhrase(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsPhrase(text, phrase) {
  const needle = normalizePhrase(phrase);
  if (!needle) return false;
  return ` ${normalizePhrase(text)} `.includes(` ${needle} `);
}

export function modelStartsWithManufacturer(model, manufacturer) {
  const name = normalizePhrase(manufacturer);
  const text = normalizePhrase(model);
  if (!name || !text) return false;
  return text === name || text.startsWith(`${name} `);
}

export function stoveProductType(stove) {
  const type = clean(stove?.type);
  if (!EPA_TYPES.has(type)) return type;
  if (stove?.insertFlag && (type === "Wood Stove" || type === "Pellet Stove")) return `${type} Insert`;
  return type;
}

function displayedModel(stove) {
  return pageTitle(clean(stove.model), STOVE_MODEL_TITLE_LIMIT);
}

// Words of the product type that the shortened model does not already show.
function productTypeForTitle(stove, modelText) {
  const phrase = stoveProductType(stove);
  if (!phrase) return "";
  if (containsPhrase(modelText, phrase)) return "";
  if (phrase.endsWith(" Insert")) {
    const base = phrase.slice(0, -" Insert".length);
    const hasInsert = containsPhrase(modelText, "insert");
    const hasBase = containsPhrase(modelText, base);
    if (hasInsert && hasBase) return "";
    if (hasInsert) return base;
    if (hasBase) return "Insert";
  }
  return phrase;
}

export function stoveBaseTitle(stove) {
  const model = displayedModel(stove);
  const typePart = productTypeForTitle(stove, model);
  const manufacturer = clean(stove.manufacturer);
  const parts = [];
  if (manufacturer && !modelStartsWithManufacturer(stove.model, manufacturer)) parts.push(manufacturer);
  parts.push(model);
  if (typePart) parts.push(typePart);
  return `${parts.join(" ")}${TITLE_MARK}`;
}

function qualifiers(stove, level) {
  const out = [];
  if (level >= 1) out.push(statusLabel(stove.current));
  if (level >= 2) out.push(stoveProductType(stove) || "type not listed");
  if (level >= 3) out.push(emissionText(stove.emission, stove.emissionUnit) || "emission not listed");
  if (level >= 4) {
    const efficiency = efficiencyText(stove.efficiency);
    out.push(efficiency ? `${efficiency} HHV` : "HHV not listed");
  }
  if (level >= 5) out.push(clean(stove.modelSlug) || "model");
  if (level >= 6) out.push(clean(stove.id) || "id");
  return out;
}

function withQualifiers(base, quals) {
  if (!quals.length) return base;
  const note = ` (${quals.join(", ")})`;
  const idx = base.lastIndexOf(TITLE_MARK);
  if (idx === -1) return `${base}${note}`;
  return `${base.slice(0, idx)}${note}${base.slice(idx)}`;
}

function titleAt(stove, level) {
  return withQualifiers(stoveBaseTitle(stove), qualifiers(stove, level));
}

function descriptionAt(stove, snapshotDate, level) {
  const sentences = modelSentences(stove, snapshotDate);
  if (!level) return metaDescription(sentences);
  return metaDescription([`${qualifiers(stove, level).join(", ")}. ${sentences.join(" ")}`]);
}

function duplicateGroups(ids, valueOf) {
  const groups = new Map();
  for (const id of ids) {
    const value = valueOf(id);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(id);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function resolveLevels(stoves, valueAt) {
  const indexed = stoves.filter((stove) => stove.indexable);
  const byId = new Map(stoves.map((stove) => [stove.id, stove]));
  const levels = new Map();
  const levelOf = (id) => levels.get(id) || 0;
  for (let guard = 0; guard <= MAX_QUALIFIER_LEVEL; guard += 1) {
    const groups = duplicateGroups(
      indexed.map((stove) => stove.id),
      (id) => valueAt(byId.get(id), levelOf(id)),
    );
    if (!groups.length) break;
    let progressed = false;
    for (const group of groups) {
      for (const id of group) {
        const next = levelOf(id) + 1;
        if (next > MAX_QUALIFIER_LEVEL) continue;
        levels.set(id, next);
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return levels;
}

export function buildStovePageHeads(stoves, snapshotDate) {
  if (headCache && headCache.stoves === stoves && headCache.snapshotDate === snapshotDate) return headCache.heads;
  const titleLevels = resolveLevels(stoves, titleAt);
  const descriptionLevels = resolveLevels(stoves, (stove, level) => descriptionAt(stove, snapshotDate, level));
  const heads = new Map();
  for (const stove of stoves) {
    const indexed = Boolean(stove.indexable);
    heads.set(stove.id, {
      title: titleAt(stove, indexed ? titleLevels.get(stove.id) || 0 : 0),
      description: descriptionAt(stove, snapshotDate, indexed ? descriptionLevels.get(stove.id) || 0 : 0),
    });
  }
  headCache = { stoves, snapshotDate, heads };
  return heads;
}

export function stovePageHead(stove, stoves, snapshotDate) {
  const head = buildStovePageHeads(stoves, snapshotDate).get(stove.id);
  if (!head) throw new Error(`missing stove page head for ${stove?.id}`);
  return head;
}

export function titleIncludesProductType(title, stove) {
  const phrase = stoveProductType(stove);
  if (!phrase) return false;
  const words = normalizePhrase(phrase).split(" ").filter(Boolean);
  const hay = new Set(normalizePhrase(title).split(" ").filter(Boolean));
  return words.every((word) => hay.has(word));
}
