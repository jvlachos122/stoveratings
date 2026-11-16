// Cited firewood-moisture figures. Every percent and seasoning time on the
// page comes from a source fetched on MOISTURE_RETRIEVED. This module does
// not fetch EPA, and it does not name a meter brand or a seller.

export const MOISTURE_PAGE = "/firewood-moisture/";

export const MOISTURE_RETRIEVED = "2026-11-16";

export const TARGET_CAPTION = "Moisture figures each cited source states for firewood";

export const SEASON_CAPTION = "Seasoning times each cited source states";

export const SIGN_CAPTION = "Signs of dryness named by cited sources";

const BANNED_COPY = /\b(best|top-rated|recommend\w*|scores?)\b/i;

const SOURCE_DEFS = [
  {
    id: "epa-efficiency",
    href: "https://www.epa.gov/burnwise/energy-efficiency-and-your-wood-burning-appliance",
    label: "EPA Burn Wise: Energy efficiency and your wood-burning appliance",
  },
  {
    id: "epa-meter",
    href: "https://www.epa.gov/sites/default/files/2020-11/documents/moisturemeter_flyer_02112020_v1_d35_print_opt.pdf",
    label: "EPA Burn Wise: Test Your Wood with a Moisture Meter (EPA-456/F-20-003)",
  },
  {
    id: "wood-handbook",
    href: "https://www.fs.usda.gov/research/treesearch/37440",
    label: "Forest Products Laboratory, Wood handbook: wood as an engineering material, chapter 4",
  },
  {
    id: "basis-chapter",
    href: "http://www.ruraltech.org/projects/conversions/briggs_conversions/briggs_ch01/Chapter01_combined.pdf",
    label: "Chapter 1, Basic Wood Properties: oven-dry and wet-basis formulas",
  },
  {
    id: "mu-g5450",
    href: "https://extension.missouri.edu/publications/g5450",
    label: "University of Missouri Extension G5450, Wood Fuel for Heating",
  },
  {
    id: "mu-g5451",
    href: "https://extension.missouri.edu/publications/g5451",
    label: "University of Missouri Extension G5451, Preparing Wood for Your Wood Stove",
  },
  {
    id: "penn-state",
    href: "https://extension.psu.edu/heating-with-wood-an-introduction",
    label: "Penn State Extension, Heating with Wood: An Introduction",
  },
  {
    id: "minnesota-436",
    href: "https://hdl.handle.net/11299/169045",
    label: "University of Minnesota Agricultural Extension Service, Extension Bulletin 436, Heating the home with wood (1979)",
  },
  {
    id: "arkansas-fireplace",
    href: "https://www.uaex.uada.edu/environment-nature/energy/fireplace-safety.aspx",
    label: "University of Arkansas Division of Agriculture, Heating with firewood",
  },
  {
    id: "arkansas-chart",
    href: "https://www.uaex.uada.edu/environment-nature/energy/firewood.aspx",
    label: "University of Arkansas Division of Agriculture, Firewood, including the cord-heat table compiled from USDA Forest Service Leaflet No. 559",
  },
];

function source(id) {
  const found = SOURCE_DEFS.find((item) => item.id === id);
  if (!found) throw new Error(`missing moisture source ${id}`);
  return { ...found, retrieved: MOISTURE_RETRIEVED };
}

export function moistureSources() {
  return SOURCE_DEFS.map((item) => source(item.id));
}

function linkedRow(id, fields) {
  const item = source(id);
  return {
    id,
    source: item.label,
    href: item.href,
    retrieved: item.retrieved,
    ...fields,
  };
}

export function moistureAnswer() {
  return [
    "EPA Burn Wise states a moisture-meter reading of 20% or less for properly dried wood, and its moisture-meter flyer says wood is ready to burn below 20% moisture content.",
    "Neither EPA page states whether that percent is oven-dry basis or wet basis. The Forest Products Laboratory Wood Handbook calculates moisture content as the mass of water divided by the mass of ovendry wood, and a cited conversions chapter says oven-dry basis is common for lumber while wet basis is common in the wood-energy industry.",
    "Missouri Extension says 20% or less, and its heat guide describes about 20% on an oven-dry basis. Penn State Extension says about 20%. A 1979 Minnesota Extension bulletin says outdoor drying reaches about 15 to 25%. The cord-heat table on this site does not state a moisture percent.",
  ];
}

