"""Build data/stoves.json and the snapshot stats from the committed EPA files.

Reads data/raw CSV, or HTML result pages when those have been saved locally.
Does not contact cfpub.epa.gov or any other host.
"""

import csv
import hashlib
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from diff import diff_snapshots  # noqa: E402
from parse_epa import parse_file  # noqa: E402

RAW = ROOT / "data" / "raw"
DATA = ROOT / "data"
INSERT_RE = re.compile(r"insert|\b-I\b", re.I)
SEPARATOR = " || "

ROOM_FIELDS = [
    "New",
    "Model",
    "Manufacturer",
    "Firebox Volume (Cubic Feet)",
    "Emission Rate (grams/hr)",
    "Heat Output (BTUs)",
    "Overall Efficiency-HHV (%)",
    "Type",
    "Subtype",
    "Certified Fuel Type",
    "Test Method",
    "CO (g/min)",
    "NSPS Compliance 2020",
]
CENTRAL_FIELDS = [
    "New",
    "Model",
    "Manufacturer",
    "Firebox Volume (Cubic Feet)",
    "Emission Rate Annual Avg (lb/mmBTU)",
    "Heat Output Maximum (BTUs)",
    "Heat Output (Upper)",
    "Heat Output (Lower)",
    "Overall Efficiency-HHV (%)",
    "Type",
    "Subtype",
    "Certified Fuel Type",
    "CO (g/min)",
    "Thermal Storage",
    "NSPS Compliance 2020",
]


def slugify(value):
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = value.lower().replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "unknown"


def read_csv(path):
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def dataset_rows(stem, fields):
    html_path = RAW / f"{stem}.html"
    csv_path = RAW / f"{stem}.csv"
    if html_path.exists():
        header, records = parse_file(html_path)
        missing = [field for field in fields if field not in header]
        if missing:
            raise SystemExit(f"{html_path.name} is missing columns: {missing}")
        print(f"{html_path.name} -> {len(records)} rows (local HTML)")
        return records
    if not csv_path.exists():
        raise SystemExit(f"missing {csv_path.name} and {html_path.name}")
    records = read_csv(csv_path)
    print(f"{csv_path.name} -> {len(records)} rows (local CSV)")
    return records


def signature(row, fields):
    return tuple((row.get(field) or "").strip() for field in fields)


def blank_to_none(value):
    value = (value or "").strip()
    return value or None


def number(value):
    value = (value or "").strip()
    if not value or value.lower() in {"not applicable", "n/a", "na"}:
        return None
    try:
        return float(value)
    except ValueError as exc:
        raise SystemExit(f"cannot parse number {value!r}") from exc


def btu_pair(value):
    value = (value or "").strip()
    if not value:
        return None, None
    match = re.fullmatch(r"(\d+)\s*-\s*(\d+)", value)
    if match:
        return int(match.group(1)), int(match.group(2))
    match = re.fullmatch(r"(\d+)", value)
    if match:
        parsed = int(match.group(1))
        return parsed, parsed
    raise SystemExit(f"cannot parse BTU {value!r}")


def firebox(value):
    value = (value or "").strip()
    if not value:
        return None, "not_listed"
    if value.lower() == "not applicable":
        return None, "not_applicable"
    return number(value), "listed"


def retail_names(model):
    text = model.strip()
    if ":" in text:
        left, right = text.split(":", 1)
        parts = [left, *re.split(r"[,;]", right)]
    else:
        parts = re.split(r"[,;]", text)
    names = []
    seen = set()
    for part in parts:
        part = part.replace("(", " ").replace(")", " ")
        part = re.sub(r"\s+", " ", part).strip(" .;-/")
        if not part:
            continue
        key = part.casefold()
        if key in seen:
            continue
        seen.add(key)
        names.append(part)
    return names or [text]


TRAILING_SUFFIXES = {
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
}


def normalize_hub_name(name):
    """Case, diacritics, punctuation, parentheticals, and trailing legal suffixes.

    Parentheticals are removed so "Inc." and "Inc.(Kozy Heat)" collide.
    Do not use this to force two manufacturer strings onto one hub: dropping
    the parentheses also makes CFM's Vermont Castings and Jacuzzi strings match.
    """
    value = unicodedata.normalize("NFKD", name or "")
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = re.sub(r"\([^)]*\)", " ", value)
    value = value.lower().replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", " ", value).strip()
    tokens = [token for token in value.split() if token]
    while tokens and tokens[-1] in TRAILING_SUFFIXES:
        tokens.pop()
    return " ".join(tokens)


