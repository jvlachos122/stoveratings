"""Parse an EPA Certified Wood Heater Database result page saved as HTML.

The original extractor (research parse_epa.py) reads a local file and writes CSV.
This module keeps that behavior. It does not request cfpub.epa.gov or any network.
"""

import csv
import html
import re
import sys
from collections import Counter


def clean(value):
    value = re.sub(r"<br\s*/?>", " ", value)
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def parse_html_table(text):
    start = text.find('class="tablebord zebra"')
    if start < 0:
        raise ValueError("EPA result table (class=tablebord zebra) not found")
    end = text.find("</table>", start)
    if end < 0:
        raise ValueError("EPA result table has no closing tag")
    table = text[start:end]
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S)
    header = None
    data = []
    for row in rows:
        cells = re.findall(r"<th[^>]*>(.*?)</th>", row, re.S)
        if cells and header is None:
            header = [clean(re.sub(r"\(sort(ed)?\)", "", cell)) for cell in cells]
            continue
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if cells:
            data.append([clean(cell) for cell in cells])
    if not header:
        raise ValueError("EPA result table has no header row")
    records = []
    for cells in data:
        if len(cells) != len(header):
            raise ValueError(f"row has {len(cells)} cells, header has {len(header)}")
        records.append(dict(zip(header, cells)))
    return header, records


def parse_file(path):
    with open(path, encoding="utf-8", errors="replace") as handle:
        return parse_html_table(handle.read())


def parse(src, dest):
    header, records = parse_file(src)
    with open(dest, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        for record in records:
            writer.writerow([record[column] for column in header])
    widths = Counter(len(record) for record in records)
    print(src, "->", dest, "rows", len(records), "cols", dict(widths))


def main():
    parse(sys.argv[1], sys.argv[2])


if __name__ == "__main__":
    main()