export function targetRows() {
  return [
    linkedRow("epa-efficiency", {
      moisture: "20% or less on a moisture meter for properly dried wood",
      basis: "Not stated",
    }),
    linkedRow("epa-meter", {
      moisture: "Below 20% moisture content to be ready to burn",
      basis: "Not stated",
    }),
    linkedRow("mu-g5451", {
      moisture: "20% or less. The guide calls that the ideal moisture content for firewood. Fresh wood is often 50% or more.",
      basis: "Not stated",
    }),
    linkedRow("mu-g5450", {
      moisture: "About 20% for air-dried hardwood, described as 0.83 pound of dry wood and 0.17 pound of water. Fresh Missouri hardwoods are commonly 75% on an oven-dry basis.",
      basis: "Oven-dry basis",
    }),
    linkedRow("penn-state", {
      moisture: "About 20%. Freshly cut northern red oak can be 60 to 80%. The cord-energy table on that page assumes 20% for air-dried wood.",
      basis: "Not stated",
    }),
    linkedRow("minnesota-436", {
      moisture: "About 15 to 25% for wood stacked outdoors in a sunny open area. The same bulletin also says medium to low density firewood can reach about 20% after a minimum of 6 favorable drying months.",
      basis: "Not stated",
    }),
    linkedRow("arkansas-fireplace", {
      moisture: "20% or less, paired with at least six months of drying",
      basis: "Not stated",
    }),
  ];
}

export function seasoningRows() {
  return [
    linkedRow("epa-efficiency", {
      time: "At least 6 months for softwood and at least 12 months for hardwood",
      caveat: "Split pieces to 6 inches in diameter or smaller, stack them off the ground with the split side down, and cover the top.",
    }),
    linkedRow("epa-meter", {
      time: "At least 6 to 12 months after the wood is split, stacked, covered, and stored",
      caveat: "Split wood dries much faster than whole logs, and smaller pieces burn cleaner.",
    }),
    linkedRow("mu-g5451", {
      time: "At least one drying season, spring through fall",
      caveat: "Fresh wood often has a moisture content of 50% or more. The guide says to stack wood in the spring for the following winter.",
    }),
    linkedRow("penn-state", {
      time: "Generally 6 to 12 months, and at least six months in the schedule it prints",
      caveat: "Some species may require more than six months. Wood cut and stacked outside that schedule can take longer.",
    }),
    linkedRow("arkansas-chart", {
      time: "Six to nine months, depending on the moisture content when the wood was cut",
      caveat: "Dead standing trees have lower moisture than live trees and need less time.",
    }),
    linkedRow("arkansas-fireplace", {
      time: "At least six months",
      caveat: "The page defines seasoned wood as wood dried for that long with a moisture content of 20% or less.",
    }),
    linkedRow("minnesota-436", {
      time: "At least 6 months of favorable drying weather to reach about 15 to 25%",
      caveat: "Medium to low density firewood needs a minimum of 6 favorable drying months to reach about 20%. The 1979 record says the bulletin may not reflect current scientific knowledge.",
    }),
  ];
}

export function signRows() {
  return [
    linkedRow("epa-meter", {
      sign: "Moisture meter on a newly split side",
      statement: "Split the wood and test the newly split side. Insert the probes into the wood grain. See the meter instructions for anything more specific. The flyer does not state whether the meter reads oven-dry basis or wet basis.",
    }),
    linkedRow("arkansas-chart", {
      sign: "Sound, and checks in the end grain",
      statement: "Strike two pieces together. A sharp cracking sound means the wood is fairly dry. A dull thud means the moisture content is still high. Dry wood also shows cracks or checks in the end grain along the cut surface.",
    }),
    linkedRow("mu-g5450", {
      sign: "Checks, color, and smell",
      statement: "Seasoning checks, meaning open splits, show on the ends of at least partially dried wood. Wood seasoned outside is somewhat discolored, and it should not smell sappy.",
    }),
    linkedRow("minnesota-436", {
      sign: "End checks are not enough",
      statement: "End checks or splits may not indicate interior dryness. The bulletin says proper seasoning can be checked by weighing several representative pieces until there is no further reduction in weight.",
    }),
  ];
}

export function basisParagraphs() {
  return [
    "Oven-dry basis, also called dry basis, divides the mass of water by the mass of ovendry wood. Wet basis divides the mass of water by the original total weight, wood plus water.",
    "Forest Products Laboratory chapter 4 of the Wood Handbook says moisture content is usually expressed as a percentage calculated from the mass of water in the wood and the mass of the ovendry wood. On that definition, green wood can range from about 30% to more than 200%.",
    "The cited conversions chapter says moisture content may be expressed either way, so it matters which one a page is using. Oven-dry basis is commonly used in solid wood industries such as lumber and plywood, and on that basis the percent can exceed 100%. Wet basis is commonly used in the pulp and paper and the wood energy industries, and on that basis the percent cannot reach 100%. In its worked example, the same kiln-dry piece is 15% on an oven-dry basis and 13% on a wet basis.",
    "The EPA efficiency page, the EPA moisture-meter flyer, Penn State Extension, Minnesota Extension Bulletin 436, both Arkansas pages, and Missouri guide G5451 do not state which basis their percents use. Missouri guide G5450 does: fresh hardwoods are commonly 75% on an oven-dry basis, which it spells out as 0.57 pound of dry wood and 0.43 pound of water in a pound of wood, and it describes air-dried hardwood as about 20% moisture, or 0.83 pound of dry wood and 0.17 pound of water.",
    "None of these pages state that a firewood moisture meter reads oven-dry basis. The EPA flyer says to see the meter instructions.",
  ];
}

