import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ALIAS_FILLER,
  ALIAS_LIMIT,
  PINNED_ALIASES,
  aliasQueryHit,
  aliasSearchEntries,
  aliasSentences,
  aliasSlug,
  containsContiguous,
  rankRetailNames,
  readAliasResearch,
  resolveAliasPhrase,
  selectRetailAliases,
  significantTokens,
  tokenize,
} from "../src/lib/retail-aliases.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stoves = JSON.parse(readFileSync(join(root, "data/stoves.json"), "utf8"));
const brands = JSON.parse(readFileSync(join(root, "data/brands.json"), "utf8"));
const banned = /\b(best|popular|winner|score|ranking)\b/i;

function ids(alias) {
  return alias.targets.map((target) => target.id);
}

function linesWith(tokens) {
  return stoves
    .filter((stove) => (stove.retailNames || []).some((name) => containsContiguous(tokenize(name), tokens)))
    .map((stove) => stove.id)
    .sort();
}

test("token rules keep a decimal model number and reject a longer integer or a glued code", () => {
  assert.deepEqual(significantTokens("ashley wood stove"), ["ashley"]);
  assert.deepEqual(significantTokens("wood stove"), ["wood", "stove"]);
  assert.equal(containsContiguous(tokenize("Ashford 30.2 AF30.2"), ["ashford", "30"]), true);
  assert.equal(containsContiguous(tokenize("Chinook Sirocco Ashford 30"), ["ashford", "30"]), true);
  assert.equal(containsContiguous(tokenize("Ashford 300"), ["ashford", "30"]), false);
  assert.equal(containsContiguous(tokenize("Ashford AF30.2"), ["ashford", "30"]), false);
  assert.equal(containsContiguous(tokenize("Ashford 20.2"), ["ashford", "30"]), false);
  assert.equal(containsContiguous(tokenize("Escape 1500-I"), ["escape", "1500"]), true);
  assert.equal(aliasSlug("6143 B"), "6143-b");
});

test("a phrase lists every matching line and does not invent a line", () => {
  const brandsOnly = [
    { name: "Drolet", slug: "drolet" },
    { name: "Blaze King", slug: "blaze-king" },
    { name: "Castle", slug: "castle" },
  ];
  const sample = [
    { id: "escape-current", model: "1.7R Series Escape 1500", manufacturer: "Stove Builder International, Inc.", retailNames: ["Escape 1500"], current: true, brandSlugs: ["sbi"], url: "/stoves/sbi/current/" },
    { id: "escape-previous", model: "1.7 Series Escape 1500", manufacturer: "Stove Builder International, Inc.", retailNames: ["Escape 1500-I", "Escape 1500"], current: false, brandSlugs: ["sbi"], url: "/stoves/sbi/previous/" },
    { id: "edison", model: "Drolet Edison", manufacturer: "Stove Builder International, Inc.", retailNames: ["Drolet Edison"], current: true, brandSlugs: ["drolet"], url: "/stoves/sbi/edison/" },
    { id: "ashford-30", model: "30.2 Series", manufacturer: "Blaze King Industries, Inc.", retailNames: ["Ashford 30.2 AF30.2"], current: true, brandSlugs: ["blaze-king"], url: "/stoves/bk/30/" },
    { id: "ashford-20", model: "Ashford 20", manufacturer: "Blaze King Industries, Inc.", retailNames: ["Ashford 20.2"], current: true, brandSlugs: ["blaze-king"], url: "/stoves/bk/20/" },
    { id: "ashford-code", model: "Ashford AF30.2", manufacturer: "Blaze King Industries, Inc.", retailNames: ["Ashford AF30.2"], current: false, brandSlugs: ["blaze-king"], url: "/stoves/bk/code/" },
    { id: "other-30", model: "Ashford 30 copy", manufacturer: "Other Co", retailNames: ["Chinook Sirocco Ashford 30"], current: false, brandSlugs: ["other"], url: "/stoves/other/30/" },
    { id: "castle-a", model: "Castle Serenity 2", manufacturer: "ARDISAM, Inc.", retailNames: ["Castle Serenity 2"], current: true, brandSlugs: ["castle"], url: "/stoves/c/2/" },
    { id: "castle-b", model: "Castle Serenity 1", manufacturer: "ARDISAM, Inc.", retailNames: ["Castle Serenity 1"], current: true, brandSlugs: ["castle"], url: "/stoves/c/1/" },
  ];

  const drolet = resolveAliasPhrase(sample, brandsOnly, "drolet escape 1500");
  assert.deepEqual(drolet.targets.map((target) => target.id), ["escape-current", "escape-previous"]);
  assert.equal(drolet.brandListed, false);
  assert.equal(drolet.peeledBrand, "Drolet");

  const ashford = resolveAliasPhrase(sample, brandsOnly, "blaze king ashford 30");
  assert.deepEqual(ashford.targets.map((target) => target.id), ["ashford-30"]);
  assert.equal(ashford.brandListed, true);

  const castle = resolveAliasPhrase(sample, brandsOnly, "castle serenity");
  assert.deepEqual(castle.targets.map((target) => target.id), ["castle-b", "castle-a"]);

  const missing = resolveAliasPhrase(sample, brandsOnly, "not a real stove xyzzy");
  assert.deepEqual(missing.targets, []);
});

