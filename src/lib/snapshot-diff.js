import { formatCount, formatNumber } from "./format.js";

export const NOT_LISTED = "not listed by EPA";

export const SNAPSHOT_FILE_SPECS = [
  {
    name: "rh_all.csv",
    kind: "room",
    scope: "all",
    label: "Room heaters, including previously listed models",
  },
  {
    name: "rh_inprod.csv",
    kind: "room",
    scope: "current",
    label: "Room heaters listed as currently certified",
  },
  {
    name: "wh_all.csv",
    kind: "central",
    scope: "all",
    label: "Central heaters, including previously listed models",
  },
  {
    name: "wh_inprod.csv",
    kind: "central",
    scope: "current",
    label: "Central heaters listed as currently certified",
  },
];

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

const CENTRAL_FIELDS = [
  "New",
  "Model",
  "Manufacturer",
  "Firebox Volume (Cubic Feet)",
  "Emission Rate Annual Avg (lb/mmBTU)",
  "Heat Output Maximum (BTUs)",
  "Heat Output (Upper)",
  "Heat Output (Lower)",
  "Overall Efficiency-HHV (%)",
  "Type",
  "Subtype",
  "Certified Fuel Type",
  "CO (g/min)",
  "Thermal Storage",
  "NSPS Compliance 2020",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseCsv(text) {
  const source = String(text).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      cell = "";
      if (!(row.length === 1 && row[0] === "")) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
  }
  return rows;
}

export function csvRecords(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("CSV has no header");
  const header = rows[0].map((name) => name.trim());
  return rows.slice(1).map((cells) => {
    const record = {};
    for (let i = 0; i < header.length; i += 1) record[header[i]] = cells[i] ?? "";
    return record;
  });
}

export function parseEpaNumber(value) {
  const text = String(value ?? "").trim();
  if (!text || /^(not applicable|n\/a|na)$/i.test(text)) return null;
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    throw new Error(`cannot parse number ${JSON.stringify(text)}`);
  }
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error(`cannot parse number ${JSON.stringify(text)}`);
  return number;
}

export function formatEfficiency(value) {
  if (value == null || value === "") return NOT_LISTED;
  const number = formatNumber(value, 2);
  if (number == null) return NOT_LISTED;
  return `${number} percent`;
}

export function formatEmission(value, unit) {
  if (value == null || value === "") return NOT_LISTED;
  const number = formatNumber(value, 3);
  if (number == null) return NOT_LISTED;
  if (unit === "g/hr" || unit === "lb/mmBTU") return `${number} ${unit}`;
  return unit ? `${number} ${unit}` : number;
}

export function fuelClassOf(type, fuel) {
  if (/pellet/i.test(type || "") || /pellet/i.test(fuel || "")) return "pellet";
  return "wood";
}

export function countModelLines(lines) {
  const counts = {
    current: { wood: 0, pellet: 0 },
    previous: { wood: 0, pellet: 0 },
  };
  for (const line of lines) {
    const status = line.current ? "current" : "previous";
    counts[status][line.fuelClass] += 1;
  }
  return counts;
}

function requireColumns(records, fields, fileName) {
  if (!records.length) return;
  const missing = fields.filter((field) => !Object.hasOwn(records[0], field));
  if (missing.length) throw new Error(`${fileName} is missing columns: ${missing.join(", ")}`);
}

function signature(row, fields) {
  return fields.map((field) => String(row[field] ?? "").trim()).join("\0");
}

function choosePrimary(rows) {
  const current = rows.filter((row) => row.current);
  const pool = current.length ? current : rows;
  return [...pool].sort((left, right) => {
    if ((left.emission == null) !== (right.emission == null)) return left.emission == null ? 1 : -1;
    if (left.emission != null && right.emission != null && left.emission !== right.emission) return left.emission - right.emission;
    if ((left.efficiency == null) !== (right.efficiency == null)) return left.efficiency == null ? 1 : -1;
    return 0;
  })[0];
}

