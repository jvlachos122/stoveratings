import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  certifiedWood2013,
  certifiedWood2013Columns,
  certifiedWood2013Comparison,
  certifiedWood2013Faq,
  certifiedWood2013Intro,
  certifiedWood2013Sentences,
} from "../src/lib/certified-wood-2013.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const snapshotDate = "2026-10-23";

function read(name) {
  return readFileSync(join(root, name), "utf8");
}

test("the 2013 list review records columns and withholds dates, ids, and live figures", () => {
  assert.equal(certifiedWood2013.listDate, "2013-03-15");
  assert.equal(certifiedWood2013.listDateLabel, "March 15, 2013");
  assert.equal(certifiedWood2013.pages, 24);
  assert.equal(certifiedWood2013.section1Rows, 963);
  assert.equal(certifiedWood2013.testedEfficiencyRows, 16);
  assert.equal(certifiedWood2013.blankTypeRows, 6);
  assert.equal(certifiedWood2013.certificationDateColumn, false);
  assert.equal(certifiedWood2013.certificationIdColumn, false);
  assert.equal(certifiedWood2013.dataRowCalendarDates, 0);
  assert.equal(certifiedWood2013.usedForLiveFigures, false);
  assert.equal(certifiedWood2013.comparedWithSnapshot, snapshotDate);
  assert.equal(certifiedWood2013.fullModelCellMatchesOnCurrentlyCertified, 0);
  assert.deepEqual(
    certifiedWood2013Columns.map((column) => column.name),
    [
      "Out of production",
      "Manufacturer name",
      "Model name",
      "Emission rate (g/h)",
      "Heat output (Btu/h)",
      "Tested efficiency",
      "Default efficiency",
      "Type",
    ],
  );
  assert.equal(certifiedWood2013Columns.some((column) => /certification (date|number|id)/i.test(column.name)), false);
});

test("2013 review copy names the list limits and does not invent a certification date", () => {
  const sentences = certifiedWood2013Sentences(snapshotDate);
  const faq = certifiedWood2013Faq(snapshotDate);
  const text = [sentences.join(" "), certifiedWood2013Intro(), certifiedWood2013Comparison(), faq.question, faq.answer].join(" ");
  assert.equal(sentences.length, 3);
  assert.match(text, /March 15, 2013/);
  assert.match(text, /no certification date/i);
  assert.match(text, /no certification number/i);
  assert.match(text, /CSA B415\.1/);
  assert.match(text, /963/);
  assert.match(text, /16 rows/);
  assert.match(text, /previously certified/);
  assert.match(text, /snapshot dated 2026-10-23/);
  assert.match(text, /Where the two files disagree, the snapshot remains the figure on the page/);
  assert.doesNotMatch(text, /certified on March 15, 2013/i);
  assert.doesNotMatch(text, /\bbest\b|\bcleanest\b|\baffiliate\b/i);
  assert.doesNotMatch(text, /cfpub\.epa\.gov|https?:\/\//i);
  assert.equal(faq.question, "Did the March 15, 2013 wood stove list add certification dates?");
});

test("methodology renders the 2013 review and stove records gain no historical cert field", () => {
  const page = read("src/pages/methodology.astro");
  assert.match(page, /id="certified-wood-2013"/);
  assert.match(page, /certifiedWood2013Sentences/);
  assert.match(page, /certifiedWood2013Columns/);
  assert.match(page, /Columns in Section 1 of EPA's March 15, 2013 List of EPA Certified Wood Stoves/);
  const llms = read("public/llms.txt");
  assert.match(llms, /March 15, 2013 List of EPA Certified Wood Stoves/);
  assert.match(llms, /methodology\/#certified-wood-2013/);
  const stoves = JSON.parse(read("data/stoves.json"));
  for (const stove of stoves) {
    assert.equal(Object.hasOwn(stove, "historicalCertDate"), false);
    assert.equal(Object.hasOwn(stove, "certificationDate"), false);
    assert.equal(Object.hasOwn(stove, "certificationNumber"), false);
    assert.equal(Object.hasOwn(stove, "listedOn2013"), false);
  }
});
