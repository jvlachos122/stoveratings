// Answer, title, and meta description for an existing brand hub.
// Counts and figures come from the committed catalog. This module does not fetch EPA.
import { brandAnswer } from "./brand-copy.js";
import { countNoun, formatCount, formatNumber, metaDescription, pageTitle } from "./format.js";

export const BRAND_TITLE_LIMIT = 60;

function joinList(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function typeSplit(lines) {
  const counts = { wood: 0, pellet: 0, hydronic: 0, furnace: 0, other: 0 };
  for (const stove of lines) {
    if (stove.type === "Wood Stove") counts.wood += 1;
    else if (stove.type === "Pellet Stove") counts.pellet += 1;
    else if (stove.type === "Hydronic Heater") counts.hydronic += 1;
    else if (stove.type === "Forced Air Furnace") counts.furnace += 1;
    else counts.other += 1;
  }
  return counts;
}

function lowestGhr(lines) {
  const pool = lines.filter((stove) => stove.emission != null && stove.emissionUnit === "g/hr");
  if (!pool.length) return null;
  const value = Math.min(...pool.map((stove) => stove.emission));
  const models = pool
    .filter((stove) => stove.emission === value)
    .sort((a, b) => a.model.localeCompare(b.model))
    .map((stove) => stove.model);
  return { value, models };
}

function highestEfficiency(lines) {
  const pool = lines.filter((stove) => stove.efficiency != null);
  if (!pool.length) return null;
  const value = Math.max(...pool.map((stove) => stove.efficiency));
  const models = pool
    .filter((stove) => stove.efficiency === value)
    .sort((a, b) => a.model.localeCompare(b.model))
    .map((stove) => stove.model);
  return { value, models };
}

export function brandHubFacts(lines) {
  const currentLines = lines.filter((stove) => stove.current);
  const previous = lines.length - currentLines.length;
  const scope = currentLines.length ? currentLines : lines;
  return {
    current: currentLines.length,
    previous,
    historicalOnly: currentLines.length === 0,
    lowest: lowestGhr(currentLines),
    highest: highestEfficiency(currentLines),
    split: typeSplit(scope),
    roomStoves: currentLines.length > 0 && currentLines.every((stove) => stove.type === "Wood Stove" || stove.type === "Pellet Stove"),
  };
}

export function splitPhrase(split) {
  const parts = [countNoun(split.wood, "wood stove"), countNoun(split.pellet, "pellet stove")];
  if (split.hydronic) parts.push(countNoun(split.hydronic, "hydronic heater"));
  if (split.furnace) parts.push(countNoun(split.furnace, "forced-air furnace"));
  if (split.other) parts.push(countNoun(split.other, "other heater"));
  return joinList(parts);
}

function factsSentence(facts) {
  const split = splitPhrase(facts.split);
  if (facts.historicalOnly) {
    return `No currently certified model line is listed, so a lowest g/hr and a highest HHV efficiency are not listed, and the previously certified model lines are ${split}.`;
  }
  const ghr = facts.lowest
    ? `the lowest g/hr is ${formatNumber(facts.lowest.value, 3)} on ${joinList(facts.lowest.models)}`
    : "a g/hr emission rate is not listed";
  const efficiency = facts.highest
    ? `the highest HHV efficiency is ${formatNumber(facts.highest.value, 2)} percent on ${joinList(facts.highest.models)}`
    : "HHV efficiency is not listed";
  return `Among currently certified model lines, ${ghr}, ${efficiency}, and the lines are ${split}.`;
}

export function brandHubAnswer(brand, lines, snapshotDate) {
  const base = brandAnswer(brand, lines, snapshotDate);
  return [base[0], factsSentence(brandHubFacts(lines)), base[1]];
}

function titleNoun(count, roomStoves) {
  if (roomStoves) return count === 1 ? "stove" : "stoves";
  return count === 1 ? "model line" : "model lines";
}

function shortenName(name, room) {
  if (name.length <= room) return name;
  if (room <= 3) return name.slice(0, Math.max(room, 0));
  return `${name.slice(0, room - 3).trimEnd()}...`;
}

function fitTitle(name, rests) {
  for (const rest of rests) {
    const full = `${name}: ${rest}`;
    if (full.length <= BRAND_TITLE_LIMIT) return full;
  }
  for (const rest of rests) {
    const room = BRAND_TITLE_LIMIT - rest.length - 2;
    if (room < 8) continue;
    const text = `${shortenName(name, room)}: ${rest}`;
    if (text.length <= BRAND_TITLE_LIMIT) return text;
  }
  return pageTitle(`${name}: ${rests[0]}`, BRAND_TITLE_LIMIT);
}

export function brandHubTitle(brand, lines) {
  const facts = brandHubFacts(lines);
  const name = brand.name;
  if (facts.historicalOnly) {
    return fitTitle(name, [
      `${formatCount(facts.previous)} previously certified, none current`,
      "none currently certified",
    ]);
  }
  const noun = titleNoun(facts.current, facts.roomStoves);
  const count = formatCount(facts.current);
  if (facts.lowest) {
    const rate = formatNumber(facts.lowest.value, 3);
    return fitTitle(name, [
      `${count} EPA-certified ${noun}, lowest ${rate} g/hr`,
      `${count} certified, lowest ${rate} g/hr`,
    ]);
  }
  if (facts.highest) {
    const efficiency = formatNumber(facts.highest.value, 2);
    return fitTitle(name, [
      `${count} EPA-certified ${noun}, ${efficiency}% HHV`,
      `${count} certified, ${efficiency}% HHV`,
    ]);
  }
  return fitTitle(name, [
    `${count} EPA-certified ${noun}, g/hr not listed`,
    `${count} certified, g/hr not listed`,
  ]);
}

function metricSentence(facts) {
  if (facts.historicalOnly) return "Lowest g/hr and highest HHV efficiency are not listed.";
  const ghr = facts.lowest
    ? `Lowest ${formatNumber(facts.lowest.value, 3)} g/hr.`
    : "A g/hr emission rate is not listed.";
  const efficiency = facts.highest
    ? `Highest HHV efficiency ${formatNumber(facts.highest.value, 2)} percent.`
    : "HHV efficiency is not listed.";
  return `${ghr} ${efficiency}`;
}

export function brandHubDescription(brand, lines, snapshotDate) {
  const facts = brandHubFacts(lines);
  const lead = `${brand.name}: ${formatCount(facts.current)} currently certified and ${formatCount(facts.previous)} previously certified.`;
  const metric = metricSentence(facts);
  const split = `The split is ${splitPhrase(facts.split)}.`;
  const dated = `Snapshot ${snapshotDate}.`;
  const candidates = [
    `${lead} ${metric} ${split} ${dated}`,
    `${lead} ${metric} ${dated}`,
    `${lead} ${metric}`,
  ];
  for (const text of candidates) {
    if (text.length <= 180) return text;
  }
  return metaDescription([lead, metric]);
}