function buildLines(category, allRows, currentRows, fields, emissionField, emissionUnit) {
  requireColumns(allRows, fields, category);
  requireColumns(currentRows, fields, category);
  const currentCounts = new Map();
  for (const row of currentRows) {
    const key = signature(row, fields);
    currentCounts.set(key, (currentCounts.get(key) || 0) + 1);
  }
  const available = new Map();
  for (const row of allRows) {
    const key = signature(row, fields);
    available.set(key, (available.get(key) || 0) + 1);
  }
  for (const [key, count] of currentCounts) {
    if ((available.get(key) || 0) < count) {
      throw new Error(`${category} current row is not in the all-rows file`);
    }
  }

  const seenCurrent = new Map();
  const grouped = new Map();
  const order = [];
  for (const row of allRows) {
    const key = signature(row, fields);
    const used = seenCurrent.get(key) || 0;
    const isCurrent = used < (currentCounts.get(key) || 0);
    if (isCurrent) seenCurrent.set(key, used + 1);
    const manufacturer = String(row.Manufacturer ?? "").trim();
    const model = String(row.Model ?? "").trim();
    const groupKey = `${manufacturer}\0${model}`;
    if (!grouped.has(groupKey)) order.push(groupKey);
    const bucket = grouped.get(groupKey) || [];
    bucket.push({
      emission: parseEpaNumber(row[emissionField]),
      efficiency: parseEpaNumber(row["Overall Efficiency-HHV (%)"]),
      emissionUnit,
      current: isCurrent,
      type: String(row.Type ?? "").trim(),
      fuel: String(row["Certified Fuel Type"] ?? "").trim(),
    });
    grouped.set(groupKey, bucket);
  }

  const lines = [];
  for (const groupKey of order) {
    const rows = grouped.get(groupKey);
    const [manufacturer, model] = groupKey.split("\0");
    const primary = choosePrimary(rows);
    lines.push({
      category,
      manufacturer,
      model,
      type: primary.type,
      fuel: primary.fuel,
      fuelClass: fuelClassOf(primary.type, primary.fuel),
      current: rows.some((row) => row.current),
      rows,
      url: "",
    });
  }
  return lines;
}

export function parseSnapshot({ date, files }) {
  if (!DATE_RE.test(date)) throw new Error(`bad snapshot date ${date}`);
  const missing = SNAPSHOT_FILE_SPECS.filter((spec) => typeof files[spec.name] !== "string");
  if (missing.length) throw new Error(`snapshot ${date} is missing ${missing.map((spec) => spec.name).join(", ")}`);

  const texts = Object.fromEntries(SNAPSHOT_FILE_SPECS.map((spec) => [spec.name, csvRecords(files[spec.name])]));
  const room = buildLines(
    "room",
    texts["rh_all.csv"],
    texts["rh_inprod.csv"],
    ROOM_FIELDS,
    "Emission Rate (grams/hr)",
    "g/hr",
  );
  const central = buildLines(
    "central",
    texts["wh_all.csv"],
    texts["wh_inprod.csv"],
    CENTRAL_FIELDS,
    "Emission Rate Annual Avg (lb/mmBTU)",
    "lb/mmBTU",
  );
  const lines = [...room, ...central];
  return {
    date,
    files: SNAPSHOT_FILE_SPECS.map((spec) => ({
      name: spec.name,
      rows: texts[spec.name].length,
      label: spec.label,
    })),
    lines,
    counts: countModelLines(lines),
    modelLines: lines.length,
    editorial: null,
  };
}

function lineKey(line) {
  return `${line.category}\0${line.manufacturer}\0${line.model}`;
}

function mapByKey(lines) {
  const map = new Map();
  for (const line of lines) {
    const key = lineKey(line);
    if (map.has(key)) throw new Error(`duplicate model line ${line.category} / ${line.manufacturer} / ${line.model}`);
    map.set(key, line);
  }
  return map;
}

function compareMetricRows(left, right) {
  if ((left.emission == null) !== (right.emission == null)) return left.emission == null ? 1 : -1;
  if (left.emission != null && right.emission != null && left.emission !== right.emission) return left.emission - right.emission;
  if ((left.efficiency == null) !== (right.efficiency == null)) return left.efficiency == null ? 1 : -1;
  if (left.efficiency != null && right.efficiency != null && left.efficiency !== right.efficiency) return left.efficiency - right.efficiency;
  return String(left.emissionUnit).localeCompare(String(right.emissionUnit));
}

