import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeHubName } from "../src/lib/brand-names.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(name) {
  return JSON.parse(readFileSync(join(root, "data", name), "utf8"));
}

function manufacturers() {
  const found = new Set();
  for (const name of ["rh_all.csv", "wh_all.csv"]) {
    const text = readFileSync(join(root, "data/raw", name), "utf8").replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/).filter((line) => line.length);
    const header = lines[0].split(",");
    const index = header.indexOf("Manufacturer");
    assert.ok(index >= 0, name);
    for (const line of lines.slice(1)) {
      const cells = [];
      let current = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (quoted) {
          if (char === '"' && line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else if (char === '"') quoted = false;
          else current += char;
        } else if (char === '"') quoted = true;
        else if (char === ",") {
          cells.push(current);
          current = "";
        } else current += char;
      }
      cells.push(current);
      found.add((cells[index] || "").trim());
    }
  }
  return found;
}

function primaryMap(brands) {
  const map = new Map();
  for (const brand of brands) {
    if (brand.role !== "primary") continue;
    for (const manufacturer of brand.manufacturers) {
      assert.equal(map.has(manufacturer), false, `${manufacturer} is on two primary hubs`);
      map.set(manufacturer, brand.slug);
    }
  }
  return map;
}

test("normalized hub names do not collide", () => {
  const brands = readJson("brands.json");
  const seen = new Map();
  for (const brand of brands) {
    const key = normalizeHubName(brand.name);
    assert.ok(key, brand.slug);
    assert.equal(seen.has(key), false, `${brand.name} collides with ${seen.get(key)}`);
    seen.set(key, brand.name);
  }
});

test("every EPA manufacturer maps to exactly one primary hub and no hub is empty", () => {
  const brands = readJson("brands.json");
  const stoves = readJson("stoves.json");
  const map = primaryMap(brands);
  const epa = manufacturers();
  assert.equal(epa.size, map.size);
  for (const manufacturer of epa) {
    assert.ok(map.has(manufacturer), manufacturer || "(blank)");
  }
  for (const stove of stoves) {
    assert.equal(map.get(stove.manufacturer), stove.primarySlug, stove.id);
  }
  for (const brand of brands) {
    const lines = stoves.filter((stove) => stove.brandSlugs.includes(brand.slug));
    assert.ok(lines.length > 0, brand.slug);
  }
});

test("published hub URLs are unchanged or redirected, and redirects stay out of the index list", () => {
  const brands = readJson("brands.json");
  const redirects = readJson("brand-redirects.json");
  const history = readJson("brand-slug-history.json");
  const noindex = new Set(readJson("noindex-paths.json"));
  const slugs = new Set(brands.map((brand) => brand.slug));
  const fromSlugs = new Set();
  for (const [slug, name] of Object.entries(history.slugs)) {
    const brand = brands.find((item) => item.slug === slug);
    const redirect = redirects.find((item) => item.fromSlug === slug);
    assert.ok(brand || redirect, slug);
    assert.equal(Boolean(brand && redirect), false, slug);
    if (brand) assert.equal(brand.name, name, slug);
    if (redirect) assert.equal(redirect.fromName, name, slug);
  }
  for (const redirect of redirects) {
    assert.equal(fromSlugs.has(redirect.fromSlug), false, redirect.fromSlug);
    fromSlugs.add(redirect.fromSlug);
    assert.equal(slugs.has(redirect.fromSlug), false, redirect.fromSlug);
    assert.equal(slugs.has(redirect.toSlug), true, redirect.toSlug);
    assert.equal(redirect.url, `/brands/${redirect.fromSlug}/`);
    assert.equal(redirect.targetUrl, `/brands/${redirect.toSlug}/`);
    assert.equal(noindex.has(redirect.url), true, redirect.url);
    assert.equal(noindex.has(redirect.targetUrl), false, redirect.targetUrl);
  }
  assert.equal(history.slugs["high-valley"], undefined);
  assert.ok(slugs.has("high-valley"));
});