test("the committed snapshot resolves the five named phrases without dropping or inventing lines", () => {
  assert.equal(readAliasResearch(), null);
  const aliases = selectRetailAliases(stoves, brands);
  assert.equal(aliases.length, ALIAS_LIMIT);
  assert.deepEqual(aliases.slice(0, 5).map((alias) => alias.query), PINNED_ALIASES.map((alias) => alias.query));
  assert.deepEqual(aliases.slice(0, 5).map((alias) => alias.source), ["example", "example", "example", "example", "example"]);

  const byQuery = new Map(aliases.map((alias) => [alias.query, alias]));
  const ashley = byQuery.get("ashley wood stove");
  const vogelzang = byQuery.get("vogelzang");
  const castle = byQuery.get("castle serenity");
  const ashford = byQuery.get("blaze king ashford 30");
  const drolet = byQuery.get("drolet escape 1500");

  assert.deepEqual([...ids(ashley)].sort(), linesWith(["ashley"]));
  assert.deepEqual([...ids(vogelzang)].sort(), linesWith(["vogelzang"]));
  assert.deepEqual([...ids(castle)].sort(), linesWith(["castle", "serenity"]));
  assert.ok(ashley.targets.length > 1);
  assert.ok(vogelzang.targets.length > 1);
  assert.ok(castle.targets.length > 1);
  assert.deepEqual(castle.targets.map((target) => target.url), [
    "/stoves/ardisam-inc/castle-serenity-12327/",
    "/stoves/ardisam-inc/castle-serenity-41278/",
  ]);
  assert.ok(castle.targets.every((target) => target.current));

  const ashfordIds = linesWith(["ashford", "30"]).filter((id) => {
    const stove = stoves.find((item) => item.id === id);
    return stove.brandSlugs.includes("blaze-king");
  });
  assert.deepEqual([...ids(ashford)].sort(), [...ashfordIds].sort());
  assert.equal(ashford.brandListed, true);
  assert.equal(ashford.targets[0].current, true);
  assert.match(ashford.targets[0].url, /30-2-series/);
  for (const url of [
    "/stoves/blaze-king-industries-inc/ashford-30-1-af30-1-chinook-30-1-ck30-1-sirocco-30-1-sc30-1/",
    "/stoves/blaze-king-industries-inc/chinook-sirocco-ashford-30/",
  ]) {
    assert.ok(ashford.targets.some((target) => target.url === url), url);
  }
  for (const url of [
    "/stoves/blaze-king-industries-inc/chinook-sirocco-ashford-20/",
    "/stoves/blaze-king-industries-inc/25-series-sirocco-25-sc25-insert-ashford-25-af25-insert-boxer-24-bx24-freestandi/",
    "/stoves/blaze-king-industries-inc/ashford-af30-2-chinook-ck30-2-sirocco-sc30-2-ashford-af30-2a/",
  ]) {
    assert.equal(ashford.targets.some((target) => target.url === url), false, url);
  }

  assert.deepEqual([...ids(drolet)].sort(), linesWith(["escape", "1500"]));
  assert.equal(drolet.brandListed, false);
  assert.equal(drolet.peeledBrand, "Drolet");
  assert.equal(drolet.targets[0].current, true);
  assert.match(drolet.targets[0].model, /^1\.7R Series/);
  assert.match(drolet.targets[1].model, /^1\.7 Series/);
  assert.equal(drolet.targets.some((target) => target.model.includes("Drolet")), false);
  const text = aliasSentences(drolet).join(" ");
  assert.match(text, /Escape 1500/);
  assert.match(text, /Drolet is not in those model cells/);
  assert.doesNotMatch(text, banned);

  for (const alias of aliases) {
    assert.ok(alias.targets.length > 0, alias.query);
    assert.equal(alias.anchor, `/lookup/#${alias.slug}`);
    assert.match(alias.slug, /^alias-[a-z0-9-]+$/);
    const sentences = aliasSentences(alias);
    assert.ok(sentences.length >= 1 && sentences.length <= 2, alias.query);
    if (alias.source === "example") assert.doesNotMatch(sentences.join(" "), banned);
    for (const target of alias.targets) {
      assert.equal(target.href, `${target.url}#retail-names`);
      const stove = stoves.find((item) => item.id === target.id);
      assert.ok(stove, target.id);
      assert.ok(stove.retailNames.includes(target.retailName), `${alias.query} ${target.retailName}`);
      if (alias.source === "frequency") assert.equal(target.retailName.toLowerCase(), alias.query.toLowerCase());
    }
  }
  assert.equal(new Set(aliases.map((alias) => alias.slug)).size, aliases.length);
});

