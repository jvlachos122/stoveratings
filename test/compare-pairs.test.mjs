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
  COMPARE_SLUG_MAX,
  COMPARE_TITLE_MAX,
  COMPARE_TITLE_SUFFIX,
  NOT_LISTED_BY_EPA,
  compareBrandForms,
  compareCells,
  compareIndexSentences,
  compareModelForms,
  compareRedirects,
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
  const options = { brandBySlug };
  const forward = selectComparePairs(stoves, options);
  const backward = selectComparePairs([...stoves].reverse(), options);
  assert.equal(forward.length, 20);
  assert.deepEqual(idsOf(forward), idsOf(backward));
  assert.deepEqual(idsOf(forward), EXPECTED_PAIRS);
  assert.deepEqual(idsOf(selectComparePairs(stoves, options)), idsOf(forward));
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
  const pairs = selectComparePairs(stoves, { brandBySlug });
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
    const sentences = compareSentences(pair.left, pair.right, date, brandBySlug, pair);
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

const EXPECTED_LABELS = [
  ["hearthstone-wfp100-vs-sbi-he350", "Hearthstone WFP100 vs SBI HE350: EPA emissions and efficiency", "hearthstone-quality-home-heating-products-inc-wfp100-vs-stove-builder-international-inc-he350-fp-15-waterloo-horizon-monaco-xl-wfp100-fp-15a-waterloo-st-clair-4300-solu"],
  ["fs-astra-18-vs-hht-flexburn-2115", "FS Astra 18 vs HHT FlexBurn 2115: EPA emissions and efficiency", "foyers-supreme-inc-astra-18-elegance-30-novo-18-soapstone-and-novo-18-cast-iron-vs-hearth-and-home-technologies-vermont-castings-intrepid-flexburn-2115"],
  ["fs-elegance-36-vs-hht-pioneer-iii", "FS Elegance 36 vs HHT Pioneer-III: EPA emissions and efficiency", "foyers-supreme-inc-ambiance-elegance-36-24sf-novo-24-soapstone-vs-hearth-and-home-technologies-quadra-fire-pioneer-iii-arc-and-quadra-fire-pioneer-iii-rec-wood-heater-model-li"],
  ["hht-bay-1200-c-vs-travis-agp-insert", "HHT Bay 1200-C vs Travis AGP Insert: EPA emissions and efficiency", "hearth-and-home-technologies-quadra-fire-classic-bay-1200-c-vs-travis-industries-inc-agp-insert"],
  ["hht-31m-acc-c-vs-pe-tn20", "HHT 31M-ACC-C vs PE TN20: EPA emissions and efficiency", "hearth-and-home-technologies-quadra-fire-31m-acc-c-quadra-fire-discovery-ii-c-quadra-fire-ff-wp-200-vs-pacific-energy-fireplace-products-limited-true-north-tn20-series-b-tn-insert-series-b"],
  ["fs-elegance-st-42-vs-pe-super-le", "FS Elegance ST 42 vs PE Super LE: EPA emissions and efficiency", "foyers-supreme-inc-38sfc-d-ii-and-38st-d-ii-series-elegance-st-42-ii-astra-duo-38-ii-monarch-see-th-vs-pacific-energy-fireplace-products-limited-super-le-alderlea-t5-insert-le-super-insert-le-super-classic-le-alderlea-t5-le"],
  ["enerco-c60w-vs-uss-5710", "Enerco C60W vs USS 5710: EPA emissions and efficiency", "enerco-group-inc-ps60w-model-line-c60w-n60wts-h80xl-c80xl-j80xl-n80xl-j60w-n60w-h60w-c60wts-h60wt-vs-united-states-stove-company-5710-ap5710-vg5710-5501s-ap5501s-vg5501s-5710-xh-and-us513m"],
  ["hht-21m-acc-c-vs-pe-neo-2-5", "HHT 21M-ACC-C vs PE NEO 2.5: EPA emissions and efficiency", "hearth-and-home-technologies-quadra-fire-21m-acc-c-discovery-1-c-ff-wp-100-vs-pacific-energy-fireplace-products-limited-neo-2-5-le2-neo-2-5-insert-le2"],
  ["enerco-c130w-vs-hht-harman-xxv-tc", "Enerco C130W vs HHT Harman XXV-TC: EPA emissions and efficiency", "enerco-group-inc-ps130w-model-line-c130w-n130wts-h140xl-c140xl-j140xl-n140xl-j130w-n130w-h130w-c1-vs-hearth-and-home-technologies-harman-xxv-tc"],
  ["fs-astra-32-vs-hht-pioneer-ii", "FS Astra 32 vs HHT Pioneer-II: EPA emissions and efficiency", "foyers-supreme-inc-astra-32-elegance-40-vs-hearth-and-home-technologies-heat-and-glo-pioneer-ii-arc-heat-and-glo-pioneer-ii-rec-heat-and-glo-northstar-d"],
  ["enerco-ws110-vs-sbi-solution-2-5", "Enerco WS110 vs SBI Solution 2.5: EPA emissions and efficiency", "enerco-group-inc-ws110-c110-d110-h110-j110-n110-r110-t110-v110-vs-stove-builder-international-inc-2-5r-series-solution-2-5-zc-ii-stratford-ii-fp10-lafayette-ii-fp12-mundo-ii-he25"],
  ["enerco-g2-a50wts-vs-uss-kp5522", "Enerco G2-A50WTS vs USS KP5522: EPA emissions and efficiency", "enerco-group-inc-g2-a50wts-g2-c50wts-g2-h50wts-g2-j50wts-g2-n50wts-vs-united-states-stove-company-kp5522-kp5522-p-kp5522-l-kp5522-w-us5522-us5522-p-us5522-l-us5522-w-ap5622-ap562"],
  ["sbi-55-shpcb120-vs-uss-kp5513", "SBI 55-SHPCB120 vs USS KP5513: EPA emissions and efficiency", "stove-builder-international-inc-55-shpcb120-55-trpcb120-and-25-cb120-vs-united-states-stove-company-kp5513-kp5513-p-kp5513-l-us5513-us5513-p-us5513-l-ap5613-ap5613-p-ap5613-l-vg571"],
  ["fs-lumis-16-vs-uss-th-100", "FS Lumis 16 vs USS TH-100: EPA emissions and efficiency", "foyers-supreme-inc-16-in-model-line-lumis-16-16-in-flair-25-16-in-regal-16-16in-vs-united-states-stove-company-th-100-us500e-aw520e-vg520-sw500-ch500-kw500-cgws750"],
  ["hht-pel-pro-pp60-b-vs-sbi-25cab80", "HHT Pel-Pro PP60-B vs SBI 25CAB80: EPA emissions and efficiency", "hearth-and-home-technologies-pel-pro-pp60-b-pleasant-hearth-ph35ps-b-quadra-fire-outfitter-i-vs-stove-builder-international-inc-25cab80-55-shpcab80-55-trpcab80-25-cab80s-55-shpcab80s-55-rpcab80s"],
  ["enerco-g2-a130wts-vs-hht-p43-c", "Enerco G2-A130WTS vs HHT P43-C: EPA emissions and efficiency", "enerco-group-inc-g2-a130wts-g2-c130wts-g2-h130wts-g2-j130wts-g2-n130wts-vs-hearth-and-home-technologies-harman-p43-c"],
  ["hht-p42i-tc-vs-uss-5780", "HHT P42i-TC vs USS 5780: EPA emissions and efficiency", "hearth-and-home-technologies-p42i-tc-vs-united-states-stove-company-5780-ap5780-vg5780-sp5780-and-sp58"],
  ["hht-santa-fe-c-vs-uss-sp24e", "HHT Santa Fe-C vs USS SP24E: EPA emissions and efficiency", "hearth-and-home-technologies-quadra-fire-santa-fe-c-quadra-fire-santa-fe-i-c-quadra-fire-castile-c-quadra-fir-vs-united-states-stove-company-breckwell-sp24e-blazer-sp24ie-blazer"],
  ["sbi-blackcomb-ii-vs-uss-us1261e", "SBI Blackcomb II vs USS US1261E: EPA emissions and efficiency", "stove-builder-international-inc-1-7r-series-blackcomb-ii-escape-1500-deco-ii-columbia-ii-savannah-ii-fw2800-osbu-vs-united-states-stove-company-us1261e-uslw900e"],
  ["hearthstone-8024-vs-travis-42-apex", "Hearthstone 8024 vs Travis 42 Apex: EPA emissions and efficiency", "hearthstone-quality-home-heating-products-inc-heritage-8024-vs-travis-industries-inc-42-apex-nexgen-hybrid"],
];

