from __future__ import annotations

import logging
from typing import Optional


def get_logger(name: str = "steelmaking") -> logging.Logger:
    """Return a configured logger shared across modules."""

    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    return logger
