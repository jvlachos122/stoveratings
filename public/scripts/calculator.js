const form = document.querySelector("#size-form");
const area = document.querySelector("#sqft");
const climate = document.querySelector("#climate");
const output = document.querySelector("#size-result");

const factors = {
  mild: [20, 30],
  moderate: [30, 45],
  cold: [45, 60],
  severe: [60, 75],
};

function calculate() {
  const sqft = Number(area.value);
  const band = factors[climate.value];
  if (!sqft || sqft < 1 || !band) {
    output.textContent = "Enter a floor area of at least 1 square foot.";
    return;
  }
  const low = Math.round(sqft * band[0]);
  const high = Math.round(sqft * band[1]);
  output.textContent = `${sqft.toLocaleString("en-US")} sq ft × ${band[0]} = ${low.toLocaleString("en-US")} BTU/hr, and ${sqft.toLocaleString("en-US")} sq ft × ${band[1]} = ${high.toLocaleString("en-US")} BTU/hr. That is StoveRatings' planning range for this band, not an EPA figure.`;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  calculate();
});
calculate();
