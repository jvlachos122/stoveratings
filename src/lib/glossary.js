// Glossary of terms the site already prints. Regulatory sentences are the
// cited eCFR and EPA pages. Snapshot sentences are computed from the committed
// stove rows. This module does not fetch EPA.

import { site } from "./site.js";

export const GLOSSARY_PAGE = "/glossary/";

export const GLOSSARY_RETRIEVED = "2026-11-14";

const BANNED_COPY = /\b(best|top-rated|recommend\w*|scores?|ratings?|safest|safer|popular|winners?|affiliate|sponsored|cleanest|better)\b/i;

const SOURCE_DEFS = [
  {
    id: "cfr-60-530",
    href: "https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-60/subpart-AAA/section-60.530",
    label: "40 CFR 60.530, applicability",
  },
  {
    id: "cfr-60-531",
    href: "https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-60/subpart-AAA/section-60.531",
    label: "40 CFR 60.531, definitions",
  },
  {
    id: "cfr-60-532",
    href: "https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-60/subpart-AAA/section-60.532",
    label: "40 CFR 60.532, standards and compliance dates",
  },
  {
    id: "cfr-60-533",
    href: "https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-60/subpart-AAA/section-60.533",
    label: "40 CFR 60.533, certification and recertification",
  },
  {
    id: "cfr-60-534",
    href: "https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-60/subpart-AAA/section-60.534",
    label: "40 CFR 60.534, test methods",
  },
  {
    id: "cfr-60-5473",
    href: "https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-60/subpart-QQQQ/section-60.5473",
    label: "40 CFR 60.5473, hydronic heater and forced-air furnace definitions",
  },
  {
    id: "cfr-60-5476",
    href: "https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-60/subpart-QQQQ/section-60.5476",
    label: "40 CFR 60.5476, central-heater test methods",
  },
  {
    id: "hangtag",
    href: "https://www.epa.gov/stationary-sources-air-pollution/voluntary-hangtag-guidelines-manufacturers-wood-burning-devices",
    label: "EPA voluntary hangtag guidelines for wood-burning devices",
  },
  {
    id: "certified-stoves",
    href: "https://www.epa.gov/burnwise/epa-certified-wood-stoves",
    label: "EPA Burn Wise: EPA certified wood stoves",
  },
  {
    id: "emission-limits",
    href: "https://www.epa.gov/burnwise/choosing-right-wood-burning-stove",
    label: "EPA Burn Wise: emission limits for wood stoves",
  },
  {
    id: "burn-wise-faq",
    href: "https://www.epa.gov/burnwise/frequent-questions-about-wood-burning-appliances",
    label: "EPA Burn Wise frequent questions about wood-burning appliances",
  },
  {
    id: "ghg-hhv",
    href: "https://www.epa.gov/sites/default/files/2020-12/documents/stationaryemissions.pdf",
    label: "EPA greenhouse gas inventory guidance: direct emissions from stationary combustion sources",
  },
];

export function glossaryHref(id) {
  return `${GLOSSARY_PAGE}#${id}`;
}

