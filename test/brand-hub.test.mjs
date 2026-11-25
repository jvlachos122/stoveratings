import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { brandHubAnswer, brandHubDescription, brandHubFacts, brandHubTitle, splitPhrase } from "../src/lib/brand-hub-facts.js";
import {
  BRAND_HUB_SORT,
  brandHubCaption,
  brandHubRowView,
  brandHubRows,
  compareBrandRows,
  placeBrandRow,
} from "../src/lib/brand-hub-table.js";
import { mountBrandHubTable } from "../src/lib/brand-hub-table-ui.js";
import { formatCount, formatNumber } from "../src/lib/format.js";
import { compareEfficiencyRows, efficiencyRecord, placeEfficiencyRow } from "../src/lib/efficiency-finder.js";
import { flatInsertRow } from "../src/lib/insert-finder.js";
import { buildSitemapLastmodsFromDates } from "../src/lib/sitemap-lastmod.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const banned = /\b(best|top-rated|recommend\w*|rankings?|scores?)\b/i;

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function readJson(path) {
  return JSON.parse(read(path));
}

const stoves = readJson("data/stoves.json");
const brands = readJson("data/brands.json");
const redirects = readJson("data/brand-redirects.json");
const snapshotDate = readJson("data/meta.json").snapshotDate;

function linesFor(slug) {
  return stoves.filter((stove) => stove.brandSlugs.includes(slug));
}

function recompute(lines) {
  const currentLines = lines.filter((stove) => stove.current);
  const previous = lines.length - currentLines.length;
  const ghr = currentLines
    .filter((stove) => stove.emission != null && stove.emissionUnit === "g/hr")
    .sort((a, b) => a.emission - b.emission || a.model.localeCompare(b.model));
  const efficiency = currentLines
    .filter((stove) => stove.efficiency != null)
    .sort((a, b) => b.efficiency - a.efficiency || a.model.localeCompare(b.model));
  const scope = currentLines.length ? currentLines : lines;
  const split = { wood: 0, pellet: 0, hydronic: 0, furnace: 0, other: 0 };
  for (const stove of scope) {
    if (stove.type === "Wood Stove") split.wood += 1;
    else if (stove.type === "Pellet Stove") split.pellet += 1;
    else if (stove.type === "Hydronic Heater") split.hydronic += 1;
    else if (stove.type === "Forced Air Furnace") split.furnace += 1;
    else split.other += 1;
  }
  const lowest = ghr.length
    ? { value: ghr[0].emission, models: ghr.filter((stove) => stove.emission === ghr[0].emission).map((stove) => stove.model).sort((a, b) => a.localeCompare(b)) }
    : null;
  const highest = efficiency.length
    ? {
        value: efficiency[0].efficiency,
        models: efficiency.filter((stove) => stove.efficiency === efficiency[0].efficiency).map((stove) => stove.model).sort((a, b) => a.localeCompare(b)),
      }
    : null;
  return { current: currentLines.length, previous, lowest, highest, split, historicalOnly: currentLines.length === 0 };
}

function assertFacts(answer, facts) {
  assert.match(answer, new RegExp(`${facts.current.toLocaleString("en-US")} model lines? as currently certified`));
  assert.match(answer, new RegExp(`${facts.previous.toLocaleString("en-US")} previously certified model lines?`));
  assert.ok(answer.includes(splitPhrase(facts.split)), splitPhrase(facts.split));
  if (facts.historicalOnly) {
    assert.match(answer, /not listed/i);
    assert.doesNotMatch(answer, /\bg\/hr is \d/);
    assert.doesNotMatch(answer, /percent on /);
    return;
  }
  if (facts.lowest) {
    assert.ok(answer.includes(`the lowest g/hr is ${formatNumber(facts.lowest.value, 3)} on `));
    for (const model of facts.lowest.models) assert.ok(answer.includes(model), model);
  } else {
    assert.match(answer, /a g\/hr emission rate is not listed/);
  }
  if (facts.highest) {
    assert.ok(answer.includes(`the highest HHV efficiency is ${formatNumber(facts.highest.value, 2)} percent on `));
    for (const model of facts.highest.models) assert.ok(answer.includes(model), model);
  } else {
    assert.match(answer, /HHV efficiency is not listed/);
  }
}

