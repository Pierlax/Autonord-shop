"""
main.py
=======
Execution script for the xG Betting System — Team Marigliano Analytics.

This script orchestrates the full **Doppio Filtro** pipeline:

1. **Load** match data (with Opening/Closing O/U odds).
2. **Engineer features** (xG rolling, luck index, market momentum, etc.).
3. **Evaluate** the 3-level ensemble via Time-Series Split.
4. **Fit** the production model on all available data.
5. **Generate predictions** (calibrated Over/Under 2.5 probabilities).
6. **Apply strategy** (Doppio Filtro rules, Kelly staking, CLV tracking).
7. **Pair doubles** using the "Bilanciato" algorithm.
8. **Backtest** bankroll evolution.
9. **Report** results.

Usage
-----
    python main.py                           # default config
    python main.py --config path/to/cfg.yaml # custom config
    python main.py --data path/to/data.csv   # override data path

References
----------
[Project Doc]  Full architecture description.
[Mack]   Time-Series Split, Brier Score.
[Peta]   Cluster Luck.
[Tippett] xG rolling, Justice Table.
[Miller]  CLV, steam, market mechanics.
[Wong]   Kelly Criterion.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

# ── Ensure project root is on sys.path ──────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

from data.loader import DataLoader
from src.features import FeatureEngine
from src.model import QuantModel
from src.strategy import BettingEngine


def setup_logging(config_path: str = "config/settings.yaml") -> None:
    """Configure logging from the YAML settings."""
    with open(config_path, "r", encoding="utf-8") as fh:
        cfg = yaml.safe_load(fh)

    log_cfg = cfg.get("logging", {})
    level = getattr(logging, log_cfg.get("level", "INFO").upper(), logging.INFO)
    log_file = log_cfg.get("log_file", "logs/engine.log")

    # Ensure log directory exists
    os.makedirs(os.path.dirname(log_file), exist_ok=True)

    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(name)-25s | %(levelname)-7s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_file, mode="a", encoding="utf-8"),
        ],
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="xG Betting System — Doppio Filtro Pipeline",
    )
    parser.add_argument(
        "--config", type=str, default="config/settings.yaml",
        help="Path to YAML configuration file.",
    )
    parser.add_argument(
        "--data", type=str, default=None,
        help="Override data path (CSV).",
    )
    parser.add_argument(
        "--evaluate-only", action="store_true",
        help="Run evaluation only (no predictions or strategy).",
    )
    return parser.parse_args()


def print_banner() -> None:
    banner = """
    ╔══════════════════════════════════════════════════════════════╗
    ║          xG BETTING SYSTEM — DOPPIO FILTRO ENGINE           ║
    ║              Team Marigliano Analytics v1.0                  ║
    ╚══════════════════════════════════════════════════════════════╝
    """
    print(banner)


def main() -> None:
    args = parse_args()
    setup_logging(args.config)
    logger = logging.getLogger("main")
    print_banner()

    # ── 1. Load Data ────────────────────────────────────────────────────────
    logger.info("STEP 1/8 — Loading data …")
    loader = DataLoader(config_path=args.config)
    df = loader.load(path_override=args.data)
    logger.info("Loaded %d matches.", len(df))

    # ── 2. Feature Engineering ──────────────────────────────────────────────
    logger.info("STEP 2/8 — Engineering features …")
    engine = FeatureEngine(config_path=args.config)
    df = engine.transform(df)
    logger.info("Features engineered. Shape: %s", df.shape)

    feature_names = engine.get_feature_names()
    available = [f for f in feature_names if f in df.columns]
    logger.info("Available features: %d / %d", len(available), len(feature_names))

    # ── 3. Evaluate (Time-Series CV) ───────────────────────────────────────
    logger.info("STEP 3/8 — Evaluating model (Time-Series Split) …")
    model = QuantModel(config_path=args.config)
    metrics = model.evaluate(df)
    logger.info(
        "Evaluation complete — Brier Score: %.4f | Log Loss: %.4f",
        metrics["brier_score"], metrics["log_loss"],
    )

    if args.evaluate_only:
        logger.info("--evaluate-only flag set. Exiting.")
        return

    # ── 4. Fit Production Model ─────────────────────────────────────────────
    logger.info("STEP 4/8 — Fitting production model on full dataset …")
    model.fit(df)

    # ── 5. Generate Predictions ─────────────────────────────────────────────
    logger.info("STEP 5/8 — Generating calibrated predictions …")
    prob_df = model.predict_proba(df)
    df = df.join(prob_df)

    logger.info(
        "Prediction summary — Over 2.5 mean prob: %.3f | "
        "Predicted total xG mean: %.2f",
        prob_df["prob_over25"].mean(),
        prob_df["pred_total_xg"].mean(),
    )

    # ── 6. Apply Strategy (Doppio Filtro) ───────────────────────────────────
    logger.info("STEP 6/8 — Applying Doppio Filtro strategy …")
    strategy = BettingEngine(config_path=args.config)
    recommendations = strategy.analyse(df, prob_df)

    if recommendations:
        rec_df = strategy.to_dataframe(recommendations)
        logger.info("Recommendations:\n%s", rec_df.to_string(index=False))

        # CLV Summary [Miller & Davidow]
        clv_stats = strategy.clv_summary(recommendations)
        logger.info(
            "CLV Summary — Avg CLV: %.4f | Positive CLV: %.1f%% | "
            "Total bets: %d",
            clv_stats["avg_clv"],
            clv_stats["pct_positive_clv"] * 100,
            clv_stats["total_bets"],
        )

        # Save recommendations
        rec_df.to_csv("output_recommendations.csv", index=False)
        logger.info("Recommendations saved to output_recommendations.csv")
    else:
        logger.info("No qualifying bets found with current filters.")

    # ── 7. Pair Doubles ─────────────────────────────────────────────────────
    logger.info("STEP 7/8 — Pairing doubles (Bilanciato algorithm) …")
    doubles = strategy.pair_doubles(recommendations)

    if doubles:
        doubles_df = strategy.doubles_to_dataframe(doubles)
        logger.info("Doubles:\n%s", doubles_df.to_string(index=False))
        doubles_df.to_csv("output_doubles.csv", index=False)
        logger.info("Doubles saved to output_doubles.csv")
    else:
        logger.info("Not enough qualifying bets to form doubles.")

    # ── 8. Backtest ─────────────────────────────────────────────────────────
    logger.info("STEP 8/8 — Backtesting bankroll evolution …")
    if recommendations:
        actuals = df["over25"]
        bankroll_df = strategy.simulate_bankroll(recommendations, actuals)

        if not bankroll_df.empty:
            final_bankroll = bankroll_df["bankroll"].iloc[-1]
            total_bets = len(bankroll_df)
            wins = bankroll_df["won"].sum()
            roi = (final_bankroll - strategy.initial_bankroll) / strategy.initial_bankroll

            logger.info("=" * 60)
            logger.info("BACKTEST RESULTS")
            logger.info("  Total bets placed : %d", total_bets)
            logger.info("  Wins              : %d (%.1f%%)", wins, 100 * wins / max(total_bets, 1))
            logger.info("  Final bankroll    : %.2f", final_bankroll)
            logger.info("  ROI               : %.2f%%", roi * 100)
            logger.info("=" * 60)

            bankroll_df.to_csv("output_backtest.csv", index=False)
            logger.info("Backtest saved to output_backtest.csv")

    # ── Feature Importance ──────────────────────────────────────────────────
    imp_df = model.get_feature_importance()
    logger.info("Top 10 features:\n%s", imp_df.head(10).to_string(index=False))
    imp_df.to_csv("output_feature_importance.csv", index=False)

    logger.info("Pipeline complete.")


if __name__ == "__main__":
    main()