def load_redirects():
    path = DATA / "brand-redirects.csv"
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    redirects = []
    seen = set()
    for row in rows:
        source = row["from_slug"].strip()
        target = row["to_slug"].strip()
        name = row["from_name"].strip()
        reason = row["reason"].strip()
        if not source or not target or not name or not reason:
            raise SystemExit(f"brand redirect is incomplete: {row}")
        if source == target:
            raise SystemExit(f"brand redirect loops: {source}")
        if source in seen:
            raise SystemExit(f"duplicate brand redirect: {source}")
        seen.add(source)
        redirects.append(
            {
                "fromSlug": source,
                "toSlug": target,
                "fromName": name,
                "reason": reason,
            }
        )
    return redirects


def load_crosswalk():
    path = DATA / "brand-crosswalk.csv"
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    brands = []
    for row in rows:
        raw_strings = row["manufacturer_strings"].strip()
        if not raw_strings:
            manufacturers = []
        else:
            manufacturers = [part.strip() for part in raw_strings.split(SEPARATOR)]
            manufacturers = ["" if part == "__BLANK__" else part for part in manufacturers]
        regex = row["model_regex"].strip()
        brands.append(
            {
                "name": row["brand"].strip(),
                "slug": row["brand_slug"].strip(),
                "role": row["role"].strip(),
                "manufacturers": manufacturers,
                "regex": re.compile(regex, re.I) if regex else None,
                "manufacturerContains": row["manufacturer_contains"].strip(),
                "note": row["note"].strip(),
                "evidence": row["evidence"].strip(),
            }
        )
    return brands


def ensure_primary_hubs(brands, manufacturers):
    """Manufacturers missing from the CSV still get a hub titled with the EPA name."""
    owned = {}
    slugs = {brand["slug"] for brand in brands}
    for brand in brands:
        if brand["role"] != "primary":
            continue
        for manufacturer in brand["manufacturers"]:
            if manufacturer in owned:
                raise SystemExit(f"{manufacturer!r} is on more than one primary hub")
            owned[manufacturer] = brand["slug"]
    for manufacturer in sorted(manufacturers, key=lambda name: name.lower()):
        if manufacturer in owned:
            continue
        if manufacturer == "":
            name = "Manufacturer not listed by EPA"
            slug = "not-listed"
        else:
            name = manufacturer
            slug = slugify(manufacturer)
        if slug in slugs:
            slug = f"{slug}-mfr"
        slugs.add(slug)
        brands.append(
            {
                "name": name,
                "slug": slug,
                "role": "primary",
                "manufacturers": [manufacturer],
                "regex": None,
                "manufacturerContains": "",
                "note": "Models are grouped under the manufacturer name EPA published. This hub was added because the string is not yet in brand-crosswalk.csv.",
                "evidence": "No retail-brand mapping is recorded. The hub title is the EPA manufacturer string.",
            }
        )
        owned[manufacturer] = slug
        print(f"auto hub for unmapped manufacturer: {manufacturer or '(blank)'} -> {slug}")
    return owned


def brand_slugs_for(manufacturer, model, brands):
    slugs = []
    for brand in brands:
        if brand["role"] == "primary" and manufacturer in brand["manufacturers"]:
            slugs.append(brand["slug"])
        matched = False
        if brand["regex"] and brand["regex"].search(model):
            matched = True
        if brand["manufacturerContains"] and brand["manufacturerContains"].lower() in manufacturer.lower():
            matched = True
        if matched and brand["slug"] not in slugs:
            slugs.append(brand["slug"])
    primary = [brand["slug"] for brand in brands if brand["role"] == "primary" and manufacturer in brand["manufacturers"]]
    if len(primary) != 1:
        raise SystemExit(f"{manufacturer!r} has primary hubs {primary}")
    # Primary slug first, then aliases / extra regex hits.
    ordered = primary + [slug for slug in slugs if slug not in primary]
    return ordered


