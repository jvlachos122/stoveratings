// Review of the local March 15, 2013 "List of EPA Certified Wood Stoves" PDF.
// The build does not fetch this file, and these facts are not live stove figures.

export const certifiedWood2013 = {
  title: "List of EPA Certified Wood Stoves",
  listDate: "2013-03-15",
  listDateLabel: "March 15, 2013",
  pages: 24,
  section1Rows: 963,
  testedEfficiencyRows: 16,
  blankTypeRows: 6,
  certificationDateColumn: false,
  certificationIdColumn: false,
  dataRowCalendarDates: 0,
  usedForLiveFigures: false,
  comparedWithSnapshot: "2026-10-23",
  fullModelCellMatchesOnCurrentlyCertified: 0,
};

export const certifiedWood2013Columns = [
  {
    name: "Out of production",
    meaning: "An x when the list marks the row out of production. Blank when it does not.",
  },
  {
    name: "Manufacturer name",
    meaning: "The manufacturer printed on the row.",
  },
  {
    name: "Model name",
    meaning: "The model line printed on the row.",
  },
  {
    name: "Emission rate (g/h)",
    meaning: "Particulate emission rate in grams per hour.",
  },
  {
    name: "Heat output (Btu/h)",
    meaning: "The heat-output range printed on the row.",
  },
  {
    name: "Tested efficiency",
    meaning: "Efficiency tested per CSA B415.1. Filled on 16 rows.",
  },
  {
    name: "Default efficiency",
    meaning: "A category rating assigned by EPA on that list.",
  },
  {
    name: "Type",
    meaning: "Catalytic, non-catalytic, pellet, or catalytic-hybrid. Six rows leave this cell blank.",
  },
];

export function certifiedWood2013Sentences(snapshotDate) {
  return [
    `EPA's ${certifiedWood2013.listDateLabel} List of EPA Certified Wood Stoves has no certification date and no certification number.`,
    "The review of that list did not change emission rates, HHV efficiency, or current-certification status.",
    `Those figures remain the committed snapshot dated ${snapshotDate}.`,
  ];
}

export function certifiedWood2013Intro() {
  const review = certifiedWood2013;
  return `The file is a ${review.pages}-page list, "${review.title}," dated ${review.listDateLabel}, from EPA's Office of Compliance. Section 1 is a table of ${review.section1Rows.toLocaleString("en-US")} rows. The page footer says tested efficiency follows CSA B415.1, and that default efficiency is a category rating assigned by EPA. A tested-efficiency number is printed on ${review.testedEfficiencyRows} rows. Section II is manufacturer contact information. Section III lists accredited laboratories. Telephone numbers and street addresses from those sections are omitted here.`;
}

export function certifiedWood2013Comparison() {
  const review = certifiedWood2013;
  if (review.fullModelCellMatchesOnCurrentlyCertified !== 0) {
    throw new Error("2013 review copy expects no full model-cell match on a currently certified line");
  }
  if (review.certificationDateColumn || review.certificationIdColumn || review.usedForLiveFigures) {
    throw new Error("2013 review copy expects no certification date, certification number, or live-figure use");
  }
  if (review.dataRowCalendarDates !== 0) {
    throw new Error("2013 review copy expects no calendar date inside a data row");
  }
  return `Model-name strings from Section 1 were compared with model lines in the snapshot dated ${review.comparedWithSnapshot}. Some full model cells match a model line that snapshot lists as previously certified. No currently certified model line had a full model cell equal to a 2013 model cell. A few retail names inside a currently certified model cell also appear in the 2013 table, sometimes on a different model cell, and some of those rows print a different grams-per-hour figure. That comparison recovered no certification date and no certification number. Stove pages did not gain either field. Where the two files disagree, the snapshot remains the figure on the page.`;
}

export function certifiedWood2013Faq(snapshotDate) {
  return {
    question: "Did the March 15, 2013 wood stove list add certification dates?",
    answer: `No. EPA's March 15, 2013 list has no certification-date column and no certification-number column. March 15, 2013 is the date of the list. Emission rates, HHV efficiency, and current-certification status stay the snapshot dated ${snapshotDate}.`,
  };
}
