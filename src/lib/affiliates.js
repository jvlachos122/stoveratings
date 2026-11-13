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

export function disclosureView(options = {}) {
  const enabled = options.enabled ?? LOGOX.enabled;
  if (!enabled) {
    return {
      description: `StoveRatings has no affiliate links and no ads. ${site.legalName} operates the site.`,
      paragraphs: [
        "There are no affiliate links and no advertisements on this site. Nothing has been applied for. If that changes, this page will say so on the pages that carry a paid link, and those links will be marked.",
        "Lists are ordered by an EPA number when they are ordered at all. A future paid link would not change that order.",
      ],
      placements: [],
    };
  }
  return {
    description: `Some StoveRatings pages link to LogOX through Awin. ${site.legalName} operates the site. Lists stay in EPA order.`,
    paragraphs: [
      `Some pages include an affiliate link to LogOX (thelogox.com) through Awin. StoveRatings may earn a commission if you buy through that link, at no extra cost to you. Each link is marked with this sentence: ${LOGOX.disclosure}`,
      "These are plain links. StoveRatings does not load an Awin or LogOX script or pixel. Awin may set a cookie on its own site after you follow a link. This site does not.",
      "Lists are ordered by an EPA number when they are ordered at all. An affiliate link does not change that order.",
      `The LogOX pages below were requested on ${LOGOX.checked}.`,
    ],
    placements: LOGOX_PLACEMENTS.map((item) => ({
      path: item.path,
      label: item.label,
      destination: LOGOX_DESTINATIONS[item.destinationId].url,
      checked: LOGOX.checked,
    })),
  };
}

export function aboutAffiliateSentence(options = {}) {
  const enabled = options.enabled ?? LOGOX.enabled;
  if (!enabled) return "";
  return "Some pages link to LogOX through Awin.";
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

export function affiliateMarkupProblems(html) {
  const problems = [];
  const blockRe = /<div\b[^>]*class="[^"]*\baffiliate-note\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi;
  const blocks = [...html.matchAll(blockRe)];
  const covered = [];
  for (const match of blocks) {
    const block = match[0];
    covered.push([match.index, match.index + block.length]);
    const open = block.match(/^<div\b[^>]*>/i)?.[0] || "";
    if (!/\bdata-affiliate="logox"/.test(open)) problems.push("affiliate block is missing data-affiliate");
    const anchors = [...block.matchAll(/<a\b[^>]*>/gi)];
    if (anchors.length !== 1) {
      problems.push(`affiliate block has ${anchors.length} links`);
      continue;
    }
    const tag = anchors[0][0];
    const attributes = attrs(tag);
    const href = attributes.href || "";
    let url;
    try {
      url = new URL(href);
    } catch {
      problems.push(`affiliate href is not a URL: ${href}`);
      continue;
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
  }
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const inside = covered.some(([start, end]) => match.index >= start && match.index < end);
    if (inside) continue;
    const href = attrs(match[0]).href || "";
    if (/awin1\.com|thelogox\.com|awinmid=|awinaffid=/i.test(href)) {
      problems.push(`LogOX link outside an affiliate block: ${href}`);
    }
  }
  return problems;
}
