// 2020 NSPS (Step 2) explainer. Limits and dates are the cited EPA and eCFR
// sentences. Row counts are computed from the committed stove snapshot.

import { NOT_LISTED_BY_EPA, technologyLabel } from "./compare-pairs.js";
import { emissionText, formatCount, kindLabel } from "./format.js";

export { NOT_LISTED_BY_EPA };

export const NSPS_PAGE = "/certified-before-2020/";

export const NSPS_COLUMN = "NSPS Compliance 2020";

export const TYPE_ORDER = ["Wood Stove", "Pellet Stove"];

export const SUBTYPE_ORDER = ["Catalytic Stove", "Non-Catalytic Stove", "Hybrid"];

export const BLANK_COLUMN = "Not listed by EPA";

const BANNED_COPY = /\b(best|top-rated|recommend\w*|scores?|ratings?|safest|safer|popular|winners?|affiliate|sponsored|cleanest|better)\b/i;

export const NSPS_SOURCES = [
  {
    href: "https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-60/subpart-AAA/section-60.532",
    label: "40 CFR 60.532, standards and compliance dates",
    retrieved: "2026-11-13",
  },
  {
    href: "https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-60/subpart-AAA/section-60.530",
    label: "40 CFR 60.530, applicability",
    retrieved: "2026-11-13",
  },
  {
    href: "https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-60/subpart-AAA/section-60.531",
    label: "40 CFR 60.531, definitions",
    retrieved: "2026-11-13",
  },
  {
    href: "https://www.epa.gov/stationary-sources-air-pollution/final-amendments-new-source-performance-standards-residential-wood",
    label: "EPA: final amendments to the residential wood heater NSPS",
    retrieved: "2026-11-13",
  },
  {
    href: "https://www.epa.gov/burnwise/epa-certified-wood-stoves",
    label: "EPA Burn Wise: EPA certified wood stoves",
    retrieved: "2026-11-13",
  },
  {
    href: "https://www.epa.gov/burnwise/choosing-right-wood-burning-stove",
    label: "EPA Burn Wise: emission limits for wood stoves",
    retrieved: "2026-11-13",
  },
];

export const NSPS_HEADINGS = {
  limit: "The 2020 particulate limit",
  cell: "The 2020 NSPS cell",
  counts: "Room-heater counts",
  lookup: "Check a stove on this site",
  sources: "Sources",
};

export const NSPS_CAPTIONS = {
  currentType: "Currently certified room-heater rows by EPA type",
  allType: "Room-heater rows by EPA type, including previously certified models",
  currentCross: "Currently certified room-heater rows by EPA type and subtype",
  allCross: "Room-heater rows by EPA type and subtype, including previously certified models",
  mixed: "Room-heater model lines whose test rows do not share one 2020 NSPS value",
};

function para(before, href = "", label = "", after = "") {
  return { before, href, label, after };
}

function plain(text) {
  return para(text);
}

export function partText(part) {
  return `${part.before}${part.label || ""}${part.after}`;
}

export function nspsValueLabel(value) {
  if (value === "Yes") return "Yes";
  if (value === "No") return "No";
  if (value == null || String(value).trim() === "") return NOT_LISTED_BY_EPA;
  throw new Error(`unexpected ${NSPS_COLUMN} value: ${JSON.stringify(value)}`);
}

export function blankCountText(count) {
  if (count === 0) return "None";
  return formatCount(count);
}

function classify(value) {
  const label = nspsValueLabel(value);
  if (label === "Yes") return "yes";
  if (label === "No") return "no";
  return "blank";
}

function tally(rows) {
  const out = { yes: 0, no: 0, blank: 0, rows: rows.length };
  for (const row of rows) out[classify(row.nsps2020)] += 1;
  return out;
}

function typeLabel(type) {
  if (type === "Wood Stove") return "Wood stove";
  if (type === "Pellet Stove") return "Pellet stove";
  if (type == null || type === "") return NOT_LISTED_BY_EPA;
  return String(type);
}

