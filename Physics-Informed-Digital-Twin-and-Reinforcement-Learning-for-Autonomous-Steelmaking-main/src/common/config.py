from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

import yaml
from pydantic import BaseModel, Field


class ProjectConfig(BaseModel):
    """Validated configuration tree for the orchestrator."""

    plant: Dict[str, Any]
    alloys: Dict[str, Any]
    optimization: Dict[str, Any]
    rl: Dict[str, Any]
    data: Dict[str, Any]
    logging: Dict[str, Any] = Field(default_factory=dict)


def load_config(path: str | Path) -> ProjectConfig:
    """Load and validate a YAML configuration file."""

    path = Path(path)
    with path.open("r", encoding="utf-8") as handle:
        raw_cfg = yaml.safe_load(handle)
    return ProjectConfig(**raw_cfg)
