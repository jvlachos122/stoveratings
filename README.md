# StoveRatings

Independent pages for the emission rates and HHV efficiencies in the U.S. EPA Certified Wood Heater Database. StoveRatings does not score stoves, does not sell them, and is not affiliated with EPA. Operated by Three Pines Company LLC.

The launch snapshot is dated **2026-10-23**: 1,444 room-heater rows (265 currently certified) and 192 central-heater rows (41 currently certified).

## Build

```bash
npm ci
npm run check
```

`npm run build` parses the files in `data/raw/`, writes `data/*.json`, then builds the static site into `dist/`. Node 22. No analytics, no third-party scripts, and no external fonts.

## Data refresh

The database application asks automated clients not to crawl it. This repository does not fetch it in the build, in CI, or on a schedule.

To publish a newer snapshot, save the four EPA result pages in a browser, commit them under `data/raw/` (see `data/raw/README.md`), set `SNAPSHOT_DATE`, and run the **Rebuild EPA snapshot** workflow by hand. If the stove-data hash is unchanged, that workflow commits nothing.

## Data changelog

`/data/changelog/` is built from the snapshot files committed in this repository. It does not contact EPA. With one snapshot, the page says there is no earlier snapshot to compare, and it does not invent one.

To keep a comparison the next time you publish a snapshot:

1. Copy the four CSVs in `data/raw/` into `data/snapshots/YYYY-MM-DD/`, using the date already in `data/raw/SNAPSHOT_DATE`.
2. Copy `data/brand-crosswalk.csv`, `data/brand-redirects.csv`, and `data/insert-overrides.csv` into that same folder if the changelog should list crosswalk and insert-label changes. Copy all three, or the comparison is omitted.
3. Save the new result pages into `data/raw/`, update `SNAPSHOT_DATE`, and run the manual rebuild workflow.

Do not add a scheduled or automated fetch. See `data/snapshots/README.md`.

## Example comparisons

`/compare/` lists example side-by-side pages for currently listed model lines. The site has no sales or popularity data, so these pairs are not described as popular or best-selling.

The selection rule is in `src/lib/compare-pairs.js`. Among the eight brand hubs with the most currently listed wood-stove and pellet-stove model lines, a pair is two lines from different hubs that share an EPA type and subtype and whose heat-output midpoints are within 15 percent of the higher midpoint. The closest unused pairs are kept, up to 20. `/compare/tool/` compares any two model lines and is not indexed. Its canonical URL is `/compare/`.

The pair address and title use a short brand label and the primary model name, not the full EPA model-line string. Example: `/compare/enerco-ws110-vs-sbi-solution-2-5/` and `Enerco WS110 vs SBI Solution 2.5: EPA emissions and efficiency`. The rendered `<title>` is that comparison title, with no site-name suffix, and is capped at 65 characters. The slug is capped at 80 characters.

Brand label, from the hub name (the name published for the EPA manufacturer string):

- Drop a parenthetical, then the trailing legal suffixes used for hub matching (Inc, LLC, Company, and the rest of that list), then a trailing Group or Industries.
- Ignore and, of, the, for, and by when counting words.
- Three or more remaining words become initials: Stove Builder International → SBI, Hearth and Home Technologies → HHT, United States Stove → USS.
- One or two words stay spelled: Enerco, Hearthstone, Travis, Foyers Supreme, Pacific Energy. If the title or slug is still over the cap, a two-word label can fall back to initials (Foyers Supreme → FS, Pacific Energy → PE).

Primary model name, from the EPA `model` field. That field is a model line, not one retail model.

- Text before a colon is a line label (`PS60W Model Line`, `1.7R Series`). Use the text after the colon.
- Otherwise, `{label} Series ( ... )` is a line label. Use the first model inside the parentheses. `2.5R Series (Solution 2.5 ZC II, ...)` starts at Solution 2.5.
- Otherwise use the first comma, semicolon, or "and" item.
- Remove a parenthetical aside. Drop a trailing roman numeral or 1–4 letter all-caps code that follows a token containing a digit (`Solution 2.5 ZC II` → `Solution 2.5`). Drop a trailing `Series` plus a series letter when a name remains (`True North TN20 Series B` → `True North TN20`).

The slug is those two labels, slugified, joined with `-vs-`. Pair order is stove id, the same order as the old long slug. If the title is over 65 characters or the slug is over 80, shorten in this order: step the longer model name to its next shorter form, but do not drop to a bare number yet; then switch the longer two-word brand to initials; then allow a bare number. Left wins a tie. If two pairs still share a slug, the later pair in selection order gets `-2`, `-3`, and so on.

The full EPA model-line string stays on the page, in the comparison table and in a "Model lines covered" line. The previous long URL is a noindex refresh page whose canonical URL is the short one. Long URLs are not in the sitemap. Short URLs are.

## Retail-name aliases

`/lookup/#name-aliases` lists 40 names that link to an existing model-line page (`#retail-names`). The home page links to those anchors. No separate page is built for a retail name.

This repository does not include `data/retail-alias-research.json`. Until that file exists, the list is not a search-volume measurement and the pages do not describe it as one.

1. The first five phrases, in this order: Ashley wood stove, Vogelzang, Castle Serenity, Blaze King Ashford 30, Drolet Escape 1500.
2. A phrase matches a model line only when one retail name contains those words, in order. The words wood and stove are set aside when other words remain. A leading brand name is set aside only when the remaining words match a retail name.
3. If that brand is printed on at least one matching line, lines without it are omitted. If it is printed on none of them, every matching line is listed and the alias says the brand word is not in those cells. Drolet Escape 1500 resolves to the lines that list Escape 1500. Those cells do not include Drolet.
4. A number matches that number or that number plus a decimal part. 30 matches 30.2. It does not match 300 or AF30.
5. The other slots are exact retail names from this snapshot, counted once per model line. More lines come first, then more currently certified lines, then the name A to Z. A name is skipped when one of the five phrases already lists every line it is on.

If `data/retail-alias-research.json` is committed, that array replaces this list. Each object needs a `query`. Entries that match no retail name are omitted. The file is capped at 40 and is not padded from the frequency list.

The lookup search box reads the same aliases from `data/names.json` (`alias: true`). A one-word query still searches retail names. A phrase matches an alias when the typed text sits inside that alias.

## Domain

`public/CNAME` is `stoveratings.com`. GitHub ignores that file when Pages is deployed by Actions, so the domain is set in the repository settings. The owner steps and the Hostinger records are in the launch pull request. This repository does not change those settings itself.
