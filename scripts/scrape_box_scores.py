#!/usr/bin/env python3
"""
Scrape box scores from Basketball Reference and insert into Supabase.

Usage:
  python scripts/scrape_box_scores.py --season 2024 [--days 7] [--limit 10]
"""

import argparse
import os
import re
import sys
import time
from datetime import datetime, timedelta

import requests
from bs4 import BeautifulSoup, Comment
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["EXPO_PUBLIC_SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Basketball Reference uses different abbreviations than BallDontLie
ABBREV_TO_BREF = {
    "PHX": "PHO",
    "BKN": "BRK",
    "CHA": "CHO",
}


def to_bref(abbrev: str) -> str:
    return ABBREV_TO_BREF.get(abbrev, abbrev)


def safe_int(val) -> int | None:
    if val is None or str(val).strip() == "":
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def safe_float(val) -> float | None:
    if val is None or str(val).strip() == "":
        return None
    try:
        return round(float(val), 3)
    except (ValueError, TypeError):
        return None


def fetch_games_without_box_scores(season_year: int, days: int | None, limit: int | None):
    """Get games that are final but have no box_scores rows yet."""
    query = (
        supabase.table("games")
        .select(
            "id, game_date_utc, home_team_id, away_team_id, home_q1, "
            "home_team:teams!games_home_team_id_fkey(id, abbreviation), "
            "away_team:teams!games_away_team_id_fkey(id, abbreviation), "
            "season:seasons(year)"
        )
        .eq("status", "final")
        .is_("home_q1", "null")  # no quarter scores yet = not scraped
    )

    # Filter by season
    season_res = supabase.table("seasons").select("id").eq("year", season_year).execute()
    if not season_res.data:
        print(f"No season found for year {season_year}")
        sys.exit(1)
    season_ids = [s["id"] for s in season_res.data]
    query = query.in_("season_id", season_ids)

    if days:
        cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        query = query.gte("game_date_utc", cutoff)

    query = query.order("game_date_utc", desc=False)
    query = query.limit(limit if limit else 2000)

    res = query.execute()
    return res.data or []


def fetch_game_page(home_abbrev: str, game_date: str):
    """Fetch and parse the Basketball Reference box score page."""
    dt = datetime.strptime(game_date[:10], "%Y-%m-%d")
    date_str = dt.strftime("%Y%m%d")
    bref_home = to_bref(home_abbrev)
    url = f"https://www.basketball-reference.com/boxscores/{date_str}0{bref_home}.html"

    resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh)"})
    if resp.status_code != 200:
        print(f"  Failed to fetch {url} (status {resp.status_code})")
        return None, url

    # Basketball Reference hides advanced tables inside HTML comments.
    # Uncomment them so BeautifulSoup can find them.
    html = resp.text
    html = re.sub(r'<!--\s*(<div[^>]*>.*?</div>)\s*-->', r'\1', html, flags=re.DOTALL)

    soup = BeautifulSoup(html, "html.parser")
    return soup, url


def parse_box_score_table(soup, table_id: str) -> list[dict]:
    """Parse a basic or advanced box score table into a list of dicts."""
    table = soup.find("table", {"id": table_id})
    if not table:
        return []

    # Get column names from the second header row (first is the group header)
    header_rows = table.find("thead").find_all("tr")
    header_row = header_rows[-1]  # last header row has the actual column names
    cols = []
    for th in header_row.find_all("th"):
        stat = th.get("data-stat", th.get_text(strip=True))
        cols.append(stat)

    rows = []
    tbody = table.find("tbody")
    if not tbody:
        return []

    starter_count = 0
    seen_reserves = False
    for tr in tbody.find_all("tr"):
        # Skip separator rows (class="thead" marks the Reserves divider)
        if "thead" in tr.get("class", []):
            seen_reserves = True
            continue

        cells = tr.find_all(["th", "td"])
        if not cells:
            continue

        row_data = {}
        for i, cell in enumerate(cells):
            if i < len(cols):
                row_data[cols[i]] = cell.get_text(strip=True)

        # Skip "Did Not Play" rows
        reason_cell = tr.find("td", {"data-stat": "reason"})
        if reason_cell:
            continue

        player_name = row_data.get("player", "")
        if not player_name or player_name.lower() in ("team totals", "totals"):
            continue

        row_data["_starter"] = not seen_reserves
        if not seen_reserves:
            starter_count += 1
        rows.append(row_data)

    return rows


