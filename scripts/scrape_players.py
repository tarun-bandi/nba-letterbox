#!/usr/bin/env python3
"""
Scrape NBA player rosters (and optionally season averages) from Basketball Reference.

Usage:
  python scripts/scrape_players.py --season 2025
  python scripts/scrape_players.py --season 2025 --team BOS
  python scripts/scrape_players.py --season 2025 --averages
"""

import argparse
import os
import re
import sys
import time
import zlib
from datetime import datetime

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from nba_api.stats.static import players as nba_players
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["EXPO_PUBLIC_SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Basketball Reference uses different abbreviations than our DB
ABBREV_TO_BREF = {
    "PHX": "PHO",
    "BKN": "BRK",
    "CHA": "CHO",
}

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh)"}
RATE_LIMIT_SECONDS = 3.5


def to_bref(abbrev: str) -> str:
    return ABBREV_TO_BREF.get(abbrev, abbrev)


def slug_to_provider_id(slug: str) -> int:
    """Convert a bref player slug (e.g. 'curryst01') to a stable integer ID."""
    return zlib.adler32(slug.encode("utf-8"))


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


def parse_height(ht_str: str) -> str | None:
    """Parse height like '6-3' or '6\\'3\"' and return as-is (text field)."""
    if not ht_str or ht_str.strip() == "":
        return None
    return ht_str.strip()


def parse_birth_date(date_str: str) -> str | None:
    """Parse birth date string; return None if unparseable."""
    if not date_str or date_str.strip() == "":
        return None
    try:
        dt = datetime.strptime(date_str.strip(), "%B %d, %Y")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        pass
    try:
        dt = datetime.strptime(date_str.strip(), "%b %d, %Y")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return None


def load_teams():
    """Load all teams from Supabase, returning {abbreviation: uuid} map."""
    res = supabase.table("teams").select("id, abbreviation").execute()
    return {t["abbreviation"]: t["id"] for t in (res.data or [])}


def load_season(year: int):
    """Load season UUID for the given year."""
    res = supabase.table("seasons").select("id").eq("year", year).execute()
    if not res.data:
        print(f"No season found for year {year}")
        sys.exit(1)
    return res.data[0]["id"]


def fetch_roster_page(bref_abbrev: str, season: int):
    """Fetch the team roster page. season=2025 means 2024-25 season, URL uses 2025."""
    # Basketball Reference URL uses the ending year of the season
    url_year = season + 1
    url = f"https://www.basketball-reference.com/teams/{bref_abbrev}/{url_year}.html"

    resp = requests.get(url, headers=HEADERS)
    if resp.status_code != 200:
        print(f"  Failed to fetch {url} (status {resp.status_code})")
        return None, url

    soup = BeautifulSoup(resp.text, "html.parser")
    return soup, url


def parse_roster(soup) -> list[dict]:
    """Parse the #roster table from a team page."""
    table = soup.find("table", {"id": "roster"})
    if not table:
        return []

    tbody = table.find("tbody")
    if not tbody:
        return []

    players = []
    for tr in tbody.find_all("tr"):
        cells = {
            td.get("data-stat"): td
            for td in tr.find_all(["th", "td"])
            if td.get("data-stat")
        }

        # Extract player name and slug from link
        player_cell = cells.get("player")
        if not player_cell:
            continue

        name_text = player_cell.get_text(strip=True)
        if not name_text:
            continue

        link = player_cell.find("a")
        slug = None
        if link and link.get("href"):
            # href like /players/c/curryst01.html
            match = re.search(r"/players/[a-z]/([a-z0-9]+)\.html", link["href"])
            if match:
                slug = match.group(1)

        if not slug:
            print(f"  Warning: no slug found for {name_text}, skipping")
            continue

        # Split name into first/last
        parts = name_text.split(" ", 1)
        first_name = parts[0] if len(parts) > 0 else ""
        last_name = parts[1] if len(parts) > 1 else ""

        number = cells.get("number")
        number_text = number.get_text(strip=True) if number else None

        pos = cells.get("pos")
        pos_text = pos.get_text(strip=True) if pos else None

        ht = cells.get("height")
        ht_text = parse_height(ht.get_text(strip=True)) if ht else None

        wt = cells.get("weight")
        wt_text = wt.get_text(strip=True) if wt else None

        birth = cells.get("birth_date")
        birth_text = None
        if birth:
            # Try data-stat attribute first, then text
            birth_link = birth.find("a")
            raw = birth_link.get_text(strip=True) if birth_link else birth.get_text(strip=True)
            birth_text = parse_birth_date(raw)

        college_cell = cells.get("college")
        college_text = None
        if college_cell:
            college_link = college_cell.find("a")
            college_text = (
                college_link.get_text(strip=True)
                if college_link
                else college_cell.get_text(strip=True)
            ) or None

        country_cell = cells.get("birth_place")
        country_text = None
        if country_cell:
            country_text = country_cell.get_text(strip=True) or None

        players.append({
            "slug": slug,
            "first_name": first_name,
            "last_name": last_name,
            "jersey_number": number_text,
            "position": pos_text,
            "height": ht_text,
            "weight": wt_text,
            "college": college_text,
            "country": country_text,
        })

    return players