function joinList(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function typeOriginSentence(types) {
  const room = types.filter((type) => type === "Wood Stove" || type === "Pellet Stove");
  const central = types.filter((type) => type === "Hydronic Heater" || type === "Forced Air Furnace");
  const other = types.filter((type) => !room.includes(type) && !central.includes(type));
  const bits = [];
  if (room.length) bits.push(`${joinList(room)} ${room.length === 1 ? "is a room-heater type" : "are room-heater types"}`);
  if (central.length) bits.push(`${joinList(central)} ${central.length === 1 ? "is a central-heater type" : "are central-heater types"}`);
  if (other.length) bits.push(`${joinList(other)} ${other.length === 1 ? "is also printed in the Type cell" : "are also printed in the Type cell"}`);
  if (!bits.length) return "A blank type is not listed by EPA and is not zero.";
  return `${bits.join("; ")}, and a blank type is not listed by EPA and is not zero.`;
}

function uniqueSorted(stoves, pick) {
  const values = new Set();
  for (const stove of stoves) {
    for (const test of stove.tests) {
      const value = pick(stove, test);
      if (value) values.add(value);
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

function sentenceCount(text) {
  return text
    .split(/(?<=[a-z%)\d])\.\s+(?=[A-Z]|40 CFR|EPA\b|ASTM\b|CSA\b)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .length;
}

function term(entry) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) throw new Error(`bad glossary id ${entry.id}`);
  if (!entry.term || !entry.label) throw new Error(`glossary term ${entry.id} needs a name and a label`);
  const count = sentenceCount(entry.sentences.join(" "));
  if (count < 1 || count > 3) throw new Error(`glossary term ${entry.id} has ${count} sentences`);
  if (!entry.links?.length) throw new Error(`glossary term ${entry.id} needs a deeper page`);
  for (const link of entry.links) {
    if (!link.href.startsWith("/")) throw new Error(`glossary term ${entry.id} link must stay on this site`);
  }
  return entry;
}

function more(links) {
  if (links.length === 1) return `More detail: ${links[0].label}.`;
  return `More detail: ${joinList(links.map((link) => link.label))}.`;
}

export function glossarySources(snapshotDate) {
  return [
    ...SOURCE_DEFS.map((source) => ({ ...source, retrieved: GLOSSARY_RETRIEVED })),
    {
      id: "epa-database",
      href: site.epaDatabaseUrl,
      label: "EPA Certified Wood Heater Database",
      retrieved: snapshotDate,
    },
  ];
}

export function glossaryAnswer(snapshotDate) {
  return [
    "g/hr means grams per hour, the particulate emission rate on a room-heater row, while a central-heater row uses pounds per million BTU (lb/mmBTU), which is not the same measurement.",
    "HHV efficiency is the higher-heating-value percent in EPA's Overall Efficiency-HHV (%) column; EPA's hangtag guidelines say an LHV efficiency is not acceptable on that hangtag, and this site does not list or convert an LHV figure.",
    `NSPS means the New Source Performance Standards in 40 CFR part 60, a catalytic combustor is the noble-metal device defined in 40 CFR 60.531, and currently certified on this site means the row was in the in-production result on ${snapshotDate}, not a certification date in the export.`,
  ];
}

export function glossaryParts(stoves, snapshotDate) {
  const fuels = uniqueSorted(stoves, (_stove, test) => test.fuel);
  const types = uniqueSorted(stoves, (_stove, test) => test.type);
  const subtypes = uniqueSorted(stoves, (stove, test) => (
    stove.category === "room" && test.current ? test.subtype : ""
  ));
  const allSubtypes = uniqueSorted(stoves, (_stove, test) => test.subtype);
  const methods = uniqueSorted(stoves, (_stove, test) => test.testMethod);
  const catalyticHybrid = allSubtypes.find((value) => /catalytic-hybrid/i.test(value));
  const chipFuel = fuels.some((value) => /chip/i.test(value));
  if (!fuels.length) throw new Error("glossary found no certified-fuel strings");
  if (!types.length) throw new Error("glossary found no EPA type strings");
  if (!subtypes.length) throw new Error("glossary found no current room-heater subtype strings");
  if (!methods.length) throw new Error("glossary found no test-method strings");

  const fuelSentences = [
    "Certified fuel is the Certified Fuel Type cell, the fuel EPA printed for that test row, and a blank cell is not listed by EPA and is not zero.",
    `In the snapshot dated ${snapshotDate}, that cell uses ${joinList(fuels)}.`,
  ];
  if (chipFuel) {
    fuelSentences.push("40 CFR 60.532(d) says the operator of a wood heater certified to burn chip wood must burn only chip wood fuel specified in the owner's manual.");
  }

  const terms = [
    term({
      id: "g-hr",
      term: "g/hr",
      label: "Emission Rate (grams/hr) on a room-heater row",
      sentences: [
        "g/hr means grams per hour of particulate matter, which 40 CFR 60.531 defines as total particulate matter, including coarse particulate (PM10) and fine particulate (PM2.5).",
        "40 CFR 60.532 states the affected-wood-heater limits as weighted averages in g/hr, and the room-heater column in this export is Emission Rate (grams/hr).",
        "A blank cell is not listed by EPA and is not zero.",
      ],
      links: [
        { href: "/cleanest-burning-wood-stoves/", label: "Wood stoves ordered by emission rate" },
        { href: "/cleanest-burning-pellet-stoves/", label: "Pellet stoves ordered by emission rate" },
      ],
    }),
    term({
      id: "lb-mmbtu",
      term: "lb/mmBTU",
      label: "Emission Rate Annual Avg (lb/mmBTU) on a central-heater row",
      sentences: [
        "lb/mmBTU means pounds of particulate matter per million BTU of heat output, and the central-heater column in this export is Emission Rate Annual Avg (lb/mmBTU).",
        "EPA's hangtag guidelines describe hydronic-heater and forced-air-furnace emissions as pounds per million Btu heat output for each burn category.",
        "Do not compare an lb/mmBTU figure with a g/hr figure as if they were the same measurement, and a blank cell is not listed by EPA and is not zero.",
      ],
      links: [
        { href: "/outdoor-wood-boilers/", label: "Hydronic heaters" },
        { href: "/wood-furnaces/", label: "Forced-air furnaces" },
      ],
    }),
    term({
      id: "hhv",
      term: "HHV efficiency",
      label: "Overall Efficiency-HHV (%)",
      sentences: [
        "HHV efficiency on this site is the percent in EPA's Overall Efficiency-HHV (%) column, which EPA's voluntary hangtag guidelines describe as the weighted average efficiency calculated using the higher heating value of the fuel.",
        "40 CFR 60.534(e) requires the laboratory to measure efficiency with CSA Method B415.1-10, section 13.7.",
        "A blank cell is not listed by EPA and is not zero, and this site does not convert the percent to another basis.",
      ],
      links: [
        { href: "/most-efficient-wood-stoves/", label: "Wood stoves ordered by HHV efficiency" },
        { href: "/most-efficient-pellet-stoves/", label: "Pellet stoves ordered by HHV efficiency" },
        { href: "/tools/heating-cost-calculator/", label: "Heating cost calculator" },
      ],
    }),
    term({
      id: "lhv",
      term: "LHV efficiency",
      label: "Not a column in this export",
      sentences: [
        "LHV means lower heating value: EPA's greenhouse gas inventory guidance for stationary combustion says it assumes the steam released during combustion remains a gas, while the higher heating value assumes that steam is condensed to a liquid.",
        "That guidance is about fuel heat content in a greenhouse-gas inventory, not a wood-heater test result, and this site does not apply it to a stove percent.",
        "EPA's voluntary hangtag guidelines say an LHV efficiency is not acceptable on that hangtag, and this site has no LHV column and does not convert an HHV percent.",
      ],
      links: [
        { href: "/glossary/#hhv", label: "HHV efficiency" },
        { href: "/most-efficient-wood-stoves/", label: "Wood stoves ordered by HHV efficiency" },
      ],
    }),
    term({
      id: "btu-hr",
      term: "Heat output (BTU/hr)",
      label: "Heat Output (BTUs), and on central heaters a lower, an upper, and a maximum",
      sentences: [
        "Heat output is the BTU/hr figure EPA lists: a room-heater row uses Heat Output (BTUs), shown here as a range when the cell has a low and a high number or as one number when the cell has one, and a central-heater row can list Heat Output (Lower), Heat Output (Upper), and Heat Output Maximum (BTUs).",
        "40 CFR 60.534(e) requires the laboratory to measure heat output with CSA Method B415.1-10, section 13.7.",
        "The stove size calculator uses separate planning factors, which are not these EPA figures.",
      ],
      links: [
        { href: "/tools/stove-size-calculator/", label: "Stove size calculator" },
      ],
    }),
    term({
      id: "nsps",
      term: "NSPS",
      label: "New Source Performance Standards, 40 CFR part 60",
      sentences: [
        "NSPS means New Source Performance Standards, and EPA's Burn Wise frequent-questions page says the Residential Wood Heater New Source Performance Standards govern the manufacture and sale of wood heaters, and that a model meeting those requirements is considered EPA-certified.",
        "Subpart AAA of 40 CFR part 60 is the standard for new residential wood heaters, and 40 CFR 60.530(c)(1) says residential hydronic heaters and residential forced-air furnaces subject to subpart QQQQ are not affected wood heaters under subpart AAA.",
      ],
      links: [
        { href: "/certified-before-2020/", label: "Certified before 2020" },
      ],
    }),
    term({
      id: "step-1",
      term: "Step 1 (2015)",
      label: "The 2015 weighted-average particulate limit, not a column in this export",
      sentences: [
        "EPA's Burn Wise emission-limits page calls the 4.5 grams-per-hour limit Step 1, and 40 CFR 60.532(a) states that weighted average for an affected wood heater manufactured, imported into the United States, and/or sold at retail on or after May 15, 2015.",
        "A wood heater manufactured before May 15, 2015 may be imported and/or sold at retail on or before December 31, 2015, and Step 1 is not a column in this export.",
      ],
      links: [
        { href: "/certified-before-2020/", label: "Certified before 2020" },
      ],
    }),
    term({
      id: "step-2",
      term: "Step 2 (2020)",
      label: "The 2020 particulate limit, called Step 2 on EPA's emission-limits page",
      sentences: [
        "EPA's Burn Wise emission-limits page says Step 2 took effect on May 15, 2020, when the standard was lowered to 2.0 grams per hour, and that heaters using the optional cord wood test method must meet 2.5 grams per hour.",
        "40 CFR 60.532(b) states the 2.0 grams-per-hour weighted average, and paragraph (c) states the 2.5 grams-per-hour cord wood alternative. EPA's certified wood stoves page describes the 2.0 figure as the crib-wood test and the 2.5 figure as the cord-wood test.",
      ],
      links: [
        { href: "/certified-before-2020/", label: "Certified before 2020" },
        { href: "/glossary/#cord-wood", label: "Cord wood" },
        { href: "/glossary/#crib-wood", label: "Crib wood" },
      ],
    }),
    term({
      id: "nsps-2020",
      term: "2020 NSPS",
      label: "NSPS Compliance 2020",
      sentences: [
        "2020 NSPS on a stove page is the NSPS Compliance 2020 cell, and Yes and No are the words EPA printed in that cell.",
        "A blank cell is not listed by EPA and is not zero.",
        "The cell is not a certification date, and it is a different field from currently certified.",
      ],
      links: [
        { href: "/certified-before-2020/", label: "Certified before 2020" },
      ],
    }),
    term({
      id: "catalytic-combustor",
      term: "Catalytic combustor",
      label: "EPA subtype Catalytic Stove",
      sentences: [
        "40 CFR 60.531 defines a catalytic combustor as a device coated with a noble metal used in a wood heater to lower the temperature required for combustion, and 40 CFR 60.5473 repeats that definition for central heaters.",
        "EPA's Burn Wise frequent-questions page describes the smoke passing through a coated honeycomb, and on this site Catalytic Stove is the EPA subtype string.",
      ],
      links: [
        { href: "/catalytic-vs-non-catalytic/", label: "Catalytic, non-catalytic, and hybrid" },
        { href: "/catalytic-wood-stoves/", label: "Catalytic wood stoves" },
      ],
    }),
    term({
      id: "non-catalytic",
      term: "Non-catalytic",
      label: "EPA subtype Non-Catalytic Stove",
      sentences: [
        "Non-catalytic on this site means the EPA subtype Non-Catalytic Stove, which EPA's Burn Wise frequent-questions page describes as using firebox insulation, a baffle, and pre-heated combustion air instead of a catalyst.",
        "The subtype cell and the model name are different fields, and a blank subtype is not listed by EPA and is not zero.",
      ],
      links: [
        { href: "/catalytic-vs-non-catalytic/", label: "Catalytic, non-catalytic, and hybrid" },
        { href: "/non-catalytic-wood-stoves/", label: "Non-catalytic wood stoves" },
      ],
    }),
    term({
      id: "hybrid",
      term: "Hybrid",
      label: "EPA subtype Hybrid",
      sentences: [
        "Hybrid on this site means the EPA subtype Hybrid, which EPA's Burn Wise frequent-questions page describes as a unit with both a catalyst and secondary combustion.",
        catalyticHybrid
          ? `This snapshot also uses the subtype string ${catalyticHybrid}.`
          : "No subtype string in this snapshot is catalytic-hybrid, and the 2013 list's Type word catalytic-hybrid is not copied onto a current row.",
      ],
      links: [
        { href: "/catalytic-vs-non-catalytic/", label: "Catalytic, non-catalytic, and hybrid" },
        { href: "/hybrid-wood-stoves/", label: "Hybrid wood stoves" },
        { href: "/methodology/#certified-wood-2013", label: "March 15, 2013 list review" },
      ],
    }),
    term({
      id: "cord-wood",
      term: "Cord wood",
      label: "A test fuel in 40 CFR 60.532(c), and a Certified Fuel Type string",
      sentences: [
        "Cord wood, in the 2020 test rules, is the fuel for the alternative compliance option in 40 CFR 60.532(c) and 60.534, and EPA's certified wood stoves page describes it as typical firewood.",
        "That page describes crib wood as 2 by 4 or 4 by 4 lumber stapled together.",
        "The firewood chart on this site is million BTU per cord of a species, which is not that test method and not an emission rate.",
      ],
      links: [
        { href: "/certified-before-2020/", label: "Certified before 2020" },
        { href: "/firewood-btu-chart/", label: "Firewood heat values" },
      ],
    }),
    term({
      id: "crib-wood",
      term: "Crib wood",
      label: "The crib-wood test fuel named in 40 CFR 60.534",
      sentences: [
        "40 CFR 60.534(a)(1)(i) says to conduct testing with crib wood using EPA Method 28R, an alternative crib wood method the Administrator approves, or the ASTM E2779-10 pellet heater test method.",
        "EPA's certified wood stoves page describes crib wood as 2 by 4 or 4 by 4 lumber stapled together, and the 2020 crib-wood particulate limit in 40 CFR 60.532(b) is a weighted average of 2.0 grams per hour.",
      ],
      links: [
        { href: "/certified-before-2020/", label: "Certified before 2020" },
        { href: "/glossary/#cord-wood", label: "Cord wood" },
      ],
    }),
    term({
      id: "test-method",
      term: "Test method",
      label: "Test Method on a room-heater row",
      sentences: [
        "Test method is a column on room-heater rows, and the central-heater export parsed here has no Test Method column, so a central-heater page shows Not listed for that row.",
        "40 CFR 60.534 names crib-wood testing with EPA Method 28R and cord-wood testing with a cord wood method the Administrator approves.",
        `In the snapshot dated ${snapshotDate}, room-heater rows that fill the cell use ${joinList(methods)}, and the export does not expand those strings.`,
      ],
      links: [
        { href: "/certified-before-2020/", label: "Certified before 2020" },
        { href: "/glossary/#crib-wood", label: "Crib wood" },
      ],
    }),
    term({
      id: "pellet-stove",
      term: "Pellet stove",
      label: "EPA type Pellet Stove",
      sentences: [
        "40 CFR 60.531 defines a pellet stove as an enclosed, pellet- or chip-fuel-burning device intended for residential space heating, or for space heating and domestic water heating, with a fuel storage hopper or bin and a fuel feed system.",
        "The definition includes free-standing pellet stoves, pellet stove fireplace inserts, and built-in pellet stoves.",
        "On this site, Pellet Stove is the room-heater type, and a central heater that burns pellets stays under Hydronic Heater or Forced Air Furnace.",
      ],
      links: [
        { href: "/pellet-stoves/", label: "Pellet stoves" },
        { href: "/pellet-stove-vs-wood-stove/", label: "Pellet and wood figures" },
      ],
    }),
    term({
      id: "fireplace-insert",
      term: "Fireplace insert",
      label: "No insert column; the model name can say name indicates insert",
      sentences: [
        "40 CFR 60.531 defines a fireplace insert wood heater as a wood heater intended to be installed in a masonry fireplace cavity or in another enclosure, and it defines a pellet stove fireplace insert the same way for a pellet stove.",
        "This export has no insert column, and a model line is labeled name indicates insert only from the model name.",
      ],
      links: [
        { href: "/wood-stove-inserts/", label: "Wood stove inserts" },
        { href: "/pellet-stove-inserts/", label: "Pellet stove inserts" },
      ],
    }),
    term({
      id: "hydronic-heater",
      term: "Hydronic heater",
      label: "EPA type Hydronic Heater",
      sentences: [
        "40 CFR 60.5473 defines a residential hydronic heater as a device designed to burn wood or wood pellet fuel that heats building space and/or water by distributing a heated fluid, typically water or a water and antifreeze mixture, typically through pipes.",
        "The EPA type in this export is Hydronic Heater, and the export does not say outdoor or indoor.",
      ],
      links: [
        { href: "/outdoor-wood-boilers/", label: "Hydronic heaters" },
        { href: "/pellet-boilers/", label: "Pellet hydronic heaters" },
      ],
    }),
    term({
      id: "forced-air-furnace",
      term: "Forced-air furnace",
      label: "EPA type Forced Air Furnace",
      sentences: [
        "40 CFR 60.5473 defines a residential forced-air furnace as a device designed to burn wood or wood pellet fuel that warms spaces other than the space where the furnace is located, by distributing air through ducts.",
        "The same section calls a furnace small when its maximum heat output is less than 65,000 BTU per hour, and large when it is 65,000 BTU per hour or greater, and the list on this site uses the type Forced Air Furnace without splitting those two sizes.",
      ],
      links: [
        { href: "/wood-furnaces/", label: "Forced-air furnaces" },
      ],
    }),
    term({
      id: "firebox-volume",
      term: "Firebox volume",
      label: "Firebox Volume (Cubic Feet)",
      sentences: [
        "Firebox volume is the number in Firebox Volume (Cubic Feet), shown here in cubic feet, and a blank cell is not listed by EPA and is not zero, while Not applicable is text EPA printed, not a zero.",
        "40 CFR 60.533(k) presumes that a change in firebox dimensions beyond 0.64 cm (1/4 inch) in a linear dimension, or 5 percent in a listed cross-sectional area, affects emissions, and that presumption is a design rule for recertification, not this column.",
      ],
      links: [
        { href: "/small-wood-stoves/", label: "Small firebox wood stoves" },
      ],
    }),
    term({
      id: "currently-certified",
      term: "Currently certified",
      label: "The row was in the in-production result on the snapshot date",
      sentences: [
        `Currently certified means the row was in EPA's in-production result on the snapshot dated ${snapshotDate}, and the export has no certification date, so this site does not say the stove was certified on a particular day.`,
        "EPA-certified, on the Burn Wise frequent-questions page, means the model meets the wood heater NSPS, which is a different statement from the in-production flag.",
        "That page says an EPA-certified wood-burning appliance has a label on the back indicating EPA certification.",
      ],
      links: [
        { href: "/methodology/", label: "Methodology" },
        { href: "/lookup/", label: "Look up a stove name" },
      ],
    }),
    term({
      id: "previously-certified",
      term: "Previously certified",
      label: "In the full export, and not in the in-production result",
      sentences: [
        "Previously certified means the row was in the full export and not in the in-production result on the snapshot date, and it is not a certification date.",
        "It is a different field from the 2020 NSPS cell, and a Yes or No there does not set this status.",
      ],
      links: [
        { href: "/methodology/", label: "Methodology" },
        { href: "/certified-before-2020/", label: "Certified before 2020" },
      ],
    }),
    term({
      id: "not-listed",
      term: "Not listed by EPA",
      label: "A blank cell in the export",
      sentences: [
        "Not listed by EPA means the export left the cell blank, and this site does not fill that blank with zero.",
        "Not applicable is a different printed value, and the firebox cell uses it when EPA prints those words.",
      ],
      links: [
        { href: "/methodology/", label: "Methodology" },
      ],
    }),
    term({
      id: "co",
      term: "CO",
      label: "CO (g/min)",
      sentences: [
        "CO is the carbon monoxide figure in the CO (g/min) column, in grams per minute. 40 CFR 60.534(e) requires the laboratory to measure carbon monoxide emissions with CSA Method B415.1-10, section 13.7.",
        "A blank cell is not listed by EPA and is not zero.",
      ],
      links: [
        { href: "/methodology/", label: "Methodology" },
      ],
    }),
    term({
      id: "certified-fuel",
      term: "Certified fuel",
      label: "Certified Fuel Type",
      sentences: fuelSentences,
      links: [
        { href: "/pellet-stove-vs-wood-stove/", label: "Pellet and wood figures" },
        { href: "/glossary/#cord-wood", label: "Cord wood" },
        { href: "/glossary/#crib-wood", label: "Crib wood" },
      ],
    }),
    term({
      id: "thermal-storage",
      term: "Thermal storage",
      label: "Thermal Storage on a central-heater row",
      sentences: [
        "Thermal storage is a column on central-heater rows, and 40 CFR 60.5476 names it in the hydronic-heater test methods, including units sold with thermal storage and full thermal storage certification tests.",
        "The same section says a heater equipped with full or partial heat storage must not be sold or installed with less heat storage capacity than the certification test used.",
        "This site prints the cell EPA filled in, and a blank is not listed by EPA and is not zero.",
      ],
      links: [
        { href: "/outdoor-wood-boilers/", label: "Hydronic heaters" },
        { href: "/wood-furnaces/", label: "Forced-air furnaces" },
      ],
    }),
    term({
      id: "model-line",
      term: "Model line",
      label: "The EPA model cell, one page on this site",
      sentences: [
        "40 CFR 60.531 defines a model line as all wood heaters offered for sale by a single manufacturer that are similar in all material respects that would affect emissions, and 40 CFR 60.5473 uses the same definition for central heaters.",
        "On this site, one page is one manufacturer-and-model-line pair from the export, and the model cell often names several retail models, which are aliases for that line.",
      ],
      links: [
        { href: "/methodology/", label: "Methodology" },
        { href: "/lookup/", label: "Look up a stove name" },
      ],
    }),
    term({
      id: "epa-manufacturer",
      term: "EPA manufacturer",
      label: "The manufacturer string in the export",
      sentences: [
        "EPA manufacturer is the manufacturer string in the export, and 40 CFR 60.531 defines a manufacturer as any entity that constructs or imports a wood heater into the United States.",
        "A brand hub on this site is a separate page, and it exists only when the brand name appears in that string or in the model text.",
      ],
      links: [
        { href: "/methodology/#brands", label: "How brand hubs are chosen" },
        { href: "/brands/", label: "Browse all brands" },
      ],
    }),
    term({
      id: "epa-type",
      term: "EPA type",
      label: "The Type cell",
      sentences: [
        `EPA type is the Type cell, and in the snapshot dated ${snapshotDate} it uses ${joinList(types)}.`,
        typeOriginSentence(types),
      ],
      links: [
        { href: "/pellet-stove-vs-wood-stove/", label: "Pellet and wood figures" },
        { href: "/outdoor-wood-boilers/", label: "Hydronic heaters" },
        { href: "/wood-furnaces/", label: "Forced-air furnaces" },
      ],
    }),
    term({
      id: "epa-subtype",
      term: "EPA subtype",
      label: "The Subtype cell",
      sentences: [
        `EPA subtype is the Subtype cell, and in the snapshot dated ${snapshotDate} the currently certified room-heater rows that fill it use ${joinList(subtypes)}.`,
        "A blank subtype is not listed by EPA and is not zero, and the model name can contain a technology word the subtype cell does not use.",
      ],
      links: [
        { href: "/catalytic-vs-non-catalytic/", label: "Catalytic, non-catalytic, and hybrid" },
      ],
    }),
    term({
      id: "epa-new",
      term: "EPA marked New",
      label: "The New column",
      sentences: [
        "The New column is separate from currently certified, and when the cell is new!, the stove page shows EPA marked New.",
        "A blank New cell is not a certification date.",
      ],
      links: [
        { href: "/methodology/", label: "Methodology" },
      ],
    }),
  ];

  const ids = new Set(terms.map((item) => item.id));
  if (ids.size !== terms.length) throw new Error("duplicate glossary id");
  for (const item of terms) {
    for (const link of item.links) {
      if (!link.href.startsWith("/glossary/#")) continue;
      const id = link.href.slice("/glossary/#".length);
      if (!ids.has(id)) throw new Error(`glossary term ${item.id} links to a missing anchor ${id}`);
    }
  }

  const groups = [
    {
      id: "measurements",
      heading: "Emission, efficiency, and heat output",
      ids: ["g-hr", "lb-mmbtu", "hhv", "lhv", "btu-hr", "co", "firebox-volume"],
    },
    {
      id: "standards",
      heading: "Standards and test fuel",
      ids: ["nsps", "step-1", "step-2", "nsps-2020", "cord-wood", "crib-wood", "test-method", "certified-fuel"],
    },
    {
      id: "appliances",
      heading: "Appliance types",
      ids: ["catalytic-combustor", "non-catalytic", "hybrid", "epa-subtype", "pellet-stove", "fireplace-insert", "hydronic-heater", "forced-air-furnace", "epa-type"],
    },
    {
      id: "rows",
      heading: "How a row is listed",
      ids: ["currently-certified", "previously-certified", "not-listed", "epa-new", "model-line", "epa-manufacturer", "thermal-storage"],
    },
  ];
  const byId = new Map(terms.map((item) => [item.id, item]));
  const grouped = groups.map((group) => ({
    ...group,
    terms: group.ids.map((id) => {
      const found = byId.get(id);
      if (!found) throw new Error(`glossary group ${group.id} is missing ${id}`);
      return found;
    }),
  }));
  const orderedIds = grouped.flatMap((group) => group.terms.map((item) => item.id));
  if (orderedIds.length !== terms.length) throw new Error("a glossary term is missing from the groups");

  const sources = glossarySources(snapshotDate);
  const sentences = glossaryAnswer(snapshotDate);
  const faqs = glossaryFaqs(terms, snapshotDate);
  const notes = glossaryNotes(snapshotDate);
  const caption = "Terms defined on this page";
  return {
    sentences,
    faqs,
    notes,
    sources,
    groups: grouped,
    terms: orderedIds.map((id) => byId.get(id)),
    caption,
    more,
    headings: grouped.map((group) => group.heading),
  };
}

function byId(terms, id) {
  const found = terms.find((item) => item.id === id);
  if (!found) throw new Error(`missing glossary term ${id}`);
  return found.sentences.join(" ");
}

export function glossaryFaqs(terms, snapshotDate) {
  return [
    {
      question: "What does g/hr mean on a wood stove?",
      answer: byId(terms, "g-hr"),
    },
    {
      question: "What is the difference between HHV and LHV efficiency?",
      answer: `${byId(terms, "hhv")} ${byId(terms, "lhv")}`,
    },
    {
      question: "What is NSPS?",
      answer: `${byId(terms, "nsps")} ${byId(terms, "step-1")} ${byId(terms, "step-2")}`,
    },
    {
      question: "What is a catalytic combustor?",
      answer: byId(terms, "catalytic-combustor"),
    },
    {
      question: "What does EPA certified mean on this site?",
      answer: `${byId(terms, "currently-certified")} ${byId(terms, "previously-certified")} Snapshot ${snapshotDate}.`,
    },
  ];
}

export function glossaryNotes(snapshotDate) {
  return [
    `Column names are the headers in the committed EPA export. Snapshot ${snapshotDate}.`,
    "A blank cell is not listed by EPA. It is not zero.",
    `Regulatory pages in the source list were retrieved ${GLOSSARY_RETRIEVED}, except the database landing page, which is dated with the snapshot.`,
    "The eCFR is not an official legal edition of the CFR. This page is not legal advice. Check the rules where a stove would be sold or installed.",
    "g/hr and lb/mmBTU are different measurements.",
    "This site copies the EPA figure. It does not add its own number on top of that figure.",
  ];
}

export function glossaryVisibleText(parts) {
  return [
    parts.sentences.join(" "),
    parts.caption,
    "Term",
    "What the label means on this site",
    parts.terms.map((item) => `${item.term} ${item.label} ${item.sentences.join(" ")} ${more(item.links)}`).join(" "),
    parts.headings.join(" "),
    "Common questions",
    parts.faqs.map((faq) => `${faq.question} ${faq.answer}`).join(" "),
    "Sources",
    parts.sources.map((source) => `${source.label} ${source.href} Retrieved ${source.retrieved}`).join(" "),
    parts.notes.join(" "),
    `EPA snapshot ${parts.sources.find((source) => source.id === "epa-database").retrieved}. Regulatory pages retrieved ${GLOSSARY_RETRIEVED}.`,
  ].join(" ");
}

export function assertGlossaryCopy(text) {
  if (BANNED_COPY.test(text)) throw new Error(`glossary copy contains a banned word: ${text.match(BANNED_COPY)[0]}`);
  if (text.includes("cfpub.epa.gov")) throw new Error("glossary copy names the EPA application host");
  if (/\b(Product|Review|AggregateRating|DefinedTerm|DefinedTermSet)\b/.test(text)) {
    throw new Error("glossary copy names a banned structured-data type");
  }
  if (!/\bnot listed by EPA\b/i.test(text)) throw new Error("glossary copy never says a blank cell is not listed by EPA");
}
