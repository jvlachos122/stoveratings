import {
  DEFAULT_SORT,
  compareInsertRows,
  filtersFromInputs,
  finderCaption,
  finderStatusText,
  matchesInsertFilters,
} from "./insert-finder.js";

function numberAttr(element, name) {
  const raw = element.getAttribute(name);
  if (raw == null || String(raw).trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function readInsertRow(element) {
  return {
    element,
    id: element.getAttribute("data-id") || "",
    model: element.getAttribute("data-model") || "",
    manufacturer: element.getAttribute("data-manufacturer") || "",
    emission: numberAttr(element, "data-emission"),
    efficiency: numberAttr(element, "data-efficiency"),
    btuLow: numberAttr(element, "data-heat-low"),
    btuHigh: numberAttr(element, "data-heat-high"),
    firebox: numberAttr(element, "data-firebox"),
    subtype: element.getAttribute("data-subtype") || "",
    index: numberAttr(element, "data-index") ?? 0,
  };
}

function inputValue(doc, id) {
  if (!id) return "";
  const element = doc.getElementById(id);
  return element ? element.value : "";
}

function syncAria(table, mode) {
  const parsed = /^([a-z]+)-(asc|desc)$/.exec(mode || "");
  const key = parsed ? parsed[1] : "";
  const aria = parsed?.[2] === "desc" ? "descending" : "ascending";
  for (const header of table.querySelectorAll("th[data-sort-key]")) {
    header.setAttribute("aria-sort", header.getAttribute("data-sort-key") === key ? aria : "none");
  }
}

export function mountFilteredTable(doc, config) {
  const ids = config.ids;
  const form = doc.getElementById(ids.form);
  const body = doc.getElementById(ids.body);
  const table = doc.getElementById(ids.table);
  const status = doc.getElementById(ids.status);
  const empty = doc.getElementById(ids.empty);
  const caption = doc.getElementById(ids.caption);
  const sort = doc.getElementById(ids.sort);
  if (!form || !body || !table || !status || !empty || !caption || !sort) return;

  const unreportedBody = ids.unreportedBody ? doc.getElementById(ids.unreportedBody) : null;
  const unreportedSection = ids.unreportedSection ? doc.getElementById(ids.unreportedSection) : null;
  const rows = [...body.querySelectorAll("tr")].map((element) => config.readRow(element));

  function apply() {
    const filters = config.filtersFromInputs({
      subtype: inputValue(doc, ids.subtype),
      heatMin: inputValue(doc, ids.heatMin),
      heatMax: inputValue(doc, ids.heatMax),
      fireboxMin: inputValue(doc, ids.fireboxMin),
      fireboxMax: inputValue(doc, ids.fireboxMax),
    });
    const mode = sort.value || config.defaultSort;
    const matched = [];
    const unreported = [];
    for (const row of rows) {
      const place = config.place(row, filters);
      if (place === "unreported" && unreportedBody) {
        row.element.hidden = false;
        unreported.push(row);
      } else if (place === "match") {
        row.element.hidden = false;
        matched.push(row);
      } else {
        row.element.hidden = true;
      }
    }
    matched.sort((left, right) => config.compare(left, right, mode));
    unreported.sort((left, right) => config.compare(left, right, mode));
    for (const row of rows) {
      if (!matched.includes(row) && !unreported.includes(row)) body.appendChild(row.element);
    }
    for (const row of matched) body.appendChild(row.element);
    if (unreportedBody) {
      for (const row of unreported) unreportedBody.appendChild(row.element);
    }
    status.textContent = config.statusText(matched.length, rows.length, unreported.length);
    empty.hidden = matched.length !== 0;
    caption.textContent = config.captionText(mode);
    if (unreportedSection) unreportedSection.hidden = unreported.length === 0;
    syncAria(table, mode);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    apply();
  });
  for (const id of config.controls) {
    const element = doc.getElementById(id);
    if (!element) continue;
    element.addEventListener("input", apply);
    element.addEventListener("change", apply);
  }
  for (const button of table.querySelectorAll("[data-sort]")) {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-sort");
      const fallback = button.getAttribute("data-default") || "asc";
      let dir = fallback;
      if (sort.value === `${key}-asc`) dir = "desc";
      else if (sort.value === `${key}-desc`) dir = "asc";
      sort.value = `${key}-${dir}`;
      apply();
    });
  }
  apply();
}

export function mountInsertFinder(doc) {
  mountFilteredTable(doc, {
    ids: {
      form: "insert-finder",
      body: "insert-finder-rows",
      table: "insert-finder-table",
      status: "insert-finder-status",
      empty: "insert-finder-empty",
      caption: "insert-finder-caption",
      sort: "insert-sort",
      subtype: "insert-subtype",
      heatMin: "insert-heat-min",
      heatMax: "insert-heat-max",
      fireboxMin: "insert-firebox-min",
      fireboxMax: "insert-firebox-max",
    },
    controls: ["insert-subtype", "insert-heat-min", "insert-heat-max", "insert-firebox-min", "insert-firebox-max", "insert-sort"],
    defaultSort: DEFAULT_SORT,
    readRow: readInsertRow,
    filtersFromInputs,
    place: (row, filters) => (matchesInsertFilters(row, filters) ? "match" : "hide"),
    compare: compareInsertRows,
    captionText: finderCaption,
    statusText: (shown, total) => finderStatusText(shown, total),
  });
}
