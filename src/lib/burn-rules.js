// Pointers to official state air-agency pages. Checked on LINKS_CHECKED.
// This module does not restate state or local rules and does not fetch EPA.
// adeq.state.ar.us is the Division of Environmental Quality site. It is not a
// .gov host. Every other linked host is a .gov host that returned HTTP 200
// on the check date. A row marked unverified did not.

import { site } from "./site.js";

export const BURN_RULES_PAGE = "/burn-rules/";

export const LINKS_CHECKED = "2026-11-21";

export const BURN_WISE_URL = "https://www.epa.gov/burnwise";

export const AIRNOW_URL = "https://www.airnow.gov/";

export const BURN_RULES_CAPTION = `State air-agency pages checked on ${LINKS_CHECKED}`;

// The agency's own site, checked on LINKS_CHECKED. Not a .gov host.
export const OFFICIAL_DOMAIN_EXCEPTIONS = ["adeq.state.ar.us"];

const BLOCKED_HOST = ["cf", "pub.epa.gov"].join("");

const BANNED_COPY = /\b(best|safe|safest|safer|top-rated|recommend\w*|scores?|ratings?|popular|winners?|affiliate|sponsored|cleanest|better)\b/i;

const JURISDICTIONS = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "District of Columbia",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
];

function linked(state, agency, kind, href) {
  return { state, agency, kind, href };
}

function unverified(state) {
  return { state, agency: "not verified", kind: "unverified", href: BURN_WISE_URL };
}

const ROWS = [
  linked("Alabama", "Alabama Department of Environmental Management", "air", "https://adem.alabama.gov/air/air-quality-information"),
  unverified("Alaska"),
  unverified("Arizona"),
  linked("Arkansas", "Division of Environmental Quality (DEQ)", "air", "https://adeq.state.ar.us/air/"),
  linked("California", "California Air Resources Board", "wood", "https://ww2.arb.ca.gov/our-work/programs/residential-woodsmoke-reduction"),
  linked("Colorado", "Colorado Department of Public Health and Environment", "wood", "https://cdphe.colorado.gov/indoor-burning-frequently-requested-information"),
  linked("Connecticut", "Department of Energy & Environmental Protection", "wood", "https://portal.ct.gov/DEEP/Air/Wood-Burning-in-Connecticut"),
  linked("Delaware", "Delaware Natural Resources and Environmental Control", "air", "https://dnrec.delaware.gov/air/"),
  linked("District of Columbia", "DC Department of Energy & Environment", "air", "https://doee.dc.gov/air"),
  linked("Florida", "Florida Department of Environmental Protection", "air", "https://floridadep.gov/air"),
  linked("Georgia", "Georgia Environmental Protection Division", "air", "https://epd.georgia.gov/air-protection-branch"),
  linked("Hawaii", "State of Hawaii, Department of Health", "air", "https://health.hawaii.gov/cab/"),
  linked("Idaho", "Idaho Department of Environmental Quality", "wood", "https://www.deq.idaho.gov/air-quality/smoke-and-burning/woodstove-best-burning-practices/"),
  linked("Illinois", "Illinois Environmental Protection Agency", "air", "https://epa.illinois.gov/topics/air-quality.html"),
  linked("Indiana", "Indiana Department of Environmental Management", "air", "https://www.in.gov/idem/airquality/"),
  linked("Iowa", "Iowa Department of Natural Resources", "air", "https://www.iowadnr.gov/environmental-protection/air-quality"),
  unverified("Kansas"),
  linked("Kentucky", "Kentucky Energy and Environment Cabinet", "air", "https://eec.ky.gov/Environmental-Protection/Air/Pages/default.aspx"),
  linked("Louisiana", "Louisiana Department of Environmental Quality", "air", "https://www.deq.louisiana.gov/page/air"),
  linked("Maine", "Maine Department of Environmental Protection", "wood", "https://www.maine.gov/dep/air/woodsmoke/woodcombustion.html"),
  linked("Maryland", "Maryland Department of the Environment", "air", "https://mde.maryland.gov/programs/air/Pages/index.aspx"),
  unverified("Massachusetts"),
  linked("Michigan", "Michigan Department of Environment, Great Lakes, and Energy", "air", "https://www.michigan.gov/egle/about/organization/air-quality"),
  unverified("Minnesota"),
  linked("Mississippi", "Mississippi Department of Environmental Quality", "air", "https://www.mdeq.ms.gov/air/"),
  linked("Missouri", "Missouri Department of Natural Resources", "air", "https://dnr.mo.gov/about-us/division-environmental-quality/air-pollution-control-program"),
  linked("Montana", "Montana Department of Environmental Quality", "air", "https://deq.mt.gov/air/"),
  linked("Nebraska", "Nebraska Department of Water, Energy, and Environment", "air", "https://dwee.nebraska.gov/air"),
  linked("Nevada", "Nevada Department of Environmental Protection", "air", "https://ndep.nv.gov/air"),
  unverified("New Hampshire"),
  unverified("New Jersey"),
  linked("New Mexico", "New Mexico Environment Department", "air", "https://www.env.nm.gov/air-quality/"),
  linked("New York", "Department of Environmental Conservation", "wood", "https://dec.ny.gov/environmental-protection/air-quality/residential-commercial-wood-burning"),
  linked("North Carolina", "North Carolina Department of Environmental Quality", "air", "https://www.deq.nc.gov/about/divisions/air-quality"),
  linked("North Dakota", "North Dakota Department of Environmental Quality", "air", "https://deq.nd.gov/AQ/"),
  linked("Ohio", "Ohio Environmental Protection Agency", "air", "https://epa.ohio.gov/divisions-and-offices/air-pollution-control"),
  linked("Oklahoma", "Department of Environmental Quality", "air", "https://oklahoma.gov/deq/divisions/air-quality.html"),
  linked("Oregon", "Oregon Department of Environmental Quality", "wood", "https://www.oregon.gov/deq/Residential/Pages/heatsmart.aspx"),
  linked("Pennsylvania", "Department of Environmental Protection", "air", "https://www.pa.gov/agencies/dep/programs-and-services/air"),
  unverified("Rhode Island"),
  linked("South Carolina", "South Carolina Department of Environmental Services", "air", "https://des.sc.gov/programs/bureau-air-quality"),
  linked("South Dakota", "South Dakota Department of Agriculture and Natural Resources", "air", "https://danr.sd.gov/Environment/AirQuality/default.aspx"),
  linked("Tennessee", "Department of Environment & Conservation", "air", "https://www.tn.gov/environment/air.html"),
  linked("Texas", "Texas Commission on Environmental Quality", "air", "https://www.tceq.texas.gov/agency/air_main.html"),
  linked("Utah", "Utah Department of Environmental Quality", "air", "https://deq.utah.gov/division-air-quality"),
  linked("Vermont", "Department of Environmental Conservation", "wood", "https://dec.vermont.gov/air-quality/compliance/owb"),
  unverified("Virginia"),
  linked("Washington", "Washington State Department of Ecology", "wood", "https://ecology.wa.gov/air-climate/air-quality/smoke-fire/wood-stove-info"),
  linked("West Virginia", "West Virginia Department of Environmental Protection", "air", "https://dep.wv.gov/daq/Pages/default.aspx"),
  linked("Wisconsin", "Wisconsin Department of Natural Resources", "wood", "https://dnr.wisconsin.gov/topic/OpenBurning/Boilers.html"),
  linked("Wyoming", "Wyoming Department of Environmental Quality", "air", "https://deq.wyoming.gov/aqd/"),
];

