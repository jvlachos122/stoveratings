// Pellet fuel grades a US buyer sees on a bag, limited to figures read from
// the standard owner's own published PDF or page on GRADES_RETRIEVED.
// EPA sentences are the cited eCFR sections. Snapshot counts are computed
// from the committed stove rows. This module does not fetch EPA.

import { countNoun } from "./format.js";
import { site } from "./site.js";

export const GRADES_PAGE = "/pellet-fuel-grades/";

export const GRADES_RETRIEVED = "2026-11-20";

export const GRADE_CAPTION = "Limits the cited PFI specification and ENplus standard print for each grade";

const BANNED_COPY = /\b(best|safe|safest|safer|top-rated|recommend\w*|scores?|ratings?|popular|winners?|affiliate|sponsored|cleanest|better)\b/i;

const QUOTE_532_E = "Operators of wood heaters that are certified to burn pellet fuels may burn only pellets that have been specified in the owner's manual and graded under a licensing agreement with a third-party organization approved by the EPA (including a certification by the third-party organization that the pellets do not contain, and are not manufactured from, any of the prohibited fuels in paragraph (f) of this section). The Pellet Fuels Institute, ENplus, and CANplus are initially deemed to be approved third-party organizations for this purpose, and additional organizations may apply to the Administrator for approval.";

const QUOTE_531_FUEL = "Pellet fuel means refined and densified fuel shaped into small pellets or briquettes that are uniform in size, shape, moisture, density and energy content.";

const QUOTE_534 = "Conduct testing with crib wood using EPA Method 28R of appendix A-8 of this part or an alternative crib wood test method approved by the Administrator or the ASTM E2779-10 (IBR, see § 60.17) pellet heater test method to establish the certification test conditions and the particulate matter emission values.";

const QUOTE_536 = "Such information must be consistent with the operating instructions provided by the manufacturer to the approved test laboratory for operating the wood heater during certification testing, except for details of the certification test that would not be relevant to the user.";

const QUOTE_538 = "No person is permitted to install or operate an affected wood heater except in a manner consistent with the instructions on its permanent label and in the owner's manual pursuant to § 60.536(g), including only using fuels for which the unit is certified.";

const QUOTE_532_F14 = "Any materials that were not included in the certification tests for the subject wood heater";

const SOURCE_DEFS = [
  {
    id: "cfr-60-531",
    href: "https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-60/subpart-AAA/section-60.531",
    label: "40 CFR 60.531, definitions",
  },
  {
    id: "cfr-60-532",
    href: "https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-60/subpart-AAA/section-60.532",
    label: "40 CFR 60.532, standards and requirements",
  },
  {
    id: "cfr-60-534",
    href: "https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-60/subpart-AAA/section-60.534",
    label: "40 CFR 60.534, test methods and procedures",
  },
  {
    id: "cfr-60-536",
    href: "https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-60/subpart-AAA/section-60.536",
    label: "40 CFR 60.536, labels and owner's manuals",
  },
  {
    id: "cfr-60-538",
    href: "https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-60/subpart-AAA/section-60.538",
    label: "40 CFR 60.538, prohibited activities",
  },
  {
    id: "pfi-spec",
    href: "https://www.pelletheat.org/assets/docs/2022/2022_PFI_Standard_Specification.pdf",
    label: "Pellet Fuels Institute Standard Specifications for Residential/Commercial Densified Fuel, October 4, 2022",
  },
  {
    id: "enplus-st-1001",
    href: "https://enplus-pellets.eu/wp-content/uploads/Documents/ENplus%C2%AE-ST-1001-ENplus%C2%AE-wood-pellets-Requirements-for-companies.pdf",
    label: "ENplus ST 1001:2022, second edition, ENplus wood pellets — Requirements for companies",
  },
  {
    id: "iso-17225-2",
    href: "https://www.iso.org/standard/76088.html",
    label: "ISO 17225-2:2021 catalogue page, Solid biofuels — Fuel specifications and classes — Part 2: Graded wood pellets",
  },
];

function source(id) {
  const found = SOURCE_DEFS.find((item) => item.id === id);
  if (!found) throw new Error(`missing pellet-grade source ${id}`);
  return { ...found, retrieved: GRADES_RETRIEVED };
}

