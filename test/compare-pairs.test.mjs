import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { btuRange, efficiencyText, emissionText, emissionUnitShort, formatNumber } from "../src/lib/format.js";
import {
  COMPARE_BRAND_LIMIT,
  COMPARE_HEAT_RELATIVE_MAX,
  COMPARE_PAIR_LIMIT,
  NOT_LISTED_BY_EPA,
  compareCells,
  compareIndexSentences,
  compareSentences,
  compareTableRows,
  efficiencyCell,
  emissionCell,
  heatCell,
  heatRelativeGap,
  largestCompareBrands,
  selectComparePairs,
} from "../src/lib/compare-pairs.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(name) {
  return JSON.parse(readFileSync(join(root, "data", name), "utf8"));
}

const stoves = readJson("stoves.json");
const brands = readJson("brands.json");
const brandBySlug = new Map(brands.map((brand) => [brand.slug, brand]));
const banned = /\b(winners?|better|best|safest|safe|popular|best-selling|bestselling|scores?)\b/i;

const EXPECTED_PAIRS = [
  ["room--hearthstone-quality-home-heating-products-inc--wfp100", "room--stove-builder-international-inc--he350-fp-15-waterloo-horizon-monaco-xl-wfp100-fp-15a-waterloo-st-clair-4300-solu"],
  ["room--foyers-supreme-inc--astra-18-elegance-30-novo-18-soapstone-and-novo-18-cast-iron", "room--hearth-and-home-technologies--vermont-castings-intrepid-flexburn-2115"],
  ["room--foyers-supreme-inc--ambiance-elegance-36-24sf-novo-24-soapstone", "room--hearth-and-home-technologies--quadra-fire-pioneer-iii-arc-and-quadra-fire-pioneer-iii-rec-wood-heater-model-li"],
  ["room--hearth-and-home-technologies--quadra-fire-classic-bay-1200-c", "room--travis-industries-inc--agp-insert"],
  ["room--hearth-and-home-technologies--quadra-fire-31m-acc-c-quadra-fire-discovery-ii-c-quadra-fire-ff-wp-200", "room--pacific-energy-fireplace-products-limited--true-north-tn20-series-b-tn-insert-series-b"],
  ["room--foyers-supreme-inc--38sfc-d-ii-and-38st-d-ii-series-elegance-st-42-ii-astra-duo-38-ii-monarch-see-th", "room--pacific-energy-fireplace-products-limited--super-le-alderlea-t5-insert-le-super-insert-le-super-classic-le-alderlea-t5-le"],
  ["room--enerco-group-inc--ps60w-model-line-c60w-n60wts-h80xl-c80xl-j80xl-n80xl-j60w-n60w-h60w-c60wts-h60wt", "room--united-states-stove-company--5710-ap5710-vg5710-5501s-ap5501s-vg5501s-5710-xh-and-us513m"],
  ["room--hearth-and-home-technologies--quadra-fire-21m-acc-c-discovery-1-c-ff-wp-100", "room--pacific-energy-fireplace-products-limited--neo-2-5-le2-neo-2-5-insert-le2"],
  ["room--enerco-group-inc--ps130w-model-line-c130w-n130wts-h140xl-c140xl-j140xl-n140xl-j130w-n130w-h130w-c1", "room--hearth-and-home-technologies--harman-xxv-tc"],
  ["room--foyers-supreme-inc--astra-32-elegance-40", "room--hearth-and-home-technologies--heat-and-glo-pioneer-ii-arc-heat-and-glo-pioneer-ii-rec-heat-and-glo-northstar-d"],
  ["room--enerco-group-inc--ws110-c110-d110-h110-j110-n110-r110-t110-v110", "room--stove-builder-international-inc--2-5r-series-solution-2-5-zc-ii-stratford-ii-fp10-lafayette-ii-fp12-mundo-ii-he25"],
  ["room--enerco-group-inc--g2-a50wts-g2-c50wts-g2-h50wts-g2-j50wts-g2-n50wts", "room--united-states-stove-company--kp5522-kp5522-p-kp5522-l-kp5522-w-us5522-us5522-p-us5522-l-us5522-w-ap5622-ap562"],
  ["room--stove-builder-international-inc--55-shpcb120-55-trpcb120-and-25-cb120", "room--united-states-stove-company--kp5513-kp5513-p-kp5513-l-us5513-us5513-p-us5513-l-ap5613-ap5613-p-ap5613-l-vg571"],
  ["room--foyers-supreme-inc--16-in-model-line-lumis-16-16-in-flair-25-16-in-regal-16-16in", "room--united-states-stove-company--th-100-us500e-aw520e-vg520-sw500-ch500-kw500-cgws750"],
  ["room--hearth-and-home-technologies--pel-pro-pp60-b-pleasant-hearth-ph35ps-b-quadra-fire-outfitter-i", "room--stove-builder-international-inc--25cab80-55-shpcab80-55-trpcab80-25-cab80s-55-shpcab80s-55-rpcab80s"],
  ["room--enerco-group-inc--g2-a130wts-g2-c130wts-g2-h130wts-g2-j130wts-g2-n130wts", "room--hearth-and-home-technologies--harman-p43-c"],
  ["room--hearth-and-home-technologies--p42i-tc", "room--united-states-stove-company--5780-ap5780-vg5780-sp5780-and-sp58"],
  ["room--hearth-and-home-technologies--quadra-fire-santa-fe-c-quadra-fire-santa-fe-i-c-quadra-fire-castile-c-quadra-fir", "room--united-states-stove-company--breckwell-sp24e-blazer-sp24ie-blazer"],
  ["room--stove-builder-international-inc--1-7r-series-blackcomb-ii-escape-1500-deco-ii-columbia-ii-savannah-ii-fw2800-osbu", "room--united-states-stove-company--us1261e-uslw900e"],
  ["room--hearthstone-quality-home-heating-products-inc--heritage-8024", "room--travis-industries-inc--42-apex-nexgen-hybrid"],
];

