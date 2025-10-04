import pandas as pd
from urllib.parse import urlparse
from Bio import Entrez
from lxml import etree
import json
import time
from urllib.error import HTTPError
from http.client import IncompleteRead

Entrez.email = "theodore.vandusen@hotmail.com" # add your email

def load_links(path: str) -> list[str]:
  df = pd.read_csv(path)
  return df["Link"].dropna().tolist()

def extract_pmcid(url: str) -> str:
  path = urlparse(url).path.rstrip("/")
  return path.split("/")[-1]

def fetch_pmc_xml(pmcid: str, retries: int = 3, delay: float = 2.0) -> str:
  for attempt in range(retries):
    try:
      handle = Entrez.efetch(db="pmc", id=pmcid, rettype="xml", retmode="text")
      xml_str = handle.read().decode("utf-8")
      handle.close()
      return xml_str
    except (IncompleteRead, HTTPError):
      time.sleep(delay)
  return ""

def get_title(root) -> str | None:
    title = root.findtext(".//article-title")
    if title and title.strip():
        return title.strip()

    title = root.findtext(".//title-group/article-title")
    if title and title.strip():
        return title.strip()

    title = root.findtext(".//title-group/alt-title")
    if title and title.strip():
        return title.strip()

    journal = root.findtext(".//journal-title") or ""
    year = root.findtext(".//pub-date/year") or ""
    if journal or year:
        return f"Untitled ({journal} {year})".strip()

    return None

def parse_jats(xml_data) -> dict:
    if isinstance(xml_data, str):
        xml_data = xml_data.encode("utf-8")
    root = etree.fromstring(xml_data)

    title =  get_title(root)
    abstract = " ".join(root.xpath(".//abstract//text()"))
    journal = root.findtext(".//journal-title")
    year = root.findtext(".//pub-date/year")
    pmid = root.findtext(".//article-id[@pub-id-type='pmid']")
    doi = root.findtext(".//article-id[@pub-id-type='doi']")

    authors = []
    for contrib in root.findall(".//contrib[@contrib-type='author']"):
        given = contrib.findtext(".//given-names")
        surname = contrib.findtext(".//surname")
        collab = contrib.findtext(".//collab")
        if collab:
            authors.append(collab.strip())
        else:
            parts = []
            if given: parts.append(given.strip())
            if surname: parts.append(surname.strip())
            if parts: authors.append(" ".join(parts))

    return {
        "pmid": pmid,
        "doi": doi,
        "title": title,
        "abstract": abstract.strip() if abstract else None,
        "journal": journal,
        "year": year,
        "authors": authors if authors else None,
    }

if __name__ == "__main__":
  urls = load_links("../data/raw/articles.csv")
  results = []

  for url in urls:
    pmcid = extract_pmcid(url)    
    xml_str = fetch_pmc_xml(pmcid)
    if not xml_str:
      continue
    try:
      parsed = parse_jats(xml_str)
      results.append(parsed)
      print(f"Saved {len(results)} / {len(urls)}")
    except Exception:
      pass
    time.sleep(1)

with open("../data/parsed/articles.json", "w") as f:
  json.dump(results, f, indent=2)