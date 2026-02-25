/**
 * ESPN Public API client for NBA live score polling.
 * Replaces BallDontLie — no auth required.
 */

import { Platform } from 'react-native';

const ESPN_SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';

// ─── Types ──────────────────────────────────────────────────────────────────

interface EspnCompetitor {
  id: string;
  homeAway: 'home' | 'away';
  team: {
    id: string;
    abbreviation: string;
    displayName: string;
    shortDisplayName: string;
  };
  score: string;
}

interface EspnStatus {
  clock: number;
  displayClock: string;
  period: number;
  type: {
    id: string;
    name: string;
    state: 'pre' | 'in' | 'post';
    completed: boolean;
    description: string;
    detail: string;
    shortDetail: string;
  };
}

interface EspnBroadcast {
  names: string[];
}

interface EspnVenue {
  fullName: string;
  city: string;
  state: string;
}

interface EspnCompetition {
  id: string;
  competitors: EspnCompetitor[];
  status: EspnStatus;
  broadcasts: EspnBroadcast[];
  venue: EspnVenue;
}

export interface EspnEvent {
  id: string;
  date: string; // ISO UTC
  name: string;
  shortName: string;
  competitions: EspnCompetition[];
  status: EspnStatus;
  season: {
    year: number;
    type: number; // 2 = regular, 3 = postseason
  };
}

export interface EspnScoreboard {
  events: EspnEvent[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function mapStatus(
  state: 'pre' | 'in' | 'post',
  completed: boolean,
): 'scheduled' | 'live' | 'final' {
  if (state === 'pre') return 'scheduled';
  if (state === 'in') return 'live';
  if (state === 'post' || completed) return 'final';
  return 'scheduled';
}

/**
 * Format ESPN status into a human-readable live label.
 * e.g. "Q3 5:42", "Halftime", "OT1 2:15", "End Q4"
 */
export function formatLiveStatus(
  status: string,
  period: number,
  clock: string,
): string | null {
  // For ESPN, the `status` field we pass through is the ESPN state string.
  // But the provider interface passes the raw status string — for ESPN we
  // reconstruct from period + clock which are more reliable.
  // When called from useLiveScores, status is the ESPN state ('pre'|'in'|'post').

  if (status === 'pre' || status === 'scheduled') return null;
  if (status === 'post' || status === 'final') return null;

  // Halftime: period 2, clock at 0:00 or ESPN sometimes shows this differently
  // We'll check the clock value
  if (period === 2 && clock === '0:00') return 'Halftime';

  const label = period <= 4 ? `Q${period}` : `OT${period - 4}`;

  if (clock === '0:00') return `End ${label}`;

  return clock ? `${label} ${clock}` : label;
}

/**
 * Build the ESPN scoreboard URL for a given ET date (YYYYMMDD).
 */
export function getEspnScoreboardUrl(dateStr?: string): string {
  if (dateStr) {
    return `${ESPN_SCOREBOARD_URL}?dates=${dateStr}`;
  }
  return ESPN_SCOREBOARD_URL;
}

/**
 * Fetch today's ESPN scoreboard for client-side live score polling.
 * Web: proxy via /api/scores/nba (CORS).
 * Native: call ESPN directly (no CORS issue).
 */
export async function fetchTodaysGamesFromESPN(): Promise<EspnEvent[]> {
  if (Platform.OS === 'web') {
    return fetchViaProxy();
  }
  return fetchDirectFromESPN();
}

/** Web: call our Vercel serverless proxy */
async function fetchViaProxy(): Promise<EspnEvent[]> {
  try {
    const res = await fetch('/api/scores/nba');
    if (!res.ok) {
      console.warn(`ESPN proxy error: ${res.status}`);
      return [];
    }
    const json: EspnScoreboard = await res.json();
    return json.events ?? [];
  } catch (err) {
    console.warn('Failed to fetch from ESPN proxy:', err);
    return [];
  }
}

/** Native: call ESPN directly (public API, no auth needed) */
async function fetchDirectFromESPN(): Promise<EspnEvent[]> {
  try {
    const today = new Date()
      .toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      .replace(/-/g, '');
    const url = getEspnScoreboardUrl(today);

    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`ESPN API error: ${res.status}`);
      return [];
    }
    const json: EspnScoreboard = await res.json();
    return json.events ?? [];
  } catch (err) {
    console.warn('Failed to fetch from ESPN:', err);
    return [];
  }
}

// ─── Event helpers ──────────────────────────────────────────────────────────

/** Get the home competitor from an ESPN event */
export function getHomeCompetitor(event: EspnEvent): EspnCompetitor | undefined {
  return event.competitions[0]?.competitors.find((c) => c.homeAway === 'home');
}

/** Get the away competitor from an ESPN event */
export function getAwayCompetitor(event: EspnEvent): EspnCompetitor | undefined {
  return event.competitions[0]?.competitors.find((c) => c.homeAway === 'away');
}

/** Get broadcast string from an ESPN event */
export function getBroadcast(event: EspnEvent): string | null {
  const names = event.competitions[0]?.broadcasts?.[0]?.names;
  return names?.length ? names.join(', ') : null;
}

/** Get venue/arena string from an ESPN event */
export function getVenue(event: EspnEvent): string | null {
  const venue = event.competitions[0]?.venue;
  return venue?.fullName ?? null;
}