function rank(order, key) {
  const index = order.indexOf(key);
  if (index !== -1) return index;
  return order.length + (key === "" ? 1 : 0);
}

function groupRows(rows, order, keyFn, labelFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.keys()]
    .sort((a, b) => rank(order, a) - rank(order, b) || String(a).localeCompare(String(b)))
    .map((key) => ({
      key,
      label: labelFn(key),
      ...tally(map.get(key)),
    }));
}

function crossRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const type = row.type || "";
    const subtype = row.subtype || "";
    const id = `${type}\0${subtype}`;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return [...map.entries()]
    .map(([id, group]) => {
      const [type, subtype] = id.split("\0");
      return {
        type,
        subtype,
        typeLabel: typeLabel(type),
        subtypeLabel: technologyLabel(subtype),
        ...tally(group),
      };
    })
    .sort((a, b) => (
      rank(TYPE_ORDER, a.type) - rank(TYPE_ORDER, b.type)
      || rank(SUBTYPE_ORDER, a.subtype) - rank(SUBTYPE_ORDER, b.subtype)
      || a.subtypeLabel.localeCompare(b.subtypeLabel)
    ));
}

function roomRows(stoves) {
  const rows = [];
  for (const stove of stoves) {
    if (stove.category !== "room") continue;
    if (!stove.url || !stove.model) throw new Error("room-heater row is missing a model page");
    for (const test of stove.tests) {
      if (!test.type) throw new Error(`room-heater row is missing an EPA type: ${stove.url}`);
      rows.push({
        nsps2020: test.nsps2020,
        current: Boolean(test.current),
        type: test.type,
        subtype: test.subtype || "",
        emission: test.emission,
        emissionUnit: test.emissionUnit,
        model: stove.model,
        url: stove.url,
        manufacturer: stove.manufacturer || NOT_LISTED_BY_EPA,
      });
    }
  }
  return rows;
}

export function mixedValueText(line) {
  return line.tests
    .map((test) => `${test.current ? "Currently certified" : "Previously certified"}: ${test.label}`)
    .join("; ");
}

function mixedLines(stoves) {
  const lines = [];
  for (const stove of stoves) {
    if (stove.category !== "room") continue;
    const tests = [...stove.tests]
      .sort((a, b) => Number(b.current) - Number(a.current) || nspsValueLabel(a.nsps2020).localeCompare(nspsValueLabel(b.nsps2020)))
      .map((test) => ({
        current: Boolean(test.current),
        label: nspsValueLabel(test.nsps2020),
      }));
    const labels = new Set(tests.map((test) => test.label));
    if (labels.size < 2) continue;
    lines.push({
      model: stove.model,
      url: stove.url,
      manufacturer: stove.manufacturer || NOT_LISTED_BY_EPA,
      tests,
    });
  }
  lines.sort((a, b) => a.model.localeCompare(b.model) || a.url.localeCompare(b.url));
  return lines;
}

function currentNoRows(rows) {
  return rows
    .filter((row) => row.current && row.nsps2020 === "No")
    .map((row) => ({
      model: row.model,
      url: row.url,
      manufacturer: row.manufacturer,
      kind: kindLabel({ type: row.type, subtype: row.subtype }),
      emission: row.emission,
      emissionUnit: row.emissionUnit,
    }))
    .sort((a, b) => a.model.localeCompare(b.model) || a.url.localeCompare(b.url));
}

export function nspsReport(stoves) {
  const rows = roomRows(stoves);
  const current = rows.filter((row) => row.current);
  return {
    all: tally(rows),
    current: tally(current),
    allByType: groupRows(rows, TYPE_ORDER, (row) => row.type, typeLabel),
    currentByType: groupRows(current, TYPE_ORDER, (row) => row.type, typeLabel),
    allCross: crossRows(rows),
    currentCross: crossRows(current),
    currentNo: currentNoRows(rows),
    mixed: mixedLines(stoves),
  };
}