test("short slugs and titles stay within the caps and keep every old slug", () => {
  assert.equal(COMPARE_SLUG_MAX, 80);
  assert.equal(COMPARE_TITLE_MAX, 65);
  assert.equal(COMPARE_TITLE_SUFFIX, ": EPA emissions and efficiency");
  assert.deepEqual(compareBrandForms("Enerco Group, Inc."), ["Enerco"]);
  assert.deepEqual(compareBrandForms("Stove Builder International, Inc."), ["SBI"]);
  assert.deepEqual(compareBrandForms("Hearth and Home Technologies"), ["HHT"]);
  assert.deepEqual(compareBrandForms("United States Stove Company"), ["USS"]);
  assert.deepEqual(compareBrandForms("Foyers Supreme, Inc"), ["Foyers Supreme", "FS"]);
  assert.deepEqual(compareBrandForms("Pacific Energy"), ["Pacific Energy", "PE"]);
  assert.deepEqual(compareBrandForms("Travis Industries, Inc"), ["Travis"]);
  assert.deepEqual(compareBrandForms("Hearthstone"), ["Hearthstone"]);
  const ws110 = stoves.find((stove) => stove.id === EXPECTED_PAIRS[10][0]);
  const solution = stoves.find((stove) => stove.id === EXPECTED_PAIRS[10][1]);
  assert.equal(compareModelForms(ws110.model)[0], "WS110");
  assert.equal(compareModelForms(solution.model)[0], "Solution 2.5");

  const pairs = selectComparePairs(stoves, { brandBySlug });
  const redirects = compareRedirects(pairs);
  const stored = readJson("compare-redirects.json");
  const noindex = new Set(readJson("noindex-paths.json"));
  assert.deepEqual(stored, redirects);
  assert.equal(pairs.length, 20);
  assert.equal(redirects.length, 20);
  const slugs = new Set();
  const legacy = new Set();
  pairs.forEach((pair, index) => {
    const [slug, title, oldSlug] = EXPECTED_LABELS[index];
    assert.equal(pair.slug, slug);
    assert.equal(pair.title, title);
    assert.equal(pair.legacySlug, oldSlug);
    assert.ok(pair.slug.length <= COMPARE_SLUG_MAX, pair.slug);
    assert.ok(pair.title.length <= COMPARE_TITLE_MAX, pair.title);
    assert.equal(pair.title.endsWith(COMPARE_TITLE_SUFFIX), true);
    assert.equal(pair.title.includes("StoveRatings"), false);
    assert.equal(pair.title.includes("·"), false);
    assert.equal(slugs.has(pair.slug), false, pair.slug);
    slugs.add(pair.slug);
    assert.equal(legacy.has(pair.legacySlug), false, pair.legacySlug);
    legacy.add(pair.legacySlug);
    assert.notEqual(pair.legacySlug, pair.slug);
    assert.equal(pair.url, `/compare/${pair.slug}/`);
    assert.equal(pair.legacyUrl, `/compare/${pair.legacySlug}/`);
    assert.equal(noindex.has(pair.legacyUrl), true, pair.legacyUrl);
    assert.equal(noindex.has(pair.url), false, pair.url);
    assert.equal(pair.left.model.length > 0, true);
    assert.notEqual(pair.leftLabel, pair.left.model);
    assert.equal(banned.test(pair.title), false, pair.title);
  });
  assert.equal(slugs.size, 20);
  for (const redirect of redirects) {
    assert.equal(legacy.has(redirect.fromSlug), true, redirect.fromSlug);
    assert.equal(slugs.has(redirect.toSlug), true, redirect.toSlug);
    assert.equal(redirect.url, `/compare/${redirect.fromSlug}/`);
    assert.equal(redirect.targetUrl, `/compare/${redirect.toSlug}/`);
  }
  const example = pairs.find((pair) => pair.slug === "enerco-ws110-vs-sbi-solution-2-5");
  assert.ok(example);
  assert.equal(example.title, "Enerco WS110 vs SBI Solution 2.5: EPA emissions and efficiency");
  assert.match(example.left.model, /WS110, C110/);
  assert.match(example.right.model, /Solution 2\.5 ZC II/);
});

