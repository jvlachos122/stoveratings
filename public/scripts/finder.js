const status = document.querySelector("#finder-status");
const body = document.querySelector("#finder-rows");
const q = document.querySelector("#finder-q");
const type = document.querySelector("#finder-type");
const subtype = document.querySelector("#finder-subtype");
const fuel = document.querySelector("#finder-fuel");
const emission = document.querySelector("#finder-emission");
const efficiency = document.querySelector("#finder-efficiency");
const sort = document.querySelector("#finder-sort");
const previous = document.querySelector("#finder-previous");

let current = [];
let historical = [];
let historicalLoaded = false;

function text(value) {
  return document.createTextNode(value == null || value === "" ? "Not listed" : String(value));
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function fillSelect(select, values) {
  const existing = new Set([...select.options].map((option) => option.value));
  for (const value of values) {
    if (!value || existing.has(value)) continue;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

function numberOrBlank(value, digits) {
  if (value == null || Number.isNaN(Number(value))) return "Not listed";
  return String(Number(Number(value).toFixed(digits)));
}

function heat(stove) {
  if (stove.btuLo != null && stove.btuHi != null && stove.btuLo !== stove.btuHi) {
    return `${Math.round(stove.btuLo).toLocaleString("en-US")}–${Math.round(stove.btuHi).toLocaleString("en-US")}`;
  }
  if (stove.btuLo != null) return Math.round(stove.btuLo).toLocaleString("en-US");
  if (stove.btuMax != null) return `${Math.round(stove.btuMax).toLocaleString("en-US")} max`;
  return "Not listed";
}

function btuSort(stove) {
  if (stove.btuLo != null && stove.btuHi != null) return (stove.btuLo + stove.btuHi) / 2;
  return stove.btuMax ?? -1;
}

function render() {
  const query = q.value.trim().toLowerCase();
  const emissionMax = emission.value === "" ? null : Number(emission.value);
  const efficiencyMin = efficiency.value === "" ? null : Number(efficiency.value);
  let rows = previous.checked ? current.concat(historical) : current.slice();
  rows = rows.filter((stove) => {
    if (type.value && stove.type !== type.value) return false;
    if (subtype.value && stove.sub !== subtype.value) return false;
    if (fuel.value && stove.fuel !== fuel.value) return false;
    if (emissionMax != null && (stove.em == null || stove.em > emissionMax)) return false;
    if (efficiencyMin != null && (stove.eff == null || stove.eff < efficiencyMin)) return false;
    if (!query) return true;
    const haystack = `${stove.model} ${stove.mfr} ${(stove.names || []).join(" ")}`.toLowerCase();
    return haystack.includes(query);
  });
  const mode = sort.value;
  rows.sort((a, b) => {
    if (mode === "efficiency") return (b.eff ?? -1) - (a.eff ?? -1) || (a.em ?? 999) - (b.em ?? 999);
    if (mode === "btu") return btuSort(b) - btuSort(a);
    if (mode === "name") return a.model.localeCompare(b.model);
    return (a.em ?? 999) - (b.em ?? 999) || a.model.localeCompare(b.model);
  });
  clear(body);
  const shown = rows.slice(0, 250);
  for (const stove of shown) {
    const tr = document.createElement("tr");
    const modelCell = document.createElement("th");
    modelCell.scope = "row";
    const link = document.createElement("a");
    link.href = stove.url;
    link.textContent = stove.model;
    modelCell.append(link);
    tr.append(modelCell);
    for (const value of [stove.mfr || "Not listed"]) {
      const td = document.createElement("td");
      td.append(text(value));
      tr.append(td);
    }
    const statusCell = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = stove.current ? "pill pill-current" : "pill pill-previous";
    pill.textContent = stove.current ? "Currently certified" : "Previously certified";
    statusCell.append(pill);
    tr.append(statusCell);
    for (const value of [
      stove.em == null ? "Not listed" : `${numberOrBlank(stove.em, 3)} ${stove.emUnit || ""}`.trim(),
      stove.eff == null ? "Not listed" : numberOrBlank(stove.eff, 2),
      heat(stove),
    ]) {
      const td = document.createElement("td");
      td.className = "num";
      td.append(text(value));
      tr.append(td);
    }
    body.append(tr);
  }
  const extra = rows.length - shown.length;
  status.textContent = extra > 0
    ? `${rows.length.toLocaleString("en-US")} model lines match. Showing the first ${shown.length}. Narrow the filters to see the rest.`
    : `${rows.length.toLocaleString("en-US")} model lines match.`;
}

async function loadHistorical() {
  if (historicalLoaded) return;
  status.textContent = "Loading previously certified model lines…";
  const response = await fetch("/data/historical.json");
  const payload = await response.json();
  historical = payload.stoves;
  historicalLoaded = true;
  fillSelect(type, historical.map((stove) => stove.type));
  fillSelect(subtype, historical.map((stove) => stove.sub));
  fillSelect(fuel, historical.map((stove) => stove.fuel));
}

async function init() {
  const response = await fetch("/data/current.json");
  const payload = await response.json();
  current = payload.stoves;
  fillSelect(type, current.map((stove) => stove.type));
  fillSelect(subtype, current.map((stove) => stove.sub));
  fillSelect(fuel, current.map((stove) => stove.fuel));
  for (const control of [q, type, subtype, fuel, emission, efficiency, sort]) {
    control.addEventListener("input", render);
    control.addEventListener("change", render);
  }
  previous.addEventListener("change", async () => {
    if (previous.checked) await loadHistorical();
    render();
  });
  render();
}

init().catch(() => {
  status.textContent = "The finder data did not load. The HTML lists linked from this page still work.";
});
