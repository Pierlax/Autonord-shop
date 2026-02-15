"""
tests/generate_synthetic_data.py
================================
Generate a realistic synthetic match dataset for pipeline testing.

Produces 500 matches across 5 leagues with:
- Realistic xG distributions (Poisson-based)
- Opening and Closing O/U 2.5 odds with realistic movement
- Correlated goals and xG (with noise for cluster luck)
"""

import os
import sys
import numpy as np
import pandas as pd

np.random.seed(42)

N = 500  # matches

leagues = ["Serie A", "Premier League", "La Liga", "Bundesliga", "Eredivisie"]
teams = {
    "Serie A": ["Inter", "Milan", "Juventus", "Napoli", "Roma", "Lazio",
                "Atalanta", "Fiorentina", "Bologna", "Torino"],
    "Premier League": ["Man City", "Arsenal", "Liverpool", "Chelsea",
                       "Man Utd", "Tottenham", "Newcastle", "Aston Villa",
                       "Brighton", "West Ham"],
    "La Liga": ["Real Madrid", "Barcelona", "Atletico", "Sevilla",
                "Real Sociedad", "Villarreal", "Athletic Bilbao",
                "Real Betis", "Valencia", "Girona"],
    "Bundesliga": ["Bayern", "Dortmund", "Leverkusen", "Leipzig",
                   "Stuttgart", "Frankfurt", "Wolfsburg", "Freiburg",
                   "Union Berlin", "Hoffenheim"],
    "Eredivisie": ["PSV", "Ajax", "Feyenoord", "AZ", "Twente",
                   "Utrecht", "Heerenveen", "Vitesse", "Groningen",
                   "Sparta Rotterdam"],
}

rows = []
base_date = pd.Timestamp("2023-08-18")

for i in range(N):
    league = leagues[i % len(leagues)]
    league_teams = teams[league]
    home = league_teams[np.random.randint(0, len(league_teams))]
    away = league_teams[np.random.randint(0, len(league_teams))]
    while away == home:
        away = league_teams[np.random.randint(0, len(league_teams))]

    date = base_date + pd.Timedelta(days=int(i * 0.7))

    # xG generation (realistic: home advantage ~0.3 xG)
    home_xg = max(0.2, np.random.normal(1.5, 0.6))
    away_xg = max(0.2, np.random.normal(1.2, 0.5))

    # Goals from Poisson (correlated with xG but with noise = cluster luck)
    home_goals = np.random.poisson(home_xg * np.random.uniform(0.8, 1.2))
    away_goals = np.random.poisson(away_xg * np.random.uniform(0.8, 1.2))

    total_xg = home_xg + away_xg

    # Odds generation: derive from true total xG
    from scipy.stats import poisson as poisson_dist
    prob_under = 0.0
    for h in range(8):
        for a in range(8):
            if h + a <= 2:
                prob_under += poisson_dist.pmf(h, home_xg) * poisson_dist.pmf(a, away_xg)
    prob_over = 1.0 - prob_under

    # Opening odds (with bookmaker margin ~5%)
    margin = 1.05
    over_open = margin / max(prob_over, 0.05)
    under_open = margin / max(prob_under, 0.05)

    # Closing odds: add realistic market movement (steam)
    steam_direction = np.random.choice([-1, 0, 1], p=[0.15, 0.70, 0.15])
    steam_magnitude = np.random.uniform(0.02, 0.10) if steam_direction != 0 else 0

    over_close = over_open * (1 - steam_direction * steam_magnitude)
    under_close = under_open * (1 + steam_direction * steam_magnitude)

    # Clamp odds
    over_open = round(max(1.05, over_open), 2)
    under_open = round(max(1.05, under_open), 2)
    over_close = round(max(1.05, over_close), 2)
    under_close = round(max(1.05, under_close), 2)

    rows.append({
        "date": date.strftime("%Y-%m-%d"),
        "home_team": home,
        "away_team": away,
        "home_goals": home_goals,
        "away_goals": away_goals,
        "home_xg": round(home_xg, 2),
        "away_xg": round(away_xg, 2),
        "over25_open_odds": over_open,
        "under25_open_odds": under_open,
        "over25_close_odds": over_close,
        "under25_close_odds": under_close,
        "league": league,
    })

df = pd.DataFrame(rows)

# Save
out_dir = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, "matches.csv")
df.to_csv(out_path, index=False)
print(f"Generated {len(df)} synthetic matches → {out_path}")
print(f"Over 2.5 rate: {(df['home_goals'] + df['away_goals'] > 2.5).mean():.1%}")
print(f"Avg total xG: {(df['home_xg'] + df['away_xg']).mean():.2f}")
print(df.head(10).to_string())
