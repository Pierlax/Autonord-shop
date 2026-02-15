"""
src/model.py
============
Quantitative model for Over/Under 2.5 prediction.

Architecture (aligned with Project Doc §5 — "Doppio Filtro"):

**Level 1 — Base Models (The Specialists)**

*   **Model A (xG Puro)**: ``XGBRegressor`` trained on match features to
    predict home and away expected goals.  The predicted xG pair is then
    converted into Over/Under probabilities via the **Poisson distribution**
    [Mack – Statistical Sports Models].
*   **Model C (Poisson Baseline)**: A league-average Poisson model that
    serves as a naïve but robust baseline [Wong].

**Level 2 — Meta-Learner (The Judge)**

*   ``LogisticRegression`` that takes ``[prob_xg, prob_poisson, market_features]``
    and learns which specialist is more trustworthy in each context.

**Level 3 — Isotonic Calibration (The Rectifier)**

*   ``IsotonicRegression`` applied to the Level-2 output so that a
    predicted 70 % wins exactly 70 % of the time.
*   Primary metric: **Brier Score** (not accuracy) [Mack].

Validation uses **Time-Series Split** exclusively [Mack].

References
----------
[Mack]     Log Loss, Brier Score, Time-Series Split, Poisson.
[Wong]     Poisson distribution for totals.
[Project Doc §5]  3-level ensemble with Isotonic calibration.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import yaml
from scipy.stats import poisson
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss
from sklearn.model_selection import TimeSeriesSplit
from xgboost import XGBRegressor

logger = logging.getLogger(__name__)


class QuantModel:
    """Three-level ensemble for Over/Under 2.5 prediction.

    Parameters
    ----------
    config_path : str
        Path to ``config/settings.yaml``.

    Attributes
    ----------
    home_model : XGBRegressor
        Predicts home team xG.
    away_model : XGBRegressor
        Predicts away team xG.
    meta_model : LogisticRegression
        Level-2 meta-learner.
    calibrator : IsotonicRegression
        Level-3 calibrator.
    ou_line : float
        Over/Under line (default 2.5).
    poisson_max : int
        Maximum goals in Poisson grid.
    """

    def __init__(self, config_path: str = "config/settings.yaml") -> None:
        with open(config_path, "r", encoding="utf-8") as fh:
            cfg = yaml.safe_load(fh)

        model_cfg: Dict[str, Any] = cfg.get("model", {})
        self.xgb_params: Dict[str, Any] = model_cfg.get("xgb_params", {})
        self.ou_line: float = model_cfg.get("ou_line", 2.5)
        self.poisson_max: int = model_cfg.get("poisson_max_goals", 10)
        self.ts_splits: int = model_cfg.get("time_series_splits", 5)
        self.calibration_method: str = model_cfg.get("calibration_method", "isotonic")

        self.home_model: Optional[XGBRegressor] = None
        self.away_model: Optional[XGBRegressor] = None
        self.meta_model: Optional[LogisticRegression] = None
        self.calibrator: Optional[IsotonicRegression] = None

        self.feature_cols: List[str] = []
        self._is_fitted: bool = False

        logger.info(
            "QuantModel initialised — ou_line=%.1f, poisson_max=%d, "
            "ts_splits=%d",
            self.ou_line, self.poisson_max, self.ts_splits,
        )

    # =====================================================================
    # Poisson engine
    # =====================================================================

    def predict_totals(
        self, home_xg: np.ndarray, away_xg: np.ndarray
    ) -> np.ndarray:
        """Convert predicted xG into Over/Under probabilities via Poisson.

        Implements the bivariate Poisson grid:

        .. math::

            P(\\text{Over } L) = 1 - \\sum_{i+j \\leq L}
                P(H=i) \\cdot P(A=j)

        where :math:`H \\sim \\text{Poisson}(\\lambda_H)` and
        :math:`A \\sim \\text{Poisson}(\\lambda_A)`.

        Parameters
        ----------
        home_xg : np.ndarray
            Predicted home expected goals (shape ``(n,)``).
        away_xg : np.ndarray
            Predicted away expected goals (shape ``(n,)``).

        Returns
        -------
        np.ndarray
            Probability of **Over** for each match (shape ``(n,)``).

        References
        ----------
        [Mack – Statistical Sports Models in Excel]
            "Use Poisson Distribution to convert expected goals into
            Over/Under probabilities."
        [Wong – Sharp Sports Betting]
            "The Poisson model is the classical approach to totals."
        """
        n = len(home_xg)
        prob_over = np.zeros(n)
        line = self.ou_line
        max_g = self.poisson_max

        for idx in range(n):
            lam_h = max(home_xg[idx], 0.01)
            lam_a = max(away_xg[idx], 0.01)

            # Build Poisson probability vectors
            p_h = poisson.pmf(np.arange(max_g + 1), lam_h)
            p_a = poisson.pmf(np.arange(max_g + 1), lam_a)

            # Joint probability grid
            prob_under = 0.0
            for i in range(max_g + 1):
                for j in range(max_g + 1):
                    if (i + j) <= line:
                        prob_under += p_h[i] * p_a[j]

            prob_over[idx] = 1.0 - prob_under

        return prob_over

    def _poisson_baseline(self, df: pd.DataFrame) -> np.ndarray:
        """League-average Poisson baseline (Model C).

        Uses the global average xG as lambda for both teams — a naïve
        but robust anchor that prevents the ensemble from over-fitting.

        References
        ----------
        [Wong – Sharp Sports Betting]
            "The Poisson model is the classical approach to totals."
        """
        avg_xg = df["total_xg"].mean() / 2.0 if "total_xg" in df.columns else 1.3
        home_lam = np.full(len(df), avg_xg)
        away_lam = np.full(len(df), avg_xg)
        return self.predict_totals(home_lam, away_lam)

    # =====================================================================
    # Feature resolution
    # =====================================================================

    def _resolve_features(self, df: pd.DataFrame) -> List[str]:
        """Auto-detect numeric feature columns."""
        if self.feature_cols:
            return self.feature_cols

        exclude = {
            "date", "home_team", "away_team", "result", "season", "league",
            "home_goals", "away_goals", "home_xg", "away_xg",
            "home_xp", "away_xp", "home_pts", "away_pts",
            "total_goals", "total_xg", "over25",
            "over25_open_odds", "under25_open_odds",
            "over25_close_odds", "under25_close_odds",
            "liquidity",
        }
        cols = [
            c for c in df.select_dtypes(include=[np.number]).columns
            if c not in exclude
        ]
        logger.info("Auto-detected %d feature columns.", len(cols))
        return cols

    # =====================================================================
    # Fit
    # =====================================================================

    def fit(self, df: pd.DataFrame) -> "QuantModel":
        """Fit the full 3-level ensemble.

        Level 1: Two XGBRegressors (home xG, away xG) + Poisson baseline.
        Level 2: LogisticRegression meta-learner.
        Level 3: IsotonicRegression calibrator.

        Parameters
        ----------
        df : pd.DataFrame
            Feature-engineered match data (output of ``FeatureEngine``).

        Returns
        -------
        QuantModel
            ``self``, for method chaining.

        References
        ----------
        [Mack]  Calibration, Brier Score.
        [Project Doc §5]  3-level stacking.
        """
        features = self._resolve_features(df)
        self.feature_cols = features
        X = df[features].values.astype(np.float32)
        y_home = df["home_goals"].values.astype(np.float32)
        y_away = df["away_goals"].values.astype(np.float32)
        y_over = df["over25"].values.astype(int)

        logger.info(
            "Fitting Level 1 — XGBRegressor (home + away) on %d samples, "
            "%d features.", X.shape[0], X.shape[1],
        )

        # ── Level 1: Base models ────────────────────────────────────────────
        self.home_model = XGBRegressor(**self.xgb_params)
        self.away_model = XGBRegressor(**self.xgb_params)
        self.home_model.fit(X, y_home)
        self.away_model.fit(X, y_away)

        pred_home_xg = self.home_model.predict(X)
        pred_away_xg = self.away_model.predict(X)

        # Model A: XGBoost + Poisson
        prob_xg = self.predict_totals(pred_home_xg, pred_away_xg)

        # Model C: League-average Poisson baseline
        prob_poisson = self._poisson_baseline(df)

        # ── Level 2: Meta-learner ───────────────────────────────────────────
        logger.info("Fitting Level 2 — LogisticRegression meta-learner.")
        # Include market features if available
        meta_features = np.column_stack([prob_xg, prob_poisson])
        if "market_momentum_over" in df.columns:
            meta_features = np.column_stack([
                meta_features,
                df["market_momentum_over"].values,
                df["steam_signal"].values,
            ])

        self.meta_model = LogisticRegression(max_iter=1000, random_state=42)
        self.meta_model.fit(meta_features, y_over)
        raw_probs = self.meta_model.predict_proba(meta_features)[:, 1]

        # ── Level 3: Isotonic calibration ───────────────────────────────────
        logger.info("Fitting Level 3 — IsotonicRegression calibrator.")
        self.calibrator = IsotonicRegression(out_of_bounds="clip")
        self.calibrator.fit(raw_probs, y_over)

        self._is_fitted = True
        logger.info("Full 3-level ensemble fitted successfully.")
        return self

    # =====================================================================
    # Predict
    # =====================================================================

    def predict_proba(self, df: pd.DataFrame) -> pd.DataFrame:
        """Return calibrated Over/Under 2.5 probabilities.

        Parameters
        ----------
        df : pd.DataFrame
            Feature-engineered match data.

        Returns
        -------
        pd.DataFrame
            Columns ``prob_over25`` and ``prob_under25``.
        """
        if not self._is_fitted:
            raise RuntimeError("Model not fitted. Call .fit() first.")

        X = df[self.feature_cols].values.astype(np.float32)

        # Level 1
        pred_home = self.home_model.predict(X)
        pred_away = self.away_model.predict(X)
        prob_xg = self.predict_totals(pred_home, pred_away)
        prob_poisson = self._poisson_baseline(df)

        # Level 2
        meta_features = np.column_stack([prob_xg, prob_poisson])
        if "market_momentum_over" in df.columns:
            meta_features = np.column_stack([
                meta_features,
                df["market_momentum_over"].values,
                df["steam_signal"].values,
            ])
        raw_probs = self.meta_model.predict_proba(meta_features)[:, 1]

        # Level 3
        calibrated = self.calibrator.predict(raw_probs)
        calibrated = np.clip(calibrated, 0.01, 0.99)

        return pd.DataFrame(
            {
                "prob_over25": calibrated,
                "prob_under25": 1.0 - calibrated,
                "pred_home_xg": pred_home,
                "pred_away_xg": pred_away,
                "pred_total_xg": pred_home + pred_away,
            },
            index=df.index,
        )

    # =====================================================================
    # Evaluate
    # =====================================================================

    def evaluate(self, df: pd.DataFrame) -> Dict[str, float]:
        """Evaluate via Time-Series Split cross-validation.

        Metrics
        -------
        * **Brier Score** — primary metric for binary O/U outcome [Mack].
        * **Log Loss** — secondary metric.

        Parameters
        ----------
        df : pd.DataFrame
            Feature-engineered, chronologically sorted match data.

        Returns
        -------
        dict
            ``{"brier_score": float, "log_loss": float}``

        References
        ----------
        [Mack – Statistical Sports Models in Excel]
            "Optimise for Log Loss. Use out-of-sample testing strictly
            by time (Time Series Split), avoiding data leakage."
        """
        features = self._resolve_features(df)
        X = df[features].values.astype(np.float32)
        y_home = df["home_goals"].values.astype(np.float32)
        y_away = df["away_goals"].values.astype(np.float32)
        y_over = df["over25"].values.astype(int)

        tscv = TimeSeriesSplit(n_splits=self.ts_splits)
        fold_brier: List[float] = []
        fold_ll: List[float] = []

        for fold_idx, (train_idx, test_idx) in enumerate(tscv.split(X), 1):
            X_tr, X_te = X[train_idx], X[test_idx]
            yh_tr, ya_tr = y_home[train_idx], y_away[train_idx]
            yo_tr, yo_te = y_over[train_idx], y_over[test_idx]

            # Level 1
            hm = XGBRegressor(**self.xgb_params)
            am = XGBRegressor(**self.xgb_params)
            hm.fit(X_tr, yh_tr)
            am.fit(X_tr, ya_tr)

            # Train probs
            tr_prob_xg = self.predict_totals(hm.predict(X_tr), am.predict(X_tr))
            tr_prob_poi = self._poisson_baseline(df.iloc[train_idx])
            tr_meta = np.column_stack([tr_prob_xg, tr_prob_poi])
            if "market_momentum_over" in df.columns:
                tr_meta = np.column_stack([
                    tr_meta,
                    df.iloc[train_idx]["market_momentum_over"].values,
                    df.iloc[train_idx]["steam_signal"].values,
                ])

            # Test probs
            te_prob_xg = self.predict_totals(hm.predict(X_te), am.predict(X_te))
            te_prob_poi = self._poisson_baseline(df.iloc[test_idx])
            te_meta = np.column_stack([te_prob_xg, te_prob_poi])
            if "market_momentum_over" in df.columns:
                te_meta = np.column_stack([
                    te_meta,
                    df.iloc[test_idx]["market_momentum_over"].values,
                    df.iloc[test_idx]["steam_signal"].values,
                ])

            # Level 2
            mm = LogisticRegression(max_iter=1000, random_state=42)
            mm.fit(tr_meta, yo_tr)
            raw_tr = mm.predict_proba(tr_meta)[:, 1]
            raw_te = mm.predict_proba(te_meta)[:, 1]

            # Level 3
            iso = IsotonicRegression(out_of_bounds="clip")
            iso.fit(raw_tr, yo_tr)
            cal_te = np.clip(iso.predict(raw_te), 0.01, 0.99)

            bs = brier_score_loss(yo_te, cal_te)
            ll = log_loss(yo_te, cal_te)
            fold_brier.append(bs)
            fold_ll.append(ll)

            logger.info(
                "Fold %d/%d — Brier: %.4f | Log Loss: %.4f",
                fold_idx, self.ts_splits, bs, ll,
            )

        avg_bs = float(np.mean(fold_brier))
        avg_ll = float(np.mean(fold_ll))

        logger.info("=" * 60)
        logger.info("EVALUATION SUMMARY (Time-Series CV, %d folds)", self.ts_splits)
        logger.info("  Mean Brier Score: %.4f (± %.4f)", avg_bs, np.std(fold_brier))
        logger.info("  Mean Log Loss   : %.4f (± %.4f)", avg_ll, np.std(fold_ll))
        logger.info("=" * 60)

        return {"brier_score": avg_bs, "log_loss": avg_ll}

    # =====================================================================
    # Feature importance
    # =====================================================================

    def get_feature_importance(self) -> pd.DataFrame:
        """Return averaged feature importances from both XGB regressors.

        Returns
        -------
        pd.DataFrame
            Columns ``feature`` and ``importance``, sorted descending.
        """
        if not self._is_fitted:
            raise RuntimeError("Model not fitted.")

        imp_h = self.home_model.feature_importances_
        imp_a = self.away_model.feature_importances_
        avg_imp = (imp_h + imp_a) / 2.0

        return (
            pd.DataFrame({"feature": self.feature_cols, "importance": avg_imp})
            .sort_values("importance", ascending=False)
            .reset_index(drop=True)
        )
