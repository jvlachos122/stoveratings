import { countNoun, efficiencyText, emissionText, formatNumber, kindLabel, shortModel } from "./format.js";

function sourceSentence(snapshotDate) {
  return `Source: EPA Certified Wood Heater Database, snapshot ${snapshotDate}.`;
}

export function modelSentences(stove, snapshotDate) {
  const kind = kindLabel(stove);
  const status = stove.current ? "currently certified" : "previously certified";
  const who = stove.manufacturer
    ? `under ${stove.manufacturer}`
    : "with the manufacturer cell left blank";
  const sentences = [
    `EPA lists ${shortModel(stove.model, 140)} ${who} as a ${status} ${kind}.`,
  ];
  if (stove.rowCount > 1) {
    const rates = stove.tests
      .map((test) => emissionText(test.emission, test.emissionUnit))
      .filter(Boolean);
    sentences.push(
      rates.length
        ? `EPA lists ${countNoun(stove.rowCount, "row")} for this model line, with emission rates of ${rates.join(" and ")}.`
        : `EPA lists ${countNoun(stove.rowCount, "row")} for this model line.`,
    );
  } else if (stove.emission != null) {
    sentences.push(`The listed emission rate is ${emissionText(stove.emission, stove.emissionUnit)}.`);
  } else {
    sentences.push("EPA does not list an emission rate for this model line.");
  }
  if (stove.efficiency != null) {
    sentences.push(`The listed HHV efficiency is ${efficiencyText(stove.efficiency)}.`);
  } else {
    sentences.push("EPA does not list an HHV efficiency for this model line.");
  }
  sentences.push(sourceSentence(snapshotDate));
  return sentences;
}

export function brandSentences(brand, lines, snapshotDate) {
  const current = lines.filter((stove) => stove.current);
  const previous = lines.length - current.length;
  const sentences = [];
  if (brand.role === "alias") {
    sentences.push(`EPA does not use ${brand.name} as the manufacturer name on these rows.`);
    sentences.push(
      `${countNoun(lines.length, "model line")} ${lines.length === 1 ? "has" : "have"} ${brand.name} in the EPA text, and ${countNoun(current.length, "of them is currently certified", "of them are currently certified")}.`,
    );
    const manufacturers = [...new Set(lines.map((stove) => stove.manufacturer || "a blank manufacturer cell"))];
    if (manufacturers.length && manufacturers.length <= 4) {
      sentences.push(`EPA lists ${lines.length === 1 ? "that line" : "those lines"} under ${manufacturers.join("; ")}.`);
    }
  } else {
    sentences.push(
      `EPA lists ${countNoun(current.length, "currently certified model line")} and ${countNoun(previous, "previously certified model line")} for ${brand.name}.`,
    );
    const lowest = current
      .filter((stove) => stove.emission != null)
      .sort((a, b) => a.emission - b.emission || a.model.localeCompare(b.model))[0];
    if (lowest) {
      sentences.push(
        `The lowest listed emission rate among those currently certified lines is ${emissionText(lowest.emission, lowest.emissionUnit)}, on ${shortModel(lowest.model)}.`,
      );
    } else {
      sentences.push("None of these model lines are listed as currently certified in this snapshot.");
    }
  }
  sentences.push(sourceSentence(snapshotDate));
  return sentences;
}

export const insertDataNotes = [
  "EPA's export has no insert column. The label is name indicates insert. It is based on the model name.",
  "The automatic check matches the word insert or a hyphen-I token. Roman-numeral names that this snapshot also numbers II or III are removed, including Outfitter-I and XVR-I. A lone I, as on Expedition I or Explorer I, is not labeled.",
  "The review also labels a line when the model text pairs an insert code with the freestanding code, including 2100 and 2100 I, F1500 and I1500, 5770 and 5770i, and 1600 FS and 1600 FPI.",
  "A model line can name both a freestanding stove and an insert. The line is listed when any name in the cell indicates an insert.",
  "A blank emission, efficiency, or heat-output cell is Not listed, not zero.",
];

export function homeSentences(stats) {
  const date = stats.snapshotDate;
  return [
    `EPA lists ${stats.rows.roomCurrent.toLocaleString("en-US")} room-heater rows and ${stats.rows.centralCurrent.toLocaleString("en-US")} central-heater rows as currently certified in the snapshot dated ${date}.`,
    `Of those room-heater rows, ${stats.roomCurrentByType["Wood Stove"]} are wood-stove rows and ${stats.roomCurrentByType["Pellet Stove"]} are pellet-stove rows.`,
    `The same snapshot includes previously certified models: ${stats.rows.roomAll.toLocaleString("en-US")} room-heater rows and ${stats.rows.centralAll.toLocaleString("en-US")} central-heater rows.`,
    sourceSentence(date),
  ];
}

export function medianSentence(block, noun) {
  const emission = formatNumber(block.emissionMedian, 2);
  const efficiency = formatNumber(block.efficiencyMedian, 2);
  return `The median emission rate for ${block.rows} currently certified ${noun} is ${emission} grams per hour, and the median HHV efficiency is ${efficiency} percent.`;
}

export function firewoodSentences(rows) {
  const high = Math.max(...rows.map((row) => row.btuHigh));
  const atHigh = rows.filter((row) => row.btuHigh === high);
  const names = atHigh.map((row) => {
    if (row.btuLow === row.btuHigh) return `${row.species} at ${formatNumber(row.btuHigh, 1)} million BTU per cord`;
    return `${row.species} at ${formatNumber(row.btuLow, 1)} to ${formatNumber(row.btuHigh, 1)} million BTU per cord`;
  });
  const locust = rows.find((row) => row.species === "Black Locust");
  const sentences = [
    `The highest figure in the cited table is ${formatNumber(high, 1)} million BTU per cord, listed for ${names.join(" and ")}.`,
  ];
  if (locust && locust.btuHigh !== high) {
    sentences.push(
      `Black locust is listed as ${formatNumber(locust.btuLow, 1)} million BTU per cord, so the ranges overlap and the table does not name one species as hottest.`,
    );
  }
  sentences.push(
    "Source: University of Arkansas Division of Agriculture Cooperative Extension Service, table compiled from USDA Forest Service Leaflet No. 559, retrieved 2026-10-23.",
  );
  return sentences;
}