const samples = [
  "blaze-king",
  "hearth-and-home-technologies",
  "vermont-castings",
  "morso",
  "drolet",
  "ac-component-specialists",
  "alternate-heating-systems",
  "harman",
  "united-states-stove-company",
  "stove-builder-international-inc",
];

test("answer-box numbers match an offline recompute, including historical-only brands", () => {
  assert.ok(samples.filter((slug) => recompute(linesFor(slug)).historicalOnly).length >= 1);
  for (const slug of samples) {
    const brand = brands.find((item) => item.slug === slug);
    const lines = linesFor(slug);
    const facts = recompute(lines);
    const fromModule = brandHubFacts(lines);
    assert.equal(fromModule.current, facts.current, slug);
    assert.equal(fromModule.previous, facts.previous, slug);
    assert.equal(fromModule.lowest?.value ?? null, facts.lowest?.value ?? null, slug);
    assert.deepEqual(fromModule.lowest?.models ?? [], facts.lowest?.models ?? [], slug);
    assert.equal(fromModule.highest?.value ?? null, facts.highest?.value ?? null, slug);
    assert.deepEqual(fromModule.highest?.models ?? [], facts.highest?.models ?? [], slug);
    assert.deepEqual(fromModule.split, facts.split, slug);
    const answer = brandHubAnswer(brand, lines, snapshotDate);
    assert.ok(answer.length >= 1 && answer.length <= 3, slug);
    const text = answer.join(" ");
    assertFacts(text, facts);
    assert.match(text, new RegExp(`snapshot ${snapshotDate}`));
    assert.doesNotMatch(text, banned, slug);
    const description = brandHubDescription(brand, lines, snapshotDate);
    assert.ok(description.length <= 180, `${slug} ${description.length}`);
    assert.ok(description.includes(formatCount(facts.current)), slug);
    assert.ok(description.includes(formatCount(facts.previous)), slug);
    if (facts.historicalOnly) assert.match(description, /not listed/i);
    else if (facts.lowest) assert.ok(description.includes(formatNumber(facts.lowest.value, 3)), slug);
    else assert.match(description, /not listed/i);
    if (facts.highest) assert.ok(description.includes(formatNumber(facts.highest.value, 2)), slug);
  }
});

test("every brand title is computed, stays within 60 characters, and does not invent a g/hr", () => {
  const source = read("src/lib/brand-hub-facts.js");
  assert.equal(source.includes("Blaze King"), false);
  assert.equal(source.includes("0.55"), false);
  assert.equal(source.includes("hearth-and-home"), false);
  let historical = 0;
  let withRate = 0;
  for (const brand of brands) {
    const lines = linesFor(brand.slug);
    const facts = recompute(lines);
    const title = brandHubTitle(brand, lines);
    assert.ok(title.length <= 60, `${brand.slug} ${title.length}: ${title}`);
    assert.doesNotMatch(title, banned, brand.slug);
    assert.equal(title.includes(brand.name) || title.includes("..."), true, title);
    if (facts.historicalOnly) {
      historical += 1;
      assert.match(title, /none current|none currently certified/, brand.slug);
      assert.doesNotMatch(title, /g\/hr/, brand.slug);
      if (title.includes("previously certified")) assert.ok(title.includes(formatCount(facts.previous)), title);
    } else if (facts.lowest) {
      withRate += 1;
      assert.ok(title.includes(formatNumber(facts.lowest.value, 3)), title);
      assert.ok(title.includes(formatCount(facts.current)), title);
    } else {
      assert.match(title, /HHV|not listed/, brand.slug);
      assert.doesNotMatch(title, /g\/hr/, brand.slug);
      assert.ok(title.includes(formatCount(facts.current)), title);
    }
  }
  assert.ok(historical > 0);
  assert.ok(withRate > 0);
  const blaze = brands.find((brand) => brand.slug === "blaze-king");
  const blazeFacts = recompute(linesFor("blaze-king"));
  assert.equal(
    brandHubTitle(blaze, linesFor("blaze-king")),
    `${blaze.name}: ${formatCount(blazeFacts.current)} EPA-certified stoves, lowest ${formatNumber(blazeFacts.lowest.value, 3)} g/hr`,
  );
});