export function gradeSources(snapshotDate) {
  return [
    ...SOURCE_DEFS.map((item) => source(item.id)),
    {
      id: "epa-database",
      href: site.epaDatabaseUrl,
      label: "EPA Certified Wood Heater Database",
      retrieved: snapshotDate,
    },
  ];
}

function joinList(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function pelletGradeCounts(stoves) {
  let currentRows = 0;
  let currentLines = 0;
  let insertLines = 0;
  let insertRows = 0;
  const fuelRows = new Map();
  let blankRows = 0;
  for (const stove of stoves || []) {
    if (!stove || stove.category !== "room" || !Array.isArray(stove.tests)) continue;
    const tests = stove.tests.filter((test) => test && test.current === true && test.type === "Pellet Stove");
    const lineIsCurrentPellet = stove.type === "Pellet Stove" && stove.current === true;
    if (lineIsCurrentPellet) currentLines += 1;
    if (lineIsCurrentPellet && stove.insertFlag === true) {
      insertLines += 1;
      insertRows += stove.tests.filter((test) => test && test.current === true).length;
    }
    currentRows += tests.length;
    for (const test of tests) {
      const fuel = typeof test.fuel === "string" ? test.fuel.trim() : "";
      if (!fuel) blankRows += 1;
      else fuelRows.set(fuel, (fuelRows.get(fuel) || 0) + 1);
    }
  }
  const fuels = [...fuelRows.entries()]
    .map(([fuel, rows]) => ({ fuel, rows }))
    .sort((a, b) => b.rows - a.rows || a.fuel.localeCompare(b.fuel));
  return { currentRows, currentLines, insertLines, insertRows, blankRows, fuels };
}

function insertClause(counts) {
  const lines = countNoun(counts.insertLines, "model line");
  const rows = countNoun(counts.insertRows, "currently certified row");
  const verb = counts.insertLines === 1 ? "has a name that indicates" : "have names that indicate";
  return `${lines} ${verb} an insert, covering ${rows}`;
}

export function gradeAnswer(counts, snapshotDate) {
  return [
    `EPA lists ${countNoun(counts.currentRows, "currently certified pellet-stove row")} on ${countNoun(counts.currentLines, "model line")} in the snapshot dated ${snapshotDate}, and ${insertClause(counts)}.`,
    "40 CFR 60.532(e) says an operator of a wood heater certified to burn pellet fuel may burn only pellets specified in the owner's manual and graded under a licensing agreement with a third-party organization approved by EPA, and that paragraph names the Pellet Fuels Institute, ENplus, and CANplus.",
    "The Pellet Fuels Institute specification dated October 4, 2022 prints Premium, Standard, and Utility, ENplus ST 1001:2022 prints classes A1, A2, and B, and the ISO 17225-2:2021 catalogue page does not print numeric class limits, so those ISO numbers are left off this page.",
  ];
}

export function fuelSentences(counts) {
  const sentences = [];
  if (!counts.fuels.length && !counts.blankRows) {
    sentences.push("No currently certified pellet-stove row is in this snapshot.");
  } else if (counts.fuels.length) {
    const bits = counts.fuels.map((item) => `${countNoun(item.rows, "row")} ${item.rows === 1 ? "lists" : "list"} ${item.fuel}`);
    sentences.push(`Certified Fuel Type on those currently certified pellet-stove rows: ${joinList(bits)}.`);
  }
  if (counts.blankRows) {
    const verb = counts.blankRows === 1 ? "leaves" : "leave";
    sentences.push(`${countNoun(counts.blankRows, "row")} ${verb} Certified Fuel Type blank. A blank cell is not listed by EPA and is not zero.`);
  }
  sentences.push("The grade names in the cited PFI specification are Premium, Standard, and Utility. The class names in the cited ENplus standard are A1, A2, and B.");
  return sentences;
}

export function gradeRows() {
  const same = (text) => ({ premium: text, standard: text, utility: text, a1: text, a2: text, b: text });
  const pfi = (premium, standard, utility) => ({ premium, standard, utility, a1: "Not in Table 4", a2: "Not in Table 4", b: "Not in Table 4" });
  const enplus = (a1, a2, b) => ({ premium: "Not in Table 1", standard: "Not in Table 1", utility: "Not in Table 1", a1, a2, b });
  const metals = "Arsenic ≤ 1, cadmium ≤ 0.5, chromium ≤ 10, copper ≤ 10, lead ≤ 10, mercury ≤ 0.1, nickel ≤ 10, zinc ≤ 100";
  return [
    {
      property: "Material",
      ...pfi("Woody biomass", "Woody biomass", "Woody biomass"),
      a1: "Table 5 lists the permitted wood types for this class",
      a2: "Table 5 lists the permitted wood types for this class",
      b: "Table 5 lists the permitted wood types for this class",
    },
    {
      property: "Additives",
      ...pfi("≤ 2.0%", "≤ 2.0%", "≤ 2.0%"),
      a1: "≤ 2.0 w-% as received. Production additives ≤ 1.8 w-%. Post-production additives ≤ 0.2 w-%",
      a2: "≤ 2.0 w-% as received. Production additives ≤ 1.8 w-%. Post-production additives ≤ 0.2 w-%",
      b: "≤ 2.0 w-% as received. Production additives ≤ 1.8 w-%. Post-production additives ≤ 0.2 w-%",
    },
    {
      property: "Bulk density",
      ...pfi("40.0 to 48.0 lb per cubic foot", "38.0 to 48.0 lb per cubic foot", "38.0 to 48.0 lb per cubic foot"),
      a1: "600 ≤ BD ≤ 750 kg/m³ as received",
      a2: "600 ≤ BD ≤ 750 kg/m³ as received",
      b: "600 ≤ BD ≤ 750 kg/m³ as received",
    },
    {
      property: "Diameter",
      ...pfi(
        "0.230 to 0.305 inches (5.84 to 7.75 mm in parentheses)",
        "0.230 to 0.305 inches (5.84 to 7.75 mm in parentheses)",
        "0.230 to 0.305 inches (5.84 to 7.75 mm in parentheses)",
      ),
      a1: "6 ± 1 mm or 8 ± 1 mm, as received",
      a2: "6 ± 1 mm or 8 ± 1 mm, as received",
      b: "6 ± 1 mm or 8 ± 1 mm, as received",
    },
    {
      property: "Length",
      ...pfi(
        "≤ 1.0 weight % longer than 1.50 inches",
        "≤ 1.0 weight % longer than 1.50 inches",
        "≤ 1.0 weight % longer than 1.50 inches",
      ),
      a1: "3.15 ≤ L ≤ 40 mm as received. At most 1 w-% may be longer than 40 mm. No pellet longer than 45 mm",
      a2: "3.15 ≤ L ≤ 40 mm as received. At most 1 w-% may be longer than 40 mm. No pellet longer than 45 mm",
      b: "3.15 ≤ L ≤ 40 mm as received. At most 1 w-% may be longer than 40 mm. No pellet longer than 45 mm",
    },
    {
      property: "Durability",
      premium: "Pellet durability index ≥ 96.5",
      standard: "Pellet durability index ≥ 95.0",
      utility: "Pellet durability index ≥ 95.0",
      a1: "Mechanical durability ≥ 98.0 w-% as received, at the loading point of the transport vehicle at the production site",
      a2: "Mechanical durability ≥ 97.5 w-% as received, at the loading point of the transport vehicle at the production site",
      b: "Mechanical durability ≥ 97.5 w-% as received, at the loading point of the transport vehicle at the production site",
    },
    {
      property: "Fines, PFI screen",
      ...pfi(
        "≤ 0.50% at the mill gate. Material passing a 1/8 inch screen",
        "≤ 1.0% at the mill gate. Material passing a 1/8 inch screen",
        "≤ 1.0% at the mill gate. Material passing a 1/8 inch screen",
      ),
    },
    {
      property: "Fines under 3.15 mm, bulk",
      ...enplus(
        "≤ 1.0 w-% as received, at the company gate or when loading big bags or a truck for end-user delivery",
        "≤ 1.0 w-% as received, at the company gate or when loading big bags or a truck for end-user delivery",
        "≤ 1.0 w-% as received, at the company gate or when loading big bags or a truck for end-user delivery",
      ),
    },
    {
      property: "Fines under 3.15 mm, bags",
      ...enplus(
        "≤ 0.5 w-% as received, at the company gate when filling bags",
        "≤ 0.5 w-% as received, at the company gate when filling bags",
        "Blank cell",
      ),
    },
    {
      property: "Ash",
      premium: "Inorganic ash ≤ 1.0% as-received",
      standard: "Inorganic ash ≤ 2.0% as-received",
      utility: "Inorganic ash ≤ 6.0% as-received",
      a1: "≤ 0.70 w-% dry basis",
      a2: "≤ 1.20 w-% dry basis",
      b: "≤ 2.00 w-% dry basis",
    },
    {
      property: "Moisture",
      ...pfi("≤ 8.0% as-received", "≤ 10.0% as-received", "≤ 10.0% as-received"),
      a1: "≤ 10.0 w-% as received",
      a2: "≤ 10.0 w-% as received",
      b: "≤ 10.0 w-% as received",
    },
    {
      property: "Chloride or chlorine",
      ...pfi("Chloride ≤ 300 ppm as-received", "Chloride ≤ 300 ppm as-received", "Chloride ≤ 300 ppm as-received"),
      a1: "Chlorine ≤ 0.02 w-% dry basis",
      a2: "Chlorine ≤ 0.02 w-% dry basis",
      b: "Chlorine ≤ 0.03 w-% dry basis",
    },
    {
      property: "Heating value",
      ...pfi(
        "7800 BTU/lb as-received. The cell prints no less-than or greater-than sign. Defined as higher heating value",
        "N/A",
        "N/A",
      ),
      a1: "Net calorific value ≥ 4.6 kWh/kg as received, stated as equal to ≥ 16.5 MJ/kg as received",
      a2: "Net calorific value ≥ 4.6 kWh/kg as received, stated as equal to ≥ 16.5 MJ/kg as received",
      b: "Net calorific value ≥ 4.6 kWh/kg as received, stated as equal to ≥ 16.5 MJ/kg as received",
    },
    {
      property: "Heavy metals, dry basis, mg/kg",
      ...same(metals),
    },
    {
      property: "Nitrogen",
      ...enplus("≤ 0.3 w-% dry basis", "≤ 0.5 w-% dry basis", "≤ 1.0 w-% dry basis"),
    },
    {
      property: "Sulfur",
      ...enplus("≤ 0.04 w-% dry basis", "≤ 0.04 w-% dry basis", "≤ 0.04 w-% dry basis"),
    },
    {
      property: "Ash fusion or ash deformation",
      ...pfi("N/A. Informative only, and not mandatory for the grade", "N/A. Informative only, and not mandatory for the grade", "N/A. Informative only, and not mandatory for the grade"),
      a1: "Ash deformation temperature ≥ 1200 °C. Ash is produced at 815 °C",
      a2: "Ash deformation temperature ≥ 1100 °C. Ash is produced at 815 °C",
      b: "Ash deformation temperature ≥ 1100 °C. Ash is produced at 815 °C",
    },
    {
      property: "Particle density, coarse fines, and pellets shorter than 10 mm",
      ...enplus(
        "Value to be stated. No numeric pass/fail limit is printed",
        "Value to be stated. No numeric pass/fail limit is printed",
        "Value to be stated. No numeric pass/fail limit is printed",
      ),
    },
  ];
}

export function schemeParagraphs() {
  return [
    "The Pellet Fuels Institute Standards Program grades in its October 4, 2022 specification are Premium, Standard, and Utility. Table 1 of that specification prints the grade limits. Section 1.2 names the normative properties: fines, bulk density, diameter, length, heating value, chloride, moisture content, pellet durability index, inorganic ash content, and heavy metals, plus woody biomass as the material type. Section 1.3 says ash fusion is the only informative property, and that determining ash fusion is not mandatory for the grade.",
    "Table 1 note 1 says failure to meet any fuel property requirement of a given grade does not automatically place a fuel in the next lower grade unless it meets all requirements of the lower grade. Note 4 says N/A means not applicable and that no value has been established. Note 5 says fines are determined by the producer at the production facility and reflect the fines at the mill gate as the product is shipped, measured on bagged product or bulk load-outs. Section 1.7 says the inch-pound values are the standard units, and that millimeter figures in parentheses are conversions.",
    "Table 1 note 2 says raw materials and additives shall exclude chemically treated materials and prohibited fuel types as defined in sections 4.2 and 4.3 of the PFI Residential/Commercial Densified Fuel QA/QC Handbook. Those handbook sections are a separate document. This page does not copy them.",
    "ENplus ST 1001:2022, second edition, was published on 2025-10-01 and came into force on 2026-01-01. Section 5.1.1 names three quality classes, A1, A2, and B, and points to the threshold values in Annex A.1, Table 4. The introduction says the requirements are based on ISO 17225-2 for raw material and product properties. Annex A.2 says the wood types in Table 5 originate in ISO 17225-2, and that the ENplus scheme deviates from ISO 17225-2 because demolition wood and chemically treated wood are not allowed for any ENplus certified pellets. Annex A.2.2 says rotted raw material, and raw material that includes contaminants or a high amount of bark, shall not be used.",
    "Where a producer combines pellets of different ENplus quality classes, section 5.2.2.3 says the outcome pellets take the lowest ENplus quality class among the pellets that were combined. Section 5.2.3.2 says the producer keeps the temperature of outgoing bulk pellets from exceeding 40 °C, and does not deliver pellets above 40 °C to the end user. That temperature rule is the same for each class, and it is outside Table 4.",
    "The ISO 17225-2:2021 catalogue page says the standard determines the fuel quality classes and specifications of graded wood pellets for non-industrial and industrial use. It says the standard covers wood pellets from forest, plantation, and other virgin wood; by-products and residues from the wood processing industry; and chemically untreated used wood. It says thermally treated biomass pellets, for example torrefied pellets, are outside the scope. That catalogue page does not print ash, moisture, or fines limits, so this page does not copy ISO 17225-2 class numbers.",
    "40 CFR 60.532(e) also names CANplus as initially deemed approved. This page does not include CANplus class limits. No CANplus standard-owner table was used for a number below.",
  ];
}

export function limitNotes() {
  return [
    "ENplus prints a decimal comma. The table uses a decimal point for the same digits. w-% means percent by weight, the unit Table 4 prints.",
    "A PFI cell and an ENplus cell on the same row are separate limits. PFI inorganic ash and moisture are as-received. ENplus ash is dry basis, and ENplus moisture is as received. PFI fines pass a 1/8 inch screen and are measured at the mill gate. ENplus fines are particles passing a 3.15 mm round-hole sieve. This page does not convert one into the other.",
    "PFI heating value is the higher heating value by ISO 18125. The Premium cell prints 7800 with no inequality sign. ENplus Table 4 prints a net calorific value, also tested by ISO 18125, and states that 4.6 kWh/kg equals at least 16.5 MJ/kg as received. This page does not convert that net figure to a higher heating value or to BTU per pound.",
    "Blank cell means Table 4 leaves the ENplus B bag-fines cell empty. Not in Table 1, and Not in Table 4, means that document's grade table has no row for that property. N/A is the text the PFI table prints.",
  ];
}

export function epaBlocks() {
  return [
    { quote: false, text: "Subpart AAA of 40 CFR part 60 is the standard for new residential wood heaters. The pellet-fuel paragraphs below are quoted from the eCFR text retrieved on this page's source date." },
    { quote: false, text: "40 CFR 60.531 defines pellet fuel in one sentence, and that definition does not name a grade:" },
    { quote: true, section: "40 CFR 60.531", text: QUOTE_531_FUEL },
    { quote: false, text: "40 CFR 60.532(e) is the pellet fuel requirement:" },
    { quote: true, section: "40 CFR 60.532(e)", text: QUOTE_532_E },
    { quote: false, text: `40 CFR 60.532(f) lists prohibited fuel types. Paragraph (f)(14) reads: "${QUOTE_532_F14}." Paragraph (e) includes a third-party certification that the graded pellets do not contain, and are not manufactured from, any of those prohibited fuels.` },
    { quote: false, text: "40 CFR 60.532(d) is the chip wood fuel paragraph. It states separate minimum requirements for chip wood. The pellet paragraph is 60.532(e)." },
    { quote: false, text: "40 CFR 60.534(a)(1)(i) names the pellet heater certification test method in this sentence:" },
    { quote: true, section: "40 CFR 60.534(a)(1)(i)", text: QUOTE_534 },
    { quote: false, text: "That sentence incorporates ASTM E2779-10 by reference. The eCFR section does not reprint the ASTM method's fuel specification, so this page does not copy one." },
    { quote: false, text: "40 CFR 60.536(g)(1) says the owner's manual must match the instructions the manufacturer gave the laboratory:" },
    { quote: true, section: "40 CFR 60.536(g)(1)", text: QUOTE_536 },
    { quote: false, text: "40 CFR 60.536(g)(3)(i) requires that manual to cover fuel loading and reloading, fuel selection, and warnings on fuels not to use. The examples named there are unseasoned wood, treated wood, colored paper, cardboard, solvents, trash, and garbage." },
    { quote: false, text: "40 CFR 60.538(e) limits operation to the fuels for which the unit is certified:" },
    { quote: true, section: "40 CFR 60.538(e)", text: QUOTE_538 },
  ];
}

export function snapshotParagraphs(counts) {
  return [
    "The counts above are room-heater rows. A central heater that burns pellets stays under hydronic heaters or forced-air furnaces.",
    ...fuelSentences(counts),
    "EPA's export has no insert column. A model line is labeled name indicates insert from the model name. The insert count uses that label.",
  ];
}

export function relatedLinks() {
  return [
    { href: "/pellet-stoves/", label: "Pellet stoves" },
    { href: "/most-efficient-pellet-stoves/", label: "Highest HHV efficiency among current pellet stoves" },
    { href: "/cleanest-burning-pellet-stoves/", label: "Lowest emission rate among current pellet stoves" },
    { href: "/pellet-stove-vs-wood-stove/", label: "Pellet and wood figures" },
    { href: "/tools/heating-cost-calculator/", label: "Heating cost calculator" },
    { href: "/pellet-stove-inserts/", label: "Pellet stove inserts" },
    { href: "/pellet-boilers/", label: "Pellet hydronic heaters" },
    { href: "/wood-furnaces/", label: "Forced-air furnaces" },
    { href: "/glossary/#pellet-fuel-grade", label: "Pellet fuel grade in the glossary" },
  ];
}

export function gradeFaqs(counts, snapshotDate) {
  const fuel = fuelSentences(counts).join(" ");
  return [
    {
      question: "What does a pellet fuel grade tell an EPA-certified pellet stove owner?",
      answer: "A pellet fuel grade is a set of limits published by a grading program. The Pellet Fuels Institute specification dated October 4, 2022 prints Premium, Standard, and Utility. ENplus ST 1001:2022 prints classes A1, A2, and B. The table on this page lists the ash, moisture, fines, and other limits those two documents print. 40 CFR 60.532(e) says the operator of a wood heater certified to burn pellet fuel may burn only pellets specified in the owner's manual and graded by a third-party organization approved by EPA.",
    },
    {
      question: "What does 40 CFR 60.532 say about pellet fuel and grading?",
      answer: `${QUOTE_532_E} That is 40 CFR 60.532(e). 40 CFR 60.531 defines pellet fuel as refined and densified fuel shaped into small pellets or briquettes that are uniform in size, shape, moisture, density and energy content, and that definition does not name a grade.`,
    },
    {
      question: "Which pellet grade does this site's EPA list show?",
      answer: `${fuel} Snapshot ${snapshotDate}. 40 CFR 60.534(a)(1)(i) names ASTM E2779-10 as a pellet heater test method. That eCFR section does not reprint the method's fuel specification.`,
    },
    {
      question: "Are the PFI and ENplus ash, moisture, and fines limits the same measurement?",
      answer: "PFI inorganic ash and moisture are as-received percents. ENplus ash is dry-basis percent by weight, and ENplus moisture is as received. PFI fines pass a 1/8 inch screen and are measured at the mill gate. ENplus fines are particles under 3.15 mm, with a bulk limit and a separate bag row. The table prints each limit with the basis the source prints. This page does not convert a PFI number into an ENplus number.",
    },
  ];
}

export function gradeNotes(snapshotDate) {
  return [
    `Standard and regulatory pages were retrieved ${GRADES_RETRIEVED}. The EPA snapshot is ${snapshotDate}.`,
    "The eCFR is not an official legal edition of the CFR. This page is not legal advice.",
    "A blank Certified Fuel Type cell is not listed by EPA. It is not zero.",
    "This page does not name a pellet producer, a stove brand to buy, or a bag price.",
  ];
}

export function gradeParts(stoves, snapshotDate) {
  const counts = pelletGradeCounts(stoves);
  const sources = gradeSources(snapshotDate);
  const hrefs = sources.map((item) => item.href);
  if (new Set(hrefs).size !== hrefs.length) throw new Error("duplicate pellet-grade source URL");
  const sentences = gradeAnswer(counts, snapshotDate);
  if (sentences.length !== 3) throw new Error(`pellet-grade answer has ${sentences.length} sentences`);
  const faqs = gradeFaqs(counts, snapshotDate);
  if (faqs.length < 3 || faqs.length > 4) throw new Error(`pellet-grade FAQ count ${faqs.length}`);
  const questions = new Set(faqs.map((faq) => faq.question));
  if (questions.size !== faqs.length) throw new Error("duplicate pellet-grade FAQ");
  const rows = gradeRows();
  for (const row of rows) {
    for (const key of ["property", "premium", "standard", "utility", "a1", "a2", "b"]) {
      if (!row[key]) throw new Error(`pellet-grade row missing ${key}`);
    }
  }
  const quotes = epaBlocks().filter((block) => block.quote);
  if (quotes.length < 4) throw new Error("pellet-grade page is missing eCFR quotes");
  return {
    counts,
    sentences,
    faqs,
    sources,
    rows,
    caption: GRADE_CAPTION,
    schemes: schemeParagraphs(),
    limitNotes: limitNotes(),
    epa: epaBlocks(),
    snapshot: snapshotParagraphs(counts),
    links: relatedLinks(),
    notes: gradeNotes(snapshotDate),
  };
}

export function gradeVisibleText(parts) {
  return [
    parts.sentences.join(" "),
    `Standard and regulatory pages retrieved ${GRADES_RETRIEVED}.`,
    parts.schemes.join(" "),
    parts.caption,
    "Property",
    "PFI Premium",
    "PFI Standard",
    "PFI Utility",
    "ENplus A1",
    "ENplus A2",
    "ENplus B",
    parts.rows.map((row) => `${row.property} ${row.premium} ${row.standard} ${row.utility} ${row.a1} ${row.a2} ${row.b}`).join(" "),
    parts.limitNotes.join(" "),
    parts.epa.map((block) => `${block.section || ""} ${block.text}`).join(" "),
    parts.snapshot.join(" "),
    parts.links.map((link) => link.label).join(" "),
    "Questions",
    parts.faqs.map((faq) => `${faq.question} ${faq.answer}`).join(" "),
    "Sources",
    parts.sources.map((item) => `${item.label} ${item.href} Retrieved ${item.retrieved}`).join(" "),
    parts.notes.join(" "),
  ].join(" ");
}

export function assertGradeCopy(text) {
  if (BANNED_COPY.test(text)) throw new Error(`pellet-grade copy contains a banned word: ${text.match(BANNED_COPY)[0]}`);
  if (text.includes(["cf", "pub.epa.gov"].join(""))) throw new Error("pellet-grade copy names the EPA application host");
  if (/\b(Product|Review|AggregateRating|WebApplication|Dataset)\b/.test(text)) {
    throw new Error("pellet-grade copy names a banned structured-data type");
  }
  if (!text.includes(QUOTE_532_E)) throw new Error("pellet-grade copy is missing the 40 CFR 60.532(e) quote");
}
