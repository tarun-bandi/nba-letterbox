/**
 * BallDontLie API client for live score polling.
 */

const BDL_BASE = 'https://api.balldontlie.io/nba/v1';
const BDL_API_KEY = process.env.EXPO_PUBLIC_BALLDONTLIE_API_KEY ?? '';

interface BdlGame {
  id: number;
  date: string;
  home_team: { id: number };
  visitor_team: { id: number };
  home_team_score: number;
  visitor_team_score: number;
  status: string;
  period: number;
  time: string;
  postseason: boolean;
  season: number;
}

interface BdlGamesResponse {
  data: BdlGame[];
  meta: {
    next_cursor?: number;
    per_page: number;
  };
}

export function mapStatus(status: string): 'scheduled' | 'live' | 'final' {
  const s = status.toLowerCase();
  if (s === 'final' || s.startsWith('final/')) return 'final';
  if (/\bq\d/.test(s) || s.includes('half') || s.includes('ot')) return 'live';
  return 'scheduled';
}

/**
 * Format the BDL status string into a human-readable live label.
 * e.g. "Q3 5:20" → "Q3 5:20", "Halftime" → "Half", "Final" → null
 */
export function formatLiveStatus(
  status: string,
  period: number,
  time: string,
): string | null {
  const mapped = mapStatus(status);
  if (mapped !== 'live') return null;

  // BDL often puts the period/time info directly in the status string
  // e.g. "Q3 5:20", "Halftime", "OT1 2:00"
  const s = status.trim();
  if (/\bq\d/i.test(s) || /\bot/i.test(s) || /half/i.test(s)) {
    return s;
  }

  // Fallback: build from period + time
  if (period > 0 && time) {
    const label = period <= 4 ? `Q${period}` : `OT${period - 4}`;
    return `${label} ${time}`;
  }

  return 'In Progress';
}

export async function fetchTodaysGamesFromBDL(): Promise<BdlGame[]> {
  if (!BDL_API_KEY) {
    console.warn('Missing EXPO_PUBLIC_BALLDONTLIE_API_KEY — skipping live scores');
    return [];
  }

  const today = new Date().toISOString().split('T')[0];
  const url = `${BDL_BASE}/games?dates[]=${today}&per_page=100`;

  const res = await fetch(url, {
    headers: {
      Authorization: BDL_API_KEY,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    console.warn(`BDL API error: ${res.status}`);
    return [];
  }

  const json: BdlGamesResponse = await res.json();
  return json.data;
}

export type { BdlGame };