def load_overrides():
    path = DATA / "insert-overrides.csv"
    overrides = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if not (row.get("manufacturer") or row.get("model")):
                continue
            flag = row["insert"].strip().lower()
            if flag not in {"yes", "no"}:
                raise SystemExit(f"insert override must be yes or no: {row}")
            overrides[(row["manufacturer"].strip(), row["model"].strip())] = {
                "insert": flag == "yes",
                "note": row.get("note", "").strip(),
            }
    return overrides


def median(values):
    values = sorted(values)
    count = len(values)
    if count == 0:
        return None
    mid = count // 2
    if count % 2:
        return values[mid]
    return (values[mid - 1] + values[mid]) / 2


def test_row(row, category, current):
    if category == "room":
        emission = number(row["Emission Rate (grams/hr)"])
        emission_unit = "g/hr"
        btu_low, btu_high = btu_pair(row["Heat Output (BTUs)"])
        btu_max = None
        thermal = None
    else:
        emission = number(row["Emission Rate Annual Avg (lb/mmBTU)"])
        emission_unit = "lb/mmBTU"
        btu_low = number(row["Heat Output (Lower)"])
        btu_high = number(row["Heat Output (Upper)"])
        btu_max = number(row["Heat Output Maximum (BTUs)"])
        btu_low = int(btu_low) if btu_low is not None else None
        btu_high = int(btu_high) if btu_high is not None else None
        btu_max = int(btu_max) if btu_max is not None else None
        thermal = blank_to_none(row["Thermal Storage"])
    firebox_value, firebox_status = firebox(row["Firebox Volume (Cubic Feet)"])
    return {
        "emission": emission,
        "emissionUnit": emission_unit,
        "efficiency": number(row["Overall Efficiency-HHV (%)"]),
        "btuLow": btu_low,
        "btuHigh": btu_high,
        "btuMax": btu_max,
        "firebox": firebox_value,
        "fireboxStatus": firebox_status,
        "co": number(row["CO (g/min)"]),
        "fuel": blank_to_none(row["Certified Fuel Type"]),
        "testMethod": blank_to_none(row.get("Test Method")),
        "nsps2020": blank_to_none(row["NSPS Compliance 2020"]),
        "isNew": (row.get("New") or "").strip().lower() == "new!",
        "current": current,
        "thermalStorage": thermal,
        "type": (row.get("Type") or "").strip(),
        "subtype": blank_to_none(row.get("Subtype")),
    }


def listed_metric(test):
    return (
        test["efficiency"] is not None
        or test["fireboxStatus"] != "not_listed"
        or test["co"] is not None
    )


def choose_primary(tests):
    pool = [test for test in tests if test["current"]] or list(tests)

    def sort_key(test):
        emission = test["emission"]
        return (emission is None, emission if emission is not None else 0, test["efficiency"] is None)

    return sorted(pool, key=sort_key)[0]


