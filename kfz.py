import requests
from bs4 import BeautifulSoup
import json
import sys

URL = "https://www.kennzeichenking.de/kfz-kennzeichen-liste"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}

def main():
    resp = requests.get(URL, headers=HEADERS)
    try:
        resp.raise_for_status()
    except requests.HTTPError as e:
        print(f"Failed to load page: {e}", file=sys.stderr)
        sys.exit(1)

    soup = BeautifulSoup(resp.text, "html.parser")

    # Try to find the correct <table>
    # Adjust this selector based on actual page structure:
    table = soup.find("table", attrs={"class": "table", "id": None})
    if not table:
        print("Error: Could not find the main table on the page.", file=sys.stderr)
        sys.exit(1)

    data = []
    rows = table.find_all("tr")
    if not rows or len(rows) < 2:
        print("Error: Table has no data rows.", file=sys.stderr)
        sys.exit(1)

    for row in rows[1:]:
        cols = [td.get_text(strip=True) for td in row.find_all("td")]
        if len(cols) != 4:
            # skip rows with unexpected column counts
            continue
        code, ursprung, landkreis, bundesland = cols
        descr = f"{ursprung}\n{landkreis}\n{bundesland}"
        data.append({"code": code, "description": descr})

    kfz_dict = {d["code"]: d["description"] for d in data}

    with open("kfz_dict.json", "w", encoding="utf-8") as f:
        json.dump(kfz_dict, f, ensure_ascii=False, indent=2)

    print(f"Saved {len(kfz_dict)} entries to kfz_dict.json")

if __name__ == "__main__":
    main()