function metricSignature(line, kind) {
  return [...line.rows]
    .map((row) => (kind === "emission" ? `${row.emissionUnit}\0${row.emission ?? ""}` : `${row.efficiency ?? ""}`))
    .sort()
    .join("|");
}

function formatAll(line, kind) {
  return [...line.rows]
    .sort(compareMetricRows)
    .map((row) => (kind === "emission" ? formatEmission(row.emission, row.emissionUnit) : formatEfficiency(row.efficiency)))
    .join("; ");
}

function fieldDiff(before, after) {
  const changes = [];
  if (metricSignature(before, "emission") !== metricSignature(after, "emission")) {
    changes.push({
      field: "emission",
      label: "Emission",
      before: formatAll(before, "emission"),
      after: formatAll(after, "emission"),
    });
  }
  if (metricSignature(before, "efficiency") !== metricSignature(after, "efficiency")) {
    changes.push({
      field: "efficiency",
      label: "HHV efficiency",
      before: formatAll(before, "efficiency"),
      after: formatAll(after, "efficiency"),
    });
  }
  if (before.manufacturer !== after.manufacturer) {
    changes.push({
      field: "manufacturer",
      label: "Manufacturer",
      before: before.manufacturer.trim() || NOT_LISTED,
      after: after.manufacturer.trim() || NOT_LISTED,
    });
  }
  return changes;
}

function presentLine(line) {
  const primary = choosePrimary(line.rows);
  return {
    category: line.category,
    manufacturer: line.manufacturer,
    model: line.model,
    fuelClass: line.fuelClass,
    current: line.current,
    url: line.url || "",
    emission: formatEmission(primary.emission, primary.emissionUnit),
    efficiency: formatEfficiency(primary.efficiency),
  };
}

function byName(left, right) {
  return (
    left.manufacturer.localeCompare(right.manufacturer) ||
    left.model.localeCompare(right.model) ||
    left.category.localeCompare(right.category)
  );
}

function pairManufacturerChanges(unmatchedBefore, unmatchedAfter) {
  const groups = new Map();
  function groupFor(line) {
    const key = `${line.category}\0${line.model}`;
    const group = groups.get(key) || { before: [], after: [] };
    groups.set(key, group);
    return group;
  }
  for (const line of unmatchedBefore) groupFor(line).before.push(line);
  for (const line of unmatchedAfter) groupFor(line).after.push(line);
  const paired = [];
  const stillBefore = [];
  const stillAfter = [];
  for (const group of groups.values()) {
    if (group.before.length === 1 && group.after.length === 1 && group.before[0].manufacturer !== group.after[0].manufacturer) {
      paired.push([group.before[0], group.after[0]]);
    } else {
      stillBefore.push(...group.before);
      stillAfter.push(...group.after);
    }
  }
  return { paired, stillBefore, stillAfter };
}

export function diffModelLines(beforeLines, afterLines) {
  const beforeMap = mapByKey(beforeLines);
  const afterMap = mapByKey(afterLines);
  const newlyCurrent = [];
  const movedToPrevious = [];
  const fieldChanges = [];
  const unmatchedBefore = [];
  const unmatchedAfter = [];

  function recordStatus(before, after) {
    if (!before.current && after.current) newlyCurrent.push(presentLine(after));
    if (before.current && !after.current) movedToPrevious.push(presentLine(after));
    const changes = fieldDiff(before, after);
    if (changes.length) {
      fieldChanges.push({
        ...presentLine(after),
        previousManufacturer: before.manufacturer,
        changes,
      });
    }
  }

  for (const [key, after] of afterMap) {
    const before = beforeMap.get(key);
    if (!before) unmatchedAfter.push(after);
    else recordStatus(before, after);
  }
  for (const [key, before] of beforeMap) {
    if (!afterMap.has(key)) unmatchedBefore.push(before);
  }

  const { paired, stillBefore, stillAfter } = pairManufacturerChanges(unmatchedBefore, unmatchedAfter);
  for (const [before, after] of paired) recordStatus(before, after);

  const added = stillAfter.map(presentLine);
  const disappeared = stillBefore.map(presentLine);
  for (const list of [added, newlyCurrent, movedToPrevious, disappeared, fieldChanges]) list.sort(byName);
  return { added, newlyCurrent, movedToPrevious, disappeared, fieldChanges };
}