function sayCount(count, singular, plural) {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}

function blankClause(count) {
  if (count === 0) return "none leave the cell blank";
  return `${sayCount(count, "is", "are")} ${NOT_LISTED_BY_EPA}`;
}

export function typeSentence(blocks, scope) {
  const parts = blocks.map((block) => (
    `${block.label}: ${formatCount(block.yes)} Yes, ${formatCount(block.no)} No, and ${blankClause(block.blank)}`
  ));
  return `${scope} ${parts.join(". ")}.`;
}

export function countLead(report, snapshotDate) {
  const current = report.current;
  const all = report.all;
  return `In the snapshot dated ${snapshotDate}, ${sayCount(current.yes, "currently certified room-heater row says", "currently certified room-heater rows say")} Yes and ${sayCount(current.no, "row says", "rows say")} No. ${sayCount(all.yes, "room-heater row says", "room-heater rows say")} Yes when previously certified models are included, and ${sayCount(all.no, "row says", "rows say")} No.`;
}

export function blankSentence(report) {
  const current = report.current.blank;
  const all = report.all.blank;
  if (current === 0 && all === 0) {
    return `No room-heater row in this snapshot leaves the ${NSPS_COLUMN} cell blank. A blank cell is ${NOT_LISTED_BY_EPA}. It is not zero.`;
  }
  if (current === 0) {
    return `No currently certified room-heater row leaves the ${NSPS_COLUMN} cell blank. ${sayCount(all, "room-heater row leaves", "room-heater rows leave")} it blank when previously certified models are included. A blank cell is ${NOT_LISTED_BY_EPA}. It is not zero.`;
  }
  return `${sayCount(current, "currently certified room-heater row leaves", "currently certified room-heater rows leave")} the ${NSPS_COLUMN} cell blank. A blank cell is ${NOT_LISTED_BY_EPA}. It is not zero.`;
}

function rateSentence(row) {
  if (row.emission == null || row.emission === "") {
    return "EPA does not list an emission rate on that row.";
  }
  const text = emissionText(row.emission, row.emissionUnit);
  if (!text) return "EPA does not list an emission rate on that row.";
  return `EPA lists the emission rate on that row as ${text}.`;
}

function whoClause(row) {
  if (!row.manufacturer || row.manufacturer === NOT_LISTED_BY_EPA) {
    return "with the manufacturer cell left blank";
  }
  return `listed under ${row.manufacturer}`;
}

export function currentNoLead(rows) {
  const tail = "The emission rate is a different cell. This page does not read the grams-per-hour figure as the NSPS cell.";
  if (!rows.length) {
    const text = `No currently certified room-heater row says No. ${tail}`;
    return { kind: "none", text, rows };
  }
  if (rows.length === 1) {
    const row = rows[0];
    const before = "One currently certified room-heater row says No. It is ";
    const after = `, a ${row.kind} ${whoClause(row)}. ${rateSentence(row)} ${tail}`;
    return {
      kind: "one",
      before,
      href: row.url,
      label: row.model,
      after,
      text: `${before}${row.model}${after}`,
      rows,
    };
  }
  const text = `${sayCount(rows.length, "currently certified room-heater row says", "currently certified room-heater rows say")} No. ${tail}`;
  return { kind: "many", text, rows };
}

export function mixedSentence(lines) {
  if (!lines.length) {
    return "No room-heater model line in this snapshot has test rows with different 2020 NSPS values. Each test row is still counted on its own.";
  }
  const noun = lines.length === 1 ? "model line has" : "model lines have";
  return `${formatCount(lines.length)} room-heater ${noun} test rows that do not share one 2020 NSPS value. Each test row is counted under the value printed on that row.`;
}

function retrievedSentence() {
  const dates = [...new Set(NSPS_SOURCES.map((source) => source.retrieved))];
  if (dates.length === 1) return `The cited pages were retrieved ${dates[0]}.`;
  return "Each cited page has its retrieved date in the source list.";
}