test("crosswalk merges that EPA strings support stay merged", () => {
  const brands = readJson("brands.json");
  const map = primaryMap(brands);
  const same = [
    ["Hussong Manufacturing Company, Inc.", "Hussong Manufacturing Company, Inc.(Kozy Heat)", "hussong-manufacturing-company-inc"],
    ["High Valley Construction and Maintenance Corp.", "High Valley Stoves by Stoll (Suppertime Stoves)", "high-valley"],
    ["HeatMaster Furnaces, Inc.", "Heatmaster Furnaces Inc. (SteelTech Inc.)", "heatmaster"],
    ["HeatMaster Furnaces, Inc.", "Steel Tech, Inc.", "heatmaster"],
    ["Sierra Products, Inc.", "High Sierra Stoves, Ltd. (Sierra Products, Inc.)", "sierra-products-inc"],
    ["SMG Hearth and Home, LLC", "Ningbo Hongsheng Fireplace Company (SMG Hearth and Home, LLC)", "smg-hearth-and-home-llc"],
    ["Jacuzzi Leisure Products, Inc.", "CFM Corporation (Jacuzzi Leisure Products, Inc.)", "jacuzzi-leisure-products-inc"],
    ["Varmebaronen AB", "Värmebaronen AB/Smokeless Heat, LLC", "varmebaronen-ab"],
    ["HY-C Company, LLC", "Fire Chief Industries/Shelter Furnace/HY-C Company", "hy-c-company-llc"],
    ["Central Boiler Inc.- WoodMaster Inc.", "WoodMaster Inc.", "central-boiler-inc-woodmaster-inc"],
    ["Vermont Castings", "CFM Corporation (Vermont Castings, Inc.)", "vermont-castings"],
    ["Blaze King Industries, Inc.", "Blaze King of Montana", "blaze-king"],
    ["St. Croix Stoves (Johnson Gas Appliance Company)", "Even Temp, Inc. - St Croix Product Development", "st-croix"],
  ];
  for (const [left, right, slug] of same) {
    assert.equal(map.get(left), slug, left);
    assert.equal(map.get(right), slug, right);
  }
});

test("ambiguous manufacturer pairs stay on separate hubs", () => {
  const brands = readJson("brands.json");
  const map = primaryMap(brands);
  const split = [
    ["Innovative Hearth Products", "Lennox Hearth Products (Innovative Hearth Products)"],
    ["Innovative Hearth Products", "Country Stoves, Inc. (Innovative Hearth Products)"],
    ["Innovative Hearth Products", "Security Chimneys International Ltd. (Innovative Hearth Products)"],
    ["United States Stove Company", "Vogelzang International Corporation (United States Stove Company)"],
    ["United States Stove Company", "HeatWorx LLC (United States Stove Company)"],
    ["United States Stove Company", "Wiseway Pellet Stoves - United States Stove Company"],
    ["United States Stove Company", "Newmac Manufacturing Incorporated (US Stove Company)"],
    ["Windhager Zentralheizung Technik GmbH", "Pellergy, LLC/ Windhager Zentralheizung Technik GmbH"],
    ["Fröling Heizkessel und Behälterbau Ges.m.b.H", "Tarm USA, Inc./ Fröling Heizkessel- und Behälterbau Ges.m.b.H"],
    ["Hearthstone Quality Home Heating Products Inc.", "Hase Kaminofenbau (Hearthstone Quality Home Products Inc.)"],
    ["Hearth and Home Technologies", "Qingdao Hichanse Group"],
    ["Windhager Zentralheizung Technik GmbH", "HIDU GmbH"],
    ["Foundries du Lion S.A.", "Thermic Distribution Europe"],
    ["Thermic Distribution Europe", "Thermic, Inc."],
    ["Dansons, Inc", "Glow Boy"],
    ["Dansons, Inc", "Horizon Research Inc."],
    ["Northwest Manufacturing Inc", "Central Boiler Inc.- WoodMaster Inc."],
    ["Sherwood Industries, Ltd.", "Fireplace Products International Limited"],
    ["Fireplace Products International Limited", "FPI/Regency Fireplace Products"],
    ["CFM Corporation (Vermont Castings, Inc.)", "CFM Corporation (Jacuzzi Leisure Products, Inc.)"],
    ["Evergreen Marketing, Inc.", "Evergreen Metal Products Inc."],
    ["Polar Fireplaces", "Polar Furnace Manufacturing Inc."],
    ["Wolf Steel Ltd.", "Wolf's Stoves"],
    ["Hawke Manufacturing Company, Inc.", "Hawken Energy"],
  ];
  for (const [left, right] of split) {
    assert.notEqual(map.get(left), map.get(right), `${left} vs ${right}`);
  }
});

test("Piney's ENVIRO CHIP-500 is not on the Enviro hub", () => {
  const stoves = readJson("stoves.json");
  const chip = stoves.find((stove) => stove.model.includes("ENVIRO CHIP-500"));
  assert.ok(chip);
  assert.equal(chip.manufacturer, "Piney Manufacturing");
  assert.equal(chip.brandSlugs.includes("enviro"), false);
  const enviro = stoves.filter((stove) => stove.brandSlugs.includes("enviro"));
  assert.ok(enviro.length > 0);
  for (const stove of enviro) {
    assert.match(stove.manufacturer, /Sherwood Industries|Fireplace Products International/);
  }
});