def build_models(category, all_rows, current_rows, fields, brands, overrides):
    current_counts = defaultdict(int)
    for row in current_rows:
        current_counts[signature(row, fields)] += 1
    available = defaultdict(int)
    for row in all_rows:
        available[signature(row, fields)] += 1
    for sig, count in current_counts.items():
        if available[sig] < count:
            raise SystemExit(f"{category} current row is not in the all-rows file: {sig[:3]}")

    grouped = defaultdict(list)
    order = []
    seen_current = defaultdict(int)
    for row in all_rows:
        sig = signature(row, fields)
        is_current = seen_current[sig] < current_counts[sig]
        if is_current:
            seen_current[sig] += 1
        manufacturer = row["Manufacturer"].strip()
        model = row["Model"].strip()
        key = (manufacturer, model)
        if key not in grouped:
            order.append(key)
        grouped[key].append(test_row(row, category, is_current))

    unmatched_current = sum(current_counts.values()) - sum(seen_current.values())
    if unmatched_current:
        raise SystemExit(f"{category} had {unmatched_current} current rows that did not match")

    stoves = []
    used_url = {}
    for manufacturer, model in order:
        tests = grouped[(manufacturer, model)]
        tests.sort(key=lambda item: (item["emission"] is None, item["emission"] or 0, item["efficiency"] or 0))
        manufacturer_slug = "not-listed" if manufacturer == "" else slugify(manufacturer)
        base_slug = slugify(model)[:80].strip("-") or "model"
        model_slug = base_slug
        suffix = 2
        while (manufacturer_slug, model_slug) in used_url:
            model_slug = f"{base_slug[:70].strip('-')}-{suffix}"
            suffix += 1
        used_url[(manufacturer_slug, model_slug)] = True
        primary = choose_primary(tests)
        override = overrides.get((manufacturer, model))
        if override:
            insert_flag = override["insert"]
            insert_basis = "manual override"
        else:
            insert_flag = bool(INSERT_RE.search(model))
            insert_basis = "name indicates insert" if insert_flag else None
        current = any(test["current"] for test in tests)
        indexable = current or any(listed_metric(test) for test in tests)
        slugs = brand_slugs_for(manufacturer, model, brands)
        stove_id = f"{category}--{manufacturer_slug}--{model_slug}"
        stoves.append(
            {
                "id": stove_id,
                "category": category,
                "manufacturer": manufacturer,
                "manufacturerSlug": manufacturer_slug,
                "model": model,
                "modelSlug": model_slug,
                "url": f"/stoves/{manufacturer_slug}/{model_slug}/",
                "retailNames": retail_names(model),
                "type": primary["type"],
                "subtype": primary["subtype"],
                "fuel": primary["fuel"],
                "current": current,
                "insertFlag": insert_flag,
                "insertBasis": insert_basis,
                "indexable": indexable,
                "emission": primary["emission"],
                "emissionUnit": primary["emissionUnit"],
                "efficiency": primary["efficiency"],
                "btuLow": primary["btuLow"],
                "btuHigh": primary["btuHigh"],
                "btuMax": primary["btuMax"],
                "firebox": primary["firebox"],
                "fireboxStatus": primary["fireboxStatus"],
                "co": primary["co"],
                "nsps2020": primary["nsps2020"],
                "isNew": any(test["isNew"] for test in tests),
                "brandSlugs": slugs,
                "primarySlug": slugs[0],
                "tests": tests,
                "rowCount": len(tests),
            }
        )
    return stoves


def count_by(items, key):
    counts = defaultdict(int)
    for item in items:
        counts[key(item) or ""] += 1
    return dict(sorted(counts.items(), key=lambda pair: (-pair[1], pair[0])))


def median_block(rows, label):
    emissions = [row["emission"] for row in rows if row["emission"] is not None]
    efficiencies = [row["efficiency"] for row in rows if row["efficiency"] is not None]
    return {
        "label": label,
        "rows": len(rows),
        "emissionN": len(emissions),
        "emissionMedian": median(emissions),
        "efficiencyN": len(efficiencies),
        "efficiencyMedian": median(efficiencies),
    }


def top_records(stoves, predicate, value, reverse, limit=5):
    pool = [stove for stove in stoves if predicate(stove) and value(stove) is not None]

    def sort_key(stove):
        metric = value(stove)
        emission = stove["emission"] if stove["emission"] is not None else 10**9
        name = stove["model"].lower()
        if reverse:
            return (-metric, emission, name)
        return (metric, emission, name)

    pool.sort(key=sort_key)
    highlights = []
    for stove in pool[:limit]:
        highlights.append(
            {
                "id": stove["id"],
                "model": stove["model"],
                "manufacturer": stove["manufacturer"],
                "emission": stove["emission"],
                "emissionUnit": stove["emissionUnit"],
                "efficiency": stove["efficiency"],
                "url": stove["url"],
            }
        )
    return highlights


def load_firewood():
    path = DATA / "firewood.csv"
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise SystemExit("firewood.csv has no rows")
    cleaned = []
    for row in rows:
        source = (row.get("source_url") or "").strip()
        if not source.startswith("https://"):
            raise SystemExit(f"firewood row missing source_url: {row.get('species')}")
        low = float(row["btu_low_million_per_cord"])
        high = float(row["btu_high_million_per_cord"])
        if low <= 0 or high < low:
            raise SystemExit(f"bad firewood BTU range for {row['species']}")
        cleaned.append(
            {
                "species": row["species"].strip(),
                "btuLow": low,
                "btuHigh": high,
                "splitting": row["splitting"].strip(),
                "sparks": row["sparks"].strip(),
                "smoke": row["smoke"].strip(),
                "coaling": row["coaling"].strip(),
                "overallRating": row["overall_rating"].strip(),
                "sourceUrl": source,
                "sourceNote": row["source_note"].strip(),
            }
        )
    return cleaned


