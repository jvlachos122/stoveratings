"""Write data/brand-crosswalk.csv from mappings evidenced in the EPA files.

A retail brand is included only when the EPA manufacturer string or the model
text contains that name. Manufacturers with no such mapping are written under
their EPA manufacturer string. Re-run this after a manual snapshot if you want
the CSV to pick up new strings; scripts/build_data.py also auto-creates a hub
for any manufacturer the CSV does not yet list.
"""

import csv
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
DEST = ROOT / "data" / "brand-crosswalk.csv"

# Exact EPA strings that are the same brand because each string contains the name.
FOLDS = [
    {
        "brand": "Vermont Castings",
        "slug": "vermont-castings",
        "manufacturers": [
            "Vermont Castings",
            "CFM Corporation (Vermont Castings, Inc.)",
            "Monessan Hearth Systems (Vermont Castings Group)",
        ],
        "model_regex": r"\bVermont Castings\b",
        "note": "Three EPA manufacturer strings contain the words Vermont Castings. Each model page still shows the original string. Model lines filed under a different manufacturer are included only when the model text contains Vermont Castings.",
        "evidence": "The EPA manufacturer strings contain Vermont Castings. Some Hearth and Home Technologies model lines also contain those words.",
    },
    {
        "brand": "Blaze King",
        "slug": "blaze-king",
        "manufacturers": [
            "Blaze King Industries, Inc.",
            "Blaze King of Montana",
        ],
        "model_regex": r"\bBlaze King\b",
        "note": "Both EPA manufacturer strings contain Blaze King. Model lines under any other manufacturer are included only when the model text contains Blaze King.",
        "evidence": "EPA manufacturer strings: Blaze King Industries, Inc. and Blaze King of Montana.",
    },
    {
        "brand": "St. Croix",
        "slug": "st-croix",
        "manufacturers": [
            "St. Croix Stoves (Johnson Gas Appliance Company)",
            "Even Temp, Inc. - St Croix Product Development",
        ],
        "model_regex": "",
        "note": "EPA uses both St. Croix and St Croix in the manufacturer field for these two strings. They are grouped here. The original string is shown on each model page.",
        "evidence": "One string contains St. Croix and the other contains St Croix.",
    },
    {
        "brand": "Ravelli",
        "slug": "ravelli",
        "manufacturers": [
            "Ravelli SRL",
            "Ravelli /EcoTeck",
        ],
        "model_regex": "",
        "note": "Both EPA manufacturer strings contain Ravelli.",
        "evidence": "EPA manufacturer strings contain Ravelli.",
    },
    {
        "brand": "Wittus",
        "slug": "wittus",
        "manufacturers": [
            "Wittus (Fire By Design)",
            "Wittus Inc.",
        ],
        "model_regex": "",
        "note": "Both EPA manufacturer strings contain Wittus.",
        "evidence": "EPA manufacturer strings contain Wittus.",
    },
    {
        "brand": "HeatMaster",
        "slug": "heatmaster",
        "manufacturers": [
            "HeatMaster Furnaces, Inc.",
            "Heatmaster Furnaces Inc. (SteelTech Inc.)",
        ],
        "model_regex": "",
        "note": "Both EPA manufacturer strings contain HeatMaster or Heatmaster. The original spelling is kept on each model page.",
        "evidence": "EPA manufacturer strings contain HeatMaster or Heatmaster.",
    },
    {
        "brand": "Windhager",
        "slug": "windhager",
        "manufacturers": [
            "Windhager Zentralheizung Technik GmbH",
            "Windhager, North America, LLC/ Windhager Zentralheizung Technik GmbH",
        ],
        "model_regex": "",
        "note": "These two EPA strings name Windhager. Pellergy's string also mentions Windhager and stays on its own hub, because Pellergy is the name EPA put first.",
        "evidence": "Both grouped strings contain Windhager as the company name.",
    },
]

