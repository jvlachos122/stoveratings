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

// Lowest listed emission first. Ties break by a higher HHV efficiency, then model name.
// A missing emission is excluded. It is not treated as zero. EPA does not define this tie break.
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

/**
 * Lists whose tables include this model line. Predicates match the page filters.
 */
export function relatedLists(stove) {
  const lists = [];
  const roomWood = stove.category === "room" && stove.type === "Wood Stove";
  if (roomWood && stove.subtype === "Catalytic Stove") {
    lists.push({ href: "/catalytic-wood-stoves/", label: "Catalytic wood stoves" });
  }
  if (roomWood && stove.subtype === "Non-Catalytic Stove") {
    lists.push({ href: "/non-catalytic-wood-stoves/", label: "Non-catalytic wood stoves" });
  }
  if (roomWood && stove.subtype === "Hybrid") {
    lists.push({ href: "/hybrid-wood-stoves/", label: "Hybrid wood stoves" });
  }
  if (stove.type === "Pellet Stove") {
    lists.push({ href: "/pellet-stoves/", label: "Pellet stoves" });
  }
  if (stove.type === "Hydronic Heater" && stove.fuel === "Wood Pellets") {
    lists.push({ href: "/pellet-boilers/", label: "Pellet boilers" });
  }
  if (stove.type === "Hydronic Heater" && stove.fuel !== "Wood Pellets") {
    lists.push({ href: "/outdoor-wood-boilers/", label: "Hydronic heaters" });
  }
  if (stove.type === "Forced Air Furnace") {
    lists.push({ href: "/wood-furnaces/", label: "Forced-air furnaces" });
  }
  if (stove.insertFlag && stove.type === "Wood Stove") {
    lists.push({ href: "/wood-stove-inserts/", label: "Wood stove inserts" });
  }
  if (stove.insertFlag && stove.type === "Pellet Stove") {
    lists.push({ href: "/pellet-stove-inserts/", label: "Pellet stove inserts" });
  }
  if (stove.current && stove.type === "Wood Stove" && stove.efficiency != null) {
    lists.push({ href: "/most-efficient-wood-stoves/", label: "Wood stoves ordered by HHV efficiency" });
  }
  if (stove.current && stove.type === "Pellet Stove" && stove.efficiency != null) {
    lists.push({ href: "/most-efficient-pellet-stoves/", label: "Pellet stoves ordered by HHV efficiency" });
  }
  if (stove.current && stove.type === "Wood Stove" && stove.emission != null) {
    lists.push({ href: "/cleanest-burning-wood-stoves/", label: "Wood stoves ordered by emission rate" });
  }
  if (stove.current && stove.type === "Pellet Stove" && stove.emission != null) {
    lists.push({ href: "/cleanest-burning-pellet-stoves/", label: "Pellet stoves ordered by emission rate" });
  }
  return lists;
}
