import { hydrateModelNumberIndex, modelNumberStatus, resolveModelNumberQuery } from "./model-number-aliases.js";

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

function appendResult(list, url, title, detail) {
  const item = document.createElement("li");
  const link = document.createElement("a");
  link.href = url;
  link.textContent = title;
  item.append(link);
  const note = document.createElement("div");
  note.className = "small muted";
  note.textContent = detail;
  item.append(note);
  list.append(item);
}

function modelDetail(match) {
  const bits = [
    `${match.current ? "Currently certified" : "Previously certified"} model line: ${match.model}.`,
  ];
  if (match.matched.length) bits.push(`Model number in the EPA cell: ${match.matched.join(", ")}.`);
  bits.push(`EPA manufacturer: ${match.mfr || "not listed"}.`);
  return bits.join(" ");
}

export function mountLookup(document) {
  const input = document.querySelector("#lookup-q");
  const list = document.querySelector("#lookup-results");
  const status = document.querySelector("#lookup-status");
  if (!input || !list || !status) return;
  let names = [];
  let modelIndex = null;
  let snapshot = "";

  function render() {
    const typed = input.value.trim();
    const query = typed.toLowerCase();
    clear(list);
    if (query.length < 2) {
      status.textContent = "Type at least two letters.";
      return;
    }
    if (modelIndex) {
      const result = resolveModelNumberQuery(modelIndex, typed);
      const versus = result.sides.length > 1;
      if (result.matches.length || versus) {
        status.textContent = modelNumberStatus(result, snapshot);
        for (const match of result.matches) appendResult(list, match.url, match.model, modelDetail(match));
        return;
      }
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
      status.textContent = modelNumberStatus({ sides: [{ query: typed, matches: [] }] }, snapshot);
      return;
    }
    status.textContent = matches.length === 25
      ? "Showing the first 25 matching names."
      : `${matches.length} matching names.`;
    for (const entry of matches) {
      appendResult(
        list,
        entry.url,
        entry.n,
        `${entry.current ? "Currently certified" : "Previously certified"} model line: ${entry.model}. EPA manufacturer: ${entry.mfr || "not listed"}.`,
      );
    }
  }

  fetch("/data/names.json")
    .then((response) => response.json())
    .then((payload) => {
      names = payload.names || [];
      snapshot = payload.snapshot || "";
      modelIndex = payload.modelNumbers ? hydrateModelNumberIndex(payload.modelNumbers) : null;
      input.addEventListener("input", render);
      const aliases = names.filter((entry) => entry.alias).length;
      const retail = names.length - aliases;
      const tokens = modelIndex ? modelIndex.tokenCount.toLocaleString("en-US") : "0";
      status.textContent = `${retail.toLocaleString("en-US")} retail names from the model-line field are ready to search, plus ${aliases.toLocaleString("en-US")} alias entries for the linked names below, plus ${tokens} model-number tokens.`;
    })
    .catch(() => {
      status.textContent = "The name index did not load.";
    });
}
