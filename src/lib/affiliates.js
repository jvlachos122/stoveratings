// LogOX affiliate links (Awin advertiser 94859, publisher 3131988).
// Set enabled to false to drop every LogOX block and the disclosure claim
// that those links are on the site. Destinations were requested on LOGOX.checked.

import { site } from "./site.js";

export const LOGOX = {
  enabled: true,
  merchantId: "94859",
  publisherId: "3131988",
  network: "Awin",
  label: "Firewood tools from LogOX",
  disclosure:
    "Affiliate link: StoveRatings may earn a commission if you buy through it, at no extra cost to you.",
  rel: "sponsored nofollow noopener",
  checked: "2026-11-13",
};

const AWIN_ORIGIN = "https://www.awin1.com/cread.php";

// Page titles are the <title> text returned on LOGOX.checked. They are a
// record of what was checked, not copy for the site.
export const LOGOX_DESTINATIONS = {
  splitters: {
    url: "https://www.thelogox.com/collections/logsplitters",
    verifiedTitle: "Log Splitters & Accessories: TimberOX Summit 30-Ton | LogOX",
  },
  firewoodTools: {
    url: "https://www.thelogox.com/collections/firewood-innovations-home",
    verifiedTitle: "Firewood Tools & Home Heating Accessories | LogOX",
  },
  tools: {
    url: "https://www.thelogox.com/collections/tools",
    verifiedTitle: "LogOX Tools: MultiTool, Hauler, WoodOX Sling and More",
  },
  hearth: {
    url: "https://www.thelogox.com/collections/hearthside-products",
    verifiedTitle: "American-Made Firewood Accessories | LogOX",
  },
  hauler: {
    url: "https://www.thelogox.com/products/logox-carrying-tool",
    verifiedTitle: "LogOX Log Hauler: Hand Tool to Lift and Carry Log Rounds",
  },
};

export const LOGOX_PLACEMENTS = [
  {
    path: "/firewood-btu-chart/",
    label: "Firewood heat values",
    destinationId: "splitters",
  },
  {
    path: "/tools/heating-cost-calculator/",
    label: "Heating cost calculator",
    destinationId: "firewoodTools",
  },
  {
    path: "/pellet-stove-vs-wood-stove/",
    label: "Pellet stove and wood stove figures",
    destinationId: "tools",
  },
  {
    path: "/catalytic-wood-stoves/",
    label: "Catalytic wood stoves",
    destinationId: "tools",
  },
  {
    path: "/non-catalytic-wood-stoves/",
    label: "Non-catalytic wood stoves",
    destinationId: "tools",
  },
  {
    path: "/hybrid-wood-stoves/",
    label: "Hybrid wood stoves",
    destinationId: "tools",
  },
  {
    path: "/wood-stove-inserts/",
    label: "Wood stove inserts",
    destinationId: "hearth",
  },
  {
    path: "/outdoor-wood-boilers/",
    label: "Hydronic heaters",
    destinationId: "hauler",
  },
];

// Etsy Affiliate US on Rakuten Advertising (MID 54027, publisher AseERiKMclc).
// Set enabled to false to drop every Etsy block and the disclosure claim
// that those links are on the site. Searches were checked on ETSY.checked.
// Destinations are Etsy search URLs with spaces in the query. rakutenHref
// single-encodes that URL once. A pre-encoded query (%20) is rejected so
// the deeplink does not turn into the double-encoded %2520 form.
export const ETSY = {
  enabled: true,
  merchantId: "54027",
  publisherId: "AseERiKMclc",
  network: "Rakuten Advertising",
  heading: "Shop accessories on Etsy",
  disclosure: "Affiliate link: we may earn a commission from Etsy purchases at no cost to you.",
  rel: "sponsored nofollow noopener",
  checked: "2026-11-26",
};

const RAKUTEN_DEEPLINK = "https://click.linksynergy.com/deeplink";