export function pageLinkLabel(kind) {
  if (kind === "wood") return "Wood-smoke page";
  if (kind === "air") return "Air-quality home page";
  if (kind === "unverified") return "not verified";
  throw new Error(`unknown burn-rule link kind ${kind}`);
}

export function isOfficialBurnUrl(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === BLOCKED_HOST || host.endsWith(`.${BLOCKED_HOST}`)) return false;
  if (OFFICIAL_DOMAIN_EXCEPTIONS.includes(host)) return true;
  return host.endsWith(".gov");
}

function assertRows(rows) {
  if (rows.length !== JURISDICTIONS.length) throw new Error(`burn-rule rows ${rows.length}`);
  const seen = new Set();
  for (const [index, row] of rows.entries()) {
    if (row.state !== JURISDICTIONS[index]) throw new Error(`burn-rule order ${row.state}`);
    if (seen.has(row.state)) throw new Error(`duplicate burn-rule state ${row.state}`);
    seen.add(row.state);
    if (!isOfficialBurnUrl(row.href)) throw new Error(`burn-rule URL ${row.state}`);
    if (row.href.includes(BLOCKED_HOST)) throw new Error(`burn-rule blocked host ${row.state}`);
    if (row.kind === "unverified") {
      if (row.agency !== "not verified" || row.href !== BURN_WISE_URL) {
        throw new Error(`unverified burn-rule row ${row.state}`);
      }
    } else if (row.kind !== "wood" && row.kind !== "air") {
      throw new Error(`burn-rule kind ${row.state}`);
    } else if (!row.agency || row.agency === "not verified") {
      throw new Error(`burn-rule agency ${row.state}`);
    }
  }
}

assertRows(ROWS);

export function burnRuleRows() {
  return ROWS.map((row) => ({ ...row, linkLabel: pageLinkLabel(row.kind) }));
}

