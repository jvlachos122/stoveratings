import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { insertDataNotes } from "../src/lib/answers.js";
import { inserts } from "../src/lib/lists.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const INSERT_RE = /insert|\b-I\b/i;

function readJson(name) {
  return JSON.parse(readFileSync(join(root, "data", name), "utf8"));
}

function readOverrides() {
  const text = readFileSync(join(root, "data/insert-overrides.csv"), "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.length);
  const header = lines[0].split(",");
  assert.deepEqual(header, ["manufacturer", "model", "insert", "note"]);
  const rows = [];
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
    const [manufacturer, model, insert, note] = cells;
    rows.push({ manufacturer, model, insert, note });
  }
  return rows;
}

function findStove(stoves, manufacturer, model) {
  const stove = stoves.find((item) => item.manufacturer === manufacturer && item.model === model);
  assert.ok(stove, `${manufacturer} / ${model}`);
  return stove;
}

test("reviewed insert exceptions match the saved model text and nothing else", () => {
  const stoves = readJson("stoves.json");
  const overrides = readOverrides();
  assert.ok(overrides.length >= 50);
  const keys = new Set();
  let yes = 0;
  let no = 0;
  for (const row of overrides) {
    assert.ok(row.manufacturer && row.model, row.model);
    assert.match(row.insert, /^(yes|no)$/, row.model);
    assert.ok(row.note && row.note.length >= 24, row.model);
    const key = `${row.manufacturer}\n${row.model}`;
    assert.equal(keys.has(key), false, key);
    keys.add(key);
    const stove = findStove(stoves, row.manufacturer, row.model);
    const regexHit = INSERT_RE.test(stove.model);
    if (row.insert === "yes") {
      yes += 1;
      assert.equal(regexHit, false, stove.model);
      assert.equal(stove.insertFlag, true, stove.model);
    } else {
      no += 1;
      assert.equal(regexHit, true, stove.model);
      assert.equal(stove.insertFlag, false, stove.model);
    }
  }
  const flagged = stoves.filter((stove) => stove.insertFlag);
  const regexHits = stoves.filter((stove) => INSERT_RE.test(stove.model));
  assert.equal(flagged.length, regexHits.length - no + yes);
  assert.equal(no, 3);
  assert.equal(yes, 56);
});

test("Roman-numeral names and unpaired letters stay unlabeled", () => {
  const stoves = readJson("stoves.json");
  const unlabeled = [
    "Quadra-Fire Expedition I, Vermont Castings Gifford-CB, Vermont Castings Gifford-BM",
    "Quadra-Fire Expedition II, Vermont Castings Montpelier II",
    "Quadrafire Explorer I",
    "Quadra Fire Explorer II",
    "Heritage I (8021)",
    "Mansfield I",
    "Fraser Elite I, S407E, S408E, S409E",
    "PelPro PP130-B, Quadra-Fire Outfitter II, PelPro PP150",
    "Quadra-Fire Pioneer-II",
    "EPI3",
    "FP-9i",
    "Brass Flame KS-1005, KS-2000I",
    "Absolute 43",
    "Harman Absolute 43-C",
    "Harman P43",
    "Harman Accentra-2",
  ];
  for (const model of unlabeled) {
    const found = stoves.filter((stove) => stove.model === model);
    assert.ok(found.length >= 1, model);
    for (const stove of found) {
      assert.equal(stove.insertFlag, false, model);
      assert.equal(stove.insertBasis, null, model);
    }
  }
  const harmony = stoves.filter((stove) => stove.model === "Harmony I");
  assert.equal(harmony.length, 2);
  for (const stove of harmony) assert.equal(stove.insertFlag, false);
  const classic = stoves.filter((stove) => stove.model.includes("Classic I NC100E"));
  assert.equal(classic.length, 2);
  for (const stove of classic) assert.equal(stove.insertFlag, false);
});

test("hyphen-I insert names stay labeled when they are not Roman numerals", () => {
  const stoves = readJson("stoves.json");
  for (const model of ["Bay Insert 4500", "Osburn 1100, Osburn 1100-I", "BBF-6, BBF-I", "1600 B-I/Ashley 4600/Forester 4700"]) {
    const stove = stoves.find((item) => item.model === model);
    assert.ok(stove, model);
    assert.equal(stove.insertFlag, true, model);
    assert.equal(stove.insertBasis, "name indicates insert", model);
  }
});

test("insert counts are wood and pellet model lines, with blanks left null", () => {
  const stoves = readJson("stoves.json");
  const stats = readJson("stats.json");
  const flagged = stoves.filter((stove) => stove.insertFlag);
  const wood = inserts(stoves, "Wood Stove");
  const pellet = inserts(stoves, "Pellet Stove");
  assert.equal(flagged.length, wood.current.length + wood.previous.length + pellet.current.length + pellet.previous.length);
  assert.equal(stats.insert.modelLines, flagged.length);
  assert.equal(stats.insert.currentModelLines, flagged.filter((stove) => stove.current).length);
  assert.equal(stats.insert.woodModelLines, wood.current.length + wood.previous.length);
  assert.equal(stats.insert.woodCurrentModelLines, wood.current.length);
  assert.equal(stats.insert.pelletModelLines, pellet.current.length + pellet.previous.length);
  assert.equal(stats.insert.pelletCurrentModelLines, pellet.current.length);
  assert.equal(stats.insert.rows, flagged.reduce((sum, stove) => sum + stove.rowCount, 0));
  assert.equal(
    stats.insert.currentRows,
    flagged.reduce((sum, stove) => sum + stove.tests.filter((test) => test.current).length, 0),
  );
  assert.equal(stats.insert.reviewedYes, 56);
  assert.equal(stats.insert.reviewedNo, 3);
  assert.match(stats.insert.basis, /name indicates insert/);
  assert.match(stats.insert.basis, /no insert field/);
  for (const stove of flagged) {
    assert.equal(stove.category, "room", stove.id);
    assert.equal(stove.insertBasis, "name indicates insert", stove.id);
    assert.ok(stove.type === "Wood Stove" || stove.type === "Pellet Stove", stove.id);
    for (const test of stove.tests) {
      for (const key of ["emission", "efficiency", "co", "firebox"]) {
        assert.ok(test[key] === null || typeof test[key] === "number", `${stove.id} ${key}`);
      }
    }
  }
  assert.equal(stoves.some((stove) => stove.category === "central" && stove.insertFlag), false);
  assert.ok(wood.current.length > 18);
  assert.ok(pellet.current.length > 8);
  assert.ok(insertDataNotes.some((note) => /name indicates insert/i.test(note)));
  assert.ok(insertDataNotes.some((note) => /model name/i.test(note)));
  assert.ok(insertDataNotes.some((note) => /not zero/i.test(note)));
});