test("a missing HHV efficiency is not listed and is not turned into a number", () => {
  const brand = { name: "Example Metals", slug: "example-metals", role: "primary" };
  const lines = [
    {
      model: "Example One",
      current: true,
      type: "Wood Stove",
      emission: 1.2,
      emissionUnit: "g/hr",
      efficiency: null,
    },
    {
      model: "Example Two",
      current: true,
      type: "Pellet Stove",
      emission: 2,
      emissionUnit: "g/hr",
      efficiency: null,
    },
  ];
  const answer = brandHubAnswer(brand, lines, snapshotDate).join(" ");
  assert.match(answer, /the lowest g\/hr is 1\.2 on Example One/);
  assert.match(answer, /HHV efficiency is not listed/);
  assert.match(answer, /1 wood stove and 1 pellet stove/);
  assert.doesNotMatch(answer, /\b0 percent\b/);
  assert.doesNotMatch(answer, /\d+(\.\d+)? percent/);
  const title = brandHubTitle(brand, lines);
  assert.match(title, /lowest 1\.2 g\/hr/);
  assert.doesNotMatch(title, /%/);
  const description = brandHubDescription(brand, lines, snapshotDate);
  assert.match(description, /HHV efficiency is not listed/);
});

test("a historical-only fixture does not borrow a g/hr from the old lines", () => {
  const brand = { name: "Old Metals", slug: "old-metals", role: "primary" };
  const lines = [
    {
      model: "Old Line",
      current: false,
      type: "Wood Stove",
      emission: 0.2,
      emissionUnit: "g/hr",
      efficiency: 80,
    },
  ];
  const answer = brandHubAnswer(brand, lines, snapshotDate).join(" ");
  assert.match(answer, /not listed/);
  assert.doesNotMatch(answer, /0\.2/);
  assert.doesNotMatch(answer, /80 percent/);
  assert.match(answer, /1 wood stove and 0 pellet stoves/);
  const title = brandHubTitle(brand, lines);
  assert.match(title, /none current/);
  assert.doesNotMatch(title, /g\/hr/);
});

test("brand hub sitemap membership is the committed hubs and former-name redirects", () => {
  const dates = new Map();
  dates.get = (key) => (Map.prototype.has.call(dates, key) ? Map.prototype.get.call(dates, key) : "2026-01-01T00:00:00Z");
  const lastmods = buildSitemapLastmodsFromDates(dates);
  const expected = [...brands.map((brand) => brand.url), ...redirects.map((redirect) => redirect.url)].sort();
  const actual = [...lastmods.keys()].filter((path) => /^\/brands\/[^/]+\/$/.test(path)).sort();
  assert.deepEqual(actual, expected);
  const all = [...lastmods.keys()].sort();
  assert.equal(all.includes("/most-efficient-wood-stoves/"), true);
  assert.equal(all.filter((path) => path.startsWith("/brands/")).length, expected.length + 1);
});

