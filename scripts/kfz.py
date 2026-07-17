#!/usr/bin/env python3
"""Scrape kennzeichenking.de → data/kfz-list.json (run via venv: venv/bin/python scripts/kfz.py)."""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
OUTPUT = DATA_DIR / "kfz-list.json"

URL = "https://www.kennzeichenking.de/kfz-kennzeichen-liste"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
}


def main() -> None:
    resp = requests.get(URL, headers=HEADERS)
    try:
        resp.raise_for_status()
    except requests.HTTPError as e:
        print(f"Failed to load page: {e}", file=sys.stderr)
        sys.exit(1)

    soup = BeautifulSoup(resp.text, "html.parser")

    table = soup.find("table", attrs={"class": "table", "id": None})
    if not table:
        print("Error: Could not find the main table on the page.", file=sys.stderr)
        sys.exit(1)

    rows = table.find_all("tr")
    if not rows or len(rows) < 2:
        print("Error: Table has no data rows.", file=sys.stderr)
        sys.exit(1)

    data = {}
    for row in rows[1:]:
        cols = [td.get_text(strip=True) for td in row.find_all("td")]
        if len(cols) != 4:
            continue
        code, ursprung, landkreis, bundesland = cols
        data[code] = {
            "ursprung": ursprung,
            "landkreis": landkreis,
            "bundesland": bundesland,
        }

    timestamp = datetime.now().strftime("%Y-%m-%d-%H:%M:%S")
    kfz_list = {
        "metadata": {
            "createdAt": timestamp,
            "total": len(data),
        },
        "data": data,
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(kfz_list, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Saved {len(data)} entries to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