function idsOf(pairs) {
  return pairs.map((pair) => [pair.left.id, pair.right.id]);
}

function line(partial) {
  return {
    id: partial.id,
    current: true,
    category: "room",
    type: "Wood Stove",
    subtype: "Non-Catalytic Stove",
    btuLow: 10000,
    btuHigh: 20000,
    emission: 1.5,
    emissionUnit: "g/hr",
    efficiency: 70,
    primarySlug: "brand-a",
    manufacturer: "Brand A",
    manufacturerSlug: partial.primarySlug || "brand-a",
    model: partial.id,
    modelSlug: partial.id,
    url: `/stoves/brand/${partial.id}/`,
    ...partial,
  };
}

test("pair selection constants match the documented rule", () => {
  assert.equal(COMPARE_BRAND_LIMIT, 8);
  assert.equal(COMPARE_PAIR_LIMIT, 20);
  assert.equal(COMPARE_HEAT_RELATIVE_MAX, 0.15);
  assert.equal(NOT_LISTED_BY_EPA, "not listed by EPA");
});

test("example pairs are a deterministic set of 20 current model lines", () => {
  const forward = selectComparePairs(stoves);
  const backward = selectComparePairs([...stoves].reverse());
  assert.equal(forward.length, 20);
  assert.deepEqual(idsOf(forward), idsOf(backward));
  assert.deepEqual(idsOf(forward), EXPECTED_PAIRS);
  assert.deepEqual(idsOf(selectComparePairs(stoves)), idsOf(forward));
  const brandsKept = new Set(largestCompareBrands(stoves).map((brand) => brand.slug));
  assert.deepEqual([...brandsKept], [
    "hearth-and-home-technologies",
    "united-states-stove-company",
    "stove-builder-international-inc",
    "hearthstone",
    "travis-industries-inc",
    "enerco-group-inc",
    "foyers-supreme-inc",
    "pacific-energy",
  ]);
  const used = new Set();
  const urls = new Set();
  for (const pair of forward) {
    assert.equal(pair.left.current, true);
    assert.equal(pair.right.current, true);
    assert.equal(pair.left.category, "room");
    assert.equal(pair.right.category, "room");
    assert.equal(pair.left.type, pair.right.type);
    assert.equal(pair.left.subtype, pair.right.subtype);
    assert.notEqual(pair.left.primarySlug, pair.right.primarySlug);
    assert.ok(brandsKept.has(pair.left.primarySlug));
    assert.ok(brandsKept.has(pair.right.primarySlug));
    assert.ok(pair.left.id < pair.right.id);
    assert.ok(pair.heatGap <= COMPARE_HEAT_RELATIVE_MAX);
    assert.ok(!used.has(pair.left.id) && !used.has(pair.right.id));
    used.add(pair.left.id);
    used.add(pair.right.id);
    assert.match(pair.url, /^\/compare\/[a-z0-9-]+-vs-[a-z0-9-]+\/$/);
    assert.equal(pair.url.includes("/compare/tool/"), false);
    urls.add(pair.url);
  }
  assert.equal(urls.size, 20);
});