export function standardParagraphs() {
  return [
    "Unless exempted under 40 CFR 60.530(b), each affected wood heater manufactured, imported into the United States, and/or sold at retail on or after May 15, 2015 must be certified to not discharge gases that contain particulate matter in excess of a weighted average of 4.5 grams per hour (0.010 pounds per hour). A wood heater manufactured before May 15, 2015 may be imported into the United States and/or sold at retail on or before December 31, 2015. That is 40 CFR 60.532(a).",
    "Unless exempted under 40 CFR 60.530(b), or unless the heater elects the cord wood alternative in paragraph (c), each affected wood heater manufactured or sold at retail for use in the United States on or after May 15, 2020 must not discharge gases that contain particulate matter in excess of a weighted average of 2.0 grams per hour (0.0044 pounds per hour). Paragraph (c) sets that cord wood alternative at a weighted average of 2.5 grams per hour (0.0055 pounds per hour), determined by a cord wood test method approved by the Administrator. That is 40 CFR 60.532(b) and (c). Those paragraphs do not state a separate 2020 number for a catalytic heater and a separate 2020 number for a non-catalytic heater.",
    "EPA's Burn Wise emission-limits page calls the 4.5 grams-per-hour limit Step 1 and says Step 2 took effect on May 15, 2020, when the standard was lowered to 2.0 grams per hour. That page says heaters using the optional cord wood test method must meet 2.5 grams per hour, and that a voluntary hangtag marked units that met these standards before the May 2020 date. EPA's certified wood stoves page says the 2020 limit for new room heaters was lowered to 2.0 grams per hour if tested with crib wood, or 2.5 grams per hour if tested with cord wood. That page describes crib wood as 2 by 4 or 4 by 4 lumber stapled together, and cord wood as typical firewood. It also says new wood heating appliances subject to the standard and offered for sale in the United States are required to meet these limits.",
    "Both of those Burn Wise pages say the program ran from 2009 to 2025 and that EPA is no longer updating that program content as of October 30, 2025. The gram-per-hour figures on this page are the sentences on those pages and in the current eCFR text. The eCFR text of 40 CFR 60.532 notes an amendment at 85 FR 18455, April 2, 2020.",
    "EPA's April 2, 2020 amendments page says EPA is maintaining the compliance dates from the original NSPS, which means retailers will have until May 15, 2020, to sell wood heating devices that do not comply with the more stringent emission standards. The same page says those amendments do not apply to wood heaters that are currently in use in people's homes, or to fireplaces, backyard barbecues, chimineas, or fire pits.",
    "40 CFR 60.531 defines a wood heater as an enclosed, wood-burning appliance capable of and intended for residential space heating or space heating and domestic water heating, and says these devices include adjustable burn rate wood heaters, single burn rate wood heaters, and pellet stoves. The same section defines sold at retail as the sale by a commercial owner of a wood heater to the ultimate purchaser or user, or to a noncommercial purchaser.",
    "40 CFR 60.530(a) says a person is subject to subpart AAA when they manufacture, sell, offer for sale, import for sale, distribute, offer to distribute, introduce or deliver for introduction into commerce in the United States, or install or operate an affected wood heater described in that section, except as provided in paragraph (c). Paragraph (c)(1) says residential hydronic heaters and residential forced-air furnaces subject to subpart QQQQ are not affected wood heaters under subpart AAA. This page does not state subpart QQQQ limits. The eCFR says it is not an official legal edition of the CFR. This page is not legal advice. Check the rules where a stove would be sold or installed.",
    retrievedSentence(),
  ];
}

