import { filtersFromInputs } from "./insert-finder.js";
import { mountFilteredTable, readInsertRow } from "./insert-finder-ui.js";
import {
  EMISSION_SORT,
  compareEmissionRows,
  emissionCaption,
  emissionStatusText,
  placeEmissionRow,
} from "./emission-finder.js";

const IDS = {
  form: "emission-finder",
  body: "emission-finder-rows",
  table: "emission-finder-table",
  status: "emission-finder-status",
  empty: "emission-finder-empty",
  caption: "emission-finder-caption",
  sort: "emission-sort",
  subtype: "emission-subtype",
  heatMin: "emission-heat-min",
  heatMax: "emission-heat-max",
  fireboxMin: "emission-firebox-min",
  fireboxMax: "emission-firebox-max",
  unreportedBody: "emission-finder-unreported-rows",
  unreportedSection: "emission-finder-unreported",
};

export function mountEmissionFinder(doc) {
  mountFilteredTable(doc, {
    ids: IDS,
    controls: [IDS.subtype, IDS.heatMin, IDS.heatMax, IDS.fireboxMin, IDS.fireboxMax, IDS.sort],
    defaultSort: EMISSION_SORT,
    readRow: readInsertRow,
    filtersFromInputs,
    place: placeEmissionRow,
    compare: compareEmissionRows,
    captionText: emissionCaption,
    statusText: emissionStatusText,
  });
}