export function checkParagraphs() {
  return [
    "The EPA moisture-meter flyer says to split the wood and test the newly split side, with the probes inserted into the wood grain, and to see the meter instructions for anything more specific. The efficiency page says a moisture meter can test the level and that properly dried wood should read 20% or less. Neither page names a meter brand, and neither page states the basis of the reading.",
  ];
}

export function whyParagraphs() {
  return [
    "The emission rate and HHV efficiency on a stove page are the EPA test figures in the snapshot. They are not a measurement of one stack of firewood. EPA Burn Wise says wet wood can create excessive smoke which is lost heat. The moisture-meter flyer says wet wood produces less heat and more smoke and creosote.",
    "Missouri Extension G5450 says heat is needed to remove water, so more water in the wood means less available heat. It states about 8,600 Btu per oven-dry pound of hardwood, about 4,900 Btu per pound at 75% oven-dry moisture (0.57 pound of dry wood times 8,600), and about 7,100 Btu per pound at about 20% moisture (0.83 pound of dry wood times 8,600). Those are that guide's figures, not the cord table on this site.",
    "Follow the stove manual for the fuel that appliance is listed to burn.",
  ];
}

export function chartParagraphs() {
  return [
    "The firewood heat values page copies the University of Arkansas table of million BTU per cord. That page says the heat value depends on density and moisture content, and that the table was compiled from USDA Forest Service Leaflet No. 559. Retrieved 2026-11-16, the table still does not state a moisture percent for those cord figures, so this site does not apply one.",
    "Other cited heat examples use their own moisture assumption. Missouri G5450 uses air-dried hardwood at about 20% oven-dry moisture for its Btu-per-pound example. Penn State Extension assumes 20% for the air-dried cord in its own energy table. Those are not the Arkansas cord figures.",
    "The heating cost calculator uses the published Arkansas cord figures and does not apply a moisture percent that table does not state. Piece length is a separate measurement.",
  ];
}

export function moistureFaqs() {
  return [
    {
      question: "How dry should firewood be?",
      answer: "EPA Burn Wise says properly dried wood should read 20% or less on a moisture meter, and the EPA moisture-meter flyer says ready to burn means below 20% moisture content. Missouri Extension G5451 says the ideal moisture content for firewood is 20% or less. Missouri Extension G5450 describes air-dried hardwood as about 20% on an oven-dry basis. Penn State Extension says about 20%. University of Minnesota Extension Bulletin 436 says wood stacked outdoors dries to about 15 to 25%. The University of Arkansas fireplace page says seasoned wood has a moisture content of 20% or less.",
    },
    {
      question: "Is firewood moisture oven-dry basis or wet basis?",
      answer: "Oven-dry basis divides the water by the ovendry wood, and the Wood Handbook uses that definition. Wet basis divides the water by the total weight. The cited conversions chapter says lumber and plywood commonly use oven-dry basis, the wood-energy industry commonly uses wet basis, and the same kiln-dry piece in its example is 15% oven-dry and 13% wet. The EPA pages do not state which basis their 20% figures use. Missouri G5450 states an oven-dry basis. A meter reading's basis is not stated by the EPA flyer, which says to see the meter instructions.",
    },
    {
      question: "How long does firewood take to season?",
      answer: "EPA Burn Wise says at least 6 months for softwood and at least 12 months for hardwood. The moisture-meter flyer says at least 6 to 12 months. Missouri Extension says at least one drying season, spring through fall, because fresh wood is often 50% or more. Penn State Extension says generally 6 to 12 months, at least six months, and some species may require more than six months. The University of Arkansas firewood page says six to nine months depending on the moisture when the wood was cut, and less time for dead standing trees. The 1979 Minnesota bulletin says at least 6 months of favorable drying weather, and its record says the bulletin may not reflect current scientific knowledge.",
    },
    {
      question: "How do you check firewood moisture, and why does it matter on an EPA-certified stove?",
      answer: "The EPA flyer says to split the wood, test the newly split side, and put the probes into the wood grain, then see the meter instructions. It says wet wood produces less heat and more smoke and creosote. The efficiency page says wet wood can create excessive smoke which is lost heat. Missouri Extension puts the heat difference at about 8,600 Btu per oven-dry pound of hardwood, about 4,900 Btu per pound at 75% oven-dry moisture, and about 7,100 Btu per pound at about 20%. The EPA test numbers on this site are not that measurement. Follow the stove manual. The million-BTU-per-cord table does not state a moisture percent.",
    },
  ];
}

