"""Dataset discovery, parsing and content hashing.

The hash goes into every report so a score is always attributable to an exact
dataset revision — comparing a run against a baseline built from different
fixtures is meaningless, and the hash is what makes that detectable.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Union

import yaml

from .models import CarDataset, RouteDataset

DATASETS_DIR = Path(__file__).parent / "datasets"

Dataset = Union[RouteDataset, CarDataset]


def file_sha256(path: Path) -> str:
    """Short content hash — enough to detect a changed fixture set."""
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def load_dataset(path: Path) -> Dataset:
    """Parse and validate one dataset file.

    Raises pydantic.ValidationError with the offending field path when a
    fixture is malformed; that failure is the point, so it is never swallowed.
    """
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"{path.name}: expected a YAML mapping at the top level")
    kind = raw.get("kind")
    if kind == "route":
        return RouteDataset.model_validate(raw)
    if kind == "car":
        return CarDataset.model_validate(raw)
    raise ValueError(f"{path.name}: unknown dataset kind {kind!r} (expected 'route' or 'car')")


# Support files that live alongside the datasets but are not case datasets.
_NON_DATASET_STEMS = {"geocode_recordings"}


def discover(directory: Path | None = None) -> list[Path]:
    """All case datasets, in a stable order so run-to-run reports line up."""
    directory = directory or DATASETS_DIR
    return sorted(
        p for p in directory.glob("*.v*.yaml")
        if p.name.split(".")[0] not in _NON_DATASET_STEMS
    )