test("frequency aliases follow the line count and skip names the phrases already cover", () => {
  const aliases = selectRetailAliases(stoves, brands);
  const pinned = aliases.filter((alias) => alias.source === "example");
  const frequency = aliases.filter((alias) => alias.source === "frequency");
  assert.equal(pinned.length, PINNED_ALIASES.length);
  assert.equal(frequency.length, ALIAS_LIMIT - PINNED_ALIASES.length);

  function covered(row) {
    if (pinned.some((alias) => alias.query.toLowerCase() === row.key)) return true;
    const nameTokens = tokenize(row.name);
    return pinned.some((alias) => {
      if (!containsContiguous(tokenize(alias.query), nameTokens)) return false;
      const ids = new Set(alias.targets.map((target) => target.id));
      return row.ids.every((id) => ids.has(id));
    });
  }
  const expected = rankRetailNames(stoves).filter((row) => !covered(row)).slice(0, frequency.length);
  assert.deepEqual(frequency.map((alias) => alias.query), expected.map((row) => row.name));
  assert.equal(frequency.some((alias) => alias.query.toLowerCase() === "escape 1500"), false);
  assert.equal(frequency.some((alias) => alias.query.toLowerCase() === "vogelzang"), false);
  for (let index = 1; index < frequency.length; index += 1) {
    const previous = frequency[index - 1];
    const current = frequency[index];
    const ordered = previous.lines > current.lines
      || (previous.lines === current.lines && previous.currentLines > current.currentLines)
      || (previous.lines === current.lines && previous.currentLines === current.currentLines && previous.label.localeCompare(current.label, "en") <= 0);
    assert.equal(ordered, true, `${previous.label} before ${current.label}`);
  }
});

test("a research file replaces the frequency list and drops queries that match nothing", () => {
  const selected = selectRetailAliases(stoves, brands, {
    research: [
      { query: "castle serenity", label: "Castle Serenity", listedAs: "Castle Serenity" },
      { query: "not a real stove xyzzy", label: "Missing" },
      { query: "vogelzang" },
    ],
  });
  assert.deepEqual(selected.map((alias) => alias.query), ["castle serenity", "vogelzang"]);
  assert.deepEqual(selected.map((alias) => alias.source), ["research", "research"]);
  assert.equal(selectRetailAliases(stoves, brands, { research: [] }).length, 0);
  assert.throws(() => selectRetailAliases([], brands), /pinned alias matched no retail name/);
});

test("alias search entries hit the full phrase and ignore a filler word", () => {
  const aliases = selectRetailAliases(stoves, brands);
  const entries = aliasSearchEntries(aliases);
  const drolet = entries.filter((entry) => entry.q === "drolet escape 1500");
  assert.equal(drolet.length, 2);
  assert.ok(drolet.every((entry) => entry.alias && entry.url.endsWith("#retail-names")));
  assert.equal(aliasQueryHit(drolet[0], "drolet escape 1500"), true);
  assert.equal(aliasQueryHit(drolet[0], "drolet escape"), true);
  assert.equal(aliasQueryHit(drolet[0], "escape"), false);
  const ashley = entries.find((entry) => entry.q === "ashley wood stove");
  assert.equal(aliasQueryHit(ashley, "ashley wood stove"), true);
  assert.equal(aliasQueryHit(ashley, "ashley"), false);
  assert.equal(aliasQueryHit(ashley, "wood stove"), false);
  assert.equal(aliasQueryHit({ alias: false, q: "ashley" }, "ashley"), false);

  const script = readFileSync(join(root, "public/scripts/lookup.js"), "utf8");
  for (const token of ALIAS_FILLER) assert.match(script, new RegExp(`"${token}"`));
  assert.match(script, /entry\.alias/);
});

test("home and lookup surface the aliases and model pages keep every retail name", () => {
  const home = readFileSync(join(root, "src/pages/index.astro"), "utf8");
  const lookup = readFileSync(join(root, "src/pages/lookup.astro"), "utf8");
  const model = readFileSync(join(root, "src/pages/stoves/[manufacturer]/[model].astro"), "utf8");
  const footer = readFileSync(join(root, "src/components/Footer.astro"), "utf8");
  assert.match(home, /selectRetailAliases/);
  assert.match(home, /href=\{alias\.anchor\}/);
  assert.match(lookup, /id="name-aliases"/);
  assert.match(lookup, /id=\{alias\.slug\}/);
  assert.match(lookup, /href=\{target\.href\}/);
  assert.match(footer, /href="\/lookup\/#name-aliases"/);
  assert.match(model, /id="retail-names"/);
  assert.match(model, /stove\.retailNames\.map/);
  assert.doesNotMatch(home, /\bbest\b/i);
  assert.doesNotMatch(lookup, /\bbest\b/i);
  const sentences = lookup.match(/const sentences = \[([\s\S]*?)\];/);
  assert.ok(sentences);
  assert.equal(sentences[1].match(/`/g).length, 4);
});
