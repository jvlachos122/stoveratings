import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadChangelog, loadCommittedSnapshots } from "../src/lib/epa-snapshots.js";
import { fuelClassOf } from "../src/lib/snapshot-diff.js";
import {
  buildReport,
  diffEditorial,
  diffModelLines,
  formatEfficiency,
  formatEmission,
  parseSnapshot,
  recordedHubMerges,
} from "../src/lib/snapshot-diff.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const ROOM_HEADER = "New,Model,Manufacturer,Firebox Volume (Cubic Feet),Emission Rate (grams/hr),Heat Output (BTUs),Overall Efficiency-HHV (%),Type,Subtype,Certified Fuel Type,Test Method,CO (g/min),NSPS Compliance 2020";
const CENTRAL_HEADER = "New,Model,Manufacturer,Firebox Volume (Cubic Feet),Emission Rate Annual Avg (lb/mmBTU),Heat Output Maximum (BTUs),Heat Output (Upper),Heat Output (Lower),Overall Efficiency-HHV (%),Type,Subtype,Certified Fuel Type,CO (g/min),Thermal Storage,NSPS Compliance 2020";

function roomRow({ model, manufacturer, emission, efficiency, type, fuel }) {
  const efficiencyCell = efficiency == null ? "" : String(efficiency);
  return `,${csvCell(model)},${csvCell(manufacturer)},1.2,${emission},10000-20000,${efficiencyCell},${type},Non-Catalytic Stove,${fuel},,1.0,Yes`;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function filesFrom(roomAll, roomCurrent) {
  return {
    "rh_all.csv": `${ROOM_HEADER}\n${roomAll.join("\n")}\n`,
    "rh_inprod.csv": `${ROOM_HEADER}\n${roomCurrent.join("\n")}${roomCurrent.length ? "\n" : ""}`,
    "wh_all.csv": `${CENTRAL_HEADER}\n`,
    "wh_inprod.csv": `${CENTRAL_HEADER}\n`,
  };
}

function line(partial = {}) {
  const current = partial.current ?? true;
  const type = partial.type || "Wood Stove";
  const fuel = partial.fuel || "Cord Wood";
  const rows = partial.rows || [
    {
      emission: partial.emission ?? 1.2,
      efficiency: Object.hasOwn(partial, "efficiency") ? partial.efficiency : 70,
      emissionUnit: partial.emissionUnit || "g/hr",
      current,
      type,
      fuel,
    },
  ];
  return {
    category: partial.category || "room",
    manufacturer: partial.manufacturer ?? "Example Co",
    model: partial.model || "Example 1",
    type,
    fuel,
    fuelClass: partial.fuelClass || fuelClassOf(type, fuel),
    current,
    rows,
    url: partial.url || "",
  };
}

test("blank efficiency stays not listed and an explicit zero stays zero", () => {
  assert.equal(formatEfficiency(null), "not listed by EPA");
  assert.equal(formatEfficiency(""), "not listed by EPA");
  assert.equal(formatEfficiency(0), "0 percent");
  assert.equal(formatEmission(null, "g/hr"), "not listed by EPA");
  assert.equal(formatEmission(0, "g/hr"), "0 g/hr");

  const historical = roomRow({
    model: "Old Stove",
    manufacturer: "Old Co",
    emission: "4.5",
    efficiency: null,
    type: "Wood Stove",
    fuel: "Cord Wood",
  });
  const zero = roomRow({
    model: "Zero Stove",
    manufacturer: "Zero Co",
    emission: "2",
    efficiency: 0,
    type: "Wood Stove",
    fuel: "Cord Wood",
  });
  const current = roomRow({
    model: "New Stove",
    manufacturer: "New Co",
    emission: "1.1",
    efficiency: 74,
    type: "Pellet Stove",
    fuel: "Wood Pellets",
  });
  const snapshot = parseSnapshot({
    date: "2026-10-23",
    files: filesFrom([historical, zero, current], [current]),
  });
  const oldLine = snapshot.lines.find((item) => item.model === "Old Stove");
  const zeroLine = snapshot.lines.find((item) => item.model === "Zero Stove");
  const newLine = snapshot.lines.find((item) => item.model === "New Stove");
  assert.equal(oldLine.current, false);
  assert.equal(oldLine.rows[0].efficiency, null);
  assert.equal(oldLine.rows[0].efficiency === 0, false);
  assert.equal(formatEfficiency(oldLine.rows[0].efficiency), "not listed by EPA");
  assert.equal(zeroLine.rows[0].efficiency, 0);
  assert.equal(formatEfficiency(zeroLine.rows[0].efficiency), "0 percent");
  assert.equal(newLine.current, true);
  assert.equal(newLine.fuelClass, "pellet");
  assert.equal(snapshot.counts.current.pellet, 1);
  assert.equal(snapshot.counts.previous.wood, 2);
  assert.equal(snapshot.files.find((file) => file.name === "rh_all.csv").rows, 3);
  assert.equal(snapshot.files.find((file) => file.name === "rh_inprod.csv").rows, 1);
});

test("a current row missing from the all-rows file is refused", () => {
  const onlyCurrent = roomRow({
    model: "Missing",
    manufacturer: "Maker",
    emission: "1",
    efficiency: 70,
    type: "Wood Stove",
    fuel: "Cord Wood",
  });
  assert.throws(
    () => parseSnapshot({ date: "2026-10-23", files: filesFrom([], [onlyCurrent]) }),
    /not in the all-rows file/,
  );
});

test("diff reports added lines, moves to previously listed, and disappeared lines", () => {
  const before = [
    line({ model: "Stays" }),
    line({ model: "Moves" }),
    line({ model: "Gone" }),
  ];
  const after = [
    line({ model: "Stays" }),
    line({ model: "Moves", current: false }),
    line({ model: "Fresh", type: "Pellet Stove", fuel: "Wood Pellets" }),
  ];
  const diff = diffModelLines(before, after);
  assert.deepEqual(diff.added.map((item) => item.model), ["Fresh"]);
  assert.equal(diff.added[0].fuelClass, "pellet");
  assert.equal(diff.added[0].emission, "1.2 g/hr");
  assert.deepEqual(diff.movedToPrevious.map((item) => item.model), ["Moves"]);
  assert.equal(diff.movedToPrevious[0].current, false);
  assert.deepEqual(diff.disappeared.map((item) => item.model), ["Gone"]);
  assert.equal(diff.newlyCurrent.length, 0);
  assert.equal(diff.fieldChanges.length, 0);
});

test("emission and efficiency changes keep blanks as not listed", () => {
  const unchanged = diffModelLines(
    [line({ current: false, efficiency: null, emission: 4 })],
    [line({ current: false, efficiency: null, emission: 4 })],
  );
  assert.equal(unchanged.fieldChanges.length, 0);

  const changed = diffModelLines(
    [line({ emission: 1.8, efficiency: null })],
    [line({ emission: 1.5, efficiency: 74 })],
  );
  assert.equal(changed.added.length, 0);
  assert.equal(changed.fieldChanges.length, 1);
  const fields = Object.fromEntries(changed.fieldChanges[0].changes.map((change) => [change.field, change]));
  assert.equal(fields.emission.before, "1.8 g/hr");
  assert.equal(fields.emission.after, "1.5 g/hr");
  assert.equal(fields.efficiency.before, "not listed by EPA");
  assert.equal(fields.efficiency.after, "74 percent");
  assert.equal(JSON.stringify(changed).includes("0 percent"), false);
});

test("a unique model match with a new manufacturer string is a field change", () => {
  const diff = diffModelLines(
    [line({ manufacturer: "Old Co", model: "Shared", emission: 1.8, efficiency: 70 })],
    [line({ manufacturer: "New Co", model: "Shared", emission: 1.5, efficiency: 70 })],
  );
  assert.equal(diff.added.length, 0);
  assert.equal(diff.disappeared.length, 0);
  const fields = Object.fromEntries(diff.fieldChanges[0].changes.map((change) => [change.field, change]));
  assert.equal(fields.manufacturer.before, "Old Co");
  assert.equal(fields.manufacturer.after, "New Co");
  assert.equal(fields.emission.before, "1.8 g/hr");
  assert.equal(fields.emission.after, "1.5 g/hr");
});

test("ambiguous manufacturer changes stay added and disappeared", () => {
  const diff = diffModelLines(
    [line({ manufacturer: "A", model: "Same" }), line({ manufacturer: "B", model: "Same" })],
    [line({ manufacturer: "C", model: "Same" })],
  );
  assert.equal(diff.fieldChanges.length, 0);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.disappeared.length, 2);
});

