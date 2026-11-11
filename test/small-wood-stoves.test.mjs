import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatBtu, formatNumber } from "../src/lib/format.js";
import {
  NOT_LISTED_BY_EPA,
  SMALL_FIREBOX_MAX,
  emissionCell,
  fireboxCell,
  heatCell,
  pelletExclusionSentence,
  pelletRoomFirebox,
  previousLead,
  smallWoodFaqs,
  smallWoodNotes,
  smallWoodRowView,
  smallWoodRows,
  smallWoodSentences,
  splitSmallWoodRows,
} from "../src/lib/small-wood-stoves.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const banned = /\b(best|top-rated|recommend\w*)\b/i;
const ROOM_FIELDS = [
  "New",
  "Model",
  "Manufacturer",
  "Firebox Volume (Cubic Feet)",
  "Emission Rate (grams/hr)",
  "Heat Output (BTUs)",
  "Overall Efficiency-HHV (%)",
  "Type",
  "Subtype",
  "Certified Fuel Type",
  "Test Method",
  "CO (g/min)",
  "NSPS Compliance 2020",
];

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += char;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
      continue;
    }
    if (char !== "\r") field += char;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((cells) => cells.some((cell) => cell !== ""));
  return body.map((cells) => {
    const record = {};
    header.forEach((name, index) => {
      record[name] = cells[index] ?? "";
    });
    return record;
  });
}

function signature(row) {
  return ROOM_FIELDS.map((field) => (row[field] || "").trim()).join("\0");
}

