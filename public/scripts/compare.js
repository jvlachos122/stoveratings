const form = document.querySelector("#compare-form");
const leftInput = document.querySelector("#compare-a");
const rightInput = document.querySelector("#compare-b");
const leftList = document.querySelector("#compare-a-list");
const rightList = document.querySelector("#compare-b-list");
const result = document.querySelector("#compare-result");
const status = document.querySelector("#compare-status");
let stoves = [];
const byId = new Map();

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function addRow(table, label, left, right) {
  const tr = document.createElement("tr");
  const th = document.createElement("th");
  th.scope = "row";
  th.textContent = label;
  tr.append(th);
  for (const value of [left, right]) {
    const td = document.createElement("td");
    td.textContent = value;
    tr.append(td);
  }
  table.append(tr);
}

function heat(stove) {
  if (stove.btuLo != null && stove.btuHi != null && stove.btuLo !== stove.btuHi) {
    return `${Math.round(stove.btuLo).toLocaleString("en-US")}–${Math.round(stove.btuHi).toLocaleString("en-US")} BTU/hr`;
  }
  if (stove.btuLo != null) return `${Math.round(stove.btuLo).toLocaleString("en-US")} BTU/hr`;
  if (stove.btuMax != null) return `${Math.round(stove.btuMax).toLocaleString("en-US")} BTU/hr maximum`;
  return "Not listed";
}

function num(value, digits, suffix) {
  if (value == null) return "Not listed";
  return `${Number(Number(value).toFixed(digits))}${suffix || ""}`;
}

function suggest(input, list) {
  clear(list);
  const query = input.value.trim().toLowerCase();
  if (query.length < 2) return;
  const matches = stoves.filter((stove) => `${stove.model} ${stove.mfr}`.toLowerCase().includes(query)).slice(0, 8);
  for (const stove of matches) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${stove.model} — ${stove.mfr || "manufacturer not listed"}`;
    button.addEventListener("click", () => {
      input.value = stove.model;
      input.dataset.id = stove.id;
      clear(list);
      show();
    });
    item.append(button);
    list.append(item);
  }
}

function selected(input) {
  if (input.dataset.id && byId.has(input.dataset.id)) return byId.get(input.dataset.id);
  const query = input.value.trim().toLowerCase();
  return stoves.find((stove) => stove.model.toLowerCase() === query) || null;
}

function show() {
  const a = selected(leftInput);
  const b = selected(rightInput);
  clear(result);
  if (!a || !b) {
    status.textContent = "Choose two model lines from the suggestions.";
    return;
  }
  const params = new URLSearchParams({ a: a.id, b: b.id });
  history.replaceState(null, "", `?${params.toString()}`);
  status.textContent = "Figures below are the primary EPA row for each model line in this snapshot.";
  const table = document.createElement("table");
  const caption = document.createElement("caption");
  caption.textContent = "EPA figures for the two selected model lines";
  table.append(caption);
  const tbody = document.createElement("tbody");
  table.append(tbody);
  addRow(tbody, "Model line", a.model, b.model);
  addRow(tbody, "EPA manufacturer", a.mfr || "Not listed", b.mfr || "Not listed");
  addRow(tbody, "Status", a.current ? "Currently certified" : "Previously certified", b.current ? "Currently certified" : "Previously certified");
  addRow(tbody, "Emission", a.em == null ? "Not listed" : `${num(a.em, 3)} ${a.emUnit}`, b.em == null ? "Not listed" : `${num(b.em, 3)} ${b.emUnit}`);
  addRow(tbody, "HHV efficiency", num(a.eff, 2, "%"), num(b.eff, 2, "%"));
  addRow(tbody, "Heat output", heat(a), heat(b));
  result.append(table);
  const links = document.createElement("p");
  const leftLink = document.createElement("a");
  leftLink.href = a.url;
  leftLink.textContent = `Full page for ${a.model}`;
  const rightLink = document.createElement("a");
  rightLink.href = b.url;
  rightLink.textContent = `Full page for ${b.model}`;
  links.append(leftLink, document.createTextNode(" · "), rightLink);
  result.append(links);
}

Promise.all([fetch("/data/current.json"), fetch("/data/historical.json")])
  .then(async ([left, right]) => {
    const current = await left.json();
    const historical = await right.json();
    stoves = current.stoves.concat(historical.stoves);
    for (const stove of stoves) byId.set(stove.id, stove);
    leftInput.addEventListener("input", () => {
      leftInput.dataset.id = "";
      suggest(leftInput, leftList);
    });
    rightInput.addEventListener("input", () => {
      rightInput.dataset.id = "";
      suggest(rightInput, rightList);
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      show();
    });
    const params = new URLSearchParams(location.search);
    const a = byId.get(params.get("a") || "");
    const b = byId.get(params.get("b") || "");
    if (a) {
      leftInput.value = a.model;
      leftInput.dataset.id = a.id;
    }
    if (b) {
      rightInput.value = b.model;
      rightInput.dataset.id = b.id;
    }
    if (a && b) show();
    else status.textContent = `${stoves.length.toLocaleString("en-US")} model lines are available to compare.`;
  })
  .catch(() => {
    status.textContent = "The comparison data did not load.";
  });
