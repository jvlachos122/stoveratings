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

## Domain

`public/CNAME` is `stoveratings.com`. GitHub ignores that file when Pages is deployed by Actions, so the domain is set in the repository settings. The owner steps and the Hostinger records are in the launch pull request. This repository does not change those settings itself.