export const ETSY_PLACEMENTS = [
  {
    path: "/firewood-btu-chart/",
    label: "Firewood heat values",
    searches: [
      { query: "firewood log holder", label: "Firewood log holder" },
      { query: "kindling splitter", label: "Kindling splitter" },
    ],
  },
  {
    path: "/tools/heating-cost-calculator/",
    label: "Heating cost calculator",
    searches: [{ query: "firewood log holder", label: "Firewood log holder" }],
  },
  {
    path: "/pellet-stove-vs-wood-stove/",
    label: "Pellet stove and wood stove figures",
    searches: [{ query: "wood stove accessories", label: "Wood stove accessories" }],
  },
  {
    path: "/catalytic-wood-stoves/",
    label: "Catalytic wood stoves",
    searches: [{ query: "wood stove fan", label: "Wood stove fan" }],
  },
  {
    path: "/non-catalytic-wood-stoves/",
    label: "Non-catalytic wood stoves",
    searches: [{ query: "wood stove trivet", label: "Wood stove trivet" }],
  },
  {
    path: "/hybrid-wood-stoves/",
    label: "Hybrid wood stoves",
    searches: [{ query: "wood stove steamer", label: "Wood stove steamer" }],
  },
  {
    path: "/wood-stove-inserts/",
    label: "Wood stove inserts",
    searches: [
      { query: "fireplace tool set", label: "Fireplace tool set" },
      { query: "hearth gloves", label: "Hearth gloves" },
    ],
  },
  {
    path: "/outdoor-wood-boilers/",
    label: "Hydronic heaters",
    searches: [{ query: "firewood log rack", label: "Firewood log rack" }],
  },
];

export function awinHref(destination) {
  const url = String(destination || "");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`LogOX destination is not a URL: ${url}`);
  }
  if (parsed.protocol !== "https:" || parsed.host !== "www.thelogox.com" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`LogOX destination must be an https www.thelogox.com path: ${url}`);
  }
  return `${AWIN_ORIGIN}?awinmid=${LOGOX.merchantId}&awinaffid=${LOGOX.publisherId}&ued=${encodeURIComponent(url)}`;
}

export function etsySearchDestination(query) {
  const text = String(query || "").trim().replace(/\s+/g, " ");
  if (!/^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/.test(text)) {
    throw new Error(`Etsy search must be plain words: ${query}`);
  }
  if (/\b(best|top-rated|recommend\w*|scores?|ratings?)\b/i.test(text)) {
    throw new Error(`Etsy search must not rank or score: ${query}`);
  }
  const destination = `https://www.etsy.com/search?q=${text}`;
  const parsed = new URL(destination);
  if (parsed.protocol !== "https:" || parsed.hostname !== "www.etsy.com" || parsed.pathname !== "/search") {
    throw new Error(`Etsy destination is not a search URL: ${destination}`);
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error(`Etsy destination must be an https www.etsy.com URL: ${destination}`);
  }
  if (parsed.searchParams.get("q") !== text || [...parsed.searchParams.keys()].some((key) => key !== "q")) {
    throw new Error(`Etsy search did not round-trip: ${destination}`);
  }
  return destination;
}

