import { useQuery } from '@tanstack/react-query';
import type { Sport } from '@/types/database';

export interface PlayByPlayAction {
  actionNumber: number;
  clock: string;
  period: number;
  teamTricode: string;
  playerName: string;
  description: string;
  actionType: string;
  scoreHome: string;
  scoreAway: string;
  isFieldGoal: boolean;
  shotResult?: string;
}

interface PlayByPlayResponse {
  gameId: string;
  actions: PlayByPlayAction[];
}

async function fetchPlayByPlay(
  sport: Sport,
  homeTeam: string,
  date: string,
): Promise<PlayByPlayResponse> {
  const res = await fetch(
    `/api/playbyplay/${sport}?homeTeam=${encodeURIComponent(homeTeam)}&date=${encodeURIComponent(date)}`,
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Play-by-play fetch failed (${res.status})`);
  }
  return res.json();
}

export function usePlayByPlay(
  homeTeamAbbr: string | undefined,
  gameDate: string | undefined,
  gameStatus: string | undefined,
  sport: Sport = 'nba',
) {
  const isActiveGame = gameStatus === 'live' || gameStatus === 'final';

  return useQuery({
    queryKey: ['play-by-play', sport, homeTeamAbbr, gameDate],
    queryFn: () => fetchPlayByPlay(sport, homeTeamAbbr!, gameDate!),
    enabled: !!homeTeamAbbr && !!gameDate && isActiveGame,
    refetchInterval: gameStatus === 'live' ? 60_000 : false,
    staleTime: gameStatus === 'live' ? 0 : 5 * 60 * 1000,
  });
}
