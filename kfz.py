#!/usr/bin/python3
import requests
from bs4 import BeautifulSoup
import json

url = "https://de.wikipedia.org/wiki/Liste_der_Kfz-Kennzeichen_in_Deutschland"
res = requests.get(url)
soup = BeautifulSoup(res.content, "html.parser")

data = {}
tables = soup.find_all("table", class_="wikitable")

for table in tables:
    try:
        for row in table.find_all("tr")[1:]:
            cols = row.find_all("td")
            if len(cols) >= 4:
                codes = [code.strip() for code in cols[0].text.split(",")]
                region = cols[1].text.strip()
                state = cols[3].text.strip()
                for code in codes:
                    print(f"row: {code}=[{region}][{state}]")
                    data[code] = [region, state]
                    if code == "ZZ":
                        raise StopIteration
    except StopIteration:
        break


with open("kfz_dict.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
