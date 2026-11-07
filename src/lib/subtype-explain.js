import { NOT_LISTED_BY_EPA, technologyLabel } from "./compare-pairs.js";
import { formatNumber } from "./format.js";

export { NOT_LISTED_BY_EPA };

export const SUBTYPE_PAGE = "/catalytic-vs-non-catalytic/";

export const SUBTYPE_ORDER = ["Catalytic Stove", "Non-Catalytic Stove", "Hybrid"];

export const EPA_BURN_WISE_FAQ_URL = "https://www.epa.gov/burnwise/frequent-questions-about-wood-burning-appliances";

export const EPA_BURN_WISE_FAQ_LABEL = "EPA Burn Wise frequent questions about wood-burning appliances";

const BANNED_COPY = /\b(best|better|scores?|ratings?|safest|safer|popular|winners?|affiliate|sponsored|cleanest)\b/i;

export function listedNumber(value, digits) {
  if (value == null || Number.isNaN(Number(value))) return NOT_LISTED_BY_EPA;
  const text = formatNumber(value, digits);
  return text == null ? NOT_LISTED_BY_EPA : text;
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 0) return null;
  const mid = Math.floor(count / 2);
  if (count % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function metric(rows, key) {
  const values = [];
  for (const row of rows) {
    const value = row[key];
    if (value == null || Number.isNaN(Number(value))) continue;
    values.push(Number(value));
  }
  return {
    n: values.length,
    median: median(values),
    low: values.length ? Math.min(...values) : null,
    high: values.length ? Math.max(...values) : null,
  };
}

function makeBlock(subtype, rows) {
  const emission = metric(rows, "emission");
  const efficiency = metric(rows, "efficiency");
  let woodRows = 0;
  let pelletRows = 0;
  for (const row of rows) {
    if (row.type === "Wood Stove") woodRows += 1;
    else if (row.type === "Pellet Stove") pelletRows += 1;
  }
  return {
    subtype,
    label: technologyLabel(subtype),
    rows: rows.length,
    woodRows,
    pelletRows,
    otherTypeRows: rows.length - woodRows - pelletRows,
    emissionN: emission.n,
    emissionMedian: emission.median,
    emissionLow: emission.low,
    emissionHigh: emission.high,
    efficiencyN: efficiency.n,
    efficiencyMedian: efficiency.median,
    efficiencyLow: efficiency.low,
    efficiencyHigh: efficiency.high,
  };
}

function blocksFor(tests) {
  const groups = new Map();
  for (const test of tests) {
    const key = test.subtype || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(test);
  }
  const extras = [...groups.keys()]
    .filter((key) => !SUBTYPE_ORDER.includes(key))
    .sort((a, b) => {
      if (a === "") return 1;
      if (b === "") return -1;
      return a.localeCompare(b);
    });
  return [...SUBTYPE_ORDER, ...extras].map((key) => makeBlock(key, groups.get(key) || []));
}

export function findBlock(blocks, subtype) {
  const found = blocks.find((block) => block.subtype === subtype);
  if (!found) throw new Error(`missing subtype block ${subtype}`);
  return found;
}

export function subtypeReport(stoves) {
  const roomTests = stoves.filter((stove) => stove.category === "room").flatMap((stove) => stove.tests);
  const current = roomTests.filter((test) => test.current);
  return {
    currentRows: current.length,
    all: blocksFor(current),
    wood: blocksFor(current.filter((test) => test.type === "Wood Stove")),
    pellet: blocksFor(current.filter((test) => test.type === "Pellet Stove")),
    blankCurrentRows: current.filter((test) => !test.subtype).length,
    blankAllRows: roomTests.filter((test) => !test.subtype).length,
  };
}

function ratePhrase(block) {
  if (block.emissionMedian == null) return NOT_LISTED_BY_EPA;
  const number = `${listedNumber(block.emissionMedian, 3)} grams per hour`;
  if (block.emissionN !== block.rows) return `${number} across the ${block.emissionN} rows that list one`;
  return number;
}

function efficiencyPhrase(block) {
  if (block.efficiencyMedian == null) return NOT_LISTED_BY_EPA;
  const number = `${listedNumber(block.efficiencyMedian, 2)} percent`;
  if (block.efficiencyN !== block.rows) return `${number} across the ${block.efficiencyN} rows that list one`;
  return number;
}

function extraClause(report) {
  const extra = report.all.filter((block) => !SUBTYPE_ORDER.includes(block.subtype) && block.rows > 0);
  if (!extra.length) return "";
  const bits = extra.map((block) => (
    block.subtype
      ? `${block.rows} with subtype ${block.subtype}`
      : `${block.rows} with the subtype ${NOT_LISTED_BY_EPA}`
  ));
  return ` Other currently certified room-heater rows: ${bits.join(", ")}.`;
}

export function subtypeAnswer(report, snapshotDate) {
  const cat = findBlock(report.all, "Catalytic Stove");
  const non = findBlock(report.all, "Non-Catalytic Stove");
  const hybrid = findBlock(report.all, "Hybrid");
  const full = [cat, non, hybrid].every((block) => (
    block.rows > 0
    && block.emissionN === block.rows
    && block.efficiencyN === block.rows
  ));
  const efficiency = `The median HHV efficiency is ${efficiencyPhrase(cat)} for the catalytic rows, ${efficiencyPhrase(non)} for the non-catalytic rows, and ${efficiencyPhrase(hybrid)} for the hybrid rows.`;
  return [
    `EPA lists ${cat.rows} currently certified room-heater rows with the subtype Catalytic Stove, ${non.rows} with Non-Catalytic Stove, and ${hybrid.rows} with Hybrid in the snapshot dated ${snapshotDate}.${extraClause(report)}`,
    `The median emission rate is ${ratePhrase(cat)} for the catalytic rows, ${ratePhrase(non)} for the non-catalytic rows, and ${ratePhrase(hybrid)} for the hybrid rows.`,
    full
      ? `${efficiency} Each of those medians uses every row in that subtype.`
      : efficiency,
    `Source: EPA Certified Wood Heater Database, snapshot ${snapshotDate}.`,
  ];
}

function blankSentence(report) {
  const current = report.blankCurrentRows;
  const all = report.blankAllRows;
  if (current === 0 && all === 0) {
    return "No room-heater row in this snapshot leaves the subtype blank.";
  }
  if (current === 0) {
    const noun = all === 1 ? "row leaves" : "rows leave";
    return `No currently certified room-heater row leaves the subtype blank. ${all} room-heater ${noun} it blank in the full snapshot, counting previously certified models.`;
  }
  const noun = current === 1 ? "row leaves" : "rows leave";
  return `${current} currently certified room-heater ${noun} the subtype blank.`;
}

export function labelParagraph(report, snapshotDate) {
  const used = report.all.filter((block) => block.rows > 0 && block.subtype);
  const names = used.map((block) => block.subtype).join(", ");
  return `Catalytic, non-catalytic, and hybrid, on this page, mean the EPA subtype cell. In the snapshot dated ${snapshotDate}, currently certified room-heater rows that fill the cell use these strings: ${names}. ${blankSentence(report)} A blank is ${NOT_LISTED_BY_EPA}, and it is not zero.`;
}

export function technologyCopy() {
  return {
    before: "EPA's Burn Wise program stopped updating on October 30, 2025. EPA keeps that material as a historic record. The page ",
    linkLabel: EPA_BURN_WISE_FAQ_LABEL,
    href: EPA_BURN_WISE_FAQ_URL,
    after: " says certified appliances typically use a catalyst, secondary combustion, or a combination of the two, which that page calls hybrid. It describes a catalytic combustor as a coated honeycomb the smoke passes through. It describes a non-catalytic stove as using firebox insulation, a baffle, and pre-heated combustion air instead of a catalyst. It describes a hybrid unit as having both a catalyst and secondary combustion. Those sentences are EPA's description of the technologies. They are not medians from this snapshot. The tables on this page do not copy the efficiency averages printed on that page.",
  };
}

export function catalyticHybridCopy() {
  return {
    before: "Catalytic-hybrid is not a subtype string in this snapshot. The live field says Hybrid. EPA's March 15, 2013 List of EPA Certified Wood Stoves, reviewed on the ",
    linkLabel: "methodology page",
    href: "/methodology/#certified-wood-2013",
    after: ", prints a Type column. That review records the printed values as catalytic, non-catalytic, pellet, or catalytic-hybrid, and six rows with the cell blank. This site does not copy a 2013 Type word onto a current row, and it does not rename a Hybrid row to catalytic-hybrid. The 2013 list is not used for the medians on this page.",
  };
}

export function roomTableLead(report) {
  return `The room-heater table uses every currently certified room-heater row, ${report.currentRows} in this snapshot. Wood stoves and pellet stoves are both room heaters, so a subtype median can mix those two EPA types. The wood-stove table and the pellet-stove table separate them. Central heaters are left out. They use a different emission unit.`;
}

export function woodTableLead() {
  return "The wood-stove table keeps pellet rows out. Its medians are the same rows as the catalytic, non-catalytic, and hybrid wood-stove lists.";
}

export function pelletTableLead() {
  return "The pellet-stove table is the EPA type Pellet Stove, split by the same subtype cell. A subtype with zero pellet rows has medians that are not listed by EPA.";
}

function exampleFrom(stove) {
  return {
    model: stove.model,
    url: stove.url,
    manufacturer: stove.manufacturer || NOT_LISTED_BY_EPA,
    brandUrl: stove.primarySlug ? `/brands/${stove.primarySlug}/` : null,
    type: stove.type || NOT_LISTED_BY_EPA,
    subtype: stove.subtype || "",
    subtypeLabel: technologyLabel(stove.subtype),
  };
}

export function subtypeNameMismatches(stoves) {
  return stoves
    .filter((stove) => (
      stove.category === "room"
      && stove.current
      && /hybrid/i.test(stove.model)
      && stove.subtype !== "Hybrid"
    ))
    .map(exampleFrom)
    .sort((a, b) => a.model.localeCompare(b.model) || a.url.localeCompare(b.url));
}

export function subtypeMixedLines(stoves) {
  return stoves
    .filter((stove) => {
      if (stove.category !== "room") return false;
      const labels = new Set(stove.tests.map((test) => test.subtype || ""));
      return labels.size > 1;
    })
    .map((stove) => ({
      ...exampleFrom(stove),
      tests: [...stove.tests]
        .sort((a, b) => Number(b.current) - Number(a.current) || technologyLabel(a.subtype).localeCompare(technologyLabel(b.subtype)))
        .map((test) => ({
          current: Boolean(test.current),
          subtype: test.subtype || "",
          subtypeLabel: technologyLabel(test.subtype),
        })),
    }))
    .sort((a, b) => a.model.localeCompare(b.model) || a.url.localeCompare(b.url));
}

export function mixedSubtypeText(lines) {
  if (!lines.length) {
    return "No room-heater model line in this snapshot has test rows with different subtypes.";
  }
  return lines.map((line) => {
    const bits = line.tests.map((test) => {
      const status = test.current ? "currently certified" : "previously certified";
      return `the ${status} row is ${test.subtypeLabel}`;
    });
    const listed = bits.length === 2 ? `${bits[0]}, and ${bits[1]}` : bits.join(", ");
    return `${line.model} has rows with different subtypes: ${listed}.`;
  }).join(" ");
}

function joinList(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function rowNoun(count) {
  return count === 1 ? "row" : "rows";
}

function splitSentence(block, name) {
  const parts = [
    `${block.woodRows} wood-stove ${rowNoun(block.woodRows)}`,
    `${block.pelletRows} pellet-stove ${rowNoun(block.pelletRows)}`,
  ];
  if (block.otherTypeRows) {
    parts.push(`${block.otherTypeRows} ${rowNoun(block.otherTypeRows)} with another EPA type`);
  }
  return `${name}: ${block.rows} ${rowNoun(block.rows)}, of which ${joinList(parts)}.`;
}

export function subtypeFaqs(report, mismatches, mixedLines, snapshotDate) {
  const cat = findBlock(report.all, "Catalytic Stove");
  const non = findBlock(report.all, "Non-Catalytic Stove");
  const hybrid = findBlock(report.all, "Hybrid");
  const tech = technologyCopy();
  const older = catalyticHybridCopy();
  const mismatchAnswer = mismatches.length
    ? `No. The word hybrid in the model cell is not the subtype. In the snapshot dated ${snapshotDate}, ${mismatches.length} currently certified room-heater ${mismatches.length === 1 ? "model line has" : "model lines have"} hybrid in the model cell and a subtype other than Hybrid: ${mismatches.map((item) => `${item.model} (${item.subtypeLabel})`).join("; ")}.`
    : `In the snapshot dated ${snapshotDate}, no currently certified room-heater model line has hybrid in the model cell and a subtype other than Hybrid. The subtype cell is still a separate field from the model name.`;
  return [
    {
      question: "What is the difference between catalytic, non-catalytic, and hybrid in this snapshot?",
      answer: `The difference this site reports is the EPA subtype cell. Currently certified room-heater rows in the snapshot dated ${snapshotDate} include ${cat.rows} labeled Catalytic Stove, ${non.rows} labeled Non-Catalytic Stove, and ${hybrid.rows} labeled Hybrid. ${tech.before}${tech.linkLabel}${tech.after}`,
    },
    {
      question: "What does catalytic-hybrid mean here?",
      answer: `${older.before}${older.linkLabel}${older.after} Hybrid is the subtype on ${hybrid.rows} currently certified room-heater rows in the snapshot dated ${snapshotDate}.`,
    },
    {
      question: "Do these subtype medians include pellet stoves?",
      answer: `The room-heater medians include every currently certified room-heater row with that subtype in the snapshot dated ${snapshotDate}. ${splitSentence(cat, "Catalytic")} ${splitSentence(non, "Non-catalytic")} ${splitSentence(hybrid, "Hybrid")} The wood-stove table and the pellet-stove table on this page separate those EPA types. A wood-stove list does not include the pellet rows.`,
    },
    {
      question: "Is a blank emission, efficiency, or subtype a zero?",
      answer: `No. A blank cell is ${NOT_LISTED_BY_EPA}. This page prints that phrase and does not treat the blank as zero. A listed zero stays zero. ${blankSentence(report)} Snapshot ${snapshotDate}.`,
    },
    {
      question: "Does hybrid in the model name mean the subtype is Hybrid?",
      answer: `${mismatchAnswer} ${mixedSubtypeText(mixedLines)} Each test row is counted under the subtype printed on that row.`,
    },
  ];
}

export function subtypeDataNotes() {
  return [
    "A median is the middle listed value. An even number of listed values uses the average of the two middle ones.",
    "The lowest and highest columns are the smallest and largest figures EPA listed on those rows. They are not a ranking of model lines.",
    "A blank emission, efficiency, or subtype cell is not listed by EPA. It is not zero. A listed zero stays zero.",
    "Medians count EPA test rows. A model line with two rows is counted twice, once under each row's subtype.",
    "Wood-stove medians on this page use the same currently certified wood-stove rows as the catalytic, non-catalytic, and hybrid lists.",
    "The Burn Wise frequent-questions page describes the technologies. This page does not copy that page's efficiency averages into the tables.",
    "The March 15, 2013 list is not a source for these medians.",
  ];
}

export function assertSubtypeCopy(text) {
  if (BANNED_COPY.test(text)) {
    throw new Error(`subtype copy contains a banned word: ${text.match(BANNED_COPY)[0]}`);
  }
  if (text.includes("cfpub.epa.gov")) throw new Error("subtype copy names the EPA application host");
  if (/\b(Product|Review|AggregateRating)\b/.test(text)) throw new Error("subtype copy names a banned structured-data type");
}