test("brand hub modules are imported only by the brand template", () => {
  const allowed = new Map([
    ["src/lib/brand-hub-facts.js", new Set(["src/pages/brands/[brand].astro"])],
    ["src/lib/brand-hub-table.js", new Set(["src/components/BrandHubTable.astro", "src/lib/brand-hub-table-ui.js"])],
    ["src/lib/brand-hub-table-ui.js", new Set(["src/components/BrandHubTable.astro"])],
  ]);
  const found = new Map([...allowed.keys()].map((file) => [file, []]));
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".js") && !entry.name.endsWith(".astro") && !entry.name.endsWith(".mjs")) continue;
      const rel = full.slice(root.length + 1).replaceAll("\\", "/");
      if (rel.startsWith("test/")) continue;
      const source = readFileSync(full, "utf8");
      for (const file of allowed.keys()) {
        const base = file.slice(file.lastIndexOf("/") + 1).replace(/\.js$/, "");
        if (source.includes(base)) found.get(file).push(rel);
      }
    }
  }
  walk(join(root, "src"));
  for (const [file, users] of found) {
    assert.deepEqual(users.sort(), [...allowed.get(file)].sort(), file);
  }
  const answers = read("src/lib/answers.js");
  assert.equal(answers.includes("brand-hub-facts"), false);
  assert.equal(answers.includes("brandHubAnswer"), false);
  const ui = read("src/lib/brand-hub-table-ui.js");
  const table = read("src/lib/brand-hub-table.js");
  assert.match(ui, /placeBrandRow/);
  assert.match(ui, /compareBrandRows/);
  assert.doesNotMatch(ui, /from ["'][^"']*(insert-finder|efficiency-finder|lists\.js)/);
  assert.doesNotMatch(table, /from ["'][^"']*(insert-finder|efficiency-finder|lists\.js)/);
  assert.doesNotMatch(read("src/pages/brands/[brand].astro"), /from ["'][^"']*(insert-finder|efficiency-finder|lists\.js)/);
});

test("brand filters match the HHV efficiency list when certification status is not set", () => {
  const lines = linesFor("blaze-king").slice(0, 8);
  const filters = [
    {},
    { heatMin: 10000 },
    { heatMax: 15000 },
    { fireboxMin: 1, fireboxMax: 3 },
    { subtype: "Catalytic Stove" },
    { heatMin: 5000, fireboxMax: 2 },
  ];
  const modes = ["emission-asc", "efficiency-desc", "heat-desc", "firebox-asc", "name-asc"];
  const flats = lines.map((stove, index) => flatInsertRow(efficiencyRecord(stove, index)));
  for (const filtersOf of filters) {
    for (const flat of flats) {
      assert.equal(placeBrandRow(flat, filtersOf), placeEfficiencyRow(flat, filtersOf));
    }
  }
  for (const mode of modes) {
    const ordered = [...flats].sort((left, right) => compareBrandRows(left, right, mode));
    const expected = [...flats].sort((left, right) => compareEfficiencyRows(left, right, mode));
    assert.deepEqual(ordered.map((row) => row.id), expected.map((row) => row.id), mode);
  }
});

test("the certification filter hides the other status and a blank firebox is not zero", () => {
  const current = {
    current: true,
    emission: 1,
    efficiency: 70,
    btuLow: 10000,
    btuHigh: 20000,
    firebox: 2,
    subtype: "Non-Catalytic Stove",
    model: "Current",
  };
  const previous = {
    current: false,
    emission: 0.4,
    efficiency: 60,
    btuLow: 8000,
    btuHigh: 9000,
    firebox: null,
    subtype: "Catalytic Stove",
    model: "Previous",
  };
  assert.equal(placeBrandRow(current, { status: "current" }), "match");
  assert.equal(placeBrandRow(previous, { status: "current" }), "hide");
  assert.equal(placeBrandRow(previous, { status: "previous" }), "match");
  assert.equal(placeBrandRow(current, { status: "previous" }), "hide");
  assert.equal(placeBrandRow({ ...current, firebox: null }, { status: "", fireboxMin: 1 }), "unreported");
  const lines = [
    {
      id: "current-line",
      model: "Current Line",
      manufacturer: "Example",
      url: "/stoves/example/current-line/",
      current: true,
      type: "Wood Stove",
      subtype: "Non-Catalytic Stove",
      emission: 1.5,
      emissionUnit: "g/hr",
      efficiency: 70,
      btuLow: 12000,
      btuHigh: 20000,
      firebox: 2,
      fireboxStatus: "listed",
      fuel: "Crib Wood",
      insertFlag: false,
    },
    {
      id: "previous-line",
      model: "Previous Line",
      manufacturer: "Example",
      url: "/stoves/example/previous-line/",
      current: false,
      type: "Pellet Stove",
      subtype: "Catalytic Stove",
      emission: 0.4,
      emissionUnit: "g/hr",
      efficiency: null,
      btuLow: null,
      btuHigh: null,
      firebox: null,
      fireboxStatus: "not_listed",
      fuel: "Wood Pellets",
      insertFlag: false,
    },
  ];
  const rows = brandHubRows(lines);
  assert.equal(rows[0].stove.model, "Previous Line");
  assert.equal(brandHubRowView(rows[0], true).efficiency, "Not listed");
  assert.match(brandHubCaption("Example", BRAND_HUB_SORT), /lowest emission rate first/);
  assert.doesNotMatch(brandHubCaption("Example", "efficiency-desc"), banned);

  const elements = new Map();
  const listeners = new Map();
  function make(id) {
    const node = {
      id,
      tag: "div",
      value: "",
      hidden: false,
      textContent: "",
      parent: null,
      children: [],
      attrs: {},
      setAttribute(name, value) {
        this.attrs[name] = String(value);
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
      },
      addEventListener(type, fn) {
        const list = listeners.get(this) || {};
        list[type] = fn;
        listeners.set(this, list);
      },
      dispatch(type, event = {}) {
        listeners.get(this)?.[type]?.(event);
      },
      appendChild(child) {
        if (child.parent) child.parent.children = child.parent.children.filter((item) => item !== child);
        child.parent = this;
        this.children.push(child);
        return child;
      },
      querySelectorAll(selector) {
        const found = [];
        const walk = (current) => {
          for (const child of current.children) {
            found.push(child);
            walk(child);
          }
        };
        walk(this);
        if (selector === "tr") return found.filter((item) => item.tag === "tr");
        if (selector === "th[data-sort-key]") return found.filter((item) => item.tag === "th" && item.getAttribute("data-sort-key"));
        if (selector === "[data-sort]") return found.filter((item) => item.getAttribute("data-sort"));
        return [];
      },
    };
    if (id) elements.set(id, node);
    return node;
  }
  const doc = { getElementById: (id) => elements.get(id) || null };
  const body = make("brand-hub-finder-rows");
  const table = make("brand-hub-finder-table");
  table.attrs["data-brand"] = "Example";
  make("brand-hub-finder");
  make("brand-hub-finder-status");
  const empty = make("brand-hub-finder-empty");
  const caption = make("brand-hub-finder-caption");
  const sort = make("brand-hub-sort");
  sort.value = BRAND_HUB_SORT;
  make("brand-hub-subtype");
  const heatMin = make("brand-hub-heat-min");
  make("brand-hub-heat-max");
  make("brand-hub-firebox-min");
  make("brand-hub-firebox-max");
  const certification = make("brand-hub-certification");
  const unreportedBody = make("brand-hub-finder-unreported-rows");
  const unreportedSection = make("brand-hub-finder-unreported");
  table.appendChild(body);
  for (const row of rows) {
    const tr = make("");
    tr.tag = "tr";
    const view = brandHubRowView(row, true);
    tr.attrs = { ...view.attrs };
    body.appendChild(tr);
  }
  mountBrandHubTable(doc);
  const visible = () => body.children.filter((node) => node.tag === "tr" && !node.hidden).map((node) => node.getAttribute("data-model"));
  assert.deepEqual(visible(), ["Previous Line", "Current Line"]);
  assert.match(caption.textContent, /Example model lines, lowest emission rate first/);
  certification.value = "current";
  certification.dispatch("change");
  assert.deepEqual(visible(), ["Current Line"]);
  certification.value = "previous";
  certification.dispatch("change");
  assert.deepEqual(visible(), ["Previous Line"]);
  certification.value = "";
  heatMin.value = "10000";
  heatMin.dispatch("input");
  assert.deepEqual(visible(), ["Current Line"]);
  assert.equal(unreportedBody.children.some((node) => node.getAttribute("data-model") === "Previous Line"), true);
  assert.equal(unreportedSection.hidden, false);
  assert.equal(empty.hidden, true);
});
