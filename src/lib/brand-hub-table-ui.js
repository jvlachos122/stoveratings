import {
  BRAND_HUB_SORT,
  brandFiltersFromInputs,
  brandHubCaption,
  brandHubStatusText,
  compareBrandRows,
  placeBrandRow,
} from "./brand-hub-table.js";

const IDS = {
  form: "brand-hub-finder",
  body: "brand-hub-finder-rows",
  table: "brand-hub-finder-table",
  status: "brand-hub-finder-status",
  empty: "brand-hub-finder-empty",
  caption: "brand-hub-finder-caption",
  sort: "brand-hub-sort",
  subtype: "brand-hub-subtype",
  heatMin: "brand-hub-heat-min",
  heatMax: "brand-hub-heat-max",
  fireboxMin: "brand-hub-firebox-min",
  fireboxMax: "brand-hub-firebox-max",
  certification: "brand-hub-certification",
  unreportedBody: "brand-hub-finder-unreported-rows",
  unreportedSection: "brand-hub-finder-unreported",
};

function numberAttr(element, name) {
  const raw = element.getAttribute(name);
  if (raw == null || String(raw).trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function inputValue(doc, id) {
  const element = doc.getElementById(id);
  return element ? element.value : "";
}

export function readBrandRow(element) {
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
    current: element.getAttribute("data-current") === "true",
  };
}

function syncAria(table, mode) {
  const parsed = /^([a-z]+)-(asc|desc)$/.exec(mode || "");
  const key = parsed ? parsed[1] : "";
  const aria = parsed?.[2] === "desc" ? "descending" : "ascending";
  for (const header of table.querySelectorAll("th[data-sort-key]")) {
    header.setAttribute("aria-sort", header.getAttribute("data-sort-key") === key ? aria : "none");
  }
}

export function mountBrandHubTable(doc) {
  const form = doc.getElementById(IDS.form);
  const body = doc.getElementById(IDS.body);
  const table = doc.getElementById(IDS.table);
  const status = doc.getElementById(IDS.status);
  const empty = doc.getElementById(IDS.empty);
  const caption = doc.getElementById(IDS.caption);
  const sort = doc.getElementById(IDS.sort);
  if (!form || !body || !table || !status || !empty || !caption || !sort) return;

  const name = table.getAttribute("data-brand") || "This hub";
  const unreportedBody = doc.getElementById(IDS.unreportedBody);
  const unreportedSection = doc.getElementById(IDS.unreportedSection);
  const rows = [...body.querySelectorAll("tr")].map((element) => readBrandRow(element));

  function apply() {
    const filters = brandFiltersFromInputs({
      subtype: inputValue(doc, IDS.subtype),
      heatMin: inputValue(doc, IDS.heatMin),
      heatMax: inputValue(doc, IDS.heatMax),
      fireboxMin: inputValue(doc, IDS.fireboxMin),
      fireboxMax: inputValue(doc, IDS.fireboxMax),
      status: inputValue(doc, IDS.certification),
    });
    const mode = sort.value || BRAND_HUB_SORT;
    const matched = [];
    const unreported = [];
    for (const row of rows) {
      const place = placeBrandRow(row, filters);
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
    matched.sort((left, right) => compareBrandRows(left, right, mode));
    unreported.sort((left, right) => compareBrandRows(left, right, mode));
    for (const row of rows) {
      if (!matched.includes(row) && !unreported.includes(row)) body.appendChild(row.element);
    }
    for (const row of matched) body.appendChild(row.element);
    if (unreportedBody) {
      for (const row of unreported) unreportedBody.appendChild(row.element);
    }
    status.textContent = brandHubStatusText(matched.length, rows.length, unreported.length);
    empty.hidden = matched.length !== 0;
    caption.textContent = brandHubCaption(name, mode);
    if (unreportedSection) unreportedSection.hidden = unreported.length === 0;
    syncAria(table, mode);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    apply();
  });
  for (const id of [IDS.subtype, IDS.heatMin, IDS.heatMax, IDS.fireboxMin, IDS.fireboxMax, IDS.certification, IDS.sort]) {
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
