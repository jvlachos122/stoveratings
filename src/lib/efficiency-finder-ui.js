import { filtersFromInputs } from "./insert-finder.js";
import { mountFilteredTable, readInsertRow } from "./insert-finder-ui.js";
import {
  EFFICIENCY_SORT,
  compareEfficiencyRows,
  efficiencyCaption,
  efficiencyStatusText,
  placeEfficiencyRow,
} from "./efficiency-finder.js";

const IDS = {
  form: "efficiency-finder",
  body: "efficiency-finder-rows",
  table: "efficiency-finder-table",
  status: "efficiency-finder-status",
  empty: "efficiency-finder-empty",
  caption: "efficiency-finder-caption",
  sort: "efficiency-sort",
  subtype: "efficiency-subtype",
  heatMin: "efficiency-heat-min",
  heatMax: "efficiency-heat-max",
  fireboxMin: "efficiency-firebox-min",
  fireboxMax: "efficiency-firebox-max",
  unreportedBody: "efficiency-finder-unreported-rows",
  unreportedSection: "efficiency-finder-unreported",
};

export function mountEfficiencyFinder(doc) {
  mountFilteredTable(doc, {
    ids: IDS,
    controls: [IDS.subtype, IDS.heatMin, IDS.heatMax, IDS.fireboxMin, IDS.fireboxMax, IDS.sort],
    defaultSort: EFFICIENCY_SORT,
    readRow: readInsertRow,
    filtersFromInputs,
    place: placeEfficiencyRow,
    compare: compareEfficiencyRows,
    captionText: efficiencyCaption,
    statusText: efficiencyStatusText,
  });
}
