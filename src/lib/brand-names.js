const TRAILING_SUFFIXES = new Set([
  "inc",
  "llc",
  "ltd",
  "corp",
  "co",
  "company",
  "corporation",
  "incorporated",
  "limited",
  "gmbh",
  "mbh",
  "spa",
  "srl",
  "snc",
  "sa",
  "ltda",
  "pty",
  "oyj",
  "oy",
  "ab",
  "as",
  "aps",
  "bv",
  "nv",
  "plc",
  "lp",
  "llp",
]);

// Keep this in step with normalize_hub_name in scripts/build_data.py.
export function normalizeHubName(name) {
  let value = String(name || "").normalize("NFKD").replace(/\p{M}/gu, "");
  value = value.replace(/\([^)]*\)/g, " ");
  value = value.toLowerCase().replaceAll("&", " and ");
  value = value.replace(/[^a-z0-9]+/g, " ").trim();
  const tokens = value.split(/\s+/).filter(Boolean);
  while (tokens.length && TRAILING_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}
