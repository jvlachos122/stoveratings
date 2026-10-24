"""Compare two stove snapshots and write data/changes.json.

Usage:
  python3 scripts/diff.py previous.json current.json snapshot-date previous-date
"""

import json
import sys
from pathlib import Path


COMPARE_FIELDS = (
    "emission",
    "efficiency",
    "btuLow",
    "btuHigh",
    "btuMax",
    "firebox",
    "co",
    "nsps2020",
    "current",
    "fuel",
    "type",
    "subtype",
)


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def row_signature(row):
    return tuple(row.get(field) for field in COMPARE_FIELDS)


def label(stove):
    return {
        "id": stove["id"],
        "manufacturer": stove["manufacturer"],
        "model": stove["model"],
        "url": stove["url"],
    }


def diff_snapshots(previous, current, snapshot_date, previous_date):
    if not previous:
        return {
            "snapshotDate": snapshot_date,
            "previousSnapshotDate": None,
            "addedToCurrent": [],
            "droppedFromCurrent": [],
            "fieldChanges": [],
            "note": (
                f"Initial snapshot of {snapshot_date}. "
                "There is no earlier snapshot to compare, so nothing is listed as added or dropped."
            ),
        }

    old = {stove["id"]: stove for stove in previous}
    new = {stove["id"]: stove for stove in current}
    added = []
    dropped = []
    changed = []

    for stove_id, stove in sorted(new.items()):
        prior = old.get(stove_id)
        if prior is None:
            if stove["current"]:
                added.append(label(stove))
            continue
        if (not prior["current"]) and stove["current"]:
            added.append(label(stove))
        if prior["current"] and not stove["current"]:
            dropped.append(label(stove))
        old_rows = [row_signature(row) for row in prior["tests"]]
        new_rows = [row_signature(row) for row in stove["tests"]]
        if old_rows != new_rows:
            changed.append(label(stove))

    for stove_id, stove in sorted(old.items()):
        if stove_id not in new and stove["current"]:
            dropped.append(label(stove))

    return {
        "snapshotDate": snapshot_date,
        "previousSnapshotDate": previous_date,
        "addedToCurrent": added,
        "droppedFromCurrent": dropped,
        "fieldChanges": changed,
        "note": (
            f"Compared the {snapshot_date} snapshot with {previous_date}. "
            f"{len(added)} model lines are newly listed as currently certified, "
            f"{len(dropped)} are no longer listed as currently certified, "
            f"and {len(changed)} have a changed EPA figure."
        ),
    }


def main():
    previous_path, current_path, snapshot_date, previous_date = sys.argv[1:5]
    previous = load(previous_path) if previous_path != "-" else None
    current = load(current_path)
    if previous_date in {"", "-", "null"}:
        previous_date = None
    changes = diff_snapshots(previous, current, snapshot_date, previous_date)
    dest = Path(sys.argv[5]) if len(sys.argv) > 5 else Path("data/changes.json")
    dest.write_text(json.dumps(changes, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(changes["note"])


if __name__ == "__main__":
    main()
