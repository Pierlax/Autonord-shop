"""
data/loader.py
==============
Flexible data-loading layer for the xG Betting System.

This loader is designed for the **Doppio Filtro** architecture and handles:

*   Match-level data with xG metrics (Filtro A inputs).
*   **Opening AND Closing odds** for the Over/Under 2.5 market so that
    downstream modules can compute market momentum and CLV (Filtro B inputs).

Design principles
-----------------
* **Schema-agnostic**: accepts any CSV whose columns can be mapped to a
  canonical schema via a user-supplied dictionary or YAML config.
* **Temporal ordering**: rows are always sorted by date — critical for
  time-series splits and rolling features [Mack].
* **Defensive validation**: missing required columns raise early errors.

References
----------
[Mack – Statistical Sports Models in Excel]
    Data integrity is the first line of defence against data leakage.
[Miller & Davidow – The Logic of Sports Betting]
    Opening and Closing odds are both required to track market movement
    ("steam") and to compute Closing Line Value (CLV).
[Project Doc §2.2]
    Filtro B requires Pinnacle open/close quotes and exchange liquidity.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, List, Optional, Union

import numpy as np
import pandas as pd
import yaml

logger = logging.getLogger(__name__)


# ── Canonical column names ──────────────────────────────────────────────────
REQUIRED_COLUMNS: List[str] = [
    "date",              # Match date (parseable by pd.to_datetime)
    "home_team",         # Home team name
    "away_team",         # Away team name
    "home_goals",        # Actual home goals scored
    "away_goals",        # Actual away goals scored
    "home_xg",           # Home expected goals
    "away_xg",           # Away expected goals
]

ODDS_COLUMNS: List[str] = [
    "over25_open_odds",  # Opening decimal odds — Over 2.5
    "under25_open_odds", # Opening decimal odds — Under 2.5
    "over25_close_odds", # Closing decimal odds — Over 2.5
    "under25_close_odds",# Closing decimal odds — Under 2.5
]

OPTIONAL_COLUMNS: List[str] = [
    "result",            # H / D / A (derived if absent)
    "home_xp",           # Home expected points
    "away_xp",           # Away expected points
    "season",            # Season identifier
    "league",            # League identifier
    "liquidity",         # Exchange liquidity (for dynamic weights)
]


class DataLoader:
    """Load, validate, and canonicalise match-level football data.

    Handles **Opening and Closing odds** for the Over/Under 2.5 market,
    essential for computing market momentum [Miller & Davidow] and CLV.

    Parameters
    ----------
    config_path : str or Path
        Path to ``config/settings.yaml``.
    column_map : dict, optional
        Mapping ``{canonical_name: raw_csv_column_name}``.

    Example
    -------
    >>> loader = DataLoader("config/settings.yaml")
    >>> df = loader.load()
    >>> assert "over25_close_odds" in df.columns
    """

    def __init__(
        self,
        config_path: Union[str, Path] = "config/settings.yaml",
        column_map: Optional[Dict[str, str]] = None,
    ) -> None:
        self.config_path = Path(config_path)
        self._cfg = self._load_config()
        self.column_map = (
            column_map
            or self._cfg.get("data", {}).get("column_map")
            or {}
        )

    # ── Private helpers ─────────────────────────────────────────────────────

    def _load_config(self) -> dict:
        with open(self.config_path, "r", encoding="utf-8") as fh:
            cfg = yaml.safe_load(fh)
        logger.info("Configuration loaded from %s", self.config_path)
        return cfg

    def _rename_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        if self.column_map:
            inv_map = {v: k for k, v in self.column_map.items()}
            df = df.rename(columns=inv_map)
            logger.debug("Columns renamed via column_map: %s", inv_map)
        return df

    def _validate(self, df: pd.DataFrame) -> pd.DataFrame:
        """Ensure all required columns are present and correctly typed."""
        missing_req = [c for c in REQUIRED_COLUMNS if c not in df.columns]
        if missing_req:
            raise ValueError(
                f"Required columns missing: {missing_req}. "
                f"Provide a `column_map` to rename them."
            )

        missing_odds = [c for c in ODDS_COLUMNS if c not in df.columns]
        if missing_odds:
            logger.warning(
                "Odds columns missing: %s — market momentum and CLV "
                "features will not be available.", missing_odds
            )

        # Coerce types
        df["date"] = pd.to_datetime(
            df["date"], dayfirst=False, infer_datetime_format=True
        )
        numeric_cols = [
            "home_goals", "away_goals", "home_xg", "away_xg",
        ] + [c for c in ODDS_COLUMNS if c in df.columns]
        for col in numeric_cols:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        n_before = len(df)
        df = df.dropna(subset=REQUIRED_COLUMNS)
        n_after = len(df)
        if n_before != n_after:
            logger.warning(
                "Dropped %d rows with NaN in required columns.",
                n_before - n_after,
            )
        return df

    def _derive_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Create derived columns for downstream modules.

        Derived columns
        ---------------
        * ``result`` — H / D / A.
        * ``total_goals``, ``total_xg`` — sums.
        * ``over25`` — binary target (1 if total > 2.5).
        * ``home_xp`` / ``away_xp`` — expected points [Tippett].
        * ``home_pts`` / ``away_pts`` — actual points.

        References
        ----------
        [Tippett – xGenius]  Expected Points for the Justice Table.
        """
        # ── Result ──────────────────────────────────────────────────────────
        if "result" not in df.columns:
            df["result"] = np.where(
                df["home_goals"] > df["away_goals"], "H",
                np.where(df["home_goals"] == df["away_goals"], "D", "A"),
            )
            logger.info("Derived 'result' column.")

        # ── Totals & binary target ──────────────────────────────────────────
        df["total_goals"] = df["home_goals"] + df["away_goals"]
        df["total_xg"] = df["home_xg"] + df["away_xg"]
        df["over25"] = (df["total_goals"] > 2.5).astype(int)

        # ── Expected Points (sigmoid approximation from xG diff) ────────────
        if "home_xp" not in df.columns or "away_xp" not in df.columns:
            xg_diff = df["home_xg"] - df["away_xg"]
            home_win_prob = 1.0 / (1.0 + np.exp(-1.2 * xg_diff))
            away_win_prob = 1.0 - home_win_prob
            draw_prob = np.exp(-1.5 * xg_diff ** 2) * 0.3
            total = home_win_prob + away_win_prob + draw_prob
            home_win_prob /= total
            away_win_prob /= total
            draw_prob /= total
            df["home_xp"] = 3.0 * home_win_prob + 1.0 * draw_prob
            df["away_xp"] = 3.0 * away_win_prob + 1.0 * draw_prob
            logger.info("Derived 'home_xp' / 'away_xp' from xG.")

        # ── Actual points ───────────────────────────────────────────────────
        if "home_pts" not in df.columns:
            df["home_pts"] = (
                df["result"].map({"H": 3, "D": 1, "A": 0}).astype(float)
            )
        if "away_pts" not in df.columns:
            df["away_pts"] = (
                df["result"].map({"H": 0, "D": 1, "A": 3}).astype(float)
            )

        return df

    # ── Public API ──────────────────────────────────────────────────────────

    def load(self, path_override: Optional[str] = None) -> pd.DataFrame:
        """Load, validate, and return the canonical match DataFrame.

        Parameters
        ----------
        path_override : str, optional
            Overrides the path in ``settings.yaml``.

        Returns
        -------
        pd.DataFrame
            Chronologically sorted match data with all required and
            derived columns, including Opening/Closing O/U 2.5 odds.
        """
        csv_path = path_override or self._cfg["data"]["path"]
        logger.info("Loading data from %s …", csv_path)
        df = pd.read_csv(csv_path)
        logger.info("Raw shape: %s", df.shape)

        df = self._rename_columns(df)
        df = self._validate(df)
        df = self._derive_columns(df)

        # Chronological sort [Mack — no data leakage].
        df = df.sort_values("date").reset_index(drop=True)
        logger.info("Final shape: %s", df.shape)
        return df

    def load_multiple(self, paths: List[str]) -> pd.DataFrame:
        """Load and concatenate several CSV files."""
        frames = [self.load(path_override=p) for p in paths]
        combined = pd.concat(frames, ignore_index=True)
        combined = combined.sort_values("date").reset_index(drop=True)
        logger.info("Combined %d files → %d rows.", len(paths), len(combined))
        return combined
