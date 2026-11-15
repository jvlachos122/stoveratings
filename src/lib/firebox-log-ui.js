import {
  LINE_PLACEHOLDER,
  fitReport,
  lineVolumeSentence,
  measurementProblem,
} from "./firebox-log-length.js";

function volumesFrom(value) {
  if (!value) return [];
  const volumes = [];
  for (const part of String(value).split(",")) {
    const volume = Number(part);
    if (Number.isFinite(volume)) volumes.push(volume);
  }
  return volumes;
}

function selectedLine(select) {
  const option = select?.selectedOptions?.[0];
  if (!option || !option.value) return null;
  return {
    manufacturer: option.dataset.manufacturer || "",
    model: option.dataset.model || "",
    status: option.dataset.status || "",
    url: option.dataset.url || "",
    volumes: volumesFrom(option.dataset.volumes),
  };
}

export function mountFireboxLog(doc) {
  const form = doc.getElementById("log-form");
  const depth = doc.getElementById("depth");
  const width = doc.getElementById("width");
  const output = doc.getElementById("log-result");
  const select = doc.getElementById("stove-line");
  const lineOutput = doc.getElementById("line-result");
  if (!form || !depth || !width || !output) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const problem = measurementProblem(depth.value, width.value);
    output.textContent = problem || fitReport(depth.value, width.value);
  });

  if (!select || !lineOutput) return;
  select.addEventListener("change", () => {
    const line = selectedLine(select);
    while (lineOutput.firstChild) lineOutput.removeChild(lineOutput.firstChild);
    if (!line) {
      lineOutput.textContent = LINE_PLACEHOLDER;
      return;
    }
    lineOutput.append(doc.createTextNode(`${lineVolumeSentence(line)} `));
    if (line.url.startsWith("/")) {
      const link = doc.createElement("a");
      link.href = line.url;
      link.textContent = "Open the model line";
      lineOutput.append(link);
      lineOutput.append(doc.createTextNode("."));
    }
  });
}