def parse_quarter_scores(soup):
    """Parse the line_score table for quarter-by-quarter scores."""
    table = soup.find("table", {"id": "line_score"})
    if not table:
        return None

    tbody = table.find("tbody")
    if not tbody:
        return None

    rows = tbody.find_all("tr")
    if len(rows) < 2:
        return None

    def parse_row(row):
        cells = row.find_all("td")
        return [safe_int(c.get_text(strip=True)) for c in cells]

    away_scores = parse_row(rows[0])
    home_scores = parse_row(rows[1])

    result = {}
    for prefix, scores in [("away", away_scores), ("home", home_scores)]:
        for i, q in enumerate(["q1", "q2", "q3", "q4"]):
            result[f"{prefix}_{q}"] = scores[i] if i < len(scores) else None
        # OT: sum all overtime periods (cells between Q4 and Total)
        if len(scores) > 5:
            ot_scores = scores[4:-1]
            ot_total = sum(s for s in ot_scores if s is not None)
            result[f"{prefix}_ot"] = ot_total if ot_total > 0 else None
        else:
            result[f"{prefix}_ot"] = None

    return result


def parse_playoff_round(soup):
    """Parse playoff round from page title."""
    title_tag = soup.find("title")
    if not title_tag:
        return None
    title = title_tag.get_text().lower()
    if "first round" in title:
        return "first_round"
    if "conference semifinals" in title:
        return "conf_semis"
    if "conference finals" in title:
        return "conf_finals"
    if "nba finals" in title:
        return "finals"
    return None


def parse_arena_attendance(soup):
    """Parse arena name and attendance from the page."""
    arena = None
    attendance = None

    # Arena is in scorebox_meta, second div (after date)
    scorebox = soup.find("div", class_="scorebox_meta")
    if scorebox:
        divs = scorebox.find_all("div")
        if len(divs) >= 2:
            candidate = divs[1].get_text(strip=True)
            if not candidate.startswith("Attendance") and not candidate.startswith("Logo"):
                arena = candidate.split(",")[0].strip() if "," in candidate else candidate.strip()

    # Attendance is in a separate <div><strong>Attendance:</strong>19,156</div>
    att_strong = soup.find("strong", string=re.compile(r"Attendance"))
    if att_strong:
        att_text = att_strong.parent.get_text(strip=True)
        att_str = att_text.replace("Attendance:", "").replace("\xa0", "").replace(",", "").strip()
        attendance = safe_int(att_str)

    return arena, attendance


def scrape_game(game: dict):
    """Scrape box scores for a single game and insert into Supabase."""
    home_team = game["home_team"]
    away_team = game["away_team"]
    game_date = game["game_date_utc"]
    game_id = game["id"]

    home_abbrev = home_team["abbreviation"]
    away_abbrev = away_team["abbreviation"]
    bref_away = to_bref(away_abbrev)
    bref_home = to_bref(home_abbrev)

    print(f"\nScraping {away_abbrev} @ {home_abbrev} on {game_date[:10]}...")

    # Single page fetch gets everything
    time.sleep(3.5)  # rate limit: stay under 20 req/min
    soup, url = fetch_game_page(home_abbrev, game_date)
    if not soup:
        return False

    # 1) Parse basic + advanced box scores for both teams
    box_rows = []
    for team_bref, team_info in [(bref_away, away_team), (bref_home, home_team)]:
        basic_rows = parse_box_score_table(soup, f"box-{team_bref}-game-basic")
        adv_rows = parse_box_score_table(soup, f"box-{team_bref}-game-advanced")

        if not basic_rows:
            print(f"  No basic box score found for {team_bref}")
            continue

        # Build advanced lookup by player name
        adv_lookup = {}
        for arow in adv_rows:
            pname = arow.get("player", "")
            if pname:
                adv_lookup[pname] = arow

        for row in basic_rows:
            player_name = row.get("player", "")
            if not player_name:
                continue

            adv = adv_lookup.get(player_name, {})

            box_rows.append({
                "game_id": game_id,
                "team_id": team_info["id"],
                "player_name": player_name,
                "minutes": row.get("mp") or None,
                "points": safe_int(row.get("pts")),
                "rebounds": safe_int(row.get("trb")),
                "offensive_rebounds": safe_int(row.get("orb")),
                "defensive_rebounds": safe_int(row.get("drb")),
                "assists": safe_int(row.get("ast")),
                "steals": safe_int(row.get("stl")),
                "blocks": safe_int(row.get("blk")),
                "turnovers": safe_int(row.get("tov")),
                "fgm": safe_int(row.get("fg")),
                "fga": safe_int(row.get("fga")),
                "fg_pct": safe_float(row.get("fg_pct")),
                "tpm": safe_int(row.get("fg3")),
                "tpa": safe_int(row.get("fg3a")),
                "tp_pct": safe_float(row.get("fg3_pct")),
                "ftm": safe_int(row.get("ft")),
                "fta": safe_int(row.get("fta")),
                "ft_pct": safe_float(row.get("ft_pct")),
                "personal_fouls": safe_int(row.get("pf")),
                "plus_minus": safe_int(row.get("plus_minus")),
                # advanced stats
                "ts_pct": safe_float(adv.get("ts_pct")),
                "efg_pct": safe_float(adv.get("efg_pct")),
                "three_par": safe_float(adv.get("fg3a_per_fga_pct")),
                "ft_rate": safe_float(adv.get("fta_per_fga_pct")),
                "orb_pct": safe_float(adv.get("orb_pct")),
                "drb_pct": safe_float(adv.get("drb_pct")),
                "trb_pct": safe_float(adv.get("trb_pct")),
                "ast_pct": safe_float(adv.get("ast_pct")),
                "stl_pct": safe_float(adv.get("stl_pct")),
                "blk_pct": safe_float(adv.get("blk_pct")),
                "tov_pct": safe_float(adv.get("tov_pct")),
                "usg_pct": safe_float(adv.get("usg_pct")),
                "offensive_rating": safe_int(adv.get("off_rtg")),
                "defensive_rating": safe_int(adv.get("def_rtg")),
                "bpm": safe_float(adv.get("bpm")),
                "starter": row.get("_starter", False),
            })

    if not box_rows:
        print("  No box score rows parsed")
        return False

    # Upsert box scores
    try:
        supabase.table("box_scores").upsert(
            box_rows,
            on_conflict="game_id,team_id,player_name",
        ).execute()
        print(f"  Inserted {len(box_rows)} box score rows")
    except Exception as e:
        print(f"  Error inserting box scores: {e}")
        return False

    # 2) Parse quarter scores + arena/attendance from same page
    update_data = {}

    quarter_data = parse_quarter_scores(soup)
    if quarter_data:
        update_data.update({k: v for k, v in quarter_data.items() if v is not None})

    arena, attendance = parse_arena_attendance(soup)
    playoff_round = parse_playoff_round(soup)
    if playoff_round:
        update_data["playoff_round"] = playoff_round

    if arena:
        update_data["arena"] = arena
    if attendance:
        update_data["attendance"] = attendance

    if update_data:
        try:
            supabase.table("games").update(update_data).eq("id", game_id).execute()
            print(f"  Updated game with: {list(update_data.keys())}")
        except Exception as e:
            print(f"  Error updating game: {e}")

    return True