test("a repeated short label gets a numeric suffix and stays under the caps", () => {
  const make = (id, slug, manufacturer, model, btu) => line({
    id,
    primarySlug: slug,
    manufacturer,
    manufacturerSlug: slug,
    model,
    modelSlug: `${id}-line`,
    btuLow: btu,
    btuHigh: btu,
  });
  const series = "2.5R Series (Solution 2.5 ZC II, Other)";
  const picked = selectComparePairs([
    make("a1", "enerco", "Enerco Group, Inc.", "WS110", 10000),
    make("b1", "sbi", "Stove Builder International, Inc.", series, 10000),
    make("a2", "enerco", "Enerco Group, Inc.", "WS110", 20000),
    make("b2", "sbi", "Stove Builder International, Inc.", series, 20000),
  ], { pairLimit: 5 });
  assert.deepEqual(picked.map((pair) => pair.slug), [
    "enerco-ws110-vs-sbi-solution-2-5",
    "enerco-ws110-vs-sbi-solution-2-5-2",
  ]);
  assert.equal(picked[0].title, picked[1].title);
  assert.equal(picked[0].title.length <= COMPARE_TITLE_MAX, true);
  for (const pair of picked) {
    assert.ok(pair.slug.length <= COMPARE_SLUG_MAX);
    assert.equal(compareRedirects([pair]).length, 1);
  }
});