def apply_seen_dates(stoves, previous, snapshot_date):
    prior = {stove["id"]: stove for stove in previous or []}
    for stove in stoves:
        old = prior.get(stove["id"])
        stove["firstSeen"] = old["firstSeen"] if old and old.get("firstSeen") else snapshot_date
        stove["lastSeen"] = snapshot_date


def write_json(path, payload):
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    if any("cfpub.epa.gov" in arg for arg in sys.argv):
        raise SystemExit("refusing to use a cfpub.epa.gov address")
    snapshot_date = (RAW / "SNAPSHOT_DATE").read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", snapshot_date):
        raise SystemExit(f"bad SNAPSHOT_DATE {snapshot_date}")

    room_all = dataset_rows("rh_all", ROOM_FIELDS)
    room_current = dataset_rows("rh_inprod", ROOM_FIELDS)
    central_all = dataset_rows("wh_all", CENTRAL_FIELDS)
    central_current = dataset_rows("wh_inprod", CENTRAL_FIELDS)
    print(f"ROW_COUNTS room_all={len(room_all)} room_current={len(room_current)} central_all={len(central_all)} central_current={len(central_current)}")
    actual = (len(room_all), len(room_current), len(central_all), len(central_current))
    # The 2026-10-23 files are the launch snapshot. A later save must change
    # SNAPSHOT_DATE; this check stops a partial re-save of that same date.
    if snapshot_date == "2026-10-23" and actual != (1444, 265, 192, 41):
        raise SystemExit(f"row counts {actual} != (1444, 265, 192, 41) for the 2026-10-23 snapshot")

    brands = load_crosswalk()
    redirects = load_redirects()
    names_seen = {}
    for brand in brands:
        key = normalize_hub_name(brand["name"])
        if key and key in names_seen:
            raise SystemExit(f"normalized hub name {key!r} collides: {names_seen[key]!r} and {brand['name']!r}")
        names_seen[key] = brand["name"]
    slug_set = {brand["slug"] for brand in brands}
    for redirect in redirects:
        if redirect["fromSlug"] in slug_set:
            raise SystemExit(f"redirect slug is still a hub: {redirect['fromSlug']}")
        if redirect["toSlug"] not in slug_set:
            raise SystemExit(f"redirect target is not a hub: {redirect['toSlug']} <- {redirect['fromSlug']}")
    manufacturers = {row["Manufacturer"].strip() for row in room_all + central_all}
    ensure_primary_hubs(brands, manufacturers)
    overrides = load_overrides()

    stoves = build_models("room", room_all, room_current, ROOM_FIELDS, brands, overrides)
    stoves += build_models("central", central_all, central_current, CENTRAL_FIELDS, brands, overrides)
    stoves.sort(key=lambda stove: (stove["category"], stove["manufacturer"].lower(), stove["model"].lower(), stove["id"]))

    previous = []
    previous_date = None
    existing_path = DATA / "stoves.json"
    meta_path = DATA / "meta.json"
    if existing_path.exists():
        previous = json.loads(existing_path.read_text(encoding="utf-8"))
        if meta_path.exists():
            previous_date = json.loads(meta_path.read_text(encoding="utf-8")).get("snapshotDate")
    apply_seen_dates(stoves, previous, snapshot_date)

    ids = [stove["id"] for stove in stoves]
    if len(ids) != len(set(ids)):
        raise SystemExit("duplicate stove ids")
    urls = [stove["url"] for stove in stoves]
    if len(urls) != len(set(urls)):
        raise SystemExit("duplicate stove urls")

    for brand in brands:
        if brand["role"] != "alias" and not brand["regex"] and not brand["manufacturerContains"]:
            continue
        hits = 0
        for stove in stoves:
            text_hit = bool(brand["regex"] and brand["regex"].search(stove["model"]))
            string_hit = bool(brand["manufacturerContains"] and brand["manufacturerContains"].lower() in stove["manufacturer"].lower())
            if text_hit or string_hit:
                hits += 1
        if brand["role"] == "alias" and hits == 0:
            raise SystemExit(f"alias hub {brand['slug']} matched no rows")

    covered = {slug for stove in stoves for slug in stove["brandSlugs"]}
    for brand in brands:
        if brand["slug"] not in covered:
            raise SystemExit(f"hub {brand['slug']} has no model lines")

    room_rows = [test for stove in stoves if stove["category"] == "room" for test in stove["tests"]]
    central_rows = [test for stove in stoves if stove["category"] == "central" for test in stove["tests"]]
    room_current_rows = [test for test in room_rows if test["current"]]
    wood_current_rows = [test for test in room_current_rows if test["type"] == "Wood Stove"]
    pellet_current_rows = [test for test in room_current_rows if test["type"] == "Pellet Stove"]

    def rows_where(pool, **wanted):
        found = []
        for test in pool:
            if all(test.get(key) == value for key, value in wanted.items()):
                found.append(test)
        return found

    retail_tokens = [name for stove in stoves if stove["category"] == "room" for name in stove["retailNames"]]
    insert_rows = sum(1 for row in room_all if INSERT_RE.search(row["Model"]))
    insert_current_rows = sum(1 for row in room_current if INSERT_RE.search(row["Model"]))

    noindex = [stove["url"] for stove in stoves if not stove["indexable"]]
    noindex.extend(["/finder/", "/compare/"])
    noindex.extend(f"/brands/{redirect['fromSlug']}/" for redirect in redirects)

    brand_payload = []
    for brand in brands:
        brand_payload.append(
            {
                "name": brand["name"],
                "slug": brand["slug"],
                "role": brand["role"],
                "manufacturers": brand["manufacturers"],
                "note": brand["note"],
                "evidence": brand["evidence"],
                "url": f"/brands/{brand['slug']}/",
            }
        )
    brand_payload.sort(key=lambda brand: brand["name"].lower())
    by_slug = {brand["slug"]: brand["name"] for brand in brands}
    redirect_payload = []
    for redirect in redirects:
        redirect_payload.append(
            {
                "fromSlug": redirect["fromSlug"],
                "toSlug": redirect["toSlug"],
                "fromName": redirect["fromName"],
                "toName": by_slug[redirect["toSlug"]],
                "reason": redirect["reason"],
                "url": f"/brands/{redirect['fromSlug']}/",
                "targetUrl": f"/brands/{redirect['toSlug']}/",
            }
        )

    current_wood = [stove for stove in stoves if stove["current"] and stove["type"] == "Wood Stove"]
    current_pellet = [stove for stove in stoves if stove["current"] and stove["type"] == "Pellet Stove"]
    stats = {
        "snapshotDate": snapshot_date,
        "rows": {
            "roomAll": len(room_all),
            "roomCurrent": len(room_current),
            "centralAll": len(central_all),
            "centralCurrent": len(central_current),
        },
        "modelLines": {
            "room": sum(1 for stove in stoves if stove["category"] == "room"),
            "central": sum(1 for stove in stoves if stove["category"] == "central"),
            "total": len(stoves),
            "indexable": sum(1 for stove in stoves if stove["indexable"]),
            "noindex": sum(1 for stove in stoves if not stove["indexable"]),
        },
        "roomAllByType": count_by(room_rows, lambda test: test["type"]),
        "roomAllBySubtype": count_by(room_rows, lambda test: test["subtype"]),
        "roomCurrentByType": count_by(room_current_rows, lambda test: test["type"]),
        "roomCurrentBySubtype": count_by(room_current_rows, lambda test: test["subtype"]),
        "roomCurrentWoodBySubtype": count_by(wood_current_rows, lambda test: test["subtype"]),
        "centralAllByType": count_by(central_rows, lambda test: test["type"]),
        "centralCurrentByType": count_by([test for test in central_rows if test["current"]], lambda test: test["type"]),
        "centralAllByFuel": count_by(central_rows, lambda test: f"{test['type']}|{test['fuel']}"),
        "nsps": {
            "roomAllYes": sum(1 for test in room_rows if test["nsps2020"] == "Yes"),
            "roomCurrentYes": sum(1 for test in room_current_rows if test["nsps2020"] == "Yes"),
            "roomCurrentNo": sum(1 for test in room_current_rows if test["nsps2020"] == "No"),
            "centralAllYes": sum(1 for test in central_rows if test["nsps2020"] == "Yes"),
            "centralCurrentYes": sum(1 for test in central_rows if test["current"] and test["nsps2020"] == "Yes"),
        },
        "insert": {
            "rows": insert_rows,
            "currentRows": insert_current_rows,
            "modelLines": sum(1 for stove in stoves if stove["insertFlag"]),
            "currentModelLines": sum(1 for stove in stoves if stove["insertFlag"] and stove["current"]),
            "basis": "Model text matches /insert|\\b-I\\b/i. Labeled name indicates insert. No manual overrides are applied in this snapshot.",
        },
        "retailNames": {
            "roomTokens": len(retail_tokens),
            "roomDistinct": len({name.casefold() for name in retail_tokens}),
        },
        "brands": {
            "primary": sum(1 for brand in brands if brand["role"] == "primary"),
            "alias": sum(1 for brand in brands if brand["role"] == "alias"),
        },
        "medians": {
            "currentWoodCatalytic": median_block(rows_where(wood_current_rows, subtype="Catalytic Stove"), "currently certified catalytic wood-stove rows"),
            "currentWoodNonCatalytic": median_block(rows_where(wood_current_rows, subtype="Non-Catalytic Stove"), "currently certified non-catalytic wood-stove rows"),
            "currentWoodHybrid": median_block(rows_where(wood_current_rows, subtype="Hybrid"), "currently certified hybrid wood-stove rows"),
            "currentPellet": median_block(pellet_current_rows, "currently certified pellet-stove rows"),
            "currentWood": median_block(wood_current_rows, "currently certified wood-stove rows"),
        },
        "highlights": {
            "lowestEmissionWood": top_records(current_wood, lambda stove: True, lambda stove: stove["emission"], False),
            "highestEfficiencyWood": top_records(current_wood, lambda stove: stove["efficiency"] is not None, lambda stove: stove["efficiency"], True),
            "highestEfficiencyPellet": top_records(current_pellet, lambda stove: stove["efficiency"] is not None, lambda stove: stove["efficiency"], True),
        },
        "efficiencyAtLeast75": {
            "currentRoomRows": sum(1 for test in room_current_rows if test["efficiency"] is not None and test["efficiency"] >= 75),
            "currentRoomRowsWithEfficiency": sum(1 for test in room_current_rows if test["efficiency"] is not None),
            "currentCentralRows": sum(1 for test in central_rows if test["current"] and test["efficiency"] is not None and test["efficiency"] >= 75),
            "currentCentralRowsWithEfficiency": sum(1 for test in central_rows if test["current"] and test["efficiency"] is not None),
        },
    }

    changes = diff_snapshots(previous, stoves, snapshot_date, previous_date if previous else None)
    firewood = load_firewood()

    # Hash the stove payload without depending on meta, which stores the hash.
    encoded = json.dumps(stoves, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    content_hash = hashlib.sha256(encoded).hexdigest()
    meta = {
        "snapshotDate": snapshot_date,
        "source": "EPA Certified Wood Heater Database",
        "sourceUrl": "https://www.epa.gov/compliance/epa-certified-wood-heater-database",
        "license": "Public domain (U.S. government work)",
        "operator": "Three Pines Company LLC",
        "rows": stats["rows"],
        "contentHash": content_hash,
        "note": "Parsed from files committed in data/raw. This build did not contact cfpub.epa.gov.",
    }

    write_json(DATA / "stoves.json", stoves)
    write_json(DATA / "brands.json", brand_payload)
    write_json(DATA / "brand-redirects.json", redirect_payload)
    write_json(DATA / "stats.json", stats)
    write_json(DATA / "changes.json", changes)
    write_json(DATA / "meta.json", meta)
    write_json(DATA / "firewood.json", firewood)
    write_json(DATA / "noindex-paths.json", sorted(set(noindex)))
    print(
        "MODEL_LINES",
        stats["modelLines"],
        "BRANDS",
        stats["brands"],
        "INSERT",
        stats["insert"],
        "RETAIL",
        stats["retailNames"],
    )
    print("CONTENT_HASH", content_hash)
    print(changes["note"])


if __name__ == "__main__":
    main()