export function rakutenHref(destination) {
  const url = String(destination || "");
  if (url.includes("%")) {
    throw new Error(`Etsy destination must be single-encoded by rakutenHref, not pre-encoded: ${url}`);
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Etsy destination is not a URL: ${url}`);
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "www.etsy.com" || parsed.username || parsed.password || parsed.hash) {
    throw new Error(`Etsy destination must be an https www.etsy.com URL: ${url}`);
  }
  if (parsed.pathname.includes("/listing")) {
    throw new Error(`Etsy destination must not be a listing: ${url}`);
  }
  const search = parsed.pathname === "/search" && parsed.searchParams.get("q");
  const category = parsed.pathname.startsWith("/c/") && parsed.pathname.length > "/c/".length;
  if (!search && !category) {
    throw new Error(`Etsy destination must be a search or category URL: ${url}`);
  }
  return `${RAKUTEN_DEEPLINK}?id=${ETSY.publisherId}&mid=${ETSY.merchantId}&murl=${encodeURIComponent(url)}`;
}

function etsyPlacementRows() {
  return ETSY_PLACEMENTS.flatMap((item) =>
    item.searches.map((search) => ({
      path: item.path,
      label: item.label,
      linkLabel: search.label,
      destination: etsySearchDestination(search.query),
      checked: ETSY.checked,
    })),
  );
}

export function logoxNote(path, options = {}) {
  const enabled = options.enabled ?? LOGOX.enabled;
  if (!enabled) return null;
  const placement = LOGOX_PLACEMENTS.find((item) => item.path === path);
  if (!placement) return null;
  const destination = LOGOX_DESTINATIONS[placement.destinationId];
  if (!destination) throw new Error(`Unknown LogOX destination ${placement.destinationId}`);
  return {
    href: awinHref(destination.url),
    label: LOGOX.label,
    rel: LOGOX.rel,
    disclosure: LOGOX.disclosure,
    destination: destination.url,
    path,
  };
}

export function etsyNote(path, options = {}) {
  const enabled = options.enabled ?? ETSY.enabled;
  if (!enabled) return null;
  const placement = ETSY_PLACEMENTS.find((item) => item.path === path);
  if (!placement) return null;
  return {
    heading: ETSY.heading,
    rel: ETSY.rel,
    target: "_blank",
    disclosure: ETSY.disclosure,
    path,
    links: placement.searches.map((search) => {
      const destination = etsySearchDestination(search.query);
      return {
        href: rakutenHref(destination),
        label: search.label,
        destination,
      };
    }),
  };
}

function etsyDisclosureParagraphs(logoxAlsoOn) {
  const paragraphs = [
    `Some pages include an affiliate link to Etsy (etsy.com) through Rakuten Advertising. StoveRatings may earn a commission if you buy through that link, at no cost to you. Each link is marked with this sentence: ${ETSY.disclosure}`,
    "These are plain links. StoveRatings does not load a Rakuten or Etsy script or pixel. Rakuten may set a cookie on its own site after you follow a link. This site does not.",
  ];
  if (!logoxAlsoOn) {
    paragraphs.push("Lists are ordered by an EPA number when they are ordered at all. An affiliate link does not change that order.");
  }
  paragraphs.push(`The Etsy searches below were checked in the Rakuten Advertising dashboard on ${ETSY.checked}.`);
  return paragraphs;
}

export function disclosureView(options = {}) {
  const logoxEnabled = options.enabled ?? LOGOX.enabled;
  const etsyEnabled = options.etsyEnabled ?? ETSY.enabled;
  if (!logoxEnabled && !etsyEnabled) {
    return {
      description: `StoveRatings has no affiliate links and no ads. ${site.legalName} operates the site.`,
      paragraphs: [
        "There are no affiliate links and no advertisements on this site. Nothing has been applied for. If that changes, this page will say so on the pages that carry a paid link, and those links will be marked.",
        "Lists are ordered by an EPA number when they are ordered at all. A future paid link would not change that order.",
      ],
      placements: [],
      etsyPlacements: [],
    };
  }
  const paragraphs = [];
  if (logoxEnabled) {
    paragraphs.push(
      `Some pages include an affiliate link to LogOX (thelogox.com) through Awin. StoveRatings may earn a commission if you buy through that link, at no extra cost to you. Each link is marked with this sentence: ${LOGOX.disclosure}`,
      "These are plain links. StoveRatings does not load an Awin or LogOX script or pixel. Awin may set a cookie on its own site after you follow a link. This site does not.",
      "Lists are ordered by an EPA number when they are ordered at all. An affiliate link does not change that order.",
      `The LogOX pages below were requested on ${LOGOX.checked}.`,
    );
  }
  if (etsyEnabled) paragraphs.push(...etsyDisclosureParagraphs(logoxEnabled));
  let description = `Some StoveRatings pages link to Etsy through Rakuten Advertising. ${site.legalName} operates the site. Lists stay in EPA order.`;
  if (logoxEnabled && etsyEnabled) {
    description = `Some StoveRatings pages link to LogOX through Awin and to Etsy through Rakuten Advertising. ${site.legalName} operates the site. Lists stay in EPA order.`;
  } else if (logoxEnabled) {
    description = `Some StoveRatings pages link to LogOX through Awin. ${site.legalName} operates the site. Lists stay in EPA order.`;
  }
  return {
    description,
    paragraphs,
    placements: logoxEnabled
      ? LOGOX_PLACEMENTS.map((item) => ({
          path: item.path,
          label: item.label,
          destination: LOGOX_DESTINATIONS[item.destinationId].url,
          checked: LOGOX.checked,
        }))
      : [],
    etsyPlacements: etsyEnabled ? etsyPlacementRows() : [],
  };
}

export function aboutAffiliateSentence(options = {}) {
  const logoxEnabled = options.enabled ?? LOGOX.enabled;
  const etsyEnabled = options.etsyEnabled ?? ETSY.enabled;
  if (logoxEnabled && etsyEnabled) return "Some pages link to LogOX through Awin and to Etsy through Rakuten Advertising.";
  if (logoxEnabled) return "Some pages link to LogOX through Awin.";
  if (etsyEnabled) return "Some pages link to Etsy through Rakuten Advertising.";
  return "";
}

function decodeAttr(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function attrs(tag) {
  const found = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*"([^"]*)"/g)) found[match[1]] = decodeAttr(match[2]);
  return found;
}

function logoxBlockProblems(block) {
  const problems = [];
  const anchors = [...block.matchAll(/<a\b[^>]*>/gi)];
  if (anchors.length !== 1) {
    problems.push(`affiliate block has ${anchors.length} links`);
    return problems;
  }
  const tag = anchors[0][0];
  const attributes = attrs(tag);
  const href = attributes.href || "";
  let url;
  try {
    url = new URL(href);
  } catch {
    problems.push(`affiliate href is not a URL: ${href}`);
    return problems;
  }
  if (`${url.origin}${url.pathname}` !== AWIN_ORIGIN) problems.push(`affiliate href is not an Awin deep link: ${href}`);
  if (url.searchParams.get("awinmid") !== LOGOX.merchantId) problems.push(`awinmid ${url.searchParams.get("awinmid")}`);
  if (url.searchParams.get("awinaffid") !== LOGOX.publisherId) problems.push(`awinaffid ${url.searchParams.get("awinaffid")}`);
  const ued = url.searchParams.get("ued");
  if (!ued || !ued.startsWith("https://www.thelogox.com/")) problems.push(`ued ${ued}`);
  const rel = attributes.rel || "";
  const tokens = rel.split(/\s+/).filter(Boolean);
  if (!tokens.includes("sponsored")) problems.push(`rel missing sponsored: ${rel}`);
  if (rel !== LOGOX.rel) problems.push(`rel ${rel}`);
  if (attributes.target) problems.push(`unexpected target ${attributes.target}`);
  const disclosureAt = block.indexOf(LOGOX.disclosure);
  if (disclosureAt < 0) problems.push("disclosure missing beside affiliate link");
  else if (disclosureAt < block.indexOf(tag)) problems.push("disclosure is not after the affiliate link");
  else {
    const between = block.slice(block.indexOf("</a>"), disclosureAt);
    if (!/^<\/a>\s*<\/p>\s*<p class="affiliate-disclosure">$/.test(between)) {
      problems.push("disclosure is not adjacent to the affiliate link");
    }
  }
  return problems;
}

function etsyBlockProblems(block) {
  const problems = [];
  if (!block.includes(ETSY.heading)) problems.push("Etsy block is missing the shop label");
  const anchors = [...block.matchAll(/<a\b[^>]*>/gi)];
  if (anchors.length < 1) {
    problems.push(`affiliate block has ${anchors.length} links`);
    return problems;
  }
  for (const anchor of anchors) {
    const tag = anchor[0];
    const attributes = attrs(tag);
    const href = attributes.href || "";
    let url;
    try {
      url = new URL(href);
    } catch {
      problems.push(`affiliate href is not a URL: ${href}`);
      continue;
    }
    if (`${url.origin}${url.pathname}` !== RAKUTEN_DEEPLINK) problems.push(`affiliate href is not a Rakuten deep link: ${href}`);
    if (url.searchParams.get("id") !== ETSY.publisherId) problems.push(`id ${url.searchParams.get("id")}`);
    if (url.searchParams.get("mid") !== ETSY.merchantId) problems.push(`mid ${url.searchParams.get("mid")}`);
    if (href.includes("%2520")) problems.push(`murl is double-encoded: ${href}`);
    const murl = url.searchParams.get("murl");
    let etsy;
    try {
      etsy = new URL(murl);
    } catch {
      problems.push(`murl ${murl}`);
      continue;
    }
    if (etsy.protocol !== "https:" || etsy.hostname !== "www.etsy.com") problems.push(`murl ${murl}`);
    else if (etsy.pathname.includes("/listing") || (etsy.pathname !== "/search" && !etsy.pathname.startsWith("/c/"))) {
      problems.push(`murl is not an Etsy search or category: ${murl}`);
    } else if (etsy.pathname === "/search" && !etsy.searchParams.get("q")) {
      problems.push(`murl ${murl}`);
    }
    const rel = attributes.rel || "";
    const tokens = rel.split(/\s+/).filter(Boolean);
    if (!tokens.includes("sponsored")) problems.push(`rel missing sponsored: ${rel}`);
    if (rel !== ETSY.rel) problems.push(`rel ${rel}`);
    if (attributes.target !== "_blank") problems.push(`unexpected target ${attributes.target || "missing"}`);
  }
  const lastClose = block.lastIndexOf("</a>");
  const disclosureAt = block.indexOf(ETSY.disclosure);
  if (disclosureAt < 0) problems.push("disclosure missing beside affiliate link");
  else if (lastClose < 0 || disclosureAt < lastClose) problems.push("disclosure is not after the affiliate link");
  else {
    const between = block.slice(lastClose, disclosureAt);
    if (!/^<\/a>\s*<\/li>\s*<\/ul>\s*<p class="affiliate-disclosure">$/.test(between)) {
      problems.push("disclosure is not adjacent to the affiliate link");
    }
  }
  return problems;
}

export function affiliateMarkupProblems(html) {
  const problems = [];
  const blockRe = /<div\b[^>]*class="[^"]*\baffiliate-note\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi;
  const blocks = [...html.matchAll(blockRe)];
  const covered = [];
  for (const match of blocks) {
    const block = match[0];
    covered.push([match.index, match.index + block.length]);
    const open = block.match(/^<div\b[^>]*>/i)?.[0] || "";
    const kind = open.match(/\bdata-affiliate="([^"]*)"/)?.[1] || "";
    if (kind === "logox") problems.push(...logoxBlockProblems(block));
    else if (kind === "etsy") problems.push(...etsyBlockProblems(block));
    else problems.push("affiliate block is missing data-affiliate");
  }
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const inside = covered.some(([start, end]) => match.index >= start && match.index < end);
    if (inside) continue;
    const href = attrs(match[0]).href || "";
    if (/awin1\.com|thelogox\.com|awinmid=|awinaffid=/i.test(href)) {
      problems.push(`LogOX link outside an affiliate block: ${href}`);
    }
    if (/linksynergy\.com|etsy\.com/i.test(href)) {
      problems.push(`Etsy link outside an affiliate block: ${href}`);
    }
  }
  return problems;
}