export function burnRuleCounts(rows = burnRuleRows()) {
  const counts = { states: rows.length, wood: 0, air: 0, unverified: 0 };
  for (const row of rows) counts[row.kind] += 1;
  if (counts.wood + counts.air + counts.unverified !== counts.states) {
    throw new Error("burn-rule counts do not add up");
  }
  return counts;
}

export function burnRuleAnswer() {
  return [
    "Wood-burning rules, including burn bans, no-burn days, and stove change-out or sale rules, are set by states, air districts, and local governments.",
    "Check the official agency page for your state, and check your local government, because this page does not restate those rules.",
    "EPA certification, the subject of this site, is a federal manufacturing standard for wood heaters.",
  ];
}

export function burnRuleFaqs() {
  return [
    {
      question: "Who sets wood-burning rules?",
      answer: "States, air districts, and local governments set burn bans, no-burn days, and stove change-out or sale rules. This page links to a state air agency. It does not restate those rules, and a state page does not list every city or county rule.",
    },
    {
      question: "Does EPA certification settle a local burn rule?",
      answer: "EPA certification is a federal manufacturing standard for wood heaters. The certified-before-2020 page and the glossary describe that standard. Whether a fire is allowed on a given day is a state, air-district, or local question. This page does not answer that question for any place.",
    },
    {
      question: "What does not verified mean in the table?",
      answer: "A row that says not verified means this page did not confirm an official state agency URL on the check date. That row links to EPA's Burn Wise page. This page does not guess an address.",
    },
    {
      question: "Where is the daily air-quality report?",
      answer: "AirNow publishes the daily air-quality report. A daily report is not a burn rule. Check the state and local pages linked from this table for burn bans and no-burn days.",
    },
  ];
}

export function burnRuleSources() {
  const rows = burnRuleRows();
  const federal = [
    {
      id: "burn-wise",
      href: BURN_WISE_URL,
      label: "EPA Burn Wise",
      retrieved: LINKS_CHECKED,
    },
    {
      id: "airnow",
      href: AIRNOW_URL,
      label: "AirNow",
      retrieved: LINKS_CHECKED,
    },
  ];
  const states = rows
    .filter((row) => row.kind !== "unverified")
    .map((row) => ({
      id: row.state.toLowerCase().replaceAll(" ", "-"),
      href: row.href,
      label: `${row.state}: ${row.agency}`,
      retrieved: LINKS_CHECKED,
    }));
  return [...federal, ...states];
}

export function burnRuleNotes() {
  return [
    `Links checked on ${LINKS_CHECKED}. An agency can change its page after that date.`,
    "This page links to official pages. It does not restate state, air-district, or local rules.",
    "This page is not legal advice and does not state what any state allows or bans.",
    "A row that says not verified links to EPA Burn Wise because an official state URL was not confirmed.",
    "EPA certification is a federal manufacturing standard. It is a different question from a burn ban or a local sale rule.",
    `AirNow is the daily air-quality report at ${AIRNOW_URL}.`,
  ];
}

export function burnRuleParts() {
  const rows = burnRuleRows();
  const sentences = burnRuleAnswer();
  const faqs = burnRuleFaqs();
  const sources = burnRuleSources();
  const notes = burnRuleNotes();
  return {
    sentences,
    rows,
    faqs,
    sources,
    notes,
    caption: BURN_RULES_CAPTION,
    counts: burnRuleCounts(rows),
    checked: LINKS_CHECKED,
    checkedLine: `Links checked on ${LINKS_CHECKED}.`,
  };
}

export function burnRuleVisibleText(parts) {
  return [
    parts.sentences.join(" "),
    parts.checkedLine,
    "EPA Burn Wise",
    "AirNow",
    "certified before 2020",
    "glossary",
    parts.caption,
    "State",
    "Official agency",
    "Page",
    parts.rows.map((row) => `${row.state} ${row.agency} ${row.linkLabel} ${row.href}`).join(" "),
    "Questions",
    parts.faqs.map((faq) => `${faq.question} ${faq.answer}`).join(" "),
    "Sources",
    parts.sources.map((source) => `${source.label} ${source.href} Retrieved ${source.retrieved}`).join(" "),
    parts.notes.join(" "),
    site.name,
  ].join(" ");
}

export function assertBurnCopy(text) {
  const stripped = text.replace(/https?:\/\/\S+/g, "");
  if (BANNED_COPY.test(stripped)) {
    throw new Error(`burn-rule copy contains a banned word: ${stripped.match(BANNED_COPY)[0]}`);
  }
  if (text.includes(BLOCKED_HOST)) throw new Error("burn-rule copy names the EPA application host");
  if (!text.includes(`Links checked on ${LINKS_CHECKED}`)) throw new Error("burn-rule copy omits the check date");
  if (!text.includes("not verified")) throw new Error("burn-rule copy omits not verified");
  if (!/not legal advice/i.test(text)) throw new Error("burn-rule copy omits the legal-advice limit");
}