export function moistureNotes() {
  return [
    `Every external sentence above is taken from a page retrieved ${MOISTURE_RETRIEVED}. Where two sources disagree, both are shown.`,
    "Not stated means that page does not say whether the percent is oven-dry basis or wet basis.",
    "The University Digital Conservancy record for the 1979 Minnesota bulletin says it may not reflect current scientific knowledge and points to University of Minnesota Extension for current information.",
    "No meter brand is named here. The EPA flyer says to see the meter instructions.",
    "The cord-heat table, the Missouri Btu-per-pound example, and the Penn State cord-energy table are different publications. A percent from one is not applied to another.",
    "EPA certification figures on stove pages are the test numbers in the snapshot. They are not a moisture reading. Follow the stove manual.",
  ];
}

export function moistureParts() {
  const sources = moistureSources();
  const hrefs = new Set(sources.map((item) => item.href));
  if (hrefs.size !== sources.length) throw new Error("duplicate moisture source URL");
  const sentences = moistureAnswer();
  const faqs = moistureFaqs();
  const targets = targetRows();
  const seasons = seasoningRows();
  const signs = signRows();
  const ids = new Set(sources.map((item) => item.id));
  for (const row of [...targets, ...seasons, ...signs]) {
    if (!ids.has(row.id)) throw new Error(`moisture row uses an unknown source ${row.id}`);
    if (row.retrieved !== MOISTURE_RETRIEVED) throw new Error(`moisture row ${row.id} retrieved date drifted`);
  }
  if (faqs.length < 2 || faqs.length > 4) throw new Error(`moisture FAQ count ${faqs.length}`);
  const questions = new Set(faqs.map((faq) => faq.question));
  if (questions.size !== faqs.length) throw new Error("duplicate moisture FAQ");
  return {
    sentences,
    faqs,
    sources,
    targets,
    seasons,
    signs,
    basis: basisParagraphs(),
    check: checkParagraphs(),
    why: whyParagraphs(),
    chart: chartParagraphs(),
    notes: moistureNotes(),
    targetCaption: TARGET_CAPTION,
    seasonCaption: SEASON_CAPTION,
    signCaption: SIGN_CAPTION,
  };
}

export function moistureVisibleText(parts = moistureParts()) {
  return [
    parts.sentences.join(" "),
    `Sources retrieved ${MOISTURE_RETRIEVED}.`,
    parts.targetCaption,
    "Source",
    "Moisture the source states",
    "Basis",
    "Retrieved",
    parts.targets.map((row) => `${row.source} ${row.href} ${row.moisture} ${row.basis} ${row.retrieved}`).join(" "),
    "What the percent means",
    parts.basis.join(" "),
    "How to check a piece",
    parts.check.join(" "),
    parts.signCaption,
    "Sign",
    "What the source says",
    parts.signs.map((row) => `${row.sign} ${row.statement} ${row.source}`).join(" "),
    "Why it matters on an EPA-certified stove",
    parts.why.join(" "),
    "The cord-heat table",
    parts.chart.join(" "),
    "Seasoning time",
    parts.seasonCaption,
    "Time the source states",
    "Caveat the source states",
    parts.seasons.map((row) => `${row.source} ${row.time} ${row.caveat} ${row.retrieved}`).join(" "),
    "Questions",
    parts.faqs.map((faq) => `${faq.question} ${faq.answer}`).join(" "),
    "Sources",
    parts.sources.map((item) => `${item.label} ${item.href} Retrieved ${item.retrieved}`).join(" "),
    parts.notes.join(" "),
  ].join(" ");
}

export function assertMoistureCopy(text) {
  if (BANNED_COPY.test(text)) {
    throw new Error(`firewood moisture copy contains a banned word: ${text.match(BANNED_COPY)[0]}`);
  }
  if (text.includes(["cf", "pub.epa.gov"].join(""))) throw new Error("firewood moisture copy names the EPA application host");
  if (/\b(Product|Review|AggregateRating|WebApplication)\b/.test(text)) {
    throw new Error("firewood moisture copy names a banned structured-data type");
  }
  const hrefs = new Set(moistureSources().map((item) => item.href));
  for (const match of text.matchAll(/https?:\/\/[^\s)]+/g)) {
    const href = match[0].replace(/[.,]$/, "");
    if (!hrefs.has(href)) throw new Error(`firewood moisture copy cites an unlisted URL ${href}`);
  }
}
