export function byType(stoves, type) {
  return stoves.filter((stove) => stove.type === type);
}

export function splitCurrent(stoves) {
  const current = [];
  const previous = [];
  for (const stove of stoves) {
    if (stove.current) current.push(stove);
    else previous.push(stove);
  }
  const byName = (a, b) => a.model.localeCompare(b.model);
  current.sort((a, b) => (a.emission ?? 999) - (b.emission ?? 999) || byName(a, b));
  previous.sort((a, b) => (a.emission ?? 999) - (b.emission ?? 999) || byName(a, b));
  return { current, previous };
}

export function woodSubtype(stoves, subtype) {
  return splitCurrent(stoves.filter((stove) => stove.category === "room" && stove.type === "Wood Stove" && stove.subtype === subtype));
}

export function pelletStoves(stoves) {
  return splitCurrent(stoves.filter((stove) => stove.type === "Pellet Stove"));
}

export function inserts(stoves, type) {
  return splitCurrent(stoves.filter((stove) => stove.insertFlag && stove.type === type));
}

export function centralKind(stoves, predicate) {
  return splitCurrent(stoves.filter((stove) => stove.category === "central" && predicate(stove)));
}

export function rankByEfficiency(stoves, type) {
  return stoves
    .filter((stove) => stove.current && stove.type === type && stove.efficiency != null)
    .sort((a, b) => b.efficiency - a.efficiency || (a.emission ?? 999) - (b.emission ?? 999) || a.model.localeCompare(b.model));
}

export function rankByEmission(stoves, type) {
  return stoves
    .filter((stove) => stove.current && stove.type === type && stove.emission != null)
    .sort((a, b) => a.emission - b.emission || (b.efficiency ?? -1) - (a.efficiency ?? -1) || a.model.localeCompare(b.model));
}

export function excludedEfficiency(stoves, type) {
  return stoves.filter((stove) => stove.current && stove.type === type && stove.efficiency == null).length;
}

export function excludedEmission(stoves, type) {
  return stoves.filter((stove) => stove.current && stove.type === type && stove.emission == null).length;
}
