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

export function mountInsertFinder(doc) {
  const form = doc.getElementById("insert-finder");
  const body = doc.getElementById("insert-finder-rows");
  const table = doc.getElementById("insert-finder-table");
  const status = doc.getElementById("insert-finder-status");
  const empty = doc.getElementById("insert-finder-empty");
  const caption = doc.getElementById("insert-finder-caption");
  const sort = doc.getElementById("insert-sort");
  if (!form || !body || !table || !status || !empty || !caption || !sort) return;

  const rows = [...body.querySelectorAll("tr")].map((element) => readInsertRow(element));

  function apply() {
    const filters = filtersFromInputs({
      subtype: inputValue(doc, "insert-subtype"),
      heatMin: inputValue(doc, "insert-heat-min"),
      heatMax: inputValue(doc, "insert-heat-max"),
      fireboxMin: inputValue(doc, "insert-firebox-min"),
      fireboxMax: inputValue(doc, "insert-firebox-max"),
    });
    const mode = sort.value || DEFAULT_SORT;
    const matched = [];
    for (const row of rows) {
      const ok = matchesInsertFilters(row, filters);
      row.element.hidden = !ok;
      if (ok) matched.push(row);
    }
    matched.sort((left, right) => compareInsertRows(left, right, mode));
    for (const row of rows) {
      if (!matched.includes(row)) body.appendChild(row.element);
    }
    for (const row of matched) body.appendChild(row.element);
    status.textContent = finderStatusText(matched.length, rows.length);
    empty.hidden = matched.length !== 0;
    caption.textContent = finderCaption(mode);
    syncAria(table, mode);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    apply();
  });
  for (const id of ["insert-subtype", "insert-heat-min", "insert-heat-max", "insert-firebox-min", "insert-firebox-max", "insert-sort"]) {
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