# One EPA string, titled with the brand token that string itself contains.
DISPLAY = {
    "Jotul North America (Jotul U.S.A., Inc.)": (
        "Jotul",
        "jotul",
        r"J[oø]tul",
        "The hub title is the brand token inside the EPA manufacturer string. The full string is shown on the page and on every model.",
    ),
    "Hearthstone Quality Home Heating Products Inc.": (
        "Hearthstone",
        "hearthstone",
        r"\bHearthstone\b",
        "The hub title is the brand token inside the EPA manufacturer string. Hase rows stay on the Hase hub; they are not folded in, because that string leads with Hase.",
    ),
    "Pacific Energy Fireplace Products Limited": (
        "Pacific Energy",
        "pacific-energy",
        r"\bPacific Energy\b",
        "The hub title is the brand token inside the EPA manufacturer string.",
    ),
    "Woodstock Soapstone Company, Inc.": (
        "Woodstock",
        "woodstock",
        r"\bWoodstock\b",
        "The hub title is the brand token inside the EPA manufacturer string.",
    ),
    "Morso Jernstoberi A/S": (
        "Morso",
        "morso",
        r"Mors[oø]",
        "The hub title is the brand token EPA spelled Morso in the manufacturer string.",
    ),
    "Vogelzang International Corporation (United States Stove Company)": (
        "Vogelzang",
        "vogelzang",
        r"\bVogelzang\b",
        "The manufacturer string starts with Vogelzang and names United States Stove Company in parentheses. Other rows are included only when the model text contains Vogelzang.",
    ),
}