def backfill_playoff_rounds(season_year: int, limit: int | None):
    """Re-scrape playoff games that are missing playoff_round."""
    season_res = supabase.table("seasons").select("id").eq("year", season_year).execute()
    if not season_res.data:
        print(f"No season found for year {season_year}")
        sys.exit(1)
    season_ids = [s["id"] for s in season_res.data]

    query = (
        supabase.table("games")
        .select(
            "id, game_date_utc, home_team_id, away_team_id, "
            "home_team:teams!games_home_team_id_fkey(id, abbreviation), "
            "away_team:teams!games_away_team_id_fkey(id, abbreviation)"
        )
        .eq("postseason", True)
        .is_("playoff_round", "null")
        .not_.is_("home_q1", "null")  # already scraped
        .in_("season_id", season_ids)
        .order("game_date_utc", desc=False)
        .limit(limit if limit else 2000)
    )

    res = query.execute()
    games = res.data or []
    print(f"Found {len(games)} playoff games to backfill")

    success = 0
    for game in games:
        home_team = game["home_team"]
        home_abbrev = home_team["abbreviation"]
        game_date = game["game_date_utc"]
        game_id = game["id"]

        print(f"\nBackfilling {game_id} ({game_date[:10]})...")
        time.sleep(3.5)
        soup, url = fetch_game_page(home_abbrev, game_date)
        if not soup:
            continue

        playoff_round = parse_playoff_round(soup)
        if playoff_round:
            try:
                supabase.table("games").update({"playoff_round": playoff_round}).eq("id", game_id).execute()
                print(f"  Set playoff_round = {playoff_round}")
                success += 1
            except Exception as e:
                print(f"  Error updating: {e}")
        else:
            print("  No playoff round found in title")

    print(f"\nDone! Backfilled {success}/{len(games)} games.")


def main():
    parser = argparse.ArgumentParser(description="Scrape NBA box scores from Basketball Reference")
    parser.add_argument("--season", type=int, required=True, help="Season year (e.g. 2024 for 2024-25)")
    parser.add_argument("--days", type=int, default=None, help="Only scrape games from last N days")
    parser.add_argument("--limit", type=int, default=None, help="Max number of games to scrape")
    parser.add_argument("--backfill-playoffs", action="store_true",
                        help="Re-scrape playoff games missing playoff_round")
    args = parser.parse_args()

    if args.backfill_playoffs:
        backfill_playoff_rounds(args.season, args.limit)
    else:
        games = fetch_games_without_box_scores(args.season, args.days, args.limit)
        print(f"Found {len(games)} games to scrape")

        success = 0
        for game in games:
            if scrape_game(game):
                success += 1

        print(f"\nDone! Scraped {success}/{len(games)} games successfully.")


if __name__ == "__main__":
    main()
