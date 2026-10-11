from pathlib import Path

import yaml

CATALOGUE = Path(__file__).resolve().parent.parent / "indicators.yaml"
SECTIONS = ("world", "europe", "sectors", "germany")


def load() -> dict:
    return yaml.safe_load(CATALOGUE.read_text())


def entries(catalogue: dict | None = None) -> list[dict]:
    """All indicator entries, each tagged with its catalogue section as `scope`."""
    catalogue = catalogue or load()
    return [{**e, "scope": s} for s in SECTIONS for e in catalogue[s]]
