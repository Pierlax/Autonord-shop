# xG Betting System — Doppio Filtro Engine

**Team Marigliano Analytics** | v1.0 | February 2026

A production-ready quantitative sports betting engine focused on the **Over/Under 2.5 goals** market. The system combines a proprietary Expected Goals (xG) model with market analysis through a **"Doppio Filtro" (Double Filter)** architecture, designed to identify high-probability betting opportunities with positive expected value.

---

## Architecture

The engine implements a **3-level ensemble** with two sequential filters:

```
┌─────────────────────────────────────────────────────────────┐
│                    DOPPIO FILTRO ENGINE                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  FILTRO A — xG Model (The Sporting Truth)                   │
│  ├── XGBRegressor (Home xG) ──┐                             │
│  ├── XGBRegressor (Away xG) ──┼── Poisson Grid → P(Over)   │
│  └── Poisson Baseline (Wong) ─┘                             │
│                                                             │
│  FILTRO B — Market Analysis (The Confirmation)              │
│  ├── Market Momentum (Opening → Closing odds)               │
│  └── Steam Detection (Miller & Davidow)                     │
│                                                             │
│  ENSEMBLE                                                   │
│  ├── Level 1: Base Models (xG Poisson + Baseline Poisson)   │
│  ├── Level 2: Meta-Learner (Logistic Regression)            │
│  └── Level 3: Isotonic Calibration (Brier Score optimised)  │
│                                                             │
│  STRATEGY                                                   │
│  ├── Kelly Criterion (fractional, capped at 3%)             │
│  ├── CLV Tracking (closing line value)                      │
│  └── Doubles Pairing ("Bilanciato" algorithm)               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Execution Rules (Doppio Filtro)

A bet is placed **only** when all conditions are met:

| Rule | Condition | Source |
|------|-----------|--------|
| Filtro A | `P(Over/Under) >= 80%` | Model calibrated probability |
| Filtro B | Steam signal not adverse | Market momentum analysis |
| Min Odds | `Bookmaker odds >= 1.75` | Safety margin (EV > +5%) |
| Disagreement | `|P_model - P_market| < 20%` | No hidden information |
| Min EV | `Expected Value >= 5%` | Kelly Criterion prerequisite |

## Features Engineered

The `FeatureEngine` produces **32 features** per match:

| Category | Features | Source |
|----------|----------|--------|
| Rolling xG | `xg_for_rolling_5`, `xg_against_rolling_5`, `xg_for_ema`, `xg_against_ema` | Tippett — *xGenius* |
| Cluster Luck | `luck_index` (goals - xG divergence) | Peta — *Trading Bases* |
| Justice Table | `justice_points` (xP - actual points) | Tippett — *xGenius* |
| Strength | `attack_strength`, `defence_strength`, `xgf_atteso` | Project Doc §6 |
| Market | `market_momentum_over/under`, `steam_signal` | Miller & Davidow |
| Composites | `xg_rolling_diff`, `luck_diff`, `justice_diff`, `total_xgf_atteso` | Combined |

## Project Structure

```
sports-betting-engine/
├── config/
│   └── settings.yaml          # Full configuration (thresholds, model params, strategy)
├── data/
│   ├── loader.py              # Schema-agnostic CSV loader with validation
│   └── matches.csv            # Match data (Opening + Closing O/U odds)
├── src/
│   ├── features.py            # Feature engineering (32 features)
│   ├── model.py               # 3-level ensemble (XGBoost + Poisson + Isotonic)
│   └── strategy.py            # Kelly Criterion, CLV, doubles pairing
├── tests/
│   └── generate_synthetic_data.py  # Synthetic data generator for testing
├── logs/
│   └── engine.log             # Runtime logs
├── main.py                    # Full pipeline execution script
├── requirements.txt           # Python dependencies
└── README.md
```

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/Pierlax/Autonord-shop.git
cd sports-betting-engine

# 2. Install dependencies
pip install -r requirements.txt

# 3. Generate synthetic test data (optional)
python tests/generate_synthetic_data.py

# 4. Run the full pipeline
python main.py

# 5. Run evaluation only
python main.py --evaluate-only

# 6. Use custom data
python main.py --data path/to/your/matches.csv
```

## Data Format

The engine expects a CSV with these columns:

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `date` | date | Yes | Match date |
| `home_team` | string | Yes | Home team name |
| `away_team` | string | Yes | Away team name |
| `home_goals` | int | Yes | Actual home goals |
| `away_goals` | int | Yes | Actual away goals |
| `home_xg` | float | Yes | Home expected goals |
| `away_xg` | float | Yes | Away expected goals |
| `over25_open_odds` | float | No | Opening Over 2.5 decimal odds |
| `under25_open_odds` | float | No | Opening Under 2.5 decimal odds |
| `over25_close_odds` | float | No | Closing Over 2.5 decimal odds |
| `under25_close_odds` | float | No | Closing Under 2.5 decimal odds |
| `league` | string | No | League name |

If your CSV uses different column names, provide a `column_map` in `settings.yaml`.

## Foundational References

| Book | Author | Key Concept Used |
|------|--------|-----------------|
| *xGenius* | James Tippett | Rolling xG, Expected Points, Justice Table |
| *Trading Bases* | Joe Peta | Cluster Luck (luck_index) |
| *Statistical Sports Models in Excel* | Andrew Mack | Poisson distribution, Brier Score, Time-Series Split |
| *The Logic of Sports Betting* | Miller & Davidow | CLV, market momentum, steam detection |
| *Sharp Sports Betting* | Stanford Wong | Kelly Criterion, fractional Kelly |

## KPI Targets

| Metric | Target | Frequency |
|--------|--------|-----------|
| ROI | 12-15% | Monthly |
| Win Rate (Doubles) | 40-45% | Weekly |
| Brier Score | < 0.15 | Per matchday |
| CLV (beat closing line) | 60%+ | Per bet |
| Avg EV per bet | > +8% | Per bet |
| Sharpe Ratio | > 1.5 | Monthly |

## Configuration

All parameters are centralised in `config/settings.yaml`. Key settings:

```yaml
strategy:
  fractional_kelly: 0.25      # 1/4 Kelly for safety
  min_prob_threshold: 0.80     # Filtro A: 80% minimum
  min_ev_threshold: 0.05       # 5% minimum EV
  min_odds: 1.75               # Safety margin
  max_stake_pct: 0.03          # Hard cap: 3% of bankroll
  initial_bankroll: 1000.0
  stop_loss_consecutive: 5     # Pause after 5 consecutive losses
```

## License

Private — Team Marigliano Analytics.
