/**
 * BallDontLie API client for live score polling.
 */

import { Platform } from 'react-native';

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
  if (/\bq\d/.test(s) || /qtr/.test(s) || /\d(st|nd|rd|th)\s+qtr/i.test(s) || s.includes('half') || s.includes('ot')) return 'live';
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

  const s = status.trim();

  // If status already contains a timestamp (e.g. "Q3 5:20", "OT1 2:00"), use as-is
  if (/\b(q\d|ot\d?)\s+\d+:\d+/i.test(s)) {
    return s;
  }

  // Normalize "3rd Qtr" → "Q3" etc.
  const qtrMatch = s.match(/(\d)(st|nd|rd|th)\s+qtr/i);
  if (qtrMatch) {
    const label = `Q${qtrMatch[1]}`;
    return time ? `${label} ${time}` : label;
  }

  // "Halftime" → return as-is
  if (/half/i.test(s)) return s;

  // Build from period + time (status is bare "Q3", "OT1", etc.)
  if (period > 0) {
    const label = period <= 4 ? `Q${period}` : `OT${period - 4}`;
    // BDL time field may already include quarter prefix — strip it
    const clock = time ? time.replace(/^(q\d|ot\d?)\s+/i, '') : '';
    return clock ? `${label} ${clock}` : label;
  }

  return 'In Progress';
}

export async function fetchTodaysGamesFromBDL(): Promise<BdlGame[]> {
  if (Platform.OS === 'web') {
    return fetchViaProxy();
  }
  return fetchDirectFromBDL();
}

/** Web: call our Vercel serverless proxy (no CORS, no exposed key) */
async function fetchViaProxy(): Promise<BdlGame[]> {
  try {
    const res = await fetch('/api/scores');
    if (!res.ok) {
      console.warn(`Proxy API error: ${res.status}`);
      return [];
    }
    const json: BdlGamesResponse = await res.json();
    return json.data;
  } catch (err) {
    console.warn('Failed to fetch from proxy:', err);
    return [];
  }
}

/** Native: call BDL directly with the EXPO_PUBLIC_ key */
async function fetchDirectFromBDL(): Promise<BdlGame[]> {
  if (!BDL_API_KEY) {
    console.warn('Missing EXPO_PUBLIC_BALLDONTLIE_API_KEY — skipping live scores');
    return [];
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
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