def scrape_rosters(season: int, team_filter: str | None):
    """Scrape rosters for all (or one) teams and upsert into players table."""
    teams = load_teams()
    if not teams:
        print("No teams found in database")
        sys.exit(1)

    if team_filter:
        if team_filter not in teams:
            print(f"Team '{team_filter}' not found. Available: {sorted(teams.keys())}")
            sys.exit(1)
        teams = {team_filter: teams[team_filter]}

    print(f"Scraping rosters for {len(teams)} team(s), season {season}-{str(season+1)[-2:]}...")

    all_players = []  # list of (player_dict, team_uuid)
    for abbrev, team_id in sorted(teams.items()):
        bref_abbrev = to_bref(abbrev)
        print(f"\n{abbrev} ({bref_abbrev})...")

        time.sleep(RATE_LIMIT_SECONDS)
        soup, url = fetch_roster_page(bref_abbrev, season)
        if not soup:
            continue

        roster = parse_roster(soup)
        print(f"  Found {len(roster)} players")

        for p in roster:
            p["team_id"] = team_id
            all_players.append(p)

    # Upsert all players
    if not all_players:
        print("\nNo players found to insert")
        return []

    # Build name -> NBA person ID lookup for headshot URLs
    nba_all = nba_players.get_players()
    nba_name_map = {}
    for np in nba_all:
        full = np["full_name"]
        nba_name_map[full.lower()] = np["id"]

    upsert_rows = []
    for p in all_players:
        full_name = f"{p['first_name']} {p['last_name']}"
        person_id = nba_name_map.get(full_name.lower())
        headshot_url = (
            f"https://cdn.nba.com/headshots/nba/latest/1040x760/{person_id}.png"
            if person_id
            else None
        )

        upsert_rows.append({
            "provider": "bref",
            "provider_player_id": slug_to_provider_id(p["slug"]),
            "first_name": p["first_name"],
            "last_name": p["last_name"],
            "position": p["position"],
            "jersey_number": p["jersey_number"],
            "team_id": p["team_id"],
            "height": p["height"],
            "weight": p["weight"],
            "college": p["college"],
            "country": p["country"],
            "headshot_url": headshot_url,
        })

    try:
        supabase.table("players").upsert(
            upsert_rows,
            on_conflict="provider,provider_player_id",
        ).execute()
        print(f"\nUpserted {len(upsert_rows)} players")
    except Exception as e:
        print(f"\nError upserting players: {e}")
        return []

    return all_players


def fetch_player_page(slug: str):
    """Fetch a player's main page from Basketball Reference."""
    letter = slug[0]
    url = f"https://www.basketball-reference.com/players/{letter}/{slug}.html"

    resp = requests.get(url, headers=HEADERS)
    if resp.status_code != 200:
        print(f"    Failed to fetch {url} (status {resp.status_code})")
        return None

    html = resp.text
    # Uncomment hidden tables (bref hides some in comments)
    html = re.sub(r'<!--\s*(<div[^>]*>.*?</div>)\s*-->', r'\1', html, flags=re.DOTALL)
    return BeautifulSoup(html, "html.parser")


