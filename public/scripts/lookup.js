const input = document.querySelector("#lookup-q");
const list = document.querySelector("#lookup-results");
const status = document.querySelector("#lookup-status");
let names = [];

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function render() {
  const query = input.value.trim().toLowerCase();
  clear(list);
  if (query.length < 2) {
    status.textContent = "Type at least two letters.";
    return;
  }
  const matches = [];
  for (const entry of names) {
    if (entry.q.includes(query)) matches.push(entry);
    if (matches.length === 25) break;
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
    status.textContent = `${names.length.toLocaleString("en-US")} retail names from the model-line field are ready to search.`;
  })
  .catch(() => {
    status.textContent = "The name index did not load.";
  });