export function nspsAnswer(report, snapshotDate) {
  const current = report.current;
  return [
    "The 2020 particulate standard in 40 CFR 60.532, which EPA's Burn Wise emission-limits page calls Step 2, is a weighted average of 2.0 grams per hour for an affected wood heater manufactured or sold at retail on or after May 15, 2020, or 2.5 grams per hour under the cord wood alternative.",
    `On a stove page, 2020 NSPS: No is the word in EPA's ${NSPS_COLUMN} cell. The export has no certification date. Previously certified is a separate field on the same row.`,
    `In the snapshot dated ${snapshotDate}, ${sayCount(current.yes, "currently certified room-heater row says", "currently certified room-heater rows say")} Yes and ${sayCount(current.no, "row says", "rows say")} No. The lookup reads the cell for a name in this snapshot.`,
  ];
}

function limitFaqAnswer() {
  return `40 CFR 60.532(a) states a 2015 weighted-average particulate limit of 4.5 grams per hour (0.010 pounds per hour) for an affected wood heater manufactured, imported into the United States, and/or sold at retail on or after May 15, 2015. A heater manufactured before that date may be imported and/or sold at retail on or before December 31, 2015. Paragraphs (b) and (c) state the 2020 limit for a heater manufactured or sold at retail for use in the United States on or after May 15, 2020: 2.0 grams per hour (0.0044 pounds per hour), or 2.5 grams per hour (0.0055 pounds per hour) under the cord wood alternative. EPA's Burn Wise emission-limits page calls that 2020 change Step 2. EPA's April 2, 2020 amendments page says retailers will have until May 15, 2020, to sell wood heating devices that do not comply with the more stringent emission standards. ${retrievedSentence()}`;
}

export function cellParagraphs(report) {
  return [
    `The column in the committed export is ${NSPS_COLUMN}. Stove pages label that row 2020 NSPS. Yes and No are the words printed in the cell. A blank cell is ${NOT_LISTED_BY_EPA}. It is not zero.`,
    "The snapshot has no certification date. A No in this cell does not date a certification. Previously certified means the row was not in the in-production result on the snapshot date. That status is a different field.",
    blankSentence(report),
  ];
}

export function countParagraphs(report, snapshotDate) {
  return [
    countLead(report, snapshotDate),
    typeSentence(report.currentByType, "Currently certified room-heater rows by EPA type."),
    typeSentence(report.allByType, "Room-heater rows by EPA type, including previously certified models."),
    `The ${BLANK_COLUMN} column counts rows whose cell is blank. None means no row in that group leaves the cell blank.`,
    "These tables count EPA test rows. A model line with two rows is counted twice, once for each row.",
    "Central-heater rows are not in these tables. 40 CFR 60.530(c)(1) places residential hydronic heaters and residential forced-air furnaces that are subject to subpart QQQQ outside subpart AAA.",
    mixedSentence(report.mixed),
  ];
}

export function crossLinks(snapshotDate) {
  return [
    para(
      "To read the cell for a stove, use the ",
      "/lookup/",
      "lookup",
      ` and open the model line. The table row labeled 2020 NSPS is the ${NSPS_COLUMN} column. The lookup uses the snapshot dated ${snapshotDate}.`,
    ),
    plain("EPA's Burn Wise page on wood stoves says to look for the permanent metal EPA certification label on the back of the stove, or to check the current list of EPA-certified wood heaters. This site shows the committed snapshot. It does not search a live EPA application."),
    para(
      "Catalytic, non-catalytic, and hybrid on this site are the EPA subtype cell, counted on the ",
      "/catalytic-vs-non-catalytic/",
      "catalytic, non-catalytic, and hybrid page",
      ". The 2020 particulate limit above is the limit in 40 CFR 60.532. It is not a subtype median.",
    ),
    para(
      "A federal tax credit is a separate rule from 40 CFR 60.532. The ",
      "/wood-stove-tax-credit/",
      "tax credit page",
      " records the IRS dates checked for this site. This page does not restate them.",
    ),
    para(
      "Currently certified, previously certified, and the missing certification date are explained on the ",
      "/methodology/",
      "methodology page",
      ".",
    ),
  ];
}