# Alias hubs. A row is included only when model_regex matches the model text,
# or manufacturer_contains matches the manufacturer string. Rows that do not
# match stay on the EPA manufacturer hub only.
ALIASES = [
    {
        "brand": "Drolet",
        "slug": "drolet",
        "model_regex": r"\bDrolet\b",
        "manufacturer_contains": "",
        "note": "EPA does not use Drolet as the manufacturer. This hub lists only model lines whose text contains Drolet. Other Stove Builder International lines are not labeled Drolet in this snapshot.",
        "evidence": "The model text DC Series Osburn Volta and Drolet Edison contains Drolet. Manufacturer: Stove Builder International, Inc.",
    },
    {
        "brand": "Englander",
        "slug": "englander",
        "model_regex": r"\bEnglander\b",
        "manufacturer_contains": "",
        "note": "EPA's manufacturer string is Englands Stove Works, Inc. This hub lists only model lines whose text contains Englander. Other Englands Stove Works lines stay on that manufacturer hub.",
        "evidence": "Model text under Englands Stove Works, Inc. contains Englander, including Englander 25-PDV and Englander 13-NC.",
    },
    {
        "brand": "Lopi",
        "slug": "lopi",
        "model_regex": r"\bLopi\b",
        "manufacturer_contains": "",
        "note": "EPA lists these lines under Travis Industries, Inc. Included here only where the model text contains Lopi.",
        "evidence": "Model text under Travis Industries, Inc contains Lopi, including Lopi Patriot and Lopi 520/96.",
    },
    {
        "brand": "Ashley",
        "slug": "ashley",
        "model_regex": r"\bAshley\b",
        "manufacturer_contains": "",
        "note": "Ashley is not an EPA manufacturer string in this snapshot. Included only where the model text contains Ashley.",
        "evidence": "Model text contains Ashley under United States Stove Company, Stove Builder International, Inc., and Martin Industries, Inc.",
    },
    {
        "brand": "Comfortbilt",
        "slug": "comfortbilt",
        "model_regex": r"Comfort\s*Bilt",
        "manufacturer_contains": "",
        "note": "EPA lists these lines under SMG Hearth and Home, LLC and Ningbo Hongsheng Fireplace Company (SMG Hearth and Home, LLC). Included only where the model text contains ComfortBilt.",
        "evidence": "Model text contains ComfortBilt, including ComfortBilt HP22 and HP22i.",
    },
    {
        "brand": "Castle",
        "slug": "castle",
        "model_regex": r"\bCastle\b",
        "manufacturer_contains": "",
        "note": "The word Castle in the model text is required. Castleton and Newcastle do not match. In this snapshot the matches are ARDISAM Castle Serenity lines.",
        "evidence": "ARDISAM, Inc. model text: Castle Serenity 12327 and Castle Serenity 41278.",
    },
    {
        "brand": "PelPro",
        "slug": "pelpro",
        "model_regex": r"Pel[-\s]?Pro",
        "manufacturer_contains": "",
        "note": "PelPro is not an EPA manufacturer string. Included only where the model text contains PelPro or Pel-Pro.",
        "evidence": "Model text under Hearth and Home Technologies contains PelPro and Pel-Pro.",
    },
    {
        "brand": "Pleasant Hearth",
        "slug": "pleasant-hearth",
        "model_regex": r"Pleasant\s+Hearth",
        "manufacturer_contains": "",
        "note": "Pleasant Hearth is not an EPA manufacturer string. Included only where the model text contains Pleasant Hearth.",
        "evidence": "Model text contains Pleasant Hearth under GHP Group and Hearth and Home Technologies.",
    },
    {
        "brand": "Harman",
        "slug": "harman",
        "model_regex": r"\bHarman\b",
        "manufacturer_contains": "",
        "note": "EPA lists these lines under Hearth and Home Technologies. Included only where the model text contains Harman.",
        "evidence": "Model text under Hearth and Home Technologies contains Harman, including Harman Absolute 43 and Harman P68.",
    },
    {
        "brand": "Quadra-Fire",
        "slug": "quadra-fire",
        "model_regex": r"Quadra[\s-]?Fire",
        "manufacturer_contains": "",
        "note": "EPA lists these lines under Hearth and Home Technologies. Included only where the model text contains Quadra-Fire, Quadra Fire, or Quadrafire.",
        "evidence": "Model text under Hearth and Home Technologies contains those spellings.",
    },
    {
        "brand": "Osburn",
        "slug": "osburn",
        "model_regex": r"\bOsburn\b",
        "manufacturer_contains": "Osburn",
        "note": "Included when the model text contains Osburn, and when the EPA manufacturer string contains Osburn (Osburn Manufacturing, Inc.). Stove Builder International lines that do not say Osburn stay on that manufacturer hub.",
        "evidence": "Model text under Stove Builder International, Inc. contains Osburn. The manufacturer string Osburn Manufacturing, Inc. contains Osburn.",
    },
    {
        "brand": "Breckwell",
        "slug": "breckwell",
        "model_regex": r"\bBreckwell\b",
        "manufacturer_contains": "",
        "note": "Breckwell is not an EPA manufacturer string in this snapshot. Included only where the model text contains Breckwell.",
        "evidence": "Model text under United States Stove Company contains Breckwell.",
    },
    {
        "brand": "Enviro",
        "slug": "enviro",
        "model_regex": r"\bEnviro\b",
        "manufacturer_contains": "",
        "note": "Included only where the model text contains Enviro as a whole word. Envirofire and Environmentalist do not match.",
        "evidence": "Model text under Sherwood Industries, Ltd. and Fireplace Products International Limited contains Enviro.",
    },
    {
        "brand": "Hampton",
        "slug": "hampton",
        "model_regex": r"\bHampton\b",
        "manufacturer_contains": "",
        "note": "Hampton is not an EPA manufacturer string. Included only where the model text contains Hampton.",
        "evidence": "Model text contains Hampton under Fireplace Products International Limited and Sherwood Industries, Ltd.",
    },
    {
        "brand": "Napoleon",
        "slug": "napoleon",
        "model_regex": r"\bNapoleon\b",
        "manufacturer_contains": "",
        "note": "Napoleon is not an EPA manufacturer string. Included only where the model text contains Napoleon, including the one row whose manufacturer cell is blank.",
        "evidence": "Model text under Wolf Steel Ltd. contains Napoleon, and the blank-manufacturer row is 1900 series (Napoleon 1900), S9.",
    },
    {
        "brand": "Avalon",
        "slug": "avalon",
        "model_regex": r"\bAvalon\b",
        "manufacturer_contains": "",
        "note": "EPA lists these lines under Travis Industries, Inc. Included only where the model text contains Avalon.",
        "evidence": "Model text under Travis Industries, Inc contains Avalon.",
    },
    {
        "brand": "Regency",
        "slug": "regency",
        "model_regex": r"\bRegency\b",
        "manufacturer_contains": "Regency",
        "note": "Included when the model text contains Regency, and when the EPA manufacturer string contains Regency (FPI/Regency Fireplace Products). Fireplace Products International Limited rows that do not say Regency stay on that manufacturer hub.",
        "evidence": "The manufacturer string FPI/Regency Fireplace Products contains Regency. Model text under Fireplace Products International Limited and Sherwood Industries, Ltd. also contains Regency.",
    },
]


