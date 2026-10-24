# EPA Certified Wood Heater Database snapshot

**Source:** U.S. EPA Certified Wood Heater Database, public landing page
https://www.epa.gov/compliance/epa-certified-wood-heater-database
(database application: cfpub.epa.gov). EPA content is U.S. government work and is in the public domain.

**Retrieval date:** 2026-10-23.

**Files in this folder:**

| File | What was saved | Rows (excluding the header) |
|---|---|---|
| `rh_all.csv` | Room heaters, including previously certified models | 1,444 |
| `rh_inprod.csv` | Room heaters, currently certified only (`z_outofproduction=0`) | 265 |
| `wh_all.csv` | Central heaters (hydronic and forced-air), including previously certified | 192 |
| `wh_inprod.csv` | Central heaters, currently certified only | 41 |
| `SNAPSHOT_DATE` | Date these files were saved | 2026-10-23 |

These CSVs were parsed from EPA "show all" result pages with `scripts/parse_epa.py`. The parser reads a local HTML file. It does not contact EPA.

## Refresh

cfpub.epa.gov's robots.txt disallows automated access (`User-agent: *` / `Disallow: /`). This repository must not fetch cfpub.epa.gov in the build, in CI, or on a schedule.

To refresh:

1. Save the four EPA result pages yourself, in a browser.
2. Commit them under `data/raw/` as HTML (`rh_all.html`, `rh_inprod.html`, `wh_all.html`, `wh_inprod.html`) or as CSV exports with the names above. If an HTML file is present, the rebuild uses it instead of the CSV for that dataset.
3. Update `SNAPSHOT_DATE` to the day you saved the pages.
4. Run the **Rebuild EPA snapshot** GitHub Actions workflow manually (`workflow_dispatch`). There is no cron job.

The workflow parses the committed files, diffs them against the previous `data/stoves.json`, and commits only when the snapshot changed. It does not download anything from EPA.
