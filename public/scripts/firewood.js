const form = document.querySelector("#wood-form");
const left = document.querySelector("#wood-a");
const right = document.querySelector("#wood-b");
const output = document.querySelector("#wood-result");
const data = JSON.parse(document.querySelector("#firewood-data").textContent);
const byName = new Map(data.map((row) => [row.species, row]));

function line(row) {
  const heat = row.btuLow === row.btuHigh
    ? `${row.btuLow} million BTU per cord`
    : `${row.btuLow} to ${row.btuHigh} million BTU per cord`;
  return `${row.species}: ${heat}. Extension rating: ${row.overallRating}. Sparks: ${row.sparks}. Smoke: ${row.smoke}.`;
}

if (left.value === right.value && right.options.length > 1) right.selectedIndex = 1;

function compare() {
  const a = byName.get(left.value);
  const b = byName.get(right.value);
  if (!a || !b) return;
  output.textContent = `${line(a)} ${line(b)} Both figures are from the same extension table.`;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  compare();
});
compare();