test("table values for two sample pairs match the source rows", () => {
  const pairs = selectComparePairs(stoves);
  const date = "2026-10-23";
  for (const pair of [pairs[0], pairs[1]]) {
    const rows = compareTableRows(pair.left, pair.right, brandBySlug, date);
    const byLabel = new Map(rows.map((row) => [row.label, row]));
    for (const stove of [pair.left, pair.right]) {
      const side = stove === pair.left ? "left" : "right";
      const hrefSide = stove === pair.left ? "leftHref" : "rightHref";
      assert.equal(byLabel.get("Model line")[side], stove.model);
      assert.equal(byLabel.get("Model line")[hrefSide], stove.url);
      assert.equal(byLabel.get("EPA manufacturer")[side], stove.manufacturer);
      assert.equal(byLabel.get("Brand")[side], brandBySlug.get(stove.primarySlug).name);
      assert.equal(byLabel.get("Brand")[hrefSide], brandBySlug.get(stove.primarySlug).url);
      assert.equal(byLabel.get("Emission rate")[side], `${formatNumber(stove.emission, 3)} ${emissionUnitShort(stove.emissionUnit)}`);
      assert.equal(emissionCell(stove), byLabel.get("Emission rate")[side]);
      assert.equal(byLabel.get("HHV efficiency")[side], efficiencyText(stove.efficiency));
      assert.equal(efficiencyCell(stove), byLabel.get("HHV efficiency")[side]);
      assert.equal(byLabel.get("Heat output")[side], btuRange(stove.btuLow, stove.btuHigh));
      assert.equal(heatCell(stove), byLabel.get("Heat output")[side]);
      assert.equal(byLabel.get("Listing status")[side], `Listed as currently certified on ${date}`);
      assert.equal(stove.emission == null, false);
      assert.notEqual(byLabel.get("Emission rate")[side], "0");
      assert.notEqual(byLabel.get("HHV efficiency")[side], "0 percent");
    }
    const sentences = compareSentences(pair.left, pair.right, date, brandBySlug);
    assert.equal(sentences.length, 3);
    const text = sentences.join(" ");
    assert.match(text, /EPA lists/);
    assert.match(text, /as of 2026-10-23/);
    assert.match(text, new RegExp(emissionText(pair.left.emission, pair.left.emissionUnit).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(text, new RegExp(emissionText(pair.right.emission, pair.right.emissionUnit).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(text, /Source: EPA Certified Wood Heater Database, snapshot 2026-10-23/);
    let prose = text;
    for (const stove of [pair.left, pair.right]) {
      prose = prose.split(stove.model).join(" ");
      prose = prose.split(brandBySlug.get(stove.primarySlug).name).join(" ");
    }
    assert.equal(banned.test(prose), false);
  }
});

test("blank EPA figures render as not listed by EPA", () => {
  const blank = {
    id: "blank-a",
    model: "Blank A",
    url: "/stoves/blank/a/",
    manufacturer: "",
    primarySlug: "missing",
    type: "",
    subtype: "",
    emission: null,
    emissionUnit: null,
    efficiency: null,
    btuLow: null,
    btuHigh: null,
    btuMax: null,
    current: false,
  };
  const other = { ...blank, id: "blank-b", model: "Blank B", url: "/stoves/blank/b/" };
  const cells = compareCells(blank, brandBySlug, "2026-10-23");
  for (const key of ["brand", "manufacturer", "fuel", "technology", "emission", "efficiency", "heat"]) {
    assert.equal(cells[key], "not listed by EPA", key);
  }
  assert.equal(cells.status, "Previously listed as of 2026-10-23");
  const rows = compareTableRows(blank, other, brandBySlug, "2026-10-23");
  for (const row of rows) {
    if (row.label === "Listing status" || row.label === "Model line") continue;
    assert.equal(row.left, "not listed by EPA", row.label);
    assert.equal(row.right, "not listed by EPA", row.label);
  }
  const sentences = compareSentences(blank, other, "2026-10-23", brandBySlug);
  assert.equal(sentences.length, 3);
  assert.match(sentences.join(" "), /not listed by EPA/);
  assert.doesNotMatch(sentences.join(" "), /\b0 percent\b|\b0 g\/hr\b/);
  assert.equal(efficiencyCell({ efficiency: null }), "not listed by EPA");
  assert.equal(emissionCell({ emission: null, emissionUnit: "g/hr" }), "not listed by EPA");
  assert.equal(heatCell({ btuLow: null, btuHigh: null, btuMax: null }), "not listed by EPA");
});

test("the compare index answer states the rule without a ranking", () => {
  const sentences = compareIndexSentences("2026-10-23", 20);
  assert.equal(sentences.length, 3);
  const text = sentences.join(" ");
  assert.match(text, /20 example comparisons/);
  assert.match(text, /as of 2026-10-23/);
  assert.match(text, /8 hubs/);
  assert.match(text, /15 percent/);
  assert.match(text, /no sales figures/);
  assert.equal(banned.test(text), false);
});

test("closer midpoints win, and gaps, types, and brands outside the rule are left out", () => {
  const close = [
    line({ id: "a", primarySlug: "h1", btuLow: 10000, btuHigh: 10000 }),
    line({ id: "b", primarySlug: "h2", btuLow: 10100, btuHigh: 10100 }),
    line({ id: "c", primarySlug: "h3", btuLow: 13000, btuHigh: 13000 }),
    line({ id: "d", primarySlug: "h4", btuLow: 13200, btuHigh: 13200 }),
  ];
  const picked = selectComparePairs(close, { pairLimit: 2 });
  assert.deepEqual(idsOf(picked), [["a", "b"], ["c", "d"]]);
  assert.ok(heatRelativeGap(close[0], close[2]) > COMPARE_HEAT_RELATIVE_MAX);

  const far = [
    line({ id: "a", primarySlug: "h1", btuLow: 10000, btuHigh: 10000 }),
    line({ id: "c", primarySlug: "h3", btuLow: 20000, btuHigh: 20000 }),
  ];
  assert.equal(selectComparePairs(far).length, 0);

  const sameBrand = [
    line({ id: "a", primarySlug: "h1" }),
    line({ id: "b", primarySlug: "h1" }),
  ];
  assert.equal(selectComparePairs(sameBrand).length, 0);

  const mixedType = [
    line({ id: "a", primarySlug: "h1" }),
    line({ id: "b", primarySlug: "h2", type: "Pellet Stove" }),
  ];
  assert.equal(selectComparePairs(mixedType).length, 0);

  const mixedSubtype = [
    line({ id: "a", primarySlug: "h1", subtype: "Catalytic Stove" }),
    line({ id: "b", primarySlug: "h2", subtype: "Non-Catalytic Stove" }),
  ];
  assert.equal(selectComparePairs(mixedSubtype).length, 0);

  const previous = [
    line({ id: "a", primarySlug: "h1", current: false }),
    line({ id: "b", primarySlug: "h2" }),
  ];
  assert.equal(selectComparePairs(previous).length, 0);

  const noHeat = [
    line({ id: "a", primarySlug: "h1", btuLow: null, btuHigh: null }),
    line({ id: "b", primarySlug: "h2" }),
  ];
  assert.equal(selectComparePairs(noHeat).length, 0);

  const central = [
    line({ id: "a", primarySlug: "h1", category: "central" }),
    line({ id: "b", primarySlug: "h2" }),
  ];
  assert.equal(selectComparePairs(central).length, 0);

  const many = [];
  for (let brand = 1; brand <= 3; brand += 1) {
    many.push(line({
      id: `m${brand}`,
      primarySlug: `b${brand}`,
      btuLow: 10000,
      btuHigh: 10000,
    }));
  }
  const limited = selectComparePairs(many, { brandLimit: 2, pairLimit: 5 });
  assert.equal(limited.length, 1);
  assert.equal(limited[0].left.primarySlug === "b3" || limited[0].right.primarySlug === "b3", false);
});
