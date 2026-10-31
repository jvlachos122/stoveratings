import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { brandAnswer, brandProse } from "../src/lib/brand-copy.js";
import { formatNumber } from "../src/lib/format.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const snapshotDate = "2026-10-23";

function readJson(name) {
  return JSON.parse(readFileSync(join(root, "data", name), "utf8"));
}

const stoves = readJson("stoves.json");
const brands = readJson("brands.json");

function linesFor(slug) {
  return stoves.filter((stove) => stove.brandSlugs.includes(slug));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const mid = Math.floor(count / 2);
  return count % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function rows(lines) {
  return lines.flatMap((stove) => stove.tests);
}

function measure(value, unit) {
  const number = formatNumber(value, unit === "percent" ? 2 : 3);
  if (unit === "percent") return `${number} percent`;
  if (unit === "g/hr") return Number(value) === 1 ? `${number} gram per hour` : `${number} grams per hour`;
  if (unit === "lb/mmBTU") return Number(value) === 1 ? `${number} pound per million BTU` : `${number} pounds per million BTU`;
  return `${number} ${unit}`;
}

function expectMedian(prose, values, unit) {
  if (values.length < 2) return;
  const text = `The median is ${measure(median(values), unit)} (n=${values.length}).`;
  assert.ok(prose.includes(text), text);
}

const demand = [
  "harman",
  "quadra-fire",
  "comfortbilt",
  "pelpro",
  "breckwell",
  "vermont-castings",
  "jotul",
  "blaze-king",
  "drolet",
  "hearthstone",
];

test("every brand hub answer is 1–3 sentences with counts and the snapshot date", () => {
  for (const brand of brands) {
    const lines = linesFor(brand.slug);
    const answer = brandAnswer(brand, lines, snapshotDate);
    const prose = brandProse(brand, lines);
    const text = [...answer, ...prose].join(" ");
    assert.ok(answer.length >= 1 && answer.length <= 3, brand.slug);
    assert.ok(answer[0].includes(`as currently certified on ${snapshotDate}`), brand.slug);
    assert.ok(answer.some((sentence) => sentence.includes(`snapshot ${snapshotDate}`)), brand.slug);
    const current = lines.filter((stove) => stove.current).length;
    const previous = lines.length - current;
    assert.ok(answer[0].startsWith(`EPA lists ${current.toLocaleString("en-US")} model line`), brand.slug);
    assert.ok(answer[0].includes(`and lists ${previous.toLocaleString("en-US")} previously certified model line`), brand.slug);
    if (brand.role === "alias") assert.match(answer[0], new RegExp(`with ${brand.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} in the EPA text`));
    assert.doesNotMatch(text, /\bbest\b/i, brand.slug);
    assert.doesNotMatch(text, /\bsafe\b/i, brand.slug);
    assert.doesNotMatch(text, /\b0 percent\b/, brand.slug);
    assert.ok(prose.length > 0, brand.slug);
    if (lines.length <= 2) assert.equal(prose.some((sentence) => sentence.includes("The median")), false, brand.slug);
    const manufacturers = [...new Set(lines.map((stove) => stove.manufacturer || "a blank manufacturer cell"))];
    if (!(manufacturers.length === 1 && manufacturers[0] === brand.name)) {
      assert.ok(prose.some((sentence) => sentence.includes("listed in EPA's file under")), brand.slug);
    }
  }
});

test("demand-brand sentences match EPA rows in the committed snapshot", () => {
  const literals = {
    harman: [
      "EPA lists Harman Absolute 43-C at 0.99 g/hr.",
      "The median is 1.45 grams per hour (n=8).",
      "The median is 77 percent (n=8).",
      "HHV efficiency is not listed by EPA for 10 previously certified rows.",
      "listed in EPA's file under Hearth and Home Technologies.",
    ],
    "quadra-fire": [
      "EPA lists PelPro PP130-B, Quadra-Fire Outfitter II, PelPro PP150 at 0.53 g/hr.",
      "The median is 1.3 grams per hour (n=13).",
      "HHV efficiency is not listed by EPA for 23 previously certified rows.",
      "listed in EPA's file under Hearth and Home Technologies.",
    ],
    comfortbilt: [
      "EPA lists ComfortBilt HP22N, HP22, and HP22i Insert at 1 g/hr.",
      "The median is 1.35 grams per hour (n=2).",
      "The median is 80.5 percent (n=2).",
      "catalytic pellet stove",
      "hybrid pellet stove",
      "listed in EPA's file under Ningbo Hongsheng Fireplace Company (SMG Hearth and Home, LLC) and SMG Hearth and Home, LLC.",
    ],
    pelpro: [
      "EPA lists PelPro PP70 at 0.5 g/hr.",
      "The median is 0.635 grams per hour (n=4).",
      "HHV efficiency is not listed by EPA for 1 previously certified row.",
      "listed in EPA's file under Hearth and Home Technologies.",
    ],
    breckwell: [
      "EPA lists Breckwell SP2047 (Traverse), GW7400, ARGO500 at 0.41 g/hr.",
      "The median is 0.98 grams per hour (n=6).",
      "HHV efficiency is not listed by EPA for 7 previously certified rows.",
      "listed in EPA's file under United States Stove Company.",
    ],
    "vermont-castings": [
      "EPA lists Vermont Castings Intrepid FlexBurn 2115-CAT at 0.3 g/hr.",
      "The median is 1.5 grams per hour (n=8).",
      "The median is 74.5 percent (n=8).",
      "HHV efficiency is not listed by EPA for 123 previously certified rows.",
      "Hearth and Home Technologies",
      "Vermont Castings",
    ],
    jotul: [
      "EPA lists F445 at 0.49 g/hr.",
      "The median is 0.875 grams per hour (n=6).",
      "The median is 77 percent (n=6).",
      "HHV efficiency is not listed by EPA for 14 previously certified rows.",
      "listed in EPA's file under Jotul North America (Jotul U.S.A., Inc.).",
      "hybrid wood stove",
    ],
    "blaze-king": [
      "EPA lists Princess PE32 at 0.55 g/hr.",
      "The median is 1 gram per hour (n=7).",
      "The median is 80 percent (n=7).",
      "listed in EPA's file under Blaze King Industries, Inc. and Blaze King of Montana.",
    ],
    drolet: [
      "EPA lists DC Series Osburn Volta and Drolet Edison at 2.5 g/hr as a previously certified non-catalytic pellet stove.",
      "HHV efficiency is not listed by EPA for DC Series Osburn Volta and Drolet Edison.",
      "This model line is listed in EPA's file under Stove Builder International, Inc.",
    ],
    hearthstone: [
      "EPA lists Green Mountain 60-1 (Model 8661), Shelburne 3 (Model 8373), Hipster 20-1 (Model 8261) at 0.51 g/hr.",
      "The median is 0.67 grams per hour (n=13).",
      "The median is 79 percent (n=13).",
      "wood stove with no subtype listed by EPA",
      "listed in EPA's file under Hearthstone Quality Home Heating Products Inc.",
    ],
  };

  for (const slug of demand) {
    const brand = brands.find((item) => item.slug === slug);
    const lines = linesFor(slug);
    const answer = brandAnswer(brand, lines, snapshotDate).join(" ");
    const prose = brandProse(brand, lines).join(" ");
    const current = lines.filter((stove) => stove.current).length;
    const previous = lines.length - current;
    assert.match(answer, new RegExp(`${current} model lines? as currently certified on ${snapshotDate}`), slug);
    assert.match(answer, new RegExp(`${previous} previously certified model lines?`), slug);
    const tests = rows(lines);
    const currentGhr = tests.filter((row) => row.current && row.emission != null && row.emissionUnit === "g/hr").map((row) => row.emission);
    const currentEff = tests.filter((row) => row.current && row.efficiency != null).map((row) => row.efficiency);
    const previousGhr = tests.filter((row) => !row.current && row.emission != null && row.emissionUnit === "g/hr").map((row) => row.emission);
    const previousEff = tests.filter((row) => !row.current && row.efficiency != null).map((row) => row.efficiency);
    const previousEffBlank = tests.filter((row) => !row.current && row.efficiency == null).length;
    if (lines.length > 2) {
      expectMedian(prose, currentGhr, "g/hr");
      expectMedian(prose, currentEff, "percent");
      expectMedian(prose, previousGhr, "g/hr");
      expectMedian(prose, previousEff, "percent");
      if (previousEffBlank) {
        const noun = previousEffBlank === 1 ? "previously certified row" : "previously certified rows";
        assert.ok(prose.includes(`HHV efficiency is not listed by EPA for ${previousEffBlank} ${noun}.`), slug);
      }
      const lowest = lines
        .filter((stove) => stove.current && stove.emission != null && stove.emissionUnit === "g/hr")
        .sort((a, b) => a.emission - b.emission || a.model.localeCompare(b.model))[0];
      if (lowest) assert.ok(prose.includes(`EPA lists ${lowest.model} at ${formatNumber(lowest.emission, 3)} g/hr.`), slug);
    } else {
      assert.equal(prose.includes("The median"), false, slug);
      assert.match(prose, /not listed by EPA/);
      assert.doesNotMatch(prose, /\b0 percent\b/);
    }
    for (const phrase of literals[slug]) assert.ok(prose.includes(phrase), `${slug}: ${phrase}`);
  }
});

test("a blank HHV efficiency is not listed by EPA and is not turned into zero", () => {
  const brand = { name: "Example Metals", slug: "example-metals", role: "primary" };
  const lines = [
    {
      model: "Example One",
      manufacturer: "Example Metals",
      current: true,
      type: "Wood Stove",
      subtype: "Non-Catalytic Stove",
      emission: 1.2,
      emissionUnit: "g/hr",
      efficiency: 70,
      insertFlag: false,
      tests: [{ current: true, emission: 1.2, emissionUnit: "g/hr", efficiency: 70 }],
    },
    {
      model: "Example Two",
      manufacturer: "Example Metals",
      current: true,
      type: "Wood Stove",
      subtype: "Catalytic Stove",
      emission: 2.4,
      emissionUnit: "g/hr",
      efficiency: 80,
      insertFlag: false,
      tests: [{ current: true, emission: 2.4, emissionUnit: "g/hr", efficiency: 80 }],
    },
    {
      model: "Example Three",
      manufacturer: "Other Maker",
      current: false,
      type: "Pellet Stove",
      subtype: "Non-Catalytic Stove",
      emission: 3,
      emissionUnit: "g/hr",
      efficiency: null,
      insertFlag: true,
      tests: [{ current: false, emission: 3, emissionUnit: "g/hr", efficiency: null }],
    },
  ];
  const prose = brandProse(brand, lines).join(" ");
  assert.match(prose, /The median is 75 percent \(n=2\)/);
  assert.match(prose, /HHV efficiency is not listed by EPA for 1 previously certified row/);
  assert.match(prose, /EPA lists Example One at 1\.2 g\/hr/);
  assert.match(prose, /listed in EPA's file under Example Metals and Other Maker/);
  assert.match(prose, /name indicates an insert/);
  assert.doesNotMatch(prose, /\b0 percent\b/);
  assert.doesNotMatch(prose, /\bbest\b|\bsafe\b/i);
});

test("thin copy stays short and a matching manufacturer string needs no crosswalk sentence", () => {
  const brand = { name: "Example Metals", slug: "example-metals", role: "primary" };
  const lines = [
    {
      model: "Only Line",
      manufacturer: "Example Metals",
      current: false,
      type: "Wood Stove",
      subtype: "Hybrid",
      emission: 4,
      emissionUnit: "g/hr",
      efficiency: null,
      insertFlag: false,
      tests: [{ current: false, emission: 4, emissionUnit: "g/hr", efficiency: null }],
    },
  ];
  const prose = brandProse(brand, lines);
  assert.deepEqual(prose, [
    "EPA lists Only Line at 4 g/hr as a previously certified hybrid wood stove.",
    "HHV efficiency is not listed by EPA for Only Line.",
  ]);
  assert.equal(prose.some((sentence) => sentence.includes("listed in EPA's file under")), false);
  assert.equal(prose.some((sentence) => sentence.includes("median")), false);
});

test("central-heater rates stay in pounds per million BTU, including a listed zero", () => {
  const brand = brands.find((item) => item.slug === "wood-boiler-usa");
  const lines = linesFor("wood-boiler-usa");
  const prose = brandProse(brand, lines).join(" ");
  assert.match(prose, /from 0 to 0\.27 pounds per million BTU/);
  assert.match(prose, /The median is 0\.02 pounds per million BTU \(n=6\)/);
  assert.doesNotMatch(prose, /g\/hr/);
  assert.equal(lines.some((stove) => stove.emission === 0), true);
});

test("brand hub source keeps the tables, the answer, and Dataset JSON-LD", () => {
  const source = readFileSync(join(root, "src/pages/brands/[brand].astro"), "utf8");
  assert.match(source, /brandProse/);
  assert.match(source, /datasetLd/);
  assert.match(source, /StoveTable/);
  assert.match(source, /id="current"/);
  assert.match(source, /id="previous"/);
  assert.doesNotMatch(source, /AggregateRating|Product|Review/);
});
