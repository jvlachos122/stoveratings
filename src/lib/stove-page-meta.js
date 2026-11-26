// Document <title> and meta description for a stove model line.
//
// The title is the EPA model line, then the published emission rate, HHV
// efficiency, certification status, and heat output. The layout adds the site
// suffix (" · StoveRatings"). Indexed pages that would still share a title or
// a meta description get one extra field: the manufacturer, then the model
// slug, then the stove id.
import { metaDescription } from "./format.js";
import {
  modelCertificationTitle,
  modelPageDescription,
} from "./model-certification.js";

const EPA_TYPES = new Set(["Wood Stove", "Pellet Stove", "Hydronic Heater", "Forced Air Furnace"]);
const TITLE_SEPARATOR = " — ";
const MAX_QUALIFIER_LEVEL = 4;
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

export function stoveBaseTitle(stove) {
  return modelCertificationTitle(stove);
}

// The base title already states certification status and the EPA figures.
// A shared title then adds one field that is not already in that title:
// the manufacturer, then the model slug, then the stove id.
function discriminator(stove, level) {
  const manufacturer = clean(stove.manufacturer);
  const slug = clean(stove.modelSlug) || "model";
  const id = clean(stove.id) || "id";
  if (level <= 1) {
    if (manufacturer && !modelStartsWithManufacturer(stove.model, manufacturer)) return manufacturer;
    return slug;
  }
  if (level === 2) return slug;
  return id;
}

function withQualifier(base, note) {
  if (!note) return base;
  const suffix = ` (${note})`;
  const idx = base.indexOf(TITLE_SEPARATOR);
  if (idx === -1) return `${base}${suffix}`;
  return `${base.slice(0, idx)}${suffix}${base.slice(idx)}`;
}

function titleAt(stove, level) {
  return withQualifier(stoveBaseTitle(stove), level ? discriminator(stove, level) : "");
}

function descriptionAt(stove, snapshotDate, level) {
  const base = modelPageDescription(stove, snapshotDate);
  if (!level) return base;
  return metaDescription([`${discriminator(stove, level)}. ${base}`]);
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