def slugify(value):
    value = unicodedata.normalize("NFKD", value)
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = value.lower().replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "unknown"


def manufacturers():
    found = set()
    for name in ("rh_all.csv", "wh_all.csv"):
        with (RAW / name).open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                found.add(row["Manufacturer"].strip())
    return found


def main():
    known = manufacturers()
    rows = []
    used_slugs = set()
    assigned = set()

    def add(row):
        slug = row["brand_slug"]
        if slug in used_slugs:
            raise SystemExit(f"duplicate brand slug {slug}")
        used_slugs.add(slug)
        if row["model_regex"]:
            re.compile(row["model_regex"], re.I)
        rows.append(row)

    for fold in FOLDS:
        missing = [name for name in fold["manufacturers"] if name not in known]
        if missing:
            raise SystemExit(f"{fold['brand']} missing manufacturer strings: {missing}")
        overlap = [name for name in fold["manufacturers"] if name in assigned]
        if overlap:
            raise SystemExit(f"{fold['brand']} overlaps {overlap}")
        assigned.update(fold["manufacturers"])
        add(
            {
                "brand": fold["brand"],
                "brand_slug": fold["slug"],
                "role": "primary",
                "manufacturer_strings": " || ".join(fold["manufacturers"]),
                "model_regex": fold["model_regex"],
                "manufacturer_contains": "",
                "note": fold["note"],
                "evidence": fold["evidence"],
            }
        )

    for manufacturer, (brand, slug, regex, note) in DISPLAY.items():
        if manufacturer not in known:
            raise SystemExit(f"display manufacturer missing: {manufacturer}")
        if manufacturer in assigned:
            raise SystemExit(f"display manufacturer already assigned: {manufacturer}")
        assigned.add(manufacturer)
        add(
            {
                "brand": brand,
                "brand_slug": slug,
                "role": "primary",
                "manufacturer_strings": manufacturer,
                "model_regex": regex,
                "manufacturer_contains": "",
                "note": note,
                "evidence": f"EPA manufacturer string: {manufacturer}",
            }
        )

    for manufacturer in sorted(known - assigned, key=lambda name: name.lower()):
        if manufacturer == "":
            brand = "Manufacturer not listed by EPA"
            slug = "not-listed"
            evidence = "One room-heater row has an empty manufacturer cell. The model text is preserved as EPA published it."
            note = "EPA left the manufacturer cell blank on this row. It is also listed on any retail hub whose name appears in the model text."
        else:
            brand = manufacturer
            slug = slugify(manufacturer)
            evidence = "No retail-brand mapping is recorded. The hub title is the EPA manufacturer string."
            note = "Models are grouped under the manufacturer name EPA published."
        if slug in used_slugs:
            slug = f"{slug}-mfr"
        assigned.add(manufacturer)
        add(
            {
                "brand": brand,
                "brand_slug": slug,
                "role": "primary",
                "manufacturer_strings": manufacturer if manufacturer else "__BLANK__",
                "model_regex": "",
                "manufacturer_contains": "",
                "note": note,
                "evidence": evidence,
            }
        )

    for alias in ALIASES:
        add(
            {
                "brand": alias["brand"],
                "brand_slug": alias["slug"],
                "role": "alias",
                "manufacturer_strings": "",
                "model_regex": alias["model_regex"],
                "manufacturer_contains": alias["manufacturer_contains"],
                "note": alias["note"],
                "evidence": alias["evidence"],
            }
        )

    if known - assigned:
        raise SystemExit(f"unassigned manufacturers: {known - assigned}")

    fields = [
        "brand",
        "brand_slug",
        "role",
        "manufacturer_strings",
        "model_regex",
        "manufacturer_contains",
        "note",
        "evidence",
    ]
    with DEST.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    primary = sum(1 for row in rows if row["role"] == "primary")
    alias = sum(1 for row in rows if row["role"] == "alias")
    print(f"Wrote {DEST} primary={primary} alias={alias} manufacturers={len(known)}")


if __name__ == "__main__":
    main()
