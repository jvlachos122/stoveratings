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

## Domain

`public/CNAME` is `stoveratings.com`. GitHub ignores that file when Pages is deployed by Actions, so the domain is set in the repository settings. The owner steps and the Hostinger records are in the launch pull request. This repository does not change those settings itself.