function listedVolume(cell) {
  const text = (cell || "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

function offlineRows() {
  const all = parseCsv(read("data/raw/rh_all.csv"));
  const currentRows = parseCsv(read("data/raw/rh_inprod.csv"));
  assert.equal(all.length, 1444);
  assert.equal(currentRows.length, 265);
  const currentCounts = new Map();
  for (const row of currentRows) {
    const key = signature(row);
    currentCounts.set(key, (currentCounts.get(key) || 0) + 1);
  }
  const seen = new Map();
  const small = [];
  for (const row of all) {
    const key = signature(row);
    const used = seen.get(key) || 0;
    const current = used < (currentCounts.get(key) || 0);
    if (current) seen.set(key, used + 1);
    if ((row.Type || "").trim() !== "Wood Stove") continue;
    const firebox = listedVolume(row["Firebox Volume (Cubic Feet)"]);
    if (firebox == null || firebox > SMALL_FIREBOX_MAX) continue;
    small.push({
      current,
      manufacturer: (row.Manufacturer || "").trim(),
      model: (row.Model || "").trim(),
      firebox,
      emission: (row["Emission Rate (grams/hr)"] || "").trim(),
    });
  }
  return small;
}

function rowKey(row) {
  const emission = row.emission == null || row.emission === "" ? "" : String(formatNumber(Number(row.emission), 3));
  return [row.current ? "1" : "0", row.manufacturer, row.model, String(row.firebox), emission].join("|");
}

test("small wood rows match an offline recompute and keep blanks off zero", () => {
  const stoves = JSON.parse(read("data/stoves.json"));
  const meta = JSON.parse(read("data/meta.json"));
  const listed = smallWoodRows(stoves);
  const offline = offlineRows();
  const listedKeys = listed.map((row) => rowKey({
    current: row.current,
    manufacturer: row.stove.manufacturer,
    model: row.stove.model,
    firebox: row.firebox,
    emission: row.test.emission,
  })).sort();
  const offlineKeys = offline.map((row) => rowKey(row)).sort();
  assert.deepEqual(listedKeys, offlineKeys);
  assert.equal(listed.length, offline.length);
  assert.ok(listed.length > 0);

  for (const row of listed) {
    assert.equal(row.stove.category, "room");
    assert.equal(row.test.type, "Wood Stove");
    assert.equal(row.test.fireboxStatus, "listed");
    assert.equal(typeof row.firebox, "number");
    assert.ok(row.firebox <= SMALL_FIREBOX_MAX);
    assert.equal(row.firebox, row.test.firebox);
    const view = smallWoodRowView(row);
    assert.match(view.href, /^\/stoves\/[^/]+\/[^/]+\/$/);
    assert.equal(view.firebox, `${formatNumber(row.firebox, 3)} cu ft`);
    if (row.firebox === 0) assert.equal(view.firebox, "0 cu ft");
    else assert.notEqual(view.firebox, "0 cu ft");
    for (const [value, cell] of [
      [row.test.emission, view.emission],
      [row.test.efficiency, view.efficiency],
      [row.test.btuLow == null && row.test.btuHigh == null ? null : row.test.btuHigh, view.heat],
    ]) {
      if (value == null) {
        assert.equal(cell, NOT_LISTED_BY_EPA);
        assert.doesNotMatch(cell, /^0(?:\.0+)?(?:\s|%|$)/);
      }
    }
    if (row.test.emission != null) assert.match(view.emission, /g\/hr$/);
    assert.notEqual(view.manufacturer, "0");
    assert.notEqual(view.subtype, "0");
  }

  const { current, previous } = splitSmallWoodRows(stoves);
  assert.equal(current.length + previous.length, listed.length);
  assert.equal(current.every((row) => row.current), true);
  assert.equal(previous.every((row) => !row.current), true);
  for (let index = 1; index < current.length; index += 1) {
    assert.ok(current[index - 1].firebox <= current[index].firebox);
  }
  for (let index = 1; index < previous.length; index += 1) {
    assert.ok(previous[index - 1].firebox <= previous[index].firebox);
  }

  const lines = new Set(current.map((row) => row.stove.id));
  const smallest = Math.min(...current.map((row) => row.firebox));
  const highs = current.map((row) => row.test.btuHigh).filter((value) => value != null);
  const sentences = smallWoodSentences(stoves, meta.snapshotDate).join(" ");
  assert.match(sentences, new RegExp(String(lines.size)));
  assert.match(sentences, new RegExp(String(current.length)));
  assert.match(sentences, new RegExp(formatNumber(smallest, 3).replace(".", "\\.")));
  assert.match(sentences, new RegExp(formatBtu(Math.min(...highs)).replaceAll(",", "\\,")));
  assert.match(sentences, new RegExp(formatBtu(Math.max(...highs)).replaceAll(",", "\\,")));
  assert.match(sentences, new RegExp(meta.snapshotDate));
  assert.match(sentences, /not zero/);
  assert.match(previousLead(stoves), /not currently certified/);
  assert.equal(pelletRoomFirebox(stoves).listed, 0);
  assert.match(pelletExclusionSentence(stoves, meta.snapshotDate), /Pellet-stove rows are excluded/);
  assert.match(pelletExclusionSentence(stoves, meta.snapshotDate), /not applicable/);

  const blank = smallWoodRowView({
    stove: { url: "/stoves/example/blank/", model: "Blank", manufacturer: "", insertFlag: false },
    test: {
      emission: null,
      emissionUnit: "g/hr",
      efficiency: null,
      btuLow: null,
      btuHigh: null,
      subtype: null,
    },
    firebox: null,
  });
  assert.equal(blank.firebox, NOT_LISTED_BY_EPA);
  assert.equal(blank.heat, NOT_LISTED_BY_EPA);
  assert.equal(blank.emission, NOT_LISTED_BY_EPA);
  assert.equal(blank.efficiency, NOT_LISTED_BY_EPA);
  assert.equal(blank.manufacturer, NOT_LISTED_BY_EPA);
  assert.equal(blank.subtype, NOT_LISTED_BY_EPA);
  assert.equal(fireboxCell(0), "0 cu ft");
  assert.equal(emissionCell({ emission: 0, emissionUnit: "g/hr" }), "0 g/hr");
  assert.equal(emissionCell({ emission: null, emissionUnit: "g/hr" }), NOT_LISTED_BY_EPA);
  assert.equal(heatCell({ btuLow: null, btuHigh: null, btuMax: 0 }), NOT_LISTED_BY_EPA);
  assert.equal(blank.firebox.includes("0"), false);
});

test("tie break, pellet exclusion, and a listed zero do not collapse to a missing cell", () => {
  const fixture = [
    {
      id: "zed",
      category: "room",
      model: "Zed",
      manufacturer: "Mill",
      url: "/stoves/mill/zed/",
      insertFlag: false,
      tests: [
        { type: "Wood Stove", firebox: 0.5, fireboxStatus: "listed", current: true, emission: 1, emissionUnit: "g/hr", efficiency: 70, btuLow: 1000, btuHigh: 2000, subtype: "Hybrid" },
        { type: "Wood Stove", firebox: null, fireboxStatus: "not_listed", current: true, emission: 0, emissionUnit: "g/hr", efficiency: 1, btuLow: 1, btuHigh: 2, subtype: "Catalytic Stove" },
        { type: "Pellet Stove", firebox: 0.2, fireboxStatus: "listed", current: true, emission: 0.1, emissionUnit: "g/hr", efficiency: 80, btuLow: 1, btuHigh: 2, subtype: "Non-Catalytic Stove" },
        { type: "Wood Stove", firebox: 0, fireboxStatus: "listed", current: false, emission: null, emissionUnit: "g/hr", efficiency: null, btuLow: null, btuHigh: null, subtype: null },
        { type: "Wood Stove", firebox: 1, fireboxStatus: "listed", current: true, emission: 2, emissionUnit: "g/hr", efficiency: 60, btuLow: 3000, btuHigh: 4000, subtype: "Catalytic Stove" },
        { type: "Wood Stove", firebox: 1.01, fireboxStatus: "listed", current: true, emission: 1, emissionUnit: "g/hr", efficiency: 60, btuLow: 3, btuHigh: 4, subtype: "Catalytic Stove" },
      ],
    },
    {
      id: "furnace",
      category: "central",
      model: "Furnace",
      manufacturer: "Mill",
      url: "/stoves/mill/furnace/",
      tests: [
        { type: "Wood Stove", firebox: 0.4, fireboxStatus: "listed", current: true, emission: 1, emissionUnit: "g/hr", efficiency: 1, btuLow: 1, btuHigh: 2, subtype: "Non-Catalytic Stove" },
      ],
    },
    {
      id: "alpha",
      category: "room",
      model: "Alpha",
      manufacturer: "Mill",
      url: "/stoves/mill/alpha/",
      insertFlag: true,
      tests: [
        { type: "Wood Stove", firebox: 0.5, fireboxStatus: "listed", current: true, emission: 1, emissionUnit: "g/hr", efficiency: 70, btuLow: 5000, btuHigh: 6000, subtype: "Non-Catalytic Stove" },
      ],
    },
  ];
  const { current, previous } = splitSmallWoodRows(fixture);
  assert.deepEqual(current.map((row) => `${row.stove.model}:${row.firebox}`), ["Alpha:0.5", "Zed:0.5", "Zed:1"]);
  assert.deepEqual(previous.map((row) => row.firebox), [0]);
  const zero = smallWoodRowView(previous[0]);
  assert.equal(zero.firebox, "0 cu ft");
  assert.equal(zero.emission, NOT_LISTED_BY_EPA);
  assert.equal(zero.efficiency, NOT_LISTED_BY_EPA);
  assert.equal(zero.heat, NOT_LISTED_BY_EPA);
  assert.equal(zero.subtype, NOT_LISTED_BY_EPA);
  assert.equal(smallWoodRowView(current[0]).subtype, "Non-catalytic");
  assert.equal(smallWoodRowView(current[0]).insert, true);
  assert.equal(smallWoodRowView(current[2]).subtype, "Catalytic");
  const sentences = smallWoodSentences(fixture, "2026-10-23").join(" ");
  assert.match(sentences, /2 currently certified model lines and 3 currently certified room-heater rows/);
  assert.match(sentences, /0\.5 cubic feet/);
  assert.match(sentences, /2,000 to 6,000 BTU\/hr/);
  assert.match(sentences, /not zero/);
  assert.doesNotMatch(sentences, banned);
});

test("the small wood page states the filter, the caveat, and visible questions", () => {
  const page = read("src/pages/small-wood-stoves.astro");
  const lib = read("src/lib/small-wood-stoves.js");
  const table = read("src/components/SmallWoodTable.astro");
  const home = read("src/pages/index.astro");
  const footer = read("src/components/Footer.astro");
  const calculator = read("src/pages/tools/stove-size-calculator.astro");
  const llms = read("public/llms.txt");
  const text = [page, lib, table].join("\n");
  assert.equal(banned.test(text), false);
  assert.doesNotMatch(text, /cfpub\.epa\.gov/);
  assert.doesNotMatch(text, /affiliate|sponsored|googletagmanager|google-analytics/i);
  assert.doesNotMatch(text, /AggregateRating|@type": "Product"|@type": "Review"/);
  assert.doesNotMatch(page, /<details\b/);
  assert.doesNotMatch(page, /\|\|\s*0\b/);
  assert.match(page, /splitSmallWoodRows\(catalog\.stoves\)/);
  assert.match(page, /smallWoodSentences\(catalog\.stoves, date\)/);
  assert.match(page, /smallWoodFaqs\(catalog\.stoves, date\)/);
  assert.match(page, /faqLd\(faqs\)/);
  assert.match(page, /articleLd\(/);
  assert.match(page, /faq\.question/);
  assert.match(page, /faq\.answer/);
  assert.match(page, /href="\/tools\/stove-size-calculator\/"/);
  assert.match(page, /not currently certified/i);
  assert.match(page, /Pellet stoves are a separate list|pellet-stoves/);
  assert.match(page, /SIZING_CAVEAT/);
  assert.match(table, /view\.firebox/);
  assert.match(table, /href=\{view\.href\}/);
  assert.match(home, /href="\/small-wood-stoves\/"/);
  assert.match(footer, /href="\/small-wood-stoves\/"/);
  assert.match(calculator, /href="\/small-wood-stoves\/"/);
  assert.match(llms, /https:\/\/stoveratings\.com\/small-wood-stoves\//);
  const noindex = JSON.parse(read("data/noindex-paths.json"));
  assert.equal(noindex.includes("/small-wood-stoves/"), false);

  const stoves = JSON.parse(read("data/stoves.json"));
  const meta = JSON.parse(read("data/meta.json"));
  const faqs = smallWoodFaqs(stoves, meta.snapshotDate);
  assert.ok(faqs.length >= 2 && faqs.length <= 4);
  const notes = smallWoodNotes(stoves, meta.snapshotDate);
  const copy = [
    ...smallWoodSentences(stoves, meta.snapshotDate),
    ...faqs.map((faq) => `${faq.question} ${faq.answer}`),
    ...notes,
    previousLead(stoves),
    pelletExclusionSentence(stoves, meta.snapshotDate),
  ].join(" ");
  assert.equal(banned.test(copy), false);
  assert.match(copy, /not a sizing guarantee/);
  assert.match(copy, /not listed by EPA/);
  assert.match(copy, /not zero|not shown as zero|not treated as zero/);
  assert.doesNotMatch(copy, /cfpub\.epa\.gov/);
  assert.equal(createHash("sha256").update(copy).digest("hex").length, 64);
});