function listPhrase(count, singular, plural) {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}

function formatFileList(files) {
  const names = files.map((file) => file.name);
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function baselineSentence(snapshot) {
  const currentTotal = snapshot.counts.current.wood + snapshot.counts.current.pellet;
  const previousTotal = snapshot.counts.previous.wood + snapshot.counts.previous.pellet;
  return `EPA lists ${listPhrase(currentTotal, "model line", "model lines")} as currently certified on ${snapshot.date} (${formatCount(snapshot.counts.current.wood)} wood and ${formatCount(snapshot.counts.current.pellet)} pellet, room and central heaters together) and lists ${listPhrase(previousTotal, "model line", "model lines")} as previously listed (${formatCount(snapshot.counts.previous.wood)} wood and ${formatCount(snapshot.counts.previous.pellet)} pellet).`;
}

export function buildAnswer(snapshots) {
  if (!snapshots.length) return ["No EPA snapshot is committed in this repository."];
  const latest = snapshots[snapshots.length - 1];
  if (snapshots.length === 1) {
    return [
      `This is the first snapshot, ${latest.date}; no earlier snapshot to compare.`,
      baselineSentence(latest),
      `Source: EPA Certified Wood Heater Database, snapshot ${latest.date}. Committed files: ${formatFileList(latest.files)}.`,
    ];
  }
  const prior = snapshots[snapshots.length - 2];
  const diff = diffModelLines(prior.lines, latest.lines);
  const currentTotal = latest.counts.current.wood + latest.counts.current.pellet;
  const extra = [];
  if (diff.disappeared.length) {
    extra.push(`${listPhrase(diff.disappeared.length, "is", "are")} no longer in the export`);
  }
  if (diff.newlyCurrent.length) {
    extra.push(`${listPhrase(diff.newlyCurrent.length, "is", "are")} newly listed as currently certified`);
  }
  const tail = extra.length ? `, and ${extra.join(", and ")}` : "";
  return [
    `The latest snapshot is ${latest.date}. EPA lists ${listPhrase(currentTotal, "model line", "model lines")} as currently certified on ${latest.date} (${formatCount(latest.counts.current.wood)} wood and ${formatCount(latest.counts.current.pellet)} pellet, room and central heaters together).`,
    `Compared with ${prior.date}, ${listPhrase(diff.added.length, "model line was", "model lines were")} added, ${formatCount(diff.movedToPrevious.length)} moved from currently certified to previously listed, and ${listPhrase(diff.fieldChanges.length, "has", "have")} a changed emission, efficiency, or manufacturer string${tail}.`,
    `Source: EPA Certified Wood Heater Database, snapshots ${prior.date} and ${latest.date}.`,
  ];
}

function requireFields(row, fields, label) {
  const missing = fields.filter((field) => !Object.hasOwn(row, field));
  if (missing.length) throw new Error(`${label} is missing columns: ${missing.join(", ")}`);
}

export function parseRedirects(text) {
  return csvRecords(text).map((row) => {
    requireFields(row, ["from_slug", "to_slug", "from_name", "reason"], "brand-redirects.csv");
    return {
      fromSlug: row.from_slug.trim(),
      toSlug: row.to_slug.trim(),
      fromName: row.from_name.trim(),
      reason: row.reason.trim(),
    };
  }).filter((row) => row.fromSlug);
}

export function parseOverrides(text) {
  return csvRecords(text).map((row) => {
    requireFields(row, ["manufacturer", "model", "insert", "note"], "insert-overrides.csv");
    const flag = row.insert.trim().toLowerCase();
    if (flag !== "yes" && flag !== "no") throw new Error(`insert override must be yes or no: ${row.model}`);
    return {
      manufacturer: row.manufacturer.trim(),
      model: row.model.trim(),
      insert: flag === "yes",
      note: row.note.trim(),
    };
  }).filter((row) => row.manufacturer || row.model);
}

export function parseCrosswalk(text) {
  return csvRecords(text).map((row) => {
    requireFields(row, ["brand", "brand_slug", "role", "manufacturer_strings"], "brand-crosswalk.csv");
    return {
      slug: row.brand_slug.trim(),
      name: row.brand.trim(),
      role: row.role.trim(),
      manufacturers: row.manufacturer_strings.trim(),
    };
  }).filter((row) => row.slug);
}

function diffKeyed(before, after, keyFn, fields) {
  const oldMap = new Map(before.map((item) => [keyFn(item), item]));
  const newMap = new Map(after.map((item) => [keyFn(item), item]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [key, item] of newMap) {
    const prior = oldMap.get(key);
    if (!prior) added.push(item);
    else {
      const changes = fields
        .filter((field) => prior[field.key] !== item[field.key])
        .map((field) => ({
          field: field.label,
          before: field.format(prior[field.key]),
          after: field.format(item[field.key]),
        }));
      if (changes.length) changed.push({ before: prior, after: item, changes });
    }
  }
  for (const [key, item] of oldMap) {
    if (!newMap.has(key)) removed.push(item);
  }
  return { added, removed, changed };
}

function formatInsertFlag(value) {
  return value ? "yes" : "no";
}

export function diffEditorial(before, after) {
  return {
    redirects: diffKeyed(before.redirects || [], after.redirects || [], (row) => row.fromSlug, [
      { key: "toSlug", label: "Redirect target", format: (value) => value },
      { key: "fromName", label: "Earlier hub name", format: (value) => value },
      { key: "reason", label: "Reason", format: (value) => value },
    ]),
    overrides: diffKeyed(
      before.overrides || [],
      after.overrides || [],
      (row) => `${row.manufacturer}\0${row.model}`,
      [
        { key: "insert", label: "Reviewed insert label", format: formatInsertFlag },
        { key: "note", label: "Note", format: (value) => value },
      ],
    ),
    crosswalk: diffKeyed(before.crosswalk || [], after.crosswalk || [], (row) => row.slug, [
      { key: "name", label: "Brand name", format: (value) => value },
      { key: "role", label: "Role", format: (value) => value },
      { key: "manufacturers", label: "Manufacturer strings", format: (value) => value || NOT_LISTED },
    ]),
  };
}

export function editorialHasChanges(diff) {
  if (!diff) return false;
  return ["redirects", "overrides", "crosswalk"].some(
    (key) => diff[key].added.length || diff[key].removed.length || diff[key].changed.length,
  );
}

export function recordedHubMerges(historySlugs, redirects) {
  const merges = [];
  for (const redirect of redirects) {
    if (!Object.hasOwn(historySlugs, redirect.fromSlug)) continue;
    merges.push({
      fromSlug: redirect.fromSlug,
      fromName: redirect.fromName,
      recordedName: historySlugs[redirect.fromSlug],
      toSlug: redirect.toSlug,
      toName: redirect.toName,
      reason: redirect.reason,
    });
  }
  merges.sort((left, right) => left.fromName.localeCompare(right.fromName) || left.fromSlug.localeCompare(right.fromSlug));
  return merges;
}

function summarize(snapshot) {
  return {
    date: snapshot.date,
    files: snapshot.files,
    counts: snapshot.counts,
    modelLines: snapshot.modelLines,
  };
}

export function buildReport(snapshots, merges = []) {
  const ordered = [...snapshots].sort((left, right) => left.date.localeCompare(right.date));
  const seen = new Set();
  for (const snapshot of ordered) {
    if (seen.has(snapshot.date)) throw new Error(`duplicate snapshot date ${snapshot.date}`);
    seen.add(snapshot.date);
  }
  const intervals = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const before = ordered[index - 1];
    const after = ordered[index];
    intervals.push({
      fromDate: before.date,
      toDate: after.date,
      ...diffModelLines(before.lines, after.lines),
      editorial: before.editorial && after.editorial ? diffEditorial(before.editorial, after.editorial) : null,
    });
  }
  return {
    snapshots: ordered.map(summarize),
    comparable: ordered.length >= 2,
    firstSnapshot: ordered.length === 1,
    answer: buildAnswer(ordered),
    intervals,
    merges,
  };
}
