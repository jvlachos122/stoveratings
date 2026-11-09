import {
  AREA_ERROR,
  EMPTY_OVERLAP,
  bandById,
  overlapCaption,
  overlapRowView,
  overlapStatus,
  planningRange,
  planningSentence,
  readArea,
  selectOverlaps,
} from "./stove-size.js";

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function cell(doc, tag, text, className) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function fillRows(doc, body, rows) {
  clear(body);
  if (!rows.length) {
    const tr = doc.createElement("tr");
    const td = doc.createElement("td");
    td.colSpan = 6;
    td.textContent = EMPTY_OVERLAP;
    tr.append(td);
    body.append(tr);
    return;
  }
  for (const model of rows) {
    const view = overlapRowView(model);
    const tr = doc.createElement("tr");
    const modelCell = doc.createElement("th");
    modelCell.scope = "row";
    const link = doc.createElement("a");
    link.href = view.href;
    link.textContent = view.model;
    modelCell.append(link);
    if (view.insert) {
      const note = doc.createElement("div");
      note.className = "small";
      note.textContent = "Name indicates insert";
      modelCell.append(note);
    }
    tr.append(modelCell);
    tr.append(cell(doc, "td", view.manufacturer));
    tr.append(cell(doc, "td", view.type));
    tr.append(cell(doc, "td", view.heat, "num"));
    tr.append(cell(doc, "td", view.efficiency, "num"));
    tr.append(cell(doc, "td", view.emission, "num"));
    body.append(tr);
  }
}

export async function mountStoveSize(doc, dataUrl = "/data/size-overlap.json") {
  const form = doc.getElementById("size-form");
  const area = doc.getElementById("sqft");
  const climate = doc.getElementById("climate");
  const output = doc.getElementById("size-result");
  const type = doc.getElementById("size-type");
  const inserts = doc.getElementById("size-inserts");
  const status = doc.getElementById("overlap-status");
  const body = doc.getElementById("overlap-rows");
  const caption = doc.getElementById("overlap-caption");
  if (!form || !area || !climate || !output) return;

  let payload = null;
  try {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await response.json();
    if (!payload || !Array.isArray(payload.models) || !Number.isInteger(payload.excluded)) payload = null;
  } catch {
    payload = null;
  }

  function resultForInputs() {
    const sqft = readArea(area.value);
    const band = bandById(climate.value);
    if (sqft == null) return { sqft: null, band, text: AREA_ERROR };
    if (!band) return { sqft, band: null, text: "Choose a planning band." };
    return { sqft, band, text: planningSentence(sqft, band) };
  }

  if (!payload) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      output.textContent = resultForInputs().text;
      if (status) {
        status.textContent = "The model list on this site did not load. The table still shows the 2,000 sq ft moderate example. Reload the page to calculate another range.";
      }
    });
    return;
  }

  function render() {
    const result = resultForInputs();
    output.textContent = result.text;
    if (!result.sqft || !result.band || !body || !status) {
      if (status && (!result.sqft || !result.band)) status.textContent = result.text;
      return;
    }
    const range = planningRange(result.sqft, result.band);
    const side = type?.value || "all";
    const insertsOnly = Boolean(inserts?.checked);
    const rows = selectOverlaps(payload.models, range.low, range.high, side, insertsOnly);
    status.textContent = overlapStatus(rows.length, range, { side, insertsOnly });
    if (caption) caption.textContent = overlapCaption(result.sqft, result.band);
    fillRows(doc, body, rows);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    render();
  });
  type?.addEventListener("change", render);
  inserts?.addEventListener("change", render);
  render();
}
