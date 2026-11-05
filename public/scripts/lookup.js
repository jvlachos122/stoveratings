const input = document.querySelector("#lookup-q");
const list = document.querySelector("#lookup-results");
const status = document.querySelector("#lookup-status");
let names = [];

// Filler tokens match ALIAS_FILLER in src/lib/retail-aliases.js.
const ALIAS_FILLER = new Set(["wood", "stove", "stoves", "pellet", "pellets", "heater", "heaters", "epa", "certified"]);

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function aliasHit(entry, query) {
  if (!entry.alias) return false;
  if (entry.q === query) return true;
  const tokens = query.split(/[^a-z0-9.]+/).filter(Boolean).filter((token) => !ALIAS_FILLER.has(token));
  if (tokens.length < 2) return false;
  return entry.q.includes(query);
}

function render() {
  const query = input.value.trim().toLowerCase();
  clear(list);
  if (query.length < 2) {
    status.textContent = "Type at least two letters.";
    return;
  }
  const matches = [];
  const seen = new Set();
  function take(entry) {
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    matches.push(entry);
  }
  for (const entry of names) {
    if (aliasHit(entry, query)) take(entry);
    if (matches.length === 25) break;
  }
  if (matches.length < 25) {
    for (const entry of names) {
      if (entry.alias) continue;
      if (entry.q.includes(query)) take(entry);
      if (matches.length === 25) break;
    }
  }
  if (!matches.length) {
    status.textContent = "No retail name in this snapshot contains that text. EPA often lists a model line, not the name on the stove.";
    return;
  }
  status.textContent = matches.length === 25
    ? "Showing the first 25 matching names."
    : `${matches.length} matching names.`;
  for (const entry of matches) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = entry.url;
    link.textContent = entry.n;
    item.append(link);
    const detail = document.createElement("div");
    detail.className = "small muted";
    detail.textContent = `${entry.current ? "Currently certified" : "Previously certified"} model line: ${entry.model}. EPA manufacturer: ${entry.mfr || "not listed"}.`;
    item.append(detail);
    list.append(item);
  }
}

fetch("/data/names.json")
  .then((response) => response.json())
  .then((payload) => {
    names = payload.names;
    input.addEventListener("input", render);
    const aliases = names.filter((entry) => entry.alias).length;
    const retail = names.length - aliases;
    status.textContent = `${retail.toLocaleString("en-US")} retail names from the model-line field are ready to search, plus ${aliases.toLocaleString("en-US")} alias entries for the linked names below.`;
  })
  .catch(() => {
    status.textContent = "The name index did not load.";
  });