export function nspsFaqs(report, snapshotDate) {
  const noLead = currentNoLead(report.currentNo);
  return [
    {
      question: "What did the 2020 EPA wood stove standard change?",
      answer: limitFaqAnswer(),
    },
    {
      question: "What does 2020 NSPS compliant: No mean?",
      answer: `${cellParagraphs(report)[0]} ${cellParagraphs(report)[1]} ${noLead.text} ${blankSentence(report)} Snapshot ${snapshotDate}.`,
    },
    {
      question: "Is a stove certified before 2020 the same as previously certified?",
      answer: `No. Previously certified means the row was not in the in-production result on the snapshot date. The ${NSPS_COLUMN} cell is a separate field. ${countLead(report, snapshotDate)} ${mixedSentence(report.mixed)}`,
    },
    {
      question: "How do I check whether my wood stove is in this EPA list?",
      answer: `Use the lookup and open the model line. The 2020 NSPS row is the ${NSPS_COLUMN} cell. EPA's Burn Wise page says to look for the permanent metal certification label on the stove, or to check EPA's current certified-heater list. This site shows the snapshot dated ${snapshotDate}. This page is not legal advice. Check the rules where the stove would be sold or installed.`,
    },
  ];
}

export function nspsNotes(snapshotDate) {
  return [
    `Counts are EPA test rows in the snapshot dated ${snapshotDate}. A model line with two rows is counted twice.`,
    `A blank ${NSPS_COLUMN} cell is ${NOT_LISTED_BY_EPA}. It is not zero. A printed Yes or No stays the word in the cell.`,
    "The Not listed by EPA column uses None when no row in that group leaves the cell blank.",
    "Central-heater rows are outside these tables. This page does not state subpart QQQQ limits.",
    `${retrievedSentence()} The gram-per-hour limits are those cited sentences, not medians from this snapshot.`,
    "The tax credit page is a separate rule. This page does not restate it.",
    "This page is not legal advice. Check the rules where a stove would be sold or installed.",
  ];
}

export function nspsCopyParts(report, snapshotDate) {
  const noLead = currentNoLead(report.currentNo);
  const links = crossLinks(snapshotDate);
  return {
    sentences: nspsAnswer(report, snapshotDate),
    faqs: nspsFaqs(report, snapshotDate),
    notes: nspsNotes(snapshotDate),
    standard: standardParagraphs(),
    cell: cellParagraphs(report),
    counts: countParagraphs(report, snapshotDate),
    links,
    noLead,
    headings: Object.values(NSPS_HEADINGS),
    captions: Object.values(NSPS_CAPTIONS),
  };
}

export function nspsVisibleText(parts) {
  return [
    parts.sentences.join(" "),
    parts.faqs.map((faq) => `${faq.question} ${faq.answer}`).join(" "),
    parts.notes.join(" "),
    parts.standard.join(" "),
    parts.cell.join(" "),
    parts.counts.join(" "),
    parts.links.map(partText).join(" "),
    parts.noLead.text,
    parts.headings.join(" "),
    parts.captions.join(" "),
    NSPS_SOURCES.map((source) => `${source.label} ${source.href} Retrieved ${source.retrieved}`).join(" "),
    BLANK_COLUMN,
  ].join(" ");
}

export function assertNspsCopy(text) {
  if (BANNED_COPY.test(text)) {
    throw new Error(`2020 NSPS copy contains a banned word: ${text.match(BANNED_COPY)[0]}`);
  }
  if (text.includes("cfpub.epa.gov")) throw new Error("2020 NSPS copy names the EPA application host");
  if (/\b(Product|Review|AggregateRating)\b/.test(text)) {
    throw new Error("2020 NSPS copy names a banned structured-data type");
  }
  if (/\bnot listed by EPA\b/i.test(text) === false) {
    throw new Error("2020 NSPS copy never says a blank cell is not listed by EPA");
  }
}