test("one snapshot does not invent an earlier comparison", () => {
  const historical = roomRow({
    model: "Old Stove",
    manufacturer: "Old Co",
    emission: "4",
    efficiency: null,
    type: "Wood Stove",
    fuel: "Cord Wood",
  });
  const current = roomRow({
    model: "New Stove",
    manufacturer: "New Co",
    emission: "1.1",
    efficiency: 74,
    type: "Wood Stove",
    fuel: "Cord Wood",
  });
  const snapshot = parseSnapshot({
    date: "2026-10-23",
    files: filesFrom([historical, current], [current]),
  });
  const report = buildReport([snapshot], []);
  assert.equal(report.firstSnapshot, true);
  assert.equal(report.comparable, false);
  assert.equal(report.intervals.length, 0);
  assert.equal(report.answer.length, 3);
  assert.equal(report.answer[0], "This is the first snapshot, 2026-10-23; no earlier snapshot to compare.");
  assert.match(report.answer[1], /1 model line as currently certified on 2026-10-23 \(1 wood and 0 pellet/);
  assert.match(report.answer[1], /1 model line as previously listed \(1 wood and 0 pellet\)/);
  assert.equal(report.answer.join(" ").includes("2026-01-01"), false);
  assert.throws(() => buildReport([snapshot, snapshot]), /duplicate snapshot date/);
});

test("two fixture snapshots describe the later diff without calling it the first snapshot", () => {
  const firstRows = [
    roomRow({ model: "Kept", manufacturer: "Maker", emission: "2", efficiency: 60, type: "Wood Stove", fuel: "Cord Wood" }),
    roomRow({ model: "Moved", manufacturer: "Maker", emission: "3", efficiency: 55, type: "Wood Stove", fuel: "Cord Wood" }),
  ];
  const secondRows = [
    roomRow({ model: "Kept", manufacturer: "Maker", emission: "2.4", efficiency: null, type: "Wood Stove", fuel: "Cord Wood" }),
    roomRow({ model: "Moved", manufacturer: "Maker", emission: "3", efficiency: 55, type: "Wood Stove", fuel: "Cord Wood" }),
    roomRow({ model: "Added", manufacturer: "Maker", emission: "1", efficiency: 80, type: "Pellet Stove", fuel: "Wood Pellets" }),
  ];
  const first = parseSnapshot({ date: "2026-10-23", files: filesFrom(firstRows, firstRows) });
  const second = parseSnapshot({ date: "2026-11-15", files: filesFrom(secondRows, [secondRows[0], secondRows[2]]) });
  const report = buildReport([second, first], []);
  assert.equal(report.comparable, true);
  assert.equal(report.firstSnapshot, false);
  assert.equal(report.intervals.length, 1);
  assert.equal(report.intervals[0].fromDate, "2026-10-23");
  assert.equal(report.intervals[0].toDate, "2026-11-15");
  assert.deepEqual(report.intervals[0].added.map((item) => item.model), ["Added"]);
  assert.deepEqual(report.intervals[0].movedToPrevious.map((item) => item.model), ["Moved"]);
  assert.equal(report.intervals[0].fieldChanges.length, 1);
  const efficiency = report.intervals[0].fieldChanges[0].changes.find((change) => change.field === "efficiency");
  assert.equal(efficiency.before, "60 percent");
  assert.equal(efficiency.after, "not listed by EPA");
  assert.equal(report.answer[0].startsWith("The latest snapshot is 2026-11-15."), true);
  assert.match(report.answer[1], /1 model line was added/);
  assert.match(report.answer[1], /1 moved from currently certified to previously listed/);
  assert.equal(report.answer.join(" ").includes("first snapshot"), false);
  assert.equal(report.intervals[0].editorial, null);
});

test("editorial diffs cover redirects, insert labels, and crosswalk strings", () => {
  const before = {
    redirects: [{ fromSlug: "old", toSlug: "hub", fromName: "Old", reason: "First reason." }],
    overrides: [
      { manufacturer: "Maker", model: "One", insert: true, note: "Paired code." },
      { manufacturer: "Maker", model: "Two", insert: false, note: "Roman numeral." },
    ],
    crosswalk: [{ slug: "hub", name: "Hub", role: "primary", manufacturers: "Maker" }],
  };
  const after = {
    redirects: [
      { fromSlug: "old", toSlug: "other", fromName: "Old", reason: "First reason." },
      { fromSlug: "new", toSlug: "hub", fromName: "New", reason: "Added merge." },
    ],
    overrides: [
      { manufacturer: "Maker", model: "One", insert: false, note: "Paired code." },
      { manufacturer: "Maker", model: "Three", insert: true, note: "New label." },
    ],
    crosswalk: [{ slug: "hub", name: "Hub", role: "primary", manufacturers: "Maker || Other" }],
  };
  const diff = diffEditorial(before, after);
  assert.equal(diff.redirects.added.length, 1);
  assert.equal(diff.redirects.added[0].fromSlug, "new");
  assert.equal(diff.redirects.changed[0].changes[0].before, "hub");
  assert.equal(diff.redirects.changed[0].changes[0].after, "other");
  assert.equal(diff.overrides.removed[0].model, "Two");
  assert.equal(diff.overrides.added[0].model, "Three");
  assert.equal(diff.overrides.changed[0].changes[0].before, "yes");
  assert.equal(diff.overrides.changed[0].changes[0].after, "no");
  assert.equal(diff.crosswalk.changed[0].changes[0].before, "Maker");
  assert.equal(diff.crosswalk.changed[0].changes[0].after, "Maker || Other");

  const same = diffEditorial(before, before);
  assert.equal(same.redirects.changed.length, 0);
  assert.equal(same.overrides.added.length, 0);
  assert.equal(same.crosswalk.changed.length, 0);
});

test("recorded hub merges come only from slugs in the history file", () => {
  const merges = recordedHubMerges(
    { "old-slug": "Old Name" },
    [
      { fromSlug: "old-slug", fromName: "Old Name", toSlug: "hub", toName: "Hub", reason: "Same company." },
      { fromSlug: "unknown", fromName: "Unknown", toSlug: "hub", toName: "Hub", reason: "No history." },
    ],
  );
  assert.equal(merges.length, 1);
  assert.equal(merges[0].fromSlug, "old-slug");
  assert.equal(merges[0].recordedName, "Old Name");
});

test("the committed EPA files are one snapshot and match stoves.json", () => {
  const snapshots = loadCommittedSnapshots(root);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].date, "2026-10-23");
  const rows = Object.fromEntries(snapshots[0].files.map((file) => [file.name, file.rows]));
  assert.deepEqual(rows, {
    "rh_all.csv": 1444,
    "rh_inprod.csv": 265,
    "wh_all.csv": 192,
    "wh_inprod.csv": 41,
  });

  const stoves = JSON.parse(readFileSync(join(root, "data/stoves.json"), "utf8"));
  const byKey = new Map(snapshots[0].lines.map((line) => [`${line.category}\0${line.manufacturer}\0${line.model}`, line]));
  assert.equal(byKey.size, stoves.length);
  assert.equal(snapshots[0].modelLines, 1602);
  for (const stove of stoves) {
    const line = byKey.get(`${stove.category}\0${stove.manufacturer}\0${stove.model}`);
    assert.ok(line, stove.id);
    assert.equal(line.current, stove.current);
    assert.equal(line.fuelClass, fuelClassOf(stove.type, stove.fuel));
    assert.equal(line.rows.length, stove.tests.length);
    const lineEmissions = line.rows.map((row) => row.emission).sort((left, right) => (left ?? 999) - (right ?? 999));
    const stoveEmissions = stove.tests.map((row) => row.emission).sort((left, right) => (left ?? 999) - (right ?? 999));
    assert.deepEqual(lineEmissions, stoveEmissions);
    const lineEfficiency = line.rows.map((row) => row.efficiency).sort((left, right) => (left ?? 999) - (right ?? 999));
    const stoveEfficiency = stove.tests.map((row) => row.efficiency).sort((left, right) => (left ?? 999) - (right ?? 999));
    assert.deepEqual(lineEfficiency, stoveEfficiency);
  }
  assert.deepEqual(snapshots[0].counts, {
    current: { wood: 177, pellet: 128 },
    previous: { wood: 1043, pellet: 254 },
  });
  const chips = snapshots[0].lines.find((line) => line.model === "Farrington 12");
  assert.equal(chips.fuel, "Wood Chips");
  assert.equal(chips.fuelClass, "wood");

  const report = loadChangelog(root);
  assert.equal(report.comparable, false);
  assert.equal(report.intervals.length, 0);
  assert.equal(report.answer.length, 3);
  assert.equal(report.answer[0], "This is the first snapshot, 2026-10-23; no earlier snapshot to compare.");
  assert.equal(
    report.answer[1],
    "EPA lists 305 model lines as currently certified on 2026-10-23 (177 wood and 128 pellet, room and central heaters together) and lists 1,297 model lines as previously listed (1,043 wood and 254 pellet).",
  );
  assert.match(report.answer[2], /snapshot 2026-10-23/);
  assert.match(report.answer[2], /rh_all\.csv/);
  assert.equal(report.merges.length, 10);
  assert.equal(report.merges.every((merge) => merge.recordedName === merge.fromName), true);
});
