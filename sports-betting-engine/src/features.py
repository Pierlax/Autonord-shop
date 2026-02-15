"""
src/features.py
===============
Feature-engineering pipeline for the xG Betting System.

This module transforms raw match data into model-ready features by applying
concepts from the foundational texts and the project architecture document:

*   **xGenius (James Tippett)** — Rolling xG averages (EMA), Expected Points
    (xP), and the *Justice Table* (Actual Points vs Expected Points).
*   **Trading Bases (Joe Peta)** — *Cluster Luck* logic adapted to football.
    The ``luck_index`` quantifies the divergence between actual goals and xG
    so that "lucky" teams are penalised (mean-reversion signal).
*   **The Logic of Sports Betting (Miller & Davidow)** — *Market Momentum*
    (``market_momentum``): the percentage change between Opening and Closing
    odds.  Significant movement indicates sharp-money information ("steam").
*   **Project Doc §6** — ``xGF_atteso`` (attack strength × opponent defence
    weakness), Game State Adjustment, Defence Strength features.

Design principles
-----------------
* Every feature is computed **per-team, per-match** using only information
  available *before* that match (no future leakage).
* Rolling statistics use ``min_periods=1`` for early-season robustness.
* The class is stateless after ``transform()`` — safe for time-series CV.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
import yaml

logger = logging.getLogger(__name__)


class FeatureEngine:
    """Generate advanced betting features from canonical match data.

    Features produced
    -----------------
    **Per-team rolling (home_ / away_ prefix):**
        ``xg_for_rolling_5``, ``xg_against_rolling_5``,
        ``xg_for_ema``, ``xg_against_ema``,
        ``xp_rolling_5``, ``pts_rolling_5``,
        ``goal_diff_rolling_5``,
        ``luck_index``, ``justice_points``

    **Match-level:**
        ``total_xg_rolling_5``, ``xg_rolling_diff``,
        ``luck_diff``, ``justice_diff``

    **Market (Filtro B inputs):**
        ``market_momentum_over``, ``market_momentum_under``,
        ``steam_signal``

    **Composite (Project Doc §6):**
        ``home_attack_strength``, ``away_attack_strength``,
        ``home_defence_strength``, ``away_defence_strength``,
        ``home_xgf_atteso``, ``away_xgf_atteso``

    Parameters
    ----------
    config_path : str
        Path to ``config/settings.yaml``.

    References
    ----------
    [Tippett]  Rolling xG, xP, Justice Table.
    [Peta]     Cluster Luck / luck_index.
    [Miller]   Market momentum / steam detection.
    [Project Doc §6]  xGF_atteso, defence strength.
    """

    def __init__(self, config_path: str = "config/settings.yaml") -> None:
        with open(config_path, "r", encoding="utf-8") as fh:
            cfg = yaml.safe_load(fh)
        feat_cfg = cfg.get("features", {})
        self.rolling_window: int = feat_cfg.get("rolling_window", 5)
        self.ema_span: int = feat_cfg.get("ema_span", 10)
        self.steam_threshold: float = feat_cfg.get("steam_threshold", 0.05)
        self.min_team_history: int = cfg.get("data", {}).get("min_team_history", 10)
        logger.info(
            "FeatureEngine — window=%d, ema_span=%d, steam_thr=%.2f",
            self.rolling_window, self.ema_span, self.steam_threshold,
        )

    # =====================================================================
    # Private helpers
    # =====================================================================

    @staticmethod
    def _build_team_view(df: pd.DataFrame) -> pd.DataFrame:
        """Reshape match-level data into a *team-match* view.

        Each row produces two rows: one from the home perspective and one
        from the away perspective, enabling per-team rolling computations.
        """
        home = df.assign(
            team=df["home_team"],
            opponent=df["away_team"],
            venue="H",
            goals_for=df["home_goals"],
            goals_against=df["away_goals"],
            xg_for=df["home_xg"],
            xg_against=df["away_xg"],
            xp=df.get("home_xp", 0.0),
            actual_pts=df.get("home_pts", 0.0),
        )
        away = df.assign(
            team=df["away_team"],
            opponent=df["home_team"],
            venue="A",
            goals_for=df["away_goals"],
            goals_against=df["home_goals"],
            xg_for=df["away_xg"],
            xg_against=df["home_xg"],
            xp=df.get("away_xp", 0.0),
            actual_pts=df.get("away_pts", 0.0),
        )
        cols = [
            "date", "team", "opponent", "venue",
            "goals_for", "goals_against",
            "xg_for", "xg_against",
            "xp", "actual_pts",
        ]
        tv = pd.concat([home[cols], away[cols]], ignore_index=True)
        tv = tv.sort_values(["team", "date"]).reset_index(drop=True)
        return tv

    def _rolling_features(self, tv: pd.DataFrame) -> pd.DataFrame:
        """Compute per-team rolling / EMA features.

        All features use ``shift(1)`` so the current match is never
        included (no leakage).

        References
        ----------
        [Tippett – xGenius]
            "Form is best captured by exponentially-weighted moving
            averages of xG over the last 5–10 matches."
        """
        w = self.rolling_window
        span = self.ema_span
        grp = tv.groupby("team")

        def _shifted_rolling(series: pd.Series) -> pd.Series:
            return series.shift(1).rolling(w, min_periods=1).mean()

        def _shifted_ema(series: pd.Series) -> pd.Series:
            return series.shift(1).ewm(span=span, min_periods=1).mean()

        tv[f"xg_for_rolling_{w}"] = grp["xg_for"].transform(_shifted_rolling)
        tv[f"xg_against_rolling_{w}"] = grp["xg_against"].transform(_shifted_rolling)
        tv["xg_for_ema"] = grp["xg_for"].transform(_shifted_ema)
        tv["xg_against_ema"] = grp["xg_against"].transform(_shifted_ema)
        tv[f"xp_rolling_{w}"] = grp["xp"].transform(_shifted_rolling)
        tv[f"pts_rolling_{w}"] = grp["actual_pts"].transform(_shifted_rolling)

        # Goal difference rolling
        tv["_gd"] = tv["goals_for"] - tv["goals_against"]
        tv[f"goal_diff_rolling_{w}"] = grp["_gd"].transform(_shifted_rolling)
        tv.drop(columns=["_gd"], inplace=True)

        return tv

    def _luck_index(self, tv: pd.DataFrame) -> pd.DataFrame:
        """Compute the **Cluster Luck** indicator.

        ``luck_index = rolling_mean(goals_for - xg_for)``

        A persistently positive value means the team is scoring more than
        its shot quality warrants — classic cluster luck [Peta].

        References
        ----------
        [Peta – Trading Bases]
            "Strip luck — in particular 'cluster luck' — from a team's
            results to best predict how it will perform."
        """
        w = self.rolling_window
        tv["_luck_raw"] = tv["goals_for"] - tv["xg_for"]
        tv["luck_index"] = (
            tv.groupby("team")["_luck_raw"]
            .transform(lambda s: s.shift(1).rolling(w, min_periods=1).mean())
        )
        tv.drop(columns=["_luck_raw"], inplace=True)
        return tv

    def _justice_points(self, tv: pd.DataFrame) -> pd.DataFrame:
        """Compute the **Justice Table** differential.

        ``justice_points = xP_rolling - actual_pts_rolling``

        Positive → team deserved more points than earned (unlucky).
        Negative → team over-performed (lucky).

        References
        ----------
        [Tippett – xGenius]
            "The Justice Table shows who fortune has smiled upon and who
            has been hard done by."
        """
        w = self.rolling_window
        tv["justice_points"] = (
            tv[f"xp_rolling_{w}"] - tv[f"pts_rolling_{w}"]
        )
        return tv

    def _market_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Compute market momentum and steam signal.

        ``market_momentum = (open_odds - close_odds) / open_odds``

        A positive momentum on Over means the Over line shortened
        (sharp money on Over).  If |momentum| > steam_threshold,
        the ``steam_signal`` is set.

        Implementing Miller & Davidow's "Steam Chasing" logic:
        significant odds movement indicates informed money entering
        the market.

        References
        ----------
        [Miller & Davidow – The Logic of Sports Betting]
            "Follow the steam or fade the public."
        [Project Doc §2.2]
            "Steam Moves: odds drops > 5% in 1 hour."
        """
        if "over25_open_odds" in df.columns and "over25_close_odds" in df.columns:
            df["market_momentum_over"] = (
                (df["over25_open_odds"] - df["over25_close_odds"])
                / df["over25_open_odds"]
            )
        else:
            df["market_momentum_over"] = 0.0
            logger.warning("Opening/Closing Over odds not found — market_momentum_over = 0.")

        if "under25_open_odds" in df.columns and "under25_close_odds" in df.columns:
            df["market_momentum_under"] = (
                (df["under25_open_odds"] - df["under25_close_odds"])
                / df["under25_open_odds"]
            )
        else:
            df["market_momentum_under"] = 0.0
            logger.warning("Opening/Closing Under odds not found — market_momentum_under = 0.")

        # Steam signal: +1 = steam on Over, -1 = steam on Under, 0 = neutral
        df["steam_signal"] = 0
        df.loc[
            df["market_momentum_over"] > self.steam_threshold, "steam_signal"
        ] = 1
        df.loc[
            df["market_momentum_under"] > self.steam_threshold, "steam_signal"
        ] = -1

        return df

    def _strength_features(self, df: pd.DataFrame, tv: pd.DataFrame) -> pd.DataFrame:
        """Compute attack/defence strength and xGF_atteso.

        Implements the Project Doc §6.1 formula:

        ``xGF_atteso = Avg_xG_Home_Last5 * (Defence_Strength_Away / League_Avg_xG)``

        Where ``Defence_Strength`` = rolling average of xG conceded.

        References
        ----------
        [Project Doc §6.1]
            "xGF_Atteso = (Avg_xG_Home_Last5 * Defense_Strength_Away) /
            League_Avg_xG"
        """
        w = self.rolling_window

        # League average xG (global baseline)
        league_avg_xg = tv["xg_for"].mean()
        if league_avg_xg == 0:
            league_avg_xg = 1.3  # fallback

        # Build lookup: team → latest rolling stats (at match time)
        # We already have these in the team view; pivot back to match level.
        home_tv = tv[tv["venue"] == "H"].set_index(["date", "team"])
        away_tv = tv[tv["venue"] == "A"].set_index(["date", "team"])

        # Home attack strength = home team's rolling xG for
        df = df.copy()
        df["_idx_h"] = list(zip(df["date"], df["home_team"]))
        df["_idx_a"] = list(zip(df["date"], df["away_team"]))

        h_attack = home_tv[f"xg_for_rolling_{w}"].to_dict()
        h_defence = home_tv[f"xg_against_rolling_{w}"].to_dict()
        a_attack = away_tv[f"xg_for_rolling_{w}"].to_dict()
        a_defence = away_tv[f"xg_against_rolling_{w}"].to_dict()

        df["home_attack_strength"] = df["_idx_h"].map(h_attack)
        df["home_defence_strength"] = df["_idx_h"].map(h_defence)
        df["away_attack_strength"] = df["_idx_a"].map(a_attack)
        df["away_defence_strength"] = df["_idx_a"].map(a_defence)

        # xGF_atteso [Project Doc §6.1]
        df["home_xgf_atteso"] = (
            df["home_attack_strength"]
            * (df["away_defence_strength"] / league_avg_xg)
        )
        df["away_xgf_atteso"] = (
            df["away_attack_strength"]
            * (df["home_defence_strength"] / league_avg_xg)
        )

        df.drop(columns=["_idx_h", "_idx_a"], inplace=True)
        return df

    # =====================================================================
    # Public API
    # =====================================================================

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Run the full feature-engineering pipeline.

        Parameters
        ----------
        df : pd.DataFrame
            Canonical match data as returned by ``DataLoader.load()``.

        Returns
        -------
        pd.DataFrame
            Match-level DataFrame enriched with all features for both
            Filtro A (xG-based) and Filtro B (market-based).
        """
        logger.info("Starting feature engineering on %d matches …", len(df))

        # 1. Build team-match view
        tv = self._build_team_view(df)

        # 2. Rolling / EMA features [Tippett]
        tv = self._rolling_features(tv)

        # 3. Cluster Luck [Peta]
        tv = self._luck_index(tv)

        # 4. Justice Table [Tippett]
        tv = self._justice_points(tv)

        # 5. Pivot back to match level
        w = self.rolling_window
        feature_cols = [
            f"xg_for_rolling_{w}", f"xg_against_rolling_{w}",
            "xg_for_ema", "xg_against_ema",
            f"xp_rolling_{w}", f"pts_rolling_{w}",
            f"goal_diff_rolling_{w}",
            "luck_index", "justice_points",
        ]

        home_feats = (
            tv[tv["venue"] == "H"]
            .set_index(["date", "team"])[feature_cols]
            .add_prefix("home_")
        )
        # Rename index level 'team' → 'home_team' for clean join
        home_feats.index = home_feats.index.set_names(["date", "home_team"])

        away_feats = (
            tv[tv["venue"] == "A"]
            .set_index(["date", "team"])[feature_cols]
            .add_prefix("away_")
        )
        # Rename index level 'team' → 'away_team' for clean join
        away_feats.index = away_feats.index.set_names(["date", "away_team"])

        df = df.copy()
        # Join home features via (date, home_team)
        df = df.set_index(["date", "home_team"]).join(home_feats, how="left").reset_index()
        # Join away features via (date, away_team)
        df = df.set_index(["date", "away_team"]).join(away_feats, how="left").reset_index()

        # 6. Strength features & xGF_atteso [Project Doc §6.1]
        df = self._strength_features(df, tv)

        # 7. Composite differentials
        df["xg_rolling_diff"] = (
            df.get(f"home_xg_for_rolling_{w}", pd.Series(dtype=float))
            - df.get(f"away_xg_for_rolling_{w}", pd.Series(dtype=float))
        )
        df["luck_diff"] = (
            df.get("home_luck_index", pd.Series(dtype=float))
            - df.get("away_luck_index", pd.Series(dtype=float))
        )
        df["justice_diff"] = (
            df.get("home_justice_points", pd.Series(dtype=float))
            - df.get("away_justice_points", pd.Series(dtype=float))
        )

        # Total xG rolling (sum of both teams' attacking xG)
        df["total_xg_rolling"] = (
            df.get(f"home_xg_for_rolling_{w}", pd.Series(dtype=float))
            + df.get(f"away_xg_for_rolling_{w}", pd.Series(dtype=float))
        )
        # Total xGF atteso
        df["total_xgf_atteso"] = (
            df.get("home_xgf_atteso", pd.Series(dtype=float))
            + df.get("away_xgf_atteso", pd.Series(dtype=float))
        )

        # 8. Market features [Miller & Davidow]
        df = self._market_features(df)

        # 9. Drop early-season NaN rows
        initial_len = len(df)
        df = df.dropna(subset=[f"home_xg_for_rolling_{w}", f"away_xg_for_rolling_{w}"])
        logger.info(
            "Feature engineering complete — %d → %d rows "
            "(dropped %d early-season rows).",
            initial_len, len(df), initial_len - len(df),
        )
        return df

    def get_feature_names(self) -> List[str]:
        """Return the list of feature column names produced by the engine."""
        w = self.rolling_window
        per_team = [
            f"xg_for_rolling_{w}", f"xg_against_rolling_{w}",
            "xg_for_ema", "xg_against_ema",
            f"xp_rolling_{w}", f"pts_rolling_{w}",
            f"goal_diff_rolling_{w}",
            "luck_index", "justice_points",
        ]
        prefixed: List[str] = []
        for prefix in ("home_", "away_"):
            prefixed.extend([f"{prefix}{f}" for f in per_team])

        # Strength & atteso
        prefixed.extend([
            "home_attack_strength", "home_defence_strength",
            "away_attack_strength", "away_defence_strength",
            "home_xgf_atteso", "away_xgf_atteso",
        ])

        # Composites
        prefixed.extend([
            "xg_rolling_diff", "luck_diff", "justice_diff",
            "total_xg_rolling", "total_xgf_atteso",
        ])

        # Market
        prefixed.extend([
            "market_momentum_over", "market_momentum_under",
            "steam_signal",
        ])

        return prefixed
