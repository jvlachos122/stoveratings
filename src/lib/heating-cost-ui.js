import {
  EFFICIENCY_MISSING,
  HEAT_MISSING,
  SEASON_MISSING,
  cordHeatText,
  costsForFuel,
  deliveredMmbtuFromSize,
  efficiencyNote,
  formatPlainNumber,
  formatPriceInput,
  heatContentText,
  pelletBtuPerShortTon,
  perMmbtuText,
  readNumber,
  seasonText,
} from "./heating-cost.js";

const FIXED = [
  { key: "natural-gas", heatId: "natural-gas", priceId: "price-natural-gas", effId: "eff-natural-gas", unit: "Mcf" },
  { key: "propane", heatId: "propane", priceId: "price-propane", effId: "eff-propane", unit: "gallon" },
  { key: "heating-oil", heatId: "heating-oil", priceId: "price-heating-oil", effId: "eff-heating-oil", unit: "gallon" },
  { key: "resistance", heatId: "electricity", priceId: "price-electricity", effId: "eff-resistance", unit: "kWh" },
  { key: "heat-pump", heatId: "electricity", priceId: "price-electricity", effId: "eff-heat-pump", unit: "kWh" },
];

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function mountHeatingCost(doc) {
  const data = JSON.parse(doc.getElementById("heating-data").textContent);
  const heatById = new Map(data.heat.map((row) => [row.id, row]));
  const models = data.models.slice().sort((a, b) => Number(b.current) - Number(a.current) || a.model.localeCompare(b.model, "en"));
  const form = doc.getElementById("cost-form");
  const preview = doc.getElementById("size-preview");
  const status = doc.getElementById("cost-status");
  const state = { woodUnlisted: false, pelletUnlisted: false, woodModel: null, pelletModel: null };
  let seasonValue = null;

  function setText(id, text) {
    const node = doc.getElementById(id);
    node.textContent = text;
  }

  function seasonMmbtu() {
    const mode = form.querySelector('input[name="heat-mode"]:checked')?.value;
    if (mode === "size") {
      const band = data.bands.find((item) => item.id === doc.getElementById("size-band").value);
      const factor = band ? (doc.getElementById("size-end").value === "high" ? band.high : band.low) : null;
      const sqft = readNumber(doc.getElementById("size-sqft").value);
      const hours = readNumber(doc.getElementById("size-hours").value);
      const mmbtu = deliveredMmbtuFromSize(sqft, factor, hours);
      if (mmbtu == null) {
        preview.textContent = "Enter floor area and hours. Season heat = square feet × the band factor × hours ÷ 1,000,000. The factors match the stove size calculator and are not EPA figures. Hours have no default.";
        return null;
      }
      const btuPerHour = sqft * factor;
      const delivered = sqft * factor * hours;
      preview.textContent = `${formatPlainNumber(sqft, 0)} sq ft × ${factor} = ${formatPlainNumber(btuPerHour, 0)} BTU/hr, × ${formatPlainNumber(hours, 0)} hours = ${formatPlainNumber(delivered, 0)} BTU (${formatPlainNumber(mmbtu, 4)} million BTU). That uses the stove-size formula, not an EPA heat-loss calculation.`;
      return mmbtu;
    }
    const direct = readNumber(doc.getElementById("heat-mmbtu").value);
    if (direct == null || !(direct > 0)) {
      preview.textContent = "Enter million BTU of heat delivered over the season, or switch to the stove-size formula and enter hours.";
      return null;
    }
    preview.textContent = `${formatPlainNumber(direct, 4)} million BTU delivered is the season heat used below.`;
    return direct;
  }

  function woodHeat() {
    const species = doc.getElementById("wood-species").value;
    const row = data.firewood.find((item) => item.species === species);
    if (!row) return null;
    return {
      low: row.btuLow * 1_000_000,
      high: row.btuHigh * 1_000_000,
      label: cordHeatText(row.btuLow, row.btuHigh),
    };
  }

  function pelletHeat() {
    const row = heatById.get(doc.getElementById("pellet-region").value);
    if (!row) return null;
    const perTon = pelletBtuPerShortTon(row.btuText || row.btuPerUnit);
    if (perTon == null) return null;
    return { low: perTon, high: perTon, label: heatContentText(row) };
  }

  function paint(key, heat, priceRaw, unit, effRaw, unlisted) {
    setText(`${key}-heat`, heat ? heat.label : HEAT_MISSING);
    const priceText = formatPriceInput(priceRaw, unit);
    setText(`${key}-price`, priceText || "Enter a price above zero.");
    const eff = readNumber(effRaw);
    if (unlisted && (eff == null || !(eff > 0))) setText(`${key}-eff`, "Not listed by EPA");
    else if (eff != null && eff > 0) setText(`${key}-eff`, `${String(effRaw).trim().replace(/%$/, "")}%`);
    else setText(`${key}-eff`, EFFICIENCY_MISSING);
    const result = costsForFuel({
      price: priceRaw,
      btuLow: heat ? heat.low : null,
      btuHigh: heat ? heat.high : null,
      efficiencyPercent: effRaw,
      deliveredMmbtu: seasonValue,
    });
    setText(`${key}-mmbtu`, perMmbtuText(result));
    setText(`${key}-season`, seasonText(result));
  }

  function calculate() {
    seasonValue = seasonMmbtu();
    const wood = woodHeat();
    paint(
      "out-wood",
      wood,
      doc.getElementById("wood-price").value,
      "cord",
      doc.getElementById("wood-eff").value,
      state.woodUnlisted,
    );
    const pellet = pelletHeat();
    paint(
      "out-pellet",
      pellet,
      doc.getElementById("pellet-price").value,
      "short ton",
      doc.getElementById("pellet-eff").value,
      state.pelletUnlisted,
    );
    for (const row of FIXED) {
      const heatRow = heatById.get(row.heatId);
      const per = heatRow ? heatRow.btuPerUnit : null;
      paint(
        `out-${row.key}`,
        per ? { low: per, high: per, label: heatContentText(heatRow) } : null,
        doc.getElementById(row.priceId).value,
        row.unit,
        doc.getElementById(row.effId).value,
        false,
      );
    }
    status.textContent = seasonValue == null
      ? `${SEASON_MISSING} Cost per million BTU still appears once a price and an efficiency are filled in. A blank efficiency is not zero.`
      : `Season heat used: ${formatPlainNumber(seasonValue, 4)} million BTU delivered. A blank efficiency is not zero.`;
  }

  function renderMatches(side) {
    const queryInput = doc.getElementById(side === "wood" ? "wood-model-q" : "pellet-model-q");
    const list = doc.getElementById(side === "wood" ? "wood-matches" : "pellet-matches");
    const noteStatus = doc.getElementById(side === "wood" ? "wood-model-status" : "pellet-model-status");
    const query = queryInput.value.trim().toLowerCase();
    clear(list);
    if (query.length < 2) {
      noteStatus.textContent = "Type at least two letters. Choosing a model line fills Overall Efficiency-HHV (%) when EPA lists it.";
      return;
    }
    const matches = [];
    for (const model of models) {
      if (model.side !== side) continue;
      if (`${model.model} ${model.mfr}`.toLowerCase().includes(query)) matches.push(model);
      if (matches.length === 12) break;
    }
    noteStatus.textContent = matches.length
      ? `${matches.length === 12 ? "Showing the first 12 matching" : `${matches.length} matching`} model lines.`
      : "No model line in this snapshot contains that text.";
    for (const model of matches) {
      const item = doc.createElement("li");
      const button = doc.createElement("button");
      button.type = "button";
      button.textContent = `${model.model} — ${model.mfr || "manufacturer not listed"}`;
      button.addEventListener("click", () => {
        queryInput.value = model.model;
        applyModel(side, model);
        clear(list);
        noteStatus.textContent = "Selected model line.";
      });
      item.append(button);
      list.append(item);
    }
  }

  function applyModel(side, model) {
    const input = doc.getElementById(side === "wood" ? "wood-eff" : "pellet-eff");
    const note = doc.getElementById(side === "wood" ? "wood-model-note" : "pellet-model-note");
    if (side === "wood") {
      state.woodModel = model;
      state.woodUnlisted = model.eff == null;
    } else {
      state.pelletModel = model;
      state.pelletUnlisted = model.eff == null;
    }
    input.value = model.eff == null ? "" : String(model.eff);
    clear(note);
    note.append(doc.createTextNode(efficiencyNote(model, data.snapshotDate)));
    if (model.url && model.url.startsWith("/")) {
      note.append(doc.createTextNode(" "));
      const link = doc.createElement("a");
      link.href = model.url;
      link.textContent = "Model line page";
      note.append(link);
    }
    calculate();
  }

  doc.getElementById("wood-eff").addEventListener("input", () => {
    state.woodUnlisted = false;
  });
  doc.getElementById("pellet-eff").addEventListener("input", () => {
    state.pelletUnlisted = false;
  });
  doc.getElementById("wood-model-q").addEventListener("input", () => renderMatches("wood"));
  doc.getElementById("pellet-model-q").addEventListener("input", () => renderMatches("pellet"));
  form.addEventListener("input", calculate);
  form.addEventListener("change", calculate);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    calculate();
  });

  const requested = new URLSearchParams(doc.defaultView.location.search).get("model");
  if (requested) {
    const model = models.find((item) => item.id === requested);
    if (model) {
      const queryInput = doc.getElementById(model.side === "pellet" ? "pellet-model-q" : "wood-model-q");
      queryInput.value = model.model;
      applyModel(model.side, model);
      return;
    }
  }
  calculate();
}
