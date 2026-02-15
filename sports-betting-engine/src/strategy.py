"""
src/strategy.py
===============
Betting strategy engine: Kelly Criterion staking, CLV tracking,
Doppio Filtro execution rules, and doubles-pairing logic.

This module bridges *model output* (calibrated Over/Under probabilities)
and *actionable bets*.  It implements:

1.  **Market Implied Probability** — converting decimal odds to the
    probability the market assigns, then comparing with the model.
2.  **Expected Value (EV) filter** — only bets with EV > threshold.
3.  **Fractional Kelly Criterion** — optimal geometric-growth staking
    scaled by a safety factor [Wong].
4.  **CLV (Closing Line Value) tracking** — in backtesting mode,
    compare the model probability against the *closing* line to measure
    edge quality [Miller & Davidow].
5.  **Doppio Filtro execution rules** — probability threshold, minimum
    odds, steam signal check, disagreement skip [Project Doc §2.3].
6.  **Doubles pairing** — "Bilanciato" algorithm that pairs the
    strongest pick with the weakest for balanced risk [Project Doc §7].

References
----------
[Miller & Davidow – The Logic of Sports Betting]
    CLV, implied probability, steam chasing vs fading the public.
[Wong – Sharp Sports Betting]
    Kelly Criterion, fractional Kelly for finite bankrolls.
[Project Doc §2.3]  Execution rules.
[Project Doc §7]    Pairing strategy.
[Project Doc §8]    Bankroll management.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import yaml

logger = logging.getLogger(__name__)


# ── Data classes ────────────────────────────────────────────────────────────

@dataclass
class BetRecommendation:
    """A single bet recommendation produced by the engine.

    Attributes
    ----------
    match_index : int
        Row index in the source DataFrame.
    home_team : str
    away_team : str
    date : str
    bet_on : str
        ``"over25"`` or ``"under25"``.
    model_prob : float
        Calibrated model probability for the recommended outcome.
    implied_prob_open : float
        Market implied probability from **opening** odds.
    implied_prob_close : float
        Market implied probability from **closing** odds.
    edge : float
        ``model_prob - implied_prob_close``.
    ev : float
        Expected Value as a fraction (e.g. 0.08 = 8 %).
    kelly_fraction : float
        Full Kelly stake as a fraction of bankroll.
    recommended_stake : float
        Fractional Kelly stake, capped at ``max_stake_pct``.
    market_odds : float
        Decimal odds used for the bet (closing odds).
    clv : float
        Closing Line Value: ``model_prob - implied_prob_close``.
        Positive = model beat the closing line [Miller & Davidow].
    steam_signal : int
        +1 = steam on Over, -1 = steam on Under, 0 = neutral.
    passes_filtro_a : bool
        True if model_prob >= min_prob_threshold.
    passes_filtro_b : bool
        True if steam_signal is not adverse.
    """

    match_index: int = 0
    home_team: str = ""
    away_team: str = ""
    date: str = ""
    bet_on: str = ""
    model_prob: float = 0.0
    implied_prob_open: float = 0.0
    implied_prob_close: float = 0.0
    edge: float = 0.0
    ev: float = 0.0
    kelly_fraction: float = 0.0
    recommended_stake: float = 0.0
    market_odds: float = 0.0
    clv: float = 0.0
    steam_signal: int = 0
    passes_filtro_a: bool = False
    passes_filtro_b: bool = False
    league: str = ""


@dataclass
class DoubleBet:
    """A paired double bet (two singles combined).

    References
    ----------
    [Project Doc §7.1]  "Bilanciato" pairing algorithm.
    """

    leg_1: BetRecommendation = field(default_factory=BetRecommendation)
    leg_2: BetRecommendation = field(default_factory=BetRecommendation)
    combined_prob: float = 0.0
    combined_odds: float = 0.0
    recommended_stake: float = 0.0


class BettingEngine:
    """Convert calibrated probabilities and market odds into staking
    recommendations via the Kelly Criterion with CLV tracking.

    Parameters
    ----------
    config_path : str
        Path to ``config/settings.yaml``.

    References
    ----------
    [Wong]   Kelly Criterion, fractional Kelly.
    [Miller] EV threshold, CLV, implied probability.
    [Project Doc §2.3]  Doppio Filtro execution rules.
    """

    def __init__(self, config_path: str = "config/settings.yaml") -> None:
        with open(config_path, "r", encoding="utf-8") as fh:
            cfg = yaml.safe_load(fh)

        strat: Dict = cfg.get("strategy", {})
        self.fractional_kelly: float = strat.get("fractional_kelly", 0.25)
        self.min_ev_threshold: float = strat.get("min_ev_threshold", 0.05)
        self.min_prob_threshold: float = strat.get("min_prob_threshold", 0.80)
        self.min_odds: float = strat.get("min_odds", 1.75)
        self.max_stake_pct: float = strat.get("max_stake_pct", 0.03)
        self.initial_bankroll: float = strat.get("initial_bankroll", 1000.0)
        self.clv_enabled: bool = strat.get("clv_enabled", True)
        self.stop_loss_consecutive: int = strat.get("stop_loss_consecutive", 5)

        ens: Dict = cfg.get("ensemble", {})
        self.disagreement_skip: float = ens.get("disagreement_skip_threshold", 0.20)

        pair: Dict = cfg.get("pairing", {})
        self.pairing_enabled: bool = pair.get("enabled", True)
        self.prefer_cross_league: bool = pair.get("prefer_cross_league", True)

        logger.info(
            "BettingEngine — kelly=%.2f, min_ev=%.1f%%, min_prob=%.0f%%, "
            "min_odds=%.2f, clv=%s",
            self.fractional_kelly, self.min_ev_threshold * 100,
            self.min_prob_threshold * 100, self.min_odds, self.clv_enabled,
        )

    # =====================================================================
    # Core calculations
    # =====================================================================

    @staticmethod
    def implied_probability(decimal_odds: float) -> float:
        """Convert decimal odds to implied probability.

        .. math::

            p_{\\text{implied}} = \\frac{1}{\\text{odds}}

        References
        ----------
        [Miller & Davidow – The Logic of Sports Betting]
        """
        if decimal_odds <= 1.0:
            return 1.0
        return 1.0 / decimal_odds

    @staticmethod
    def expected_value(model_prob: float, decimal_odds: float) -> float:
        """Compute Expected Value of a unit bet.

        .. math::

            \\text{EV} = p \\cdot (\\text{odds} - 1) - (1 - p)

        References
        ----------
        [Miller & Davidow]
        """
        return model_prob * (decimal_odds - 1.0) - (1.0 - model_prob)

    @staticmethod
    def kelly_stake(model_prob: float, decimal_odds: float) -> float:
        """Full Kelly Criterion stake.

        .. math::

            f^{*} = \\frac{b \\cdot p - q}{b}

        where :math:`b = \\text{odds} - 1`, :math:`p` = model prob,
        :math:`q = 1 - p`.

        References
        ----------
        [Wong – Sharp Sports Betting]
            "The Kelly Criterion maximises the expected logarithm of
            wealth."
        """
        b = decimal_odds - 1.0
        if b <= 0:
            return 0.0
        q = 1.0 - model_prob
        f_star = (b * model_prob - q) / b
        return max(f_star, 0.0)

    # =====================================================================
    # Doppio Filtro execution rules
    # =====================================================================

    def _check_filtro_a(self, model_prob: float) -> bool:
        """Filtro A: model probability >= threshold.

        References
        ----------
        [Project Doc §2.3]  "Prob(Over/Under) >= 80%"
        """
        return model_prob >= self.min_prob_threshold

    def _check_filtro_b(self, steam_signal: int, bet_on: str) -> bool:
        """Filtro B: steam signal is not adverse.

        If betting Over and steam is on Under (-1) → BEARISH → skip.
        If betting Under and steam is on Over (+1) → BEARISH → skip.
        Neutral (0) or aligned steam → OK.

        References
        ----------
        [Project Doc §2.3]  "Segnale Mercato = BULLISH o NEUTRAL"
        [Miller & Davidow]  Steam chasing logic.
        """
        if bet_on == "over25" and steam_signal == -1:
            return False  # BEARISH for Over
        if bet_on == "under25" and steam_signal == 1:
            return False  # BEARISH for Under
        return True

    def _check_disagreement(
        self, model_prob: float, implied_prob: float
    ) -> bool:
        """Skip if |model_prob - implied_prob| > disagreement threshold.

        References
        ----------
        [Project Doc §5.4]  "Disaccordo Forte (>20% diff): Skip match."
        """
        return abs(model_prob - implied_prob) <= self.disagreement_skip

    # =====================================================================
    # CLV tracking
    # =====================================================================

    @staticmethod
    def closing_line_value(
        model_prob: float, closing_implied: float
    ) -> float:
        """Compute Closing Line Value.

        ``CLV = model_prob - closing_implied_prob``

        Positive CLV means the model beat the closing line — the gold
        standard of betting skill.

        References
        ----------
        [Miller & Davidow – The Logic of Sports Betting]
            "Beating the closing line is the gold standard."
        """
        return model_prob - closing_implied

    # =====================================================================
    # Analyse
    # =====================================================================

    def analyse(
        self,
        df: pd.DataFrame,
        prob_df: pd.DataFrame,
    ) -> List[BetRecommendation]:
        """Scan all matches and return filtered bet recommendations.

        Applies the full Doppio Filtro execution rules:
        1. Filtro A: Prob >= 80 %
        2. Filtro B: Steam signal not adverse
        3. Odds >= min_odds (1.75)
        4. Disagreement check
        5. EV > min_ev_threshold (5 %)

        Parameters
        ----------
        df : pd.DataFrame
            Feature-engineered match data with odds columns.
        prob_df : pd.DataFrame
            Calibrated probabilities (``prob_over25``, ``prob_under25``).

        Returns
        -------
        list of BetRecommendation
            Sorted by EV descending.
        """
        recommendations: List[BetRecommendation] = []

        # Map bet type to odds columns
        odds_map = {
            "over25": ("over25_open_odds", "over25_close_odds"),
            "under25": ("under25_open_odds", "under25_close_odds"),
        }
        prob_map = {
            "over25": "prob_over25",
            "under25": "prob_under25",
        }

        # Check odds columns exist
        has_open = all(
            c in df.columns for c in ["over25_open_odds", "under25_open_odds"]
        )
        has_close = all(
            c in df.columns for c in ["over25_close_odds", "under25_close_odds"]
        )
        if not has_close:
            logger.warning(
                "Closing odds columns not found — CLV and staking "
                "will use opening odds as fallback."
            )

        for idx in df.index:
            row = df.loc[idx]
            probs = prob_df.loc[idx]
            steam = int(row.get("steam_signal", 0))

            for bet_on in ("over25", "under25"):
                model_prob = float(probs[prob_map[bet_on]])
                open_col, close_col = odds_map[bet_on]

                # Determine odds to use
                if has_close and not np.isnan(row.get(close_col, np.nan)):
                    market_odds = float(row[close_col])
                elif has_open and not np.isnan(row.get(open_col, np.nan)):
                    market_odds = float(row[open_col])
                else:
                    continue

                if market_odds <= 1.0:
                    continue

                open_odds = float(row.get(open_col, market_odds))
                close_odds = market_odds

                imp_open = self.implied_probability(open_odds)
                imp_close = self.implied_probability(close_odds)

                # ── Doppio Filtro checks ────────────────────────────────────
                passes_a = self._check_filtro_a(model_prob)
                passes_b = self._check_filtro_b(steam, bet_on)

                if not passes_a or not passes_b:
                    continue

                if market_odds < self.min_odds:
                    continue

                if not self._check_disagreement(model_prob, imp_close):
                    logger.debug(
                        "Skipping %s %s — disagreement %.2f vs %.2f",
                        row.get("home_team", ""), bet_on,
                        model_prob, imp_close,
                    )
                    continue

                # ── EV & Kelly ──────────────────────────────────────────────
                edge = model_prob - imp_close
                ev = self.expected_value(model_prob, market_odds)

                if ev < self.min_ev_threshold:
                    continue

                full_kelly = self.kelly_stake(model_prob, market_odds)
                stake = min(full_kelly * self.fractional_kelly, self.max_stake_pct)

                # CLV [Miller & Davidow]
                clv = self.closing_line_value(model_prob, imp_close)

                rec = BetRecommendation(
                    match_index=int(idx),
                    home_team=str(row.get("home_team", "")),
                    away_team=str(row.get("away_team", "")),
                    date=str(row.get("date", "")),
                    bet_on=bet_on,
                    model_prob=round(model_prob, 4),
                    implied_prob_open=round(imp_open, 4),
                    implied_prob_close=round(imp_close, 4),
                    edge=round(edge, 4),
                    ev=round(ev, 4),
                    kelly_fraction=round(full_kelly, 4),
                    recommended_stake=round(stake, 4),
                    market_odds=market_odds,
                    clv=round(clv, 4),
                    steam_signal=steam,
                    passes_filtro_a=passes_a,
                    passes_filtro_b=passes_b,
                    league=str(row.get("league", "")),
                )
                recommendations.append(rec)

        recommendations.sort(key=lambda r: r.ev, reverse=True)
        logger.info(
            "BettingEngine found %d qualifying bets (EV > %.1f%%, "
            "prob >= %.0f%%).",
            len(recommendations),
            self.min_ev_threshold * 100,
            self.min_prob_threshold * 100,
        )
        return recommendations

    # =====================================================================
    # Pairing (Doubles)
    # =====================================================================

    def pair_doubles(
        self, recs: List[BetRecommendation]
    ) -> List[DoubleBet]:
        """Pair singles into doubles using the "Bilanciato" algorithm.

        Sorts by probability descending, then pairs the strongest with
        the weakest, the second-strongest with the second-weakest, etc.

        References
        ----------
        [Project Doc §7.1]
            "Accoppia la partita più sicura con la meno sicura."
        [Project Doc §7.2]
            "Preferisci 1 partita Serie A + 1 partita Premier."
        """
        if not self.pairing_enabled or len(recs) < 2:
            return []

        sorted_recs = sorted(recs, key=lambda r: r.model_prob, reverse=True)
        doubles: List[DoubleBet] = []

        while len(sorted_recs) >= 2:
            best = sorted_recs.pop(0)
            worst = sorted_recs.pop(-1)

            # Cross-league preference
            if self.prefer_cross_league and best.league == worst.league:
                # Try to find a different-league partner for best
                swapped = False
                for i in range(len(sorted_recs) - 1, -1, -1):
                    if sorted_recs[i].league != best.league:
                        worst = sorted_recs.pop(i)
                        swapped = True
                        break
                if not swapped:
                    # No cross-league available, use original worst
                    pass

            combined_prob = best.model_prob * worst.model_prob
            combined_odds = best.market_odds * worst.market_odds

            # Kelly on the double
            full_kelly = self.kelly_stake(combined_prob, combined_odds)
            stake = min(full_kelly * self.fractional_kelly, self.max_stake_pct)

            doubles.append(DoubleBet(
                leg_1=best,
                leg_2=worst,
                combined_prob=round(combined_prob, 4),
                combined_odds=round(combined_odds, 2),
                recommended_stake=round(stake, 4),
            ))

        logger.info("Paired %d doubles from %d singles.", len(doubles), len(recs))
        return doubles

    # =====================================================================
    # Helpers
    # =====================================================================

    def to_dataframe(self, recs: List[BetRecommendation]) -> pd.DataFrame:
        """Convert recommendations to a tidy DataFrame."""
        if not recs:
            return pd.DataFrame()
        return pd.DataFrame([r.__dict__ for r in recs])

    def doubles_to_dataframe(self, doubles: List[DoubleBet]) -> pd.DataFrame:
        """Convert doubles to a summary DataFrame."""
        if not doubles:
            return pd.DataFrame()
        rows = []
        for i, d in enumerate(doubles, 1):
            rows.append({
                "double_id": i,
                "leg1_match": f"{d.leg_1.home_team} vs {d.leg_1.away_team}",
                "leg1_bet": d.leg_1.bet_on,
                "leg1_prob": d.leg_1.model_prob,
                "leg1_odds": d.leg_1.market_odds,
                "leg2_match": f"{d.leg_2.home_team} vs {d.leg_2.away_team}",
                "leg2_bet": d.leg_2.bet_on,
                "leg2_prob": d.leg_2.model_prob,
                "leg2_odds": d.leg_2.market_odds,
                "combined_prob": d.combined_prob,
                "combined_odds": d.combined_odds,
                "stake_pct": d.recommended_stake,
            })
        return pd.DataFrame(rows)

    def simulate_bankroll(
        self,
        recs: List[BetRecommendation],
        actuals: pd.Series,
    ) -> pd.DataFrame:
        """Backtest the staking strategy on historical data.

        Parameters
        ----------
        recs : list of BetRecommendation
        actuals : pd.Series
            Actual ``over25`` binary outcome, indexed by match_index.

        Returns
        -------
        pd.DataFrame
            Bankroll evolution with columns: date, bet_on, odds,
            stake_pct, wager, won, profit, bankroll.

        References
        ----------
        [Wong – Sharp Sports Betting]
            "Track your bankroll evolution to verify that your edge is
            real and your staking is disciplined."
        [Project Doc §8.2]
            Stop-loss after N consecutive losses.
        """
        bankroll = self.initial_bankroll
        history: List[Dict] = []
        consecutive_losses = 0

        for rec in recs:
            # Stop-loss check [Project Doc §8.2]
            if consecutive_losses >= self.stop_loss_consecutive:
                logger.warning(
                    "Stop-loss triggered after %d consecutive losses. "
                    "Pausing.", consecutive_losses,
                )
                break

            actual_over = actuals.get(rec.match_index, None)
            if actual_over is None:
                continue

            bet_won = (
                (rec.bet_on == "over25" and actual_over == 1)
                or (rec.bet_on == "under25" and actual_over == 0)
            )

            wager = bankroll * rec.recommended_stake
            profit = wager * (rec.market_odds - 1.0) if bet_won else -wager
            bankroll += profit

            if bet_won:
                consecutive_losses = 0
            else:
                consecutive_losses += 1

            history.append({
                "match_index": rec.match_index,
                "date": rec.date,
                "bet_on": rec.bet_on,
                "odds": rec.market_odds,
                "model_prob": rec.model_prob,
                "clv": rec.clv,
                "stake_pct": rec.recommended_stake,
                "wager": round(wager, 2),
                "won": bet_won,
                "profit": round(profit, 2),
                "bankroll": round(bankroll, 2),
            })

        return pd.DataFrame(history)

    def clv_summary(self, recs: List[BetRecommendation]) -> Dict[str, float]:
        """Compute CLV summary statistics.

        Returns
        -------
        dict
            ``avg_clv``, ``pct_positive_clv``, ``total_bets``.

        References
        ----------
        [Miller & Davidow]
            "Beating the closing line 60%+ of the time is the mark
            of a sharp bettor."
        """
        if not recs:
            return {"avg_clv": 0.0, "pct_positive_clv": 0.0, "total_bets": 0}

        clvs = [r.clv for r in recs]
        return {
            "avg_clv": round(float(np.mean(clvs)), 4),
            "pct_positive_clv": round(
                sum(1 for c in clvs if c > 0) / len(clvs), 4
            ),
            "total_bets": len(recs),
        }
