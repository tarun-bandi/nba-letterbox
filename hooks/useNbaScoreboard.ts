import { useQuery } from '@tanstack/react-query';
import { fetchTodaysGamesFromESPN, getAwayCompetitor, getHomeCompetitor, type EspnEvent } from '@/lib/espn';

type EspnState = 'pre' | 'in' | 'post';

export interface NbaScoreboardTeam {
  abbreviation: string;
  displayName: string;
  score: number | null;
}

export interface NbaScoreboardGame {
  providerGameId: number;
  tipoffUtc: string;
  awayTeam: NbaScoreboardTeam;
  homeTeam: NbaScoreboardTeam;
  state: EspnState;
  displayStatus: 'scheduled' | 'live' | 'final';
  statusName: string;
  shortDetail: string | null;
  period: number;
  displayClock: string;
  tipoffLabel: string;
  statusLabel: string;
}

interface NbaScoreboardData {
  games: NbaScoreboardGame[];
}

function getLocalDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseScore(raw: string | undefined): number | null {
  const value = Number.parseInt(raw ?? '', 10);
  return Number.isNaN(value) ? null : value;
}

function isDateOnlyUtcTimestamp(date: Date): boolean {
  const h = date.getUTCHours();
  const m = date.getUTCMinutes();
  const s = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();
  return (h === 0 || h === 12) && m === 0 && s === 0 && ms === 0;
}

function getPeriodLabel(period: number): string {
  if (period <= 4) return `Q${period}`;
  return `OT${period - 4}`;
}

function formatTipoffLabel(tipoffUtc: string, shortDetail: string | null): string {
  const d = new Date(tipoffUtc);
  if (!Number.isNaN(d.getTime()) && !isDateOnlyUtcTimestamp(d)) {
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  // ESPN often includes pre-game time detail here.
  if (shortDetail) {
    return shortDetail.split(' - ')[0]?.trim() || 'TBD';
  }

  return 'TBD';
}

function formatLiveStatusLabel(
  statusName: string,
  shortDetail: string | null,
  period: number,
  displayClock: string,
): string {
  if (statusName === 'STATUS_HALFTIME') return 'Halftime';
  if (statusName === 'STATUS_END_PERIOD') {
    return `End ${getPeriodLabel(period || 1)}`;
  }
  if (shortDetail) return shortDetail;
  if (displayClock && period > 0) return `${getPeriodLabel(period)} ${displayClock}`;
  return 'In Progress';
}

function normalizeEvent(event: EspnEvent): NbaScoreboardGame | null {
  const competition = event.competitions?.[0];
  if (!competition) return null;

  const home = getHomeCompetitor(event);
  const away = getAwayCompetitor(event);
  if (!home || !away) return null;

  const status = competition.status ?? event.status;
  const state = status?.type?.state;
  if (state !== 'pre' && state !== 'in' && state !== 'post') return null;

  const statusName = status?.type?.name ?? '';
  const shortDetail = status?.type?.shortDetail ?? null;
  const period = status?.period ?? 0;
  const displayClock = status?.displayClock ?? '';
  const providerGameId = Number.parseInt(event.id, 10);
  if (Number.isNaN(providerGameId)) return null;
  const tipoffLabel = formatTipoffLabel(event.date, shortDetail);
  const displayStatus =
    state === 'in' ? 'live' : state === 'post' ? 'final' : 'scheduled';
  const statusLabel =
    displayStatus === 'scheduled'
      ? tipoffLabel
      : displayStatus === 'final'
        ? 'Final'
        : formatLiveStatusLabel(statusName, shortDetail, period, displayClock);

  return {
    providerGameId,
    tipoffUtc: event.date,
    awayTeam: {
      abbreviation: away.team.abbreviation,
      displayName: away.team.displayName,
      score: parseScore(away.score),
    },
    homeTeam: {
      abbreviation: home.team.abbreviation,
      displayName: home.team.displayName,
      score: parseScore(home.score),
    },
    state,
    displayStatus,
    statusName,
    shortDetail,
    period,
    displayClock,
    tipoffLabel,
    statusLabel,
  };
}

function getRefetchIntervalMs(games: NbaScoreboardGame[]): number | false {
  if (games.some((g) => g.state === 'in')) return 30_000;
  if (games.length > 0 && games.every((g) => g.state === 'post')) return false;
  return 300_000;
}

export function useNbaScoreboard() {
  return useQuery({
    queryKey: ['nba-scoreboard', getLocalDateKey()],
    queryFn: async (): Promise<NbaScoreboardData> => {
      const events = await fetchTodaysGamesFromESPN();
      const games = events
        .map((event) => normalizeEvent(event))
        .filter((game): game is NbaScoreboardGame => Boolean(game))
        .sort((a, b) => new Date(a.tipoffUtc).getTime() - new Date(b.tipoffUtc).getTime());

      return { games };
    },
    refetchInterval: (query) => {
      const data = query.state.data as NbaScoreboardData | undefined;
      return getRefetchIntervalMs(data?.games ?? []);
    },
    staleTime: 0,
  });
}