def parse_season_averages(soup, season: int) -> dict | None:
    """Parse per-game averages for a specific season from a player page.

    The #per_game table has rows per season. We look for the row matching
    the target season (e.g. '2024-25' for season=2025).
    """
    table = soup.find("table", {"id": "per_game"})
    if not table:
        return None

    tbody = table.find("tbody")
    if not tbody:
        return None

    # Season string as displayed on bref: "2024-25" for the 2024-25 season
    season_str = f"{season}-{str(season+1)[-2:]}"

    for tr in tbody.find_all("tr"):
        # Skip header rows inside tbody
        if "thead" in tr.get("class", []):
            continue

        season_cell = tr.find("th", {"data-stat": "season"})
        if not season_cell:
            continue

        row_season = season_cell.get_text(strip=True)
        if row_season != season_str:
            continue

        cells = {
            td.get("data-stat"): td.get_text(strip=True)
            for td in tr.find_all("td")
            if td.get("data-stat")
        }

        return {
            "games": safe_int(cells.get("g")),
            "mpg": safe_float(cells.get("mp_per_g")),
            "ppg": safe_float(cells.get("pts_per_g")),
            "rpg": safe_float(cells.get("trb_per_g")),
            "apg": safe_float(cells.get("ast_per_g")),
            "spg": safe_float(cells.get("stl_per_g")),
            "bpg": safe_float(cells.get("blk_per_g")),
            "topg": safe_float(cells.get("tov_per_g")),
            "fg_pct": safe_float(cells.get("fg_pct")),
            "tp_pct": safe_float(cells.get("fg3_pct")),
            "ft_pct": safe_float(cells.get("ft_pct")),
        }

    return None


def scrape_averages(season: int, players: list[dict]):
    """Scrape per-game season averages for each player."""
    season_id = load_season(season)

    # Build slug -> player_id lookup
    provider_ids = [slug_to_provider_id(p["slug"]) for p in players]
    res = supabase.table("players").select("id, provider_player_id").eq(
        "provider", "bref"
    ).in_("provider_player_id", provider_ids).execute()

    pid_to_uuid = {r["provider_player_id"]: r["id"] for r in (res.data or [])}

    print(f"\nScraping season averages for {len(players)} players...")

    upsert_rows = []
    for i, p in enumerate(players):
        slug = p["slug"]
        provider_id = slug_to_provider_id(slug)
        player_uuid = pid_to_uuid.get(provider_id)
        if not player_uuid:
            print(f"  {p['first_name']} {p['last_name']}: not found in DB, skipping")
            continue

        time.sleep(RATE_LIMIT_SECONDS)
        print(f"  [{i+1}/{len(players)}] {p['first_name']} {p['last_name']}...")

        soup = fetch_player_page(slug)
        if not soup:
            continue

        avgs = parse_season_averages(soup, season)
        if not avgs:
            print(f"    No {season}-{str(season+1)[-2:]} averages found")
            continue

        avgs["player_id"] = player_uuid
        avgs["season_id"] = season_id
        upsert_rows.append(avgs)

    if not upsert_rows:
        print("\nNo averages to insert")
        return

    try:
        supabase.table("player_season_averages").upsert(
            upsert_rows,
            on_conflict="player_id,season_id",
        ).execute()
        print(f"\nUpserted {len(upsert_rows)} season average rows")
    except Exception as e:
        print(f"\nError upserting averages: {e}")


def main():
    parser = argparse.ArgumentParser(
        description="Scrape NBA player rosters from Basketball Reference"
    )
    parser.add_argument(
        "--season", type=int, required=True,
        help="Season year (e.g. 2025 for 2024-25 season)"
    )
    parser.add_argument(
        "--team", type=str, default=None,
        help="Single team abbreviation (e.g. BOS). Default: all teams"
    )
    parser.add_argument(
        "--averages", action="store_true",
        help="Also scrape per-game season averages for each player"
    )
    args = parser.parse_args()

    players = scrape_rosters(args.season, args.team)

    if args.averages and players:
        scrape_averages(args.season, players)

    print("\nDone!")


if __name__ == "__main__":
    main()
